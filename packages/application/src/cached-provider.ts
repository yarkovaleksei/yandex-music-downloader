import type {
  Account,
  Album,
  ArtworkData,
  ArtworkRef,
  AudioStream,
  AudioVariant,
  MediaReference,
  MusicProvider,
  Playlist,
  StreamOptions,
  Track,
} from '@music-downloader/shared';
import type { CacheKey, CacheStore } from '@music-downloader/persistence';
import {
  decodeAlbum,
  decodeArtwork,
  decodePlaylist,
  decodeTrack,
  encodeAlbum,
  encodeArtwork,
  encodePlaylist,
  encodeTrack,
} from './cache-payload.js';

type Decoder<T> = (value: string) => T | undefined;
type Encoder<T> = (value: T) => string | undefined;

/**
 * Decorator кэширует только metadata/artwork после live проверки текущего аккаунта.
 * @link planning/tasks/STEP-024.md; docs/requirements/REQ-027-meta-cache.md
 */
export class CachedProvider implements MusicProvider {
  private operations = Promise.resolve();
  private avatarGeneration = 0;

  public constructor(
    private readonly provider: MusicProvider,
    private readonly store: CacheStore,
    private readonly namespace: {
      readonly providerId: string;
      readonly schemaVersion: string;
    },
  ) {}

  public authenticate(): Promise<Account> {
    this.avatarGeneration++;
    return this.serial(() => this.provider.authenticate());
  }
  public getAccount(): Promise<Account | null> {
    return this.provider.getAccount();
  }
  public logout(): Promise<void> {
    this.avatarGeneration++;
    return this.serial(() => this.provider.logout());
  }
  public resolveUrl(url: string): Promise<MediaReference> {
    return this.provider.resolveUrl(url);
  }
  public publicUrl(source: MediaReference): string | undefined {
    return this.provider.publicUrl?.(source);
  }
  public getTrack(id: string): Promise<Track> {
    return this.serial(() =>
      this.cached(
        'getTrack',
        [id],
        () => this.provider.getTrack(id),
        encodeTrack,
        decodeTrack,
      ),
    );
  }
  public getAlbum(id: string): Promise<Album> {
    return this.serial(() =>
      this.cached(
        'getAlbum',
        [id],
        () => this.provider.getAlbum(id),
        encodeAlbum,
        decodeAlbum,
      ),
    );
  }
  public getPlaylist(id: string): Promise<Playlist> {
    return this.serial(() =>
      this.cached(
        'getPlaylist',
        [id],
        () => this.provider.getPlaylist(id),
        encodePlaylist,
        decodePlaylist,
      ),
    );
  }
  public getAudioVariants(trackId: string): Promise<readonly AudioVariant[]> {
    return this.provider.getAudioVariants(trackId);
  }
  public openAudioStream(
    trackId: string,
    variantKey: string,
    options: StreamOptions,
  ): Promise<AudioStream> {
    return this.provider.openAudioStream(trackId, variantKey, options);
  }
  public fetchArtwork(artwork: ArtworkRef, size: number): Promise<ArtworkData> {
    return this.serial(() =>
      this.cached(
        'fetchArtwork',
        [artwork.key, String(size)],
        () => this.provider.fetchArtwork(artwork, size),
        encodeArtwork,
        decodeArtwork,
      ),
    );
  }

  /** STEP-059: avatar cache account-scoped; сеть фото не занимает metadata/auth очередь.
   * @link planning/tasks/STEP-059.md
   */
  public async fetchAccountAvatar(): Promise<ArtworkData | null> {
    const generation = this.avatarGeneration;
    try {
      const account = await this.provider.getAccount();
      if (!account || !this.provider.fetchAccountAvatar) return null;
      const current = async () =>
        generation === this.avatarGeneration &&
        (await this.provider.getAccount())?.id === account.id &&
        generation === this.avatarGeneration;
      const key: CacheKey = {
        ...this.namespace,
        accountId: account.id,
        method: 'fetchAccountAvatar',
        arguments: [],
      };
      const stored = await this.store.read(key);
      const hit = stored === undefined ? undefined : decodeArtwork(stored);
      const safe = (
        image: ArtworkData | null | undefined,
      ): image is ArtworkData =>
        !!image &&
        ['image/jpeg', 'image/png', 'image/webp'].includes(image.mimeType) &&
        image.bytes.length > 0 &&
        image.bytes.length <= 2 * 1024 * 1024;
      if (safe(hit) && (await current())) return hit;
      if (!(await current())) return null;
      const image = await this.provider.fetchAccountAvatar();
      if (!safe(image) || !(await current())) return null;
      const payload = encodeArtwork(image);
      if (payload !== undefined)
        await this.store.write(key, payload).catch(() => undefined);
      return (await current()) ? image : null;
    } catch {
      return null;
    }
  }

  private async cached<T>(
    method: string,
    arguments_: readonly string[],
    request: () => Promise<T>,
    encode: Encoder<T>,
    decode: Decoder<T>,
  ): Promise<T> {
    const account = await this.provider.getAccount();
    if (account === null) return request();
    const key: CacheKey = {
      providerId: this.namespace.providerId,
      accountId: account.id,
      schemaVersion: this.namespace.schemaVersion,
      method,
      arguments: arguments_,
    };
    const cached = await this.store.read(key);
    if (cached !== undefined) {
      const value = decode(cached);
      if (value !== undefined) return value;
    }
    const value = await request();
    const payload = encode(value);
    if (payload !== undefined)
      await this.store.write(key, payload).catch(() => undefined);
    return decode(payload ?? '') ?? value;
  }

  /** Очередь сохраняет связь account snapshot и provider request при public auth/logout. */
  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operations.then(operation, operation);
    this.operations = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
