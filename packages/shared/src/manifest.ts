import type {
  AudioVariant,
  DownloadJobControl,
  DownloadTrackStatus,
  MediaReference,
  Track,
} from './domain.js';
import { DomainError, ValidationError } from './errors.js';
import type { DomainErrorJson } from './errors.js';
import type { DownloadPlan } from './plan.js';

/** Долговечный снимок задания v1; в JSON попадают только явно перечисленные поля ADR-004. */
export interface JobManifestV1 {
  readonly version: 1;
  readonly jobId: string;
  readonly provider: string;
  readonly source: DownloadPlan['source'];
  readonly plan: DownloadPlan;
  readonly quality: string;
  readonly destination: string;
  readonly control: ManifestControl;
  readonly tracks: readonly ManifestTrack[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastControl?: ControlReceipt;
}

export interface ManifestControl {
  readonly state: DownloadJobControl;
  readonly pauseReason?: string;
  readonly pauseTrackKey?: string;
}

export interface ManifestTrack {
  readonly position: number;
  readonly trackKey: string;
  readonly status: DownloadTrackStatus;
  readonly retryPhase?: 'resolving' | 'downloading' | 'processing';
  readonly variant?: AudioVariant;
  readonly variantKey?: string;
  readonly resultPath?: string;
  readonly partPath?: string;
  readonly attempts: number;
  readonly history: readonly ManifestHistoryEntry[];
  readonly error?: DomainErrorJson;
  readonly updatedAt: string;
  readonly partial?: ManifestPartial;
  /** Checkpoint, сохранённый после final validation и до rename (ADR-004). */
  readonly postProcessing?: PostProcessingMarker;
}

export interface ManifestHistoryEntry {
  readonly at: string;
  readonly status: DownloadTrackStatus;
  readonly error?: DomainErrorJson;
}

export interface ManifestPartial {
  readonly bytes: number;
  readonly expectedSize?: number;
  readonly variantKey: string;
  readonly tagged: boolean;
}

export interface PostProcessingMarker {
  readonly size: number;
  readonly identity?: string;
}

export interface LeaseIdentity {
  readonly pid: number;
  readonly hostname: string;
  readonly processStartedAt: string;
}

export interface LeaseRecord extends LeaseIdentity {
  readonly generation: number;
  readonly ownerToken: string;
  readonly acquiredAt: string;
  readonly heartbeatAt: string;
  readonly releasedAt?: string;
}

export interface ControlRequest {
  readonly requestId: string;
  readonly command: 'pause' | 'resume' | 'cancel' | 'retry';
  readonly createdAt: string;
}

export interface ControlReceipt {
  readonly requestId: string;
  readonly accepted: boolean;
  readonly completedAt: string;
  readonly error?: DomainErrorJson;
}

export interface LeaseSession {
  readonly jobId: string;
  readonly identity: LeaseIdentity;
  readonly manifest: JobManifestV1;
  save(manifest: JobManifestV1): Promise<void>;
  heartbeat(): Promise<void>;
  consumeControls(
    handler: (request: ControlRequest) => Promise<ControlReceipt>,
  ): Promise<readonly ControlReceipt[]>;
  acknowledge(receipt: ControlReceipt): Promise<void>;
  runOwned<T>(operation: () => Promise<T>): Promise<T>;
  release(): Promise<void>;
}

export interface AcquireOptions {
  readonly identity?: LeaseIdentity;
  readonly forceForeignLease?: boolean;
  readonly expectedGeneration?: number;
  readonly recover: (manifest: JobManifestV1) => Promise<JobManifestV1>;
}

/** Неизвестное состояние аренды нельзя преобразовывать в leaseAlive=false. */
export type LeaseState = 'active' | 'inactive' | 'unknown';

/** Порт persistence: core зависит только от этого интерфейса, а не от файловой реализации. */
export interface ManifestStore {
  read(jobId: string): Promise<JobManifestV1 | undefined>;
  /**
   * Снимок политики ADR-004: inactive — нет аренды, она освобождена или распознана устаревшей.
   * Не доказывает существование job, не даёт права записи или общей транзакции с read/list.
   * @link planning/tasks/STEP-043.md; обработка unknown в application — STEP-018.
   */
  readLeaseState(jobId: string): Promise<LeaseState>;
  /**
   * Все сохранённые задания без дубликатов, в строковом порядке jobId независимо от locale.
   * Только чтение: без аренды, recovery и записи; общая транзакция всех job не обещается.
   * @link planning/tasks/STEP-042.md; подключение application listJobs принадлежит STEP-018.
   */
  list(): Promise<readonly JobManifestV1[]>;
  create(manifest: JobManifestV1): Promise<void>;
  acquire(jobId: string, options: AcquireOptions): Promise<LeaseSession>;
  sendControl(
    jobId: string,
    request: Omit<ControlRequest, 'requestId' | 'createdAt'>,
  ): Promise<ControlRequest>;
  waitControlAck(
    jobId: string,
    requestId: string,
    timeoutMs?: number,
  ): Promise<ControlReceipt | undefined>;
}

type JsonRecord = Record<string, unknown>;
const statuses = new Set<DownloadTrackStatus>([
  'queued',
  'resolving',
  'ready',
  'downloading',
  'processing',
  'retry_wait',
  'paused',
  'completed',
  'skipped',
  'failed',
  'cancelled',
]);
const retryPhases = new Set<NonNullable<ManifestTrack['retryPhase']>>([
  'resolving',
  'downloading',
  'processing',
]);
const errorCodes = new Set([
  'NETWORK_ERROR',
  'AUTH_ERROR',
  'API_CHANGED',
  'SERVICE_UNAVAILABLE',
  'PROVIDER_RESPONSE_INVALID',
  'STREAM_EXPIRED',
  'UNSUPPORTED_URL',
  'TRACK_UNAVAILABLE',
  'QUALITY_UNAVAILABLE',
  'DOWNLOAD_ERROR',
  'DISK_FULL',
  'PERMISSION_DENIED',
  'VALIDATION_ERROR',
  'METADATA_ERROR',
]);

function record(value: unknown): JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new ValidationError();
  return value as JsonRecord;
}
function string(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0)
    throw new ValidationError();
  return value;
}
function optionalString(value: unknown): string | undefined {
  return value === undefined ? undefined : string(value);
}
function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new ValidationError();
  return value;
}
function bool(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new ValidationError();
  return value;
}
function array(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) throw new ValidationError();
  return value;
}

/** Ошибка сохраняет только код из публичного словаря и его каноническое сообщение. */
function safeError(value: unknown): DomainErrorJson | undefined {
  if (value === undefined) return undefined;
  const item = record(value);
  const code = string(item.code);
  if (!errorCodes.has(code)) throw new ValidationError();
  return safeDomainError(new DomainError(code, bool(item.retryable)));
}

function decodeSource(value: unknown): MediaReference {
  const item = record(value);
  const kind = string(item.kind);
  if (kind !== 'track' && kind !== 'album' && kind !== 'playlist')
    throw new ValidationError();
  return { provider: string(item.provider), kind, id: string(item.id) };
}
function decodeArtwork(value: unknown) {
  const item = record(value);
  return { key: string(item.key) };
}
function decodeArtists(value: unknown) {
  return array(value).map((artist) => {
    const item = record(artist);
    return { id: string(item.id), name: string(item.name) };
  });
}
function decodeTrackMetadata(value: unknown): Track {
  const item = record(value);
  const availability = string(item.availability);
  if (
    availability !== 'available' &&
    availability !== 'unavailable' &&
    availability !== 'unknown'
  )
    throw new ValidationError();
  const metadata = {
    id: string(item.id),
    title: optionalString(item.title),
    artists:
      item.artists === undefined ? undefined : decodeArtists(item.artists),
    album:
      item.album === undefined
        ? undefined
        : (() => {
            const album = record(item.album);
            return {
              id: string(album.id),
              title: string(album.title),
              genre: optionalString(album.genre),
              artwork:
                album.artwork === undefined
                  ? undefined
                  : decodeArtwork(album.artwork),
            };
          })(),
    durationMs:
      item.durationMs === undefined ? undefined : integer(item.durationMs),
    trackNumber:
      item.trackNumber === undefined ? undefined : integer(item.trackNumber),
    discNumber:
      item.discNumber === undefined ? undefined : integer(item.discNumber),
    year: item.year === undefined ? undefined : integer(item.year),
    genre: optionalString(item.genre),
    artwork:
      item.artwork === undefined ? undefined : decodeArtwork(item.artwork),
  };
  if (availability === 'available') {
    if (metadata.title === undefined || metadata.artists === undefined)
      throw new ValidationError();
    return {
      ...metadata,
      availability,
      title: metadata.title,
      artists: metadata.artists,
    };
  }
  return { ...metadata, availability };
}
function decodeVariant(value: unknown): AudioVariant {
  const item = record(value);
  return {
    key: string(item.key),
    codec: string(item.codec),
    container: string(item.container),
    bitrate: item.bitrate === undefined ? undefined : integer(item.bitrate),
    lossless: bool(item.lossless),
  };
}
function decodePlan(value: unknown): DownloadPlan {
  const item = record(value);
  const tracks = array(item.tracks).map((entry, index) => {
    const planned = record(entry);
    const position = integer(planned.position);
    if (position !== index + 1 || string(planned.trackKey) !== String(position))
      throw new ValidationError();
    return {
      position,
      trackKey: string(planned.trackKey),
      track: decodeTrackMetadata(planned.track),
    };
  });
  return {
    source: decodeSource(item.source),
    title: string(item.title),
    // REQ-058: автор коллекции сохраняется в immutable plan для карточки задания.
    ...(item.author === undefined ? {} : { author: string(item.author) }),
    tracks,
  };
}
function decodeControl(value: unknown): ManifestControl {
  const item = record(value);
  if (
    item.state !== 'running' &&
    item.state !== 'paused' &&
    item.state !== 'cancelled'
  )
    throw new ValidationError();
  return {
    state: item.state,
    pauseReason: optionalString(item.pauseReason),
    pauseTrackKey: optionalString(item.pauseTrackKey),
  };
}
/** Общая граница inbox: запросы из JSON не получают произвольных полей. */
export function decodeControlRequest(value: unknown): ControlRequest {
  const item = record(value);
  if (
    item.command !== 'pause' &&
    item.command !== 'resume' &&
    item.command !== 'cancel' &&
    item.command !== 'retry'
  )
    throw new ValidationError();
  return {
    requestId: string(item.requestId),
    command: item.command,
    createdAt: string(item.createdAt),
  };
}
/** Общая граница inbox и manifest: receipt проецируется тем же allowlist. */
export function decodeControlReceipt(value: unknown): ControlReceipt {
  const item = record(value);
  return {
    requestId: string(item.requestId),
    accepted: bool(item.accepted),
    completedAt: string(item.completedAt),
    error: safeError(item.error),
  };
}

function decodeTrack(value: unknown): ManifestTrack {
  const item = record(value);
  const status = string(item.status) as DownloadTrackStatus;
  if (!statuses.has(status)) throw new ValidationError();
  const retryPhase =
    item.retryPhase === undefined
      ? undefined
      : (string(item.retryPhase) as ManifestTrack['retryPhase']);
  if (retryPhase !== undefined && !retryPhases.has(retryPhase))
    throw new ValidationError();
  const partial =
    item.partial === undefined
      ? undefined
      : (() => {
          const p = record(item.partial);
          return {
            bytes: integer(p.bytes),
            expectedSize:
              p.expectedSize === undefined
                ? undefined
                : integer(p.expectedSize),
            variantKey: string(p.variantKey),
            tagged: bool(p.tagged),
          };
        })();
  const marker =
    item.postProcessing === undefined
      ? undefined
      : (() => {
          const p = record(item.postProcessing);
          return {
            size: integer(p.size),
            identity: p.identity === undefined ? undefined : string(p.identity),
          };
        })();
  const history = Array.isArray(item.history)
    ? item.history.map((entry) => {
        const h = record(entry);
        const hStatus = string(h.status) as DownloadTrackStatus;
        if (!statuses.has(hStatus)) throw new ValidationError();
        return { at: string(h.at), status: hStatus, error: safeError(h.error) };
      })
    : (() => {
        throw new ValidationError();
      })();
  return {
    position: integer(item.position),
    trackKey: string(item.trackKey),
    status,
    retryPhase,
    variant:
      item.variant === undefined ? undefined : decodeVariant(item.variant),
    variantKey:
      item.variantKey === undefined ? undefined : string(item.variantKey),
    resultPath:
      item.resultPath === undefined ? undefined : string(item.resultPath),
    partPath: item.partPath === undefined ? undefined : string(item.partPath),
    attempts: integer(item.attempts),
    history,
    error: safeError(item.error),
    updatedAt: string(item.updatedAt),
    partial,
    postProcessing: marker,
  };
}

/** Декодер отвергает будущие форматы до любой перезаписи и сверяет позиционный план. */
export function decodeManifest(bytes: string): JobManifestV1 {
  let raw: unknown;
  try {
    raw = JSON.parse(bytes);
  } catch {
    throw new ValidationError();
  }
  const item = record(raw);
  if (item.version !== 1) throw new ValidationError();
  const plan = decodePlan(item.plan);
  const planTracks = plan.tracks;
  const tracks = array(item.tracks).map(decodeTrack);
  if (planTracks.length !== tracks.length) throw new ValidationError();
  for (const [index, track] of tracks.entries()) {
    const planned = planTracks[index];
    if (
      track.position !== index + 1 ||
      track.position !== planned?.position ||
      track.trackKey !== planned?.trackKey
    )
      throw new ValidationError();
  }
  const source = decodeSource(item.source);
  if (JSON.stringify(source) !== JSON.stringify(plan.source))
    throw new ValidationError();
  return freezeManifest({
    version: 1,
    jobId: string(item.jobId),
    provider: string(item.provider),
    source,
    plan,
    quality: string(item.quality),
    destination: string(item.destination),
    control: decodeControl(item.control),
    tracks,
    createdAt: string(item.createdAt),
    updatedAt: string(item.updatedAt),
    lastControl:
      item.lastControl === undefined
        ? undefined
        : decodeControlReceipt(item.lastControl),
  });
}

/** Проекция через JSON не переносит runtime-поля provider, AudioStream, cause или credentials. */
export function encodeManifest(manifest: JobManifestV1): string {
  const checked = decodeManifest(JSON.stringify(manifest));
  return JSON.stringify(checked);
}

export function safeDomainError(error: unknown): DomainErrorJson {
  if (error instanceof DomainError) return error.toJSON();
  return {
    code: 'DOWNLOAD_ERROR',
    message: 'Операция не выполнена.',
    retryable: false,
  };
}

function freezeManifest(manifest: JobManifestV1): JobManifestV1 {
  for (const planned of manifest.plan.tracks) {
    for (const artist of planned.track.artists ?? []) Object.freeze(artist);
    Object.freeze(planned.track.artists);
    if (planned.track.album !== undefined) {
      Object.freeze(planned.track.album.artwork);
      Object.freeze(planned.track.album);
    }
    Object.freeze(planned.track.artwork);
    Object.freeze(planned.track);
    Object.freeze(planned);
  }
  // План отделён от mutable state: freeze охватывает записи, metadata и source.
  Object.freeze(manifest.plan.source);
  Object.freeze(manifest.plan.tracks);
  Object.freeze(manifest.plan);
  Object.freeze(manifest.tracks);
  return Object.freeze(manifest);
}
