import {
  DownloadError,
  ProviderError,
  TrackUnavailableError,
  UnsupportedUrlError,
  type Account,
  type ArtworkData,
  type ArtworkRef,
  type AudioStream,
  type AudioVariant,
  type MediaReference,
  type MusicProvider,
  type StreamOptions,
  type Album,
  type Playlist,
  type Track,
} from '@music-downloader/shared';
import {
  mockAccount,
  mockAlbum,
  mockArtwork,
  mockArtworkData,
  mockAudioBytes,
  mockPlaylist,
  mockProviderId,
  mockTrack,
  mockVariants,
} from './fixtures.js';

export type MockProviderOperation = keyof MusicProvider;

export interface MockProviderOptions {
  readonly supportsRange?: boolean;
  readonly delays?: Partial<Record<MockProviderOperation, number>>;
  readonly failures?: Partial<Record<MockProviderOperation, readonly Error[]>>;
  readonly unavailableTrackIds?: readonly string[];
  readonly expiredVariantKeys?: readonly string[];
  readonly interruptedVariantKeys?: readonly string[];
}

/** Offline provider для core-тестов: только явные сценарии, без retries и сети. */
export class MockMusicProvider implements MusicProvider {
  private account: Account | null = null;
  private readonly failures: Partial<Record<MockProviderOperation, Error[]>>;
  private readonly unavailableTrackIds: ReadonlySet<string>;
  private readonly expiredVariantKeys: ReadonlySet<string>;
  private readonly interruptedVariantKeys: ReadonlySet<string>;
  private readonly supportsRange: boolean;
  private readonly delays: Partial<Record<MockProviderOperation, number>>;

  public constructor(options: MockProviderOptions = {}) {
    this.failures = Object.fromEntries(
      Object.entries(options.failures ?? {}).map(([operation, errors]) => [
        operation,
        [...errors],
      ]),
    ) as Partial<Record<MockProviderOperation, Error[]>>;
    this.unavailableTrackIds = new Set(options.unavailableTrackIds);
    this.expiredVariantKeys = new Set(options.expiredVariantKeys);
    this.interruptedVariantKeys = new Set(options.interruptedVariantKeys);
    this.supportsRange = options.supportsRange ?? true;
    this.delays = options.delays ?? {};
  }

  public enqueueFailure(operation: MockProviderOperation, error: Error): void {
    (this.failures[operation] ??= []).push(error);
  }

  public async authenticate(): Promise<Account> {
    await this.before('authenticate');
    this.account = { ...mockAccount };
    return { ...this.account };
  }

  public async getAccount(): Promise<Account | null> {
    await this.before('getAccount');
    return this.account === null ? null : { ...this.account };
  }

  public async logout(): Promise<void> {
    await this.before('logout');
    this.account = null;
  }

  public async resolveUrl(url: string): Promise<MediaReference> {
    await this.before('resolveUrl');
    const match = /^mock:\/\/(track|album|playlist)\/([^/?#]+)$/.exec(url);
    if (match?.[1] === undefined || match[2] === undefined)
      throw new UnsupportedUrlError();
    const kind = toMediaKind(match[1]);
    return { provider: mockProviderId, kind, id: match[2] };
  }

  public async getTrack(id: string): Promise<Track> {
    await this.before('getTrack');
    this.assertAvailable(id);
    if (id !== mockTrack.id) throw new TrackUnavailableError();
    return cloneTrack(mockTrack);
  }

  public async getAlbum(id: string): Promise<Album> {
    await this.before('getAlbum');
    if (id !== mockAlbum.id) throw new TrackUnavailableError();
    return {
      ...mockAlbum,
      artists: [...mockAlbum.artists],
      tracks: mockAlbum.tracks.map(cloneTrack),
    };
  }

  public async getPlaylist(id: string): Promise<Playlist> {
    await this.before('getPlaylist');
    if (id !== mockPlaylist.id) throw new TrackUnavailableError();
    return {
      ...mockPlaylist,
      tracks: mockPlaylist.tracks.map(clonePlaylistTrack),
    };
  }

  public async getAudioVariants(
    trackId: string,
  ): Promise<readonly AudioVariant[]> {
    await this.before('getAudioVariants');
    this.assertAvailable(trackId);
    if (trackId !== mockTrack.id) throw new TrackUnavailableError();
    return mockVariants.map((variant) => ({ ...variant }));
  }

  public async openAudioStream(
    trackId: string,
    variantKey: string,
    options: StreamOptions,
  ): Promise<AudioStream> {
    await this.before('openAudioStream', options.signal);
    this.assertAvailable(trackId);
    if (
      trackId !== mockTrack.id ||
      !mockVariants.some((variant) => variant.key === variantKey)
    ) {
      throw new TrackUnavailableError();
    }
    if (this.expiredVariantKeys.has(variantKey))
      throw new ProviderError('STREAM_EXPIRED', true);
    const requestedOffset = options.offset ?? 0;
    const startOffset = this.supportsRange ? clampOffset(requestedOffset) : 0;
    const bytes = mockAudioBytes.slice(startOffset);
    return {
      stream: createByteStream(
        bytes,
        options.signal,
        this.interruptedVariantKeys.has(variantKey),
      ),
      contentLength: mockAudioBytes.byteLength,
      container: mockVariants[0]?.container ?? 'mp3',
      acceptsRanges: this.supportsRange,
      startOffset,
    };
  }

  public async fetchArtwork(
    artwork: ArtworkRef,
    size: number,
  ): Promise<ArtworkData> {
    await this.before('fetchArtwork');
    if (artwork.key !== mockArtwork.key || size <= 0)
      throw new TrackUnavailableError();
    return {
      bytes: mockArtworkData.bytes.slice(),
      mimeType: mockArtworkData.mimeType,
    };
  }

  private async before(
    operation: MockProviderOperation,
    signal?: AbortSignal,
  ): Promise<void> {
    const failure = this.failures[operation]?.shift();
    if (failure !== undefined) throw failure;
    await delay(this.delays[operation] ?? 0, signal);
  }

  private assertAvailable(trackId: string): void {
    if (this.unavailableTrackIds.has(trackId))
      throw new TrackUnavailableError();
  }
}

function clampOffset(offset: number): number {
  return Math.min(Math.max(0, offset), mockAudioBytes.byteLength);
}

function toMediaKind(value: string): MediaReference['kind'] {
  if (value === 'track' || value === 'album' || value === 'playlist')
    return value;
  throw new UnsupportedUrlError();
}

function cloneTrack(track: Track): Track {
  return {
    ...track,
    artists: [...track.artists],
    album: track.album === undefined ? undefined : { ...track.album },
  };
}

function clonePlaylistTrack(item: {
  readonly position: number;
  readonly track: Track;
}): { readonly position: number; readonly track: Track } {
  return { position: item.position, track: cloneTrack(item.track) };
}

function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted === true) return Promise.reject(new DownloadError(false));
  if (milliseconds === 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    function onAbort(): void {
      cleanupAndReject();
    }
    function cleanup(): void {
      signal?.removeEventListener('abort', onAbort);
    }
    function cleanupAndResolve(): void {
      cleanup();
      resolve();
    }
    function cleanupAndReject(): void {
      clearTimeout(timer);
      cleanup();
      reject(new DownloadError(false));
    }
    const timer = setTimeout(cleanupAndResolve, milliseconds);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function createByteStream(
  bytes: Uint8Array,
  signal: AbortSignal | undefined,
  interrupt: boolean,
): ReadableStream<Uint8Array> {
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  let sent = false;
  const cleanup = () => signal?.removeEventListener('abort', onAbort);
  const onAbort = () => {
    controller?.error(new DownloadError(false));
    cleanup();
  };
  return new ReadableStream<Uint8Array>({
    start(streamController) {
      controller = streamController;
      if (signal?.aborted === true) return onAbort();
      signal?.addEventListener('abort', onAbort, { once: true });
    },
    pull(streamController) {
      if (interrupt && !sent) {
        // F-002: prefix позволяет core проверить resume; @link ../../../planning/reviews/STEP-003/REVIEW-20261008T181759Z.md
        sent = true;
        streamController.enqueue(
          bytes.slice(0, interruptionPrefixLength(bytes)),
        );
      } else if (interrupt) {
        cleanup();
        streamController.error(new ProviderError('NETWORK_ERROR', true));
      } else if (sent) {
        cleanup();
        streamController.close();
      } else {
        sent = true;
        streamController.enqueue(bytes);
      }
    },
    cancel: cleanup,
  });
}

function interruptionPrefixLength(bytes: Uint8Array): number {
  return Math.max(1, Math.floor(bytes.byteLength / 2));
}
