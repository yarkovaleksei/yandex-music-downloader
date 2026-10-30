import type {
  DownloadJobStatus,
  DownloadRequest,
  MediaReference,
  QualityPreference,
  VariantSelection,
} from './domain.js';
import type { Account } from './provider.js';
import type { CommandErrorDto, JsonObject, JobEvent } from './events.js';

/** Переносимый снимок задания не раскрывает аренду, provider или файловые handles. */
export interface JobSnapshot {
  readonly jobId: string;
  readonly source: MediaReference;
  readonly status: DownloadJobStatus;
  readonly title?: string;
  readonly author?: string;
  readonly publicUrl?: string;
  readonly pauseReason?: string;
  readonly tracks: readonly {
    readonly trackKey: string;
    readonly status: string;
    readonly resultPath?: string;
  }[];
}

export interface ArtworkDto {
  readonly mimeType: string;
  readonly base64: string;
}

export interface PreviewDto {
  readonly source: MediaReference;
  readonly title: string;
  readonly kind: MediaReference['kind'];
  readonly tracks: readonly JsonObject[];
  readonly artwork?: ArtworkDto;
  readonly author?: string;
  readonly description?: string;
  readonly durationMs?: number;
  readonly authorArtwork?: ArtworkDto;
  readonly variants?: readonly {
    readonly selection: VariantSelection;
    readonly available: number;
    readonly total: number;
  }[];
  readonly qualities?: readonly {
    readonly preference: QualityPreference;
    readonly available: number;
    readonly total: number;
  }[];
}

export interface DiagnosticsDto {
  readonly available: boolean;
  readonly backend?: string;
  readonly configuration?: JsonObject;
}

/** Результат application-команды сохраняет envelope ADR-007 без CLI/IPC транспорта. */
export type ApplicationResult<T> =
  | {
      readonly schemaVersion: 1;
      readonly kind: 'result';
      readonly command: string;
      readonly data: T;
      readonly error?: never;
    }
  | {
      readonly schemaVersion: 1;
      readonly kind: 'error';
      readonly command: string;
      readonly error: CommandErrorDto;
      readonly data?: never;
    };

/** Единая transport-neutral граница клиентов application. */
export interface ApplicationApi {
  authenticate(): Promise<ApplicationResult<Account>>;
  account(): Promise<ApplicationResult<Account | null>>;
  logout(): Promise<ApplicationResult<null>>;
  resolve(url: string): Promise<ApplicationResult<MediaReference>>;
  preview(source: MediaReference): Promise<ApplicationResult<PreviewDto>>;
  createDownload(
    request: DownloadRequest,
  ): Promise<ApplicationResult<JobSnapshot>>;
  pause(jobId: string): Promise<ApplicationResult<JobSnapshot>>;
  resume(jobId: string): Promise<ApplicationResult<JobSnapshot>>;
  retry(jobId: string): Promise<ApplicationResult<JobSnapshot>>;
  cancel(jobId: string): Promise<ApplicationResult<JobSnapshot>>;
  listJobs(): Promise<ApplicationResult<readonly JobSnapshot[]>>;
  /** `data: null` означает, что сохранённого задания не существует. */
  getJob(jobId: string): Promise<ApplicationResult<JobSnapshot | null>>;
  subscribe(listener: (event: JobEvent) => void): () => void;
  diagnostics(): Promise<ApplicationResult<DiagnosticsDto>>;
  shutdown(): Promise<ApplicationResult<null>>;
}
