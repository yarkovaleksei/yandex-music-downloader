import type {
  ArtworkData,
  AudioStream,
  AudioVariant,
  JobEvent,
  JobManifestV1,
  LeaseSession,
  ManifestPartial,
  ManifestStore,
  MediaKind,
  MusicProvider,
  PlannedTrack,
  QualityPreference,
} from '@music-downloader/shared';
import type { AudioValidator } from '@music-downloader/core-validation';

/** Очередь создаётся composition root и общая для всех job данного manager. */
export interface SchedulerPort {
  readonly concurrency: number;
  readonly activeCount: number;
  run<T>(operation: () => Promise<T>): Promise<T>;
}

export interface RetryOutcome {
  readonly action: 'retry' | 'reopen_stream' | 'fail' | 'pause_job';
  readonly delayMs?: number;
  readonly reason?: 'AUTH_REQUIRED' | 'DISK_FULL' | 'PERMISSION_DENIED';
}

export interface RangeResponse {
  readonly acceptsRanges: boolean;
  readonly startOffset: number;
  readonly contentLength: number;
  readonly stream: ReadableStream<Uint8Array>;
}
export interface RangeFiles {
  readonly stat: (path: string) => Promise<number | undefined>;
  readonly read: (path: string) => Promise<Uint8Array>;
  readonly candidatePath: (path: string) => string;
  readonly writeStreamToPart: (
    stream: ReadableStream<Uint8Array>,
    path: string,
    expected: number,
  ) => Promise<void>;
  readonly promote: (candidate: string, canonical: string) => Promise<void>;
  readonly reopenAtZero: () => Promise<RangeResponse>;
}

/** Только существующие операции filesystem; алгоритмы writer/range/finalization не копируются. */
export interface DownloadFiles {
  paths(
    manifest: JobManifestV1,
    trackKey: string,
    variant: AudioVariant,
  ): { partPath: string; resultPath: string };
  stat(path: string): Promise<number | undefined>;
  read(path: string): Promise<Uint8Array>;
  promote(from: string, to: string): Promise<void>;
  discard(path: string): Promise<void>;
  inspect(path: string): Promise<'absent' | 'valid' | 'invalid'>;
  write(
    stream: ReadableStream<Uint8Array>,
    path: string,
    options: { signal: AbortSignal; expectedSize?: number },
  ): Promise<unknown>;
  finalize(
    partPath: string,
    resultPath: string,
    variant: AudioVariant,
    onExisting: 'skip' | 'replace',
  ): Promise<{ status: 'completed' | 'skipped'; path: string }>;
}

export interface ProcessingHooks {
  validate?(
    partPath: string,
    variant: AudioVariant,
    stage: 'initial' | 'final',
  ): Promise<void>;
  metadata?(
    partPath: string,
    variant: AudioVariant,
    artwork?: ArtworkData,
    context?: MetadataProcessingContext,
  ): Promise<void>;
}

/**
 * Snapshot передаёт writer только provider-neutral данные, полученные до processing.
 * Старый трёхаргументный callback остаётся совместимым с trailing context.
 */
export interface MetadataProcessingContext {
  readonly plannedTrack: PlannedTrack;
  readonly sourceKind: MediaKind;
  readonly resultPath: string;
  readonly embedArtwork: boolean;
  readonly saveCoverFile: boolean;
}

export interface EventPublisher {
  /** Общий seq source связывает pre-manager события application и job lifecycle. */
  nextSequence?(jobId: string): number;
  publish(event: JobEvent): void | Promise<void>;
}

/** Безопасный cache операции: ready artwork переживает SIGINT/restart без сетевых вызовов processing. */
export interface ArtworkCache {
  read(
    jobId: string,
    trackKey: string,
  ): Promise<{ artwork?: ArtworkData } | undefined>;
  write(
    jobId: string,
    trackKey: string,
    entry: { artwork?: ArtworkData },
  ): Promise<void>;
}

/** Concrete adapters связывает STEP-018; вся orchestration остаётся в Download Manager. */
export interface DownloadManagerDependencies {
  readonly store: ManifestStore;
  readonly provider: MusicProvider;
  readonly scheduler: SchedulerPort;
  readonly files: DownloadFiles;
  readonly artworkCache: ArtworkCache;
  readonly recover: (manifest: JobManifestV1) => Promise<JobManifestV1>;
  readonly selectVariant: (
    variants: readonly AudioVariant[],
    quality: QualityPreference,
  ) =>
    | { readonly ok: true; readonly variant: AudioVariant }
    | { readonly ok: false; readonly error: unknown };
  readonly retry: (error: unknown, failedAttempts: number) => RetryOutcome;
  readonly prepareRange: (
    files: RangeFiles,
    partPath: string,
    partial: ManifestPartial | undefined,
    variantKey: string,
    response: RangeResponse,
  ) => Promise<{ offset: number; expectedSize: number }>;
  readonly checkpoint: (
    session: LeaseSession,
    trackKey: string,
    operations: {
      mutateAndValidate(): Promise<void>;
      size(): Promise<number>;
      rename(): Promise<void>;
    },
  ) => Promise<void>;
  /** Baseline всегда проверяет локальный файл, hooks расширяют его, но не заменяют. */
  readonly validator?: AudioValidator;
  readonly processing?: ProcessingHooks;
  readonly events?: EventPublisher;
  readonly now?: () => number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

export interface DownloadManagerOptions {
  readonly stopTimeoutMs?: number;
  readonly controlPollMs?: number;
  readonly progressFlushMs?: number;
  readonly overwrite?: boolean;
  readonly artworkSize?: number;
}

export type StreamResult = AudioStream;
