import type {
  ApplicationApi,
  ApplicationResult,
  DiagnosticsDto,
  ArtworkDto,
  JobSnapshot,
} from './application.js';
import type { JsonObject, JsonValue } from './events.js';
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
  readonly publicUrl?: string;
  readonly artwork?: ArtworkDto;
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
  hiddenDownloads(): readonly string[];
  hideDownloads(jobIds: readonly string[]): void;
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
  getDownload(jobId: string): Promise<ApplicationResult<JobSnapshot | null>>;
  listDownloads(): Promise<ApplicationResult<readonly JobSnapshot[]>>;
  clearDownloads(): Promise<ApplicationResult<number>>;
  history(): Promise<ApplicationResult<readonly HistoryEntry[]>>;
  historyArtwork(jobId: string): Promise<ApplicationResult<ArtworkDto | null>>;
  hideHistory(jobId: string): Promise<ApplicationResult<null>>;
  replay(jobId: string): Promise<ApplicationResult<JobSnapshot>>;
  checkFfmpeg(
    ffmpegPath?: string | null,
  ): Promise<ApplicationResult<{ readonly available: boolean }>>;
  lastDiagnostics(): Promise<ApplicationResult<SavedDiagnostics | null>>;
  refreshDiagnostics(): Promise<ApplicationResult<SavedDiagnostics>>;
}

/** REQ-057: применимо и к старым сохранённым результатам; служебные строки не влияют на итог. */
export function desktopDiagnostics(value: DiagnosticsDto): DiagnosticsDto {
  const raw = value.configuration?.checks;
  const allowed = [
    'runtime',
    'credentialStore',
    'provider',
    'auth',
    'account',
    'metadata',
    'audioVariants',
    'manifestStore',
    'filesystem',
  ];
  const checks: Record<string, JsonValue> = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [key, item] of Object.entries(raw)) {
      if (
        allowed.includes(key) &&
        item &&
        typeof item === 'object' &&
        !Array.isArray(item) &&
        (item as JsonObject).code !== 'NOT_APPLICABLE'
      )
        checks[key] = item;
    }
  }
  const required = [
    'runtime',
    'provider',
    'auth',
    'account',
    'metadata',
    'audioVariants',
    'manifestStore',
    'filesystem',
  ];
  return {
    ...value,
    configuration: { ...value.configuration, checks },
    available:
      Object.values(checks).every(
        (check) => (check as JsonObject).status === 'ok',
      ) &&
      required.every((key) => {
        const check = checks[key];
        return (
          check &&
          typeof check === 'object' &&
          !Array.isArray(check) &&
          (check as JsonObject).status === 'ok'
        );
      }),
  };
}
