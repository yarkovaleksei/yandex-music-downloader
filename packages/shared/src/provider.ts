import type {
  Album,
  ArtworkRef,
  AudioContainer,
  AudioVariant,
  MediaReference,
  Playlist,
  Track,
} from './domain.js';

export interface Account {
  readonly id: string;
  readonly displayName: string;
}

/** Временный минимальный порт авторизации до уточнения сценариев в STEP-006. */
export interface AuthInteraction {
  notify(message: string): void | Promise<void>;
}

/** Порт защищённого хранения credentials; реализация не входит в shared. */
export interface CredentialStore {
  read(): Promise<string | null>;
  write(credential: string): Promise<void>;
  clear(): Promise<void>;
}

export interface StreamOptions {
  readonly signal?: AbortSignal;
  readonly offset?: number;
}

export interface AudioStream {
  readonly stream: ReadableStream<Uint8Array>;
  /** Полный размер выбранного аудио, а не размер возвращённого suffix. */
  readonly contentLength?: number;
  readonly container: AudioContainer;
  readonly acceptsRanges: boolean;
  /** Фактическое смещение первого возвращённого байта. */
  readonly startOffset: number;
}

export interface ArtworkData {
  readonly bytes: Uint8Array;
  readonly mimeType: string;
}

/** Единственный provider-контракт, от которого могут зависеть core и клиенты. */
export interface MusicProvider {
  authenticate(): Promise<Account>;
  getAccount(): Promise<Account | null>;
  logout(): Promise<void>;
  resolveUrl(url: string): Promise<MediaReference>;
  getTrack(id: string): Promise<Track>;
  getAlbum(id: string): Promise<Album>;
  getPlaylist(id: string): Promise<Playlist>;
  getAudioVariants(trackId: string): Promise<readonly AudioVariant[]>;
  openAudioStream(
    trackId: string,
    variantKey: string,
    options: StreamOptions,
  ): Promise<AudioStream>;
  fetchArtwork(artwork: ArtworkRef, size: number): Promise<ArtworkData>;
}
