import type {
  ApplicationApi,
  ApplicationResult,
  DiagnosticsDto,
  JobSnapshot,
} from './application.js';
import type { DownloadRequest, MediaReference } from './domain.js';
import type { DesktopSettings, NamingPreset } from './desktop-settings.js';

/** Полный эффективный снимок: defaults после создания не могут изменить replay. */
export interface EffectiveDownload extends DownloadRequest {
  readonly overwrite: boolean;
  readonly naming: NamingPreset;
}
export interface HistoryEntry {
  readonly jobId: string;
  readonly source: MediaReference;
  readonly title: string;
  readonly artists: readonly string[];
  readonly count: number;
  readonly bytes: number | null;
  readonly completedAt: string;
  readonly replayAvailable: boolean;
  readonly replayReason: string | null;
}
export interface SavedDiagnostics {
  readonly checkedAt: string;
  readonly diagnostics: DiagnosticsDto;
}
/** Узкий синхронный порт: startup settings читаются до создания scheduler/logger. */
export interface DesktopStateStore {
  settings(): DesktopSettings;
  saveSettings(value: DesktopSettings): void;
  snapshot(jobId: string): EffectiveDownload | null;
  saveSnapshot(jobId: string, value: EffectiveDownload): void;
  hidden(): readonly string[];
  hide(jobId: string): void;
  diagnostics(): SavedDiagnostics | null;
  saveDiagnostics(value: SavedDiagnostics): void;
  close(): void;
}
/** Отдельное расширение сохраняет совместимость существующего ApplicationApi и CLI. */
export interface DesktopApplicationApi extends ApplicationApi {
  getSettings(): Promise<ApplicationResult<DesktopSettings>>;
  saveSettings(
    value: DesktopSettings,
  ): Promise<ApplicationResult<DesktopSettings>>;
  history(): Promise<ApplicationResult<readonly HistoryEntry[]>>;
  hideHistory(jobId: string): Promise<ApplicationResult<null>>;
  replay(jobId: string): Promise<ApplicationResult<JobSnapshot>>;
  lastDiagnostics(): Promise<ApplicationResult<SavedDiagnostics | null>>;
  refreshDiagnostics(): Promise<ApplicationResult<SavedDiagnostics>>;
}
