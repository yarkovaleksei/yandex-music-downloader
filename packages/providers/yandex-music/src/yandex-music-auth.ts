import { Client, DeviceAuthError } from '@dvxch/yandex-music';
import { z } from 'zod';
import {
  DomainError,
  DownloadError,
  ProviderError,
  QualityUnavailableError,
  TrackUnavailableError,
  type Account,
  type Album,
  type ArtworkData,
  type ArtworkRef,
  type MediaReference,
  type Playlist,
  type Track,
  type AuthInteraction,
  type AudioStream,
  type AudioVariant,
  type CredentialStore,
} from '@music-downloader/shared';
import { openPrivateChallenge, type AuthBrowser } from './auth-browser.js';
import {
  authenticationRequired,
  invalidProviderResponse,
} from './auth-errors.js';
import { createAuthFetch, type AuthFetch } from './auth-transport.js';
import {
  accountSchema,
  deviceCodeSchema,
  oauthTokenSchema,
  parseCredentials,
  serializeCredentials,
  type AuthCredentials,
} from './auth-schemas.js';
import { resolveYandexMusicUrl } from './url/resolve-yandex-music-url.js';
import { fetchPublicArtwork } from './metadata/artwork.js';
import { metadataError } from './metadata/errors.js';
import { mapAlbum, mapPlaylist, mapTrack } from './metadata/mappers.js';
import {
  rawAlbumSchema,
  rawPlaylistSchema,
  rawTrackSchema,
} from './metadata/schemas.js';
import { metadataTransport } from './metadata/transport.js';
import { audioTransport, fetchAudioCdn } from './audio/transport.js';
import { createAudioStream } from './audio/stream.js';
import { decodeVariantKey, sameDescriptor } from './audio/variant-key.js';
import {
  legacyVariants,
  modernVariants,
  toAudioVariants,
  type ResolvedAudioDescriptor,
} from './audio/variants.js';
import {
  parseAudioResult,
  parseModernResult,
  rawAudioTrackSchema,
  rawLegacyDownloadInfoSchema,
} from './audio/schemas.js';

export interface YandexMusicAuthOptions {
  readonly credentialStore: CredentialStore;
  readonly authInteraction: AuthInteraction;
  readonly fetch?: AuthFetch;
  readonly browser?: AuthBrowser;
  readonly now?: () => number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

/**
 * Изолирует Device Authorization и сохранённые credentials от application/CLI.
 * @link ../../../docs/adr/ADR-009-yandex-adapter-strategy.md
 */
export class YandexMusicProviderAuth {
  private active?: AuthCredentials;
  private loggedOut = false;
  private readonly fetch: AuthFetch;
  private readonly rawFetch: AuthFetch;
  private readonly now: () => number;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  public constructor(private readonly options: YandexMusicAuthOptions) {
    this.rawFetch = options.fetch ?? globalFetch;
    this.fetch = createAuthFetch(this.rawFetch);
    this.now = options.now ?? Date.now;
    this.sleep =
      options.sleep ??
      ((milliseconds) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  public async authenticate(): Promise<Account> {
    const controller = new AbortController();
    const oauth = this.client(undefined, controller.signal);
    let challenge: Awaited<ReturnType<typeof openPrivateChallenge>> | undefined;
    let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      const issued = await oauth.requestDeviceCode();
      const code = deviceCodeSchema.safeParse({
        device_code: issued.deviceCode,
        user_code: issued.userCode,
        verification_url: issued.verificationUrl,
        expires_in: issued.expiresIn,
        interval: issued.interval,
      });
      if (!code.success) throw invalidProviderResponse();
      // Browser countdown использует тот же срок, что и уже существующий hard timeout.
      // Wall-clock deadline фиксируется до открытия браузера; polling не меняется.
      const duration = code.data.expires_in * 1000;
      const deadline = Date.now() + duration;
      deadlineTimer = setTimeout(() => controller.abort(), duration);
      challenge = await openPrivateChallenge(
        code.data.user_code,
        code.data.verification_url,
        { deadline, duration },
        this.options.browser,
      );
      await this.options.authInteraction.notify(
        'Подтвердите авторизацию в открывшемся браузере.',
      );
      void challenge.cancel.then(() => controller.abort());
      const token = await this.poll(
        oauth,
        code.data.device_code,
        code.data.interval,
        code.data.expires_in,
        challenge.cancel,
        controller.signal,
      );
      const credentials = this.credentials(token);
      const account = await this.account(
        credentials.accessToken,
        controller.signal,
      );
      if (controller.signal.aborted) throw authenticationRequired();
      const next = { ...credentials, accountId: account.id };
      // Прежняя запись остаётся доступной, пока native store не подтвердит замену.
      await this.options.credentialStore.write(serializeCredentials(next));
      this.active = next;
      this.loggedOut = false;
      return account;
    } catch (error) {
      if (controller.signal.aborted) throw authenticationRequired();
      throw normalizeAuthError(error);
    } finally {
      if (deadlineTimer) clearTimeout(deadlineTimer);
      controller.abort();
      await challenge?.close();
    }
  }

  public async getAccount(): Promise<Account | null> {
    const credentials = await this.readCredentials();
    if (!credentials) return null;
    try {
      const account = await this.account(credentials.accessToken);
      this.active = credentials;
      return account;
    } catch (error) {
      throw normalizeAuthError(error);
    }
  }

  public async logout(): Promise<void> {
    // Память блокируется до clear, поэтому неудачное удаление не оставляет активный token.
    this.active = undefined;
    this.loggedOut = true;
    await this.options.credentialStore.clear();
  }

  public resolveUrl(url: string): Promise<MediaReference> {
    return resolveYandexMusicUrl(url);
  }

  public async getTrack(id: string): Promise<Track> {
    if (!/^\d+$/.test(id)) throw new TrackUnavailableError();
    const { raw, model } = await this.metadataRequest(
      z.array(rawTrackSchema),
      (client) => client.tracks(id),
    );
    const track = raw.find((candidate) => String(candidate.id) === id);
    const sdkTrack = model.find((candidate) => String(candidate.id) === id);
    if (!track) throw new TrackUnavailableError();
    if (!sdkTrack) throw invalidProviderResponse();
    const mapped = mapTrack(track, sdkTrack);
    if (mapped.availability === 'unavailable')
      throw new TrackUnavailableError();
    return mapped;
  }

  public async getAlbum(id: string): Promise<Album> {
    if (!/^\d+$/.test(id)) throw new TrackUnavailableError();
    const { raw, model } = await this.metadataRequest(
      rawAlbumSchema,
      (client) => client.albumsWithTracks(id),
    );
    if (!model || String(raw.id) !== id) throw invalidProviderResponse();
    return mapAlbum(raw, model);
  }

  public async getPlaylist(id: string): Promise<Playlist> {
    const uuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id,
      );
    const legacy = /^users\/([^/]+)\/playlists\/(\d+)$/.exec(id);
    const owner = legacy?.[1];
    const kind = legacy?.[2];
    if (!uuid && (owner === undefined || kind === undefined))
      throw new TrackUnavailableError();
    if (!uuid && owner !== undefined) {
      try {
        const decoded = decodeURIComponent(owner);
        if (
          !decoded ||
          decoded.includes('/') ||
          decoded === '.' ||
          decoded === '..' ||
          encodeURIComponent(decoded) !== owner
        )
          throw new TrackUnavailableError();
      } catch {
        throw new TrackUnavailableError();
      }
    }
    // Canonical owner остаётся encoded: SDK вставляет этот segment в URL напрямую.
    const { raw, model } = await this.metadataRequest(
      rawPlaylistSchema,
      (client) =>
        uuid ? client.playlist(id) : client.usersPlaylists(kind ?? '', owner),
    );
    if (!model || Array.isArray(model)) throw invalidProviderResponse();
    return mapPlaylist(raw, id, model);
  }

  public fetchArtwork(ref: ArtworkRef, size: number): Promise<ArtworkData> {
    return fetchPublicArtwork(this.options.fetch ?? globalFetch, ref, size);
  }

  /** Варианты принадлежат только текущему account snapshot и не раскрывают ссылки.
   * @link ../../../../planning/tasks/STEP-010.md
   */
  public async getAudioVariants(
    trackId: string,
  ): Promise<readonly AudioVariant[]> {
    const state = await this.audioState(trackId);
    return toAudioVariants(state.variants);
  }

  public async openAudioStream(
    trackId: string,
    variantKey: string,
    options: { readonly signal?: AbortSignal; readonly offset?: number },
  ): Promise<AudioStream> {
    if (!/^\d+$/.test(trackId)) throw new TrackUnavailableError();
    if (
      options.offset !== undefined &&
      (!Number.isSafeInteger(options.offset) || options.offset < 0)
    )
      throw new DownloadError();
    const signal = options.signal ?? new AbortController().signal;
    if (signal.aborted)
      throw new DOMException('Операция отменена.', 'AbortError');
    const requested = decodeVariantKey(variantKey, trackId);
    const state = await this.audioState(trackId, signal);
    const current = state.variants.find((value) =>
      sameDescriptor(value.descriptor, requested),
    );
    if (!current) throw new QualityUnavailableError();
    const url = await this.resolveAudioLink(current, state.legacyModels);
    const encrypted = current.descriptor.transport === 'encraw';
    const response = await fetchAudioCdn(
      this.rawFetch,
      url,
      signal,
      encrypted ? undefined : options.offset,
    );
    if (response.status === 401 || response.status === 403)
      throw new ProviderError('STREAM_EXPIRED', true);
    const stream = await createAudioStream(
      response,
      current.descriptor.container,
      encrypted ? undefined : options.offset,
      signal,
      current.link.kind === 'cdn' ? current.link.key : undefined,
    );
    // CTR seek не заявляется без отдельного доказательства корректного offset mapping.
    return encrypted
      ? { ...stream, acceptsRanges: false, startOffset: 0 }
      : stream;
  }

  /** Общий lifecycle не читает store после logout и не обновляет истёкший token.
   * @link ../../../../docs/adr/ADR-010-cli-auth-and-secure-storage.md
   */
  private async readCredentials(): Promise<AuthCredentials | undefined> {
    if (this.loggedOut) return undefined;
    const serialized = this.active
      ? undefined
      : await this.options.credentialStore.read();
    const credentials =
      this.active ??
      (serialized == null ? undefined : parseCredentials(serialized));
    if (
      credentials?.expiresAt !== undefined &&
      credentials.expiresAt <= this.now()
    )
      throw authenticationRequired();
    return credentials;
  }

  private async metadataRequest<T, U>(
    schema: z.ZodType<T>,
    request: (client: Client) => Promise<U>,
  ) {
    try {
      const credentials = await this.readCredentials();
      if (!credentials) throw authenticationRequired();
      const transport = metadataTransport(
        this.options.fetch ?? globalFetch,
        schema,
      );
      const model = await request(
        this.client(credentials.accessToken, undefined, transport.fetch),
      );
      // Metadata использует снимок credentials, но не меняет владельца сессии:
      // за время запроса caller мог выполнить logout и войти в другой аккаунт.
      return { model, raw: transport.result() };
    } catch (error) {
      throw metadataError(error);
    }
  }

  private async audioState(
    trackId: string,
    signal?: AbortSignal,
  ): Promise<{
    variants: ResolvedAudioDescriptor[];
    legacyModels: readonly { getDirectLink(): Promise<string> }[];
  }> {
    if (!/^\d+$/.test(trackId)) throw new TrackUnavailableError();
    try {
      const credentials = await this.readCredentials();
      if (!credentials) throw authenticationRequired();
      const transport = audioTransport(this.rawFetch);
      const client = this.client(
        credentials.accessToken,
        signal,
        transport.fetch,
      );
      await client.tracks(trackId);
      const tracks = parseAudioResult(
        z.array(rawAudioTrackSchema),
        transport.result('/tracks'),
      );
      if (
        !tracks.some(
          (track) => String(track.id) === trackId && track.available === true,
        )
      )
        throw new TrackUnavailableError();
      const legacyModels = await client.tracksDownloadInfo(trackId, false);
      const legacy = parseAudioResult(
        rawLegacyDownloadInfoSchema,
        transport.result(`/tracks/${trackId}/download-info`),
      );
      await client.tracksLosslessInfo(trackId, 'lossless');
      const modern = parseModernResult(transport.result('/get-file-info'));
      return {
        variants: [
          ...legacyVariants(trackId, legacy),
          ...modernVariants(trackId, modern),
        ],
        legacyModels,
      };
    } catch (error) {
      if (signal?.aborted)
        throw new DOMException('Операция отменена.', 'AbortError');
      if (error instanceof DomainError) throw error;
      const cause =
        typeof error === 'object' && error !== null && 'cause' in error
          ? (error as { cause?: unknown }).cause
          : undefined;
      if (cause instanceof DomainError) throw cause;
      const status =
        typeof error === 'object' && error !== null && 'status' in error
          ? (error as { status?: unknown }).status
          : undefined;
      if (status === 401 || status === 403) throw authenticationRequired();
      if (status === 429 || (typeof status === 'number' && status >= 500))
        throw new ProviderError('SERVICE_UNAVAILABLE', true);
      throw new ProviderError('NETWORK_ERROR', true);
    }
  }

  private async resolveAudioLink(
    value: ResolvedAudioDescriptor,
    models: readonly { getDirectLink(): Promise<string> }[],
  ): Promise<string> {
    if (value.link.kind === 'cdn') return value.link.url;
    const model =
      value.legacyIndex === undefined ? undefined : models[value.legacyIndex];
    if (!model) throw new QualityUnavailableError();
    try {
      return await model.getDirectLink();
    } catch (error) {
      if (error instanceof DomainError) throw error;
      const cause =
        typeof error === 'object' && error !== null && 'cause' in error
          ? (error as { cause?: unknown }).cause
          : undefined;
      if (cause instanceof DomainError) throw cause;
      throw new ProviderError('NETWORK_ERROR', true);
    }
  }

  private client(
    token?: string,
    flowSignal?: AbortSignal,
    fetchOverride?: AuthFetch,
  ): Client {
    const baseFetch = fetchOverride ?? this.fetch;
    const fetch: AuthFetch = flowSignal
      ? (url, init) =>
          baseFetch(url, {
            ...init,
            signal: AbortSignal.any([init.signal, flowSignal]),
          })
      : baseFetch;
    return new Client({
      token,
      fetch,
      retries: 0,
      reportUnknownFields: false,
    });
  }

  private async poll(
    oauth: Client,
    deviceCode: string,
    initialInterval: number,
    lifetime: number,
    cancel: Promise<void>,
    signal: AbortSignal,
  ) {
    const deadline = this.now() + lifetime * 1000;
    let interval = initialInterval * 1000;
    for (;;) {
      if (this.now() >= deadline) throw authenticationRequired();
      // Серверный interval действует и перед первым poll; это не retry запроса.
      await Promise.race([
        this.sleep(interval),
        cancel.then(() => {
          throw authenticationRequired();
        }),
      ]);
      if (this.now() >= deadline) throw authenticationRequired();
      const result = await Promise.race([
        oauth.pollDeviceToken(deviceCode),
        cancel.then(() => {
          throw authenticationRequired();
        }),
      ]).catch((error: unknown) => {
        if (signal.aborted) throw authenticationRequired();
        if (
          error instanceof DeviceAuthError &&
          error.message.includes('slow_down')
        ) {
          interval += 5000;
          return null;
        }
        throw error;
      });
      if (result) return result;
    }
  }

  private credentials(token: {
    accessToken?: string;
    refreshToken?: string;
    expiresIn?: number;
    tokenType?: string;
  }): AuthCredentials {
    const parsed = oauthTokenSchema.safeParse({
      access_token: token.accessToken,
      refresh_token: token.refreshToken,
      expires_in: token.expiresIn,
      token_type: token.tokenType,
    });
    if (!parsed.success) throw invalidProviderResponse();
    const issuedAt = this.now();
    return {
      accessToken: parsed.data.access_token,
      refreshToken: parsed.data.refresh_token,
      issuedAt,
      ...(parsed.data.expires_in === undefined
        ? {}
        : { expiresAt: issuedAt + parsed.data.expires_in * 1000 }),
      accountId: '',
    };
  }

  private async account(
    accessToken: string,
    flowSignal?: AbortSignal,
  ): Promise<Account> {
    const status = await this.client(accessToken, flowSignal).accountStatus();
    const raw = status as unknown as {
      account?: { uid?: number | string; displayName?: string; login?: string };
    } | null;
    const parsed = accountSchema.safeParse({
      id: raw?.account?.uid === undefined ? undefined : String(raw.account.uid),
      displayName: raw?.account?.displayName ?? raw?.account?.login,
    });
    if (!parsed.success) throw invalidProviderResponse();
    return parsed.data;
  }
}

const globalFetch: AuthFetch = async (url, init) => globalThis.fetch(url, init);

function normalizeAuthError(error: unknown): Error {
  if (error instanceof DomainError) return error;
  const cause = error instanceof Error ? error.cause : undefined;
  if (cause instanceof DomainError) return cause;
  if (error instanceof DeviceAuthError) return authenticationRequired();
  const status =
    typeof error === 'object' && error !== null && 'status' in error
      ? (error as { status?: unknown }).status
      : undefined;
  if (status === 401 || status === 403) return authenticationRequired();
  return new ProviderError('NETWORK_ERROR', true);
}
