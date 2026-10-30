/** Идентификатор конкретного источника; его значение сохраняется вместе с media reference. */
export type ProviderId = string;

export type MediaKind = 'track' | 'album' | 'playlist';

export interface Artist {
  readonly id: string;
  readonly name: string;
  readonly artwork?: ArtworkRef;
}

/** Непрозрачная ссылка на artwork: клиент не получает CDN URL и параметры доступа. */
export interface ArtworkRef {
  readonly key: string;
}

export interface AlbumReference {
  readonly id: string;
  readonly title: string;
  readonly genre?: string;
  readonly artwork?: ArtworkRef;
}

/** Снимок доступа provider для текущего аккаунта; unknown не разрешает чтение аудио.
 * @link ../../../docs/adr/ADR-011-shared-metadata-contract.md
 */
export type TrackAvailability = 'available' | 'unavailable' | 'unknown';

/** Общие metadata сохраняют реально сообщённые поля даже при отсутствии доступа. */
export interface TrackMetadata {
  readonly id: string;
  readonly title?: string;
  readonly artists?: readonly Artist[];
  readonly album?: AlbumReference;
  readonly durationMs?: number;
  /** F-001: метаданные brief §8; @link ../../../planning/reviews/STEP-003/REVIEW-20261008T181759Z.md */
  readonly trackNumber?: number;
  readonly discNumber?: number;
  readonly year?: number;
  readonly genre?: string;
  readonly artwork?: ArtworkRef;
}

export interface AvailableTrack extends TrackMetadata {
  readonly availability: 'available';
  readonly title: string;
  readonly artists: readonly Artist[];
}

export interface UnavailableTrack extends TrackMetadata {
  readonly availability: 'unavailable';
}

export interface UnknownTrack extends TrackMetadata {
  readonly availability: 'unknown';
}

/** Минимальная запись с ID сохраняет место в коллекции без выдуманных title/artists. */
export type Track = AvailableTrack | UnavailableTrack | UnknownTrack;

export interface Album {
  readonly description?: string;
  readonly id: string;
  readonly title: string;
  readonly artists: readonly Artist[];
  readonly year?: number;
  readonly genre?: string;
  readonly artwork?: ArtworkRef;
  readonly tracks: readonly Track[];
}

export interface PlaylistTrack {
  /** Позиция отличает повтор одного track в плейлисте. */
  readonly position: number;
  readonly track: Track;
}

export interface Playlist {
  readonly description?: string;
  readonly authorArtwork?: ArtworkRef;
  readonly id: string;
  readonly title: string;
  /** F-001: владелец из brief §8; @link ../../../planning/reviews/STEP-003/REVIEW-20261008T181759Z.md */
  readonly owner?: string;
  readonly artwork?: ArtworkRef;
  readonly tracks: readonly PlaylistTrack[];
}

export type AudioContainer = 'mp3' | 'm4a' | 'flac' | 'ogg' | 'opus' | string;

export interface AudioVariant {
  /** Стабильный непрозрачный ключ выбранного варианта без ключей расшифровки. */
  readonly key: string;
  readonly codec: string;
  readonly container: AudioContainer;
  readonly bitrate?: number;
  readonly lossless: boolean;
}

/** Точное переносимое описание варианта без provider key. @link ../../../planning/tasks/STEP-058.md */
export interface VariantSelection {
  readonly codec: string;
  readonly container: string;
  readonly lossless: boolean;
  readonly bitrate?: number;
}

export type QualityPreference = 'best' | 'lossless' | 'high' | 'normal';

export interface MediaReference {
  readonly provider: ProviderId;
  readonly kind: MediaKind;
  readonly id: string;
}

export interface DownloadRequest {
  readonly source: MediaReference;
  readonly quality: QualityPreference;
  readonly destination: string;
  readonly variantSelection?: VariantSelection;
  /** Явно заменяет существующий файл; по умолчанию core сохраняет skip policy. */
  readonly overwrite?: boolean;
}

/** Перечисление данных состояния; переходы принадлежат будущему core. */
export type DownloadTrackStatus =
  | 'queued'
  | 'resolving'
  | 'ready'
  | 'downloading'
  | 'processing'
  | 'retry_wait'
  | 'paused'
  | 'completed'
  | 'skipped'
  | 'failed'
  | 'cancelled';

export type DownloadJobControl = 'running' | 'paused' | 'cancelled';

/** F-003: агрегаты job без промежуточных фаз track; @link ../../../planning/reviews/STEP-003/REVIEW-20261008T181759Z.md */
export type DownloadJobStatus =
  | 'queued'
  | 'running'
  | 'paused'
  | 'cancelled'
  | 'interrupted'
  | 'completed'
  | 'completed_with_errors'
  | 'failed';

export interface DownloadTrackJob {
  /** Позиционный ключ, а не track ID, сохраняет повторы в playlist. */
  readonly trackKey: string;
  readonly trackId: string;
  readonly status: DownloadTrackStatus;
  readonly variant?: AudioVariant;
}

export interface DownloadJob {
  readonly id: string;
  readonly source: MediaReference;
  readonly status: DownloadJobStatus;
  readonly control: DownloadJobControl;
  readonly tracks: readonly DownloadTrackJob[];
  readonly createdAt: string;
  readonly updatedAt: string;
}
