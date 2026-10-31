import type Database from 'better-sqlite3';
import {
  defaultDesktopSettings,
  desktopSettings,
  variantSelection,
  ValidationError,
  type DesktopSettings,
  type DesktopStateStore,
  type EffectiveDownload,
  type SavedDiagnostics,
  type JsonValue,
  type JsonObject,
} from '@music-downloader/shared';
import { assertSchemaVersion, openStateDatabase } from './sqlite-database.js';
import {
  sqliteMigrations,
  supportedSchemaVersion,
} from './sqlite-migrations.js';
import { safeStoreError } from './sqlite-errors.js';

/** ADR-014: все desktop данные живут в той же базе и проходят guard каждой записи. */
export class SqliteDesktopStateStore implements DesktopStateStore {
  private db?: Database.Database;
  public constructor(private readonly options: { stateDir: string }) {}
  private connection() {
    return (this.db ??= openStateDatabase(this.options));
  }
  private read(table: string, key: string | number): unknown {
    try {
      const field = table === 'job_settings' ? 'job_id' : 'id';
      const row = this.connection()
        .prepare(`SELECT value FROM ${table} WHERE ${field} = ?`)
        .get(key) as { value: string } | undefined;
      return row ? (JSON.parse(row.value) as unknown) : null;
    } catch (error) {
      throw safeStoreError(error);
    }
  }
  private write(table: string, key: string | number, value: unknown) {
    try {
      const db = this.connection();
      db.transaction(() => {
        assertSchemaVersion(db, supportedSchemaVersion(sqliteMigrations));
        const field = table === 'job_settings' ? 'job_id' : 'id';
        db.prepare(
          `INSERT INTO ${table} (${field}, value) VALUES (?, ?) ON CONFLICT(${field}) DO UPDATE SET value = excluded.value`,
        ).run(key, JSON.stringify(value));
      }).immediate();
    } catch (error) {
      throw safeStoreError(error);
    }
  }
  public settings(): DesktopSettings {
    return desktopSettings(
      (this.read('desktop_settings', 1) ??
        defaultDesktopSettings) as DesktopSettings,
    );
  }
  public saveSettings(value: DesktopSettings) {
    this.write('desktop_settings', 1, desktopSettings(value));
  }
  public snapshot(jobId: string): EffectiveDownload | null {
    const value = this.read('job_settings', jobId) as EffectiveDownload | null;
    return value === null ? null : effectiveDownload(value);
  }
  public saveSnapshot(jobId: string, value: EffectiveDownload) {
    this.write('job_settings', jobId, effectiveDownload(value));
  }
  public hiddenDownloads(): readonly string[] {
    return (
      this.connection()
        .prepare('SELECT job_id FROM downloads_hidden')
        .all() as { job_id: string }[]
    ).map((row) => row.job_id);
  }
  public hideDownloads(jobIds: readonly string[]) {
    try {
      const db = this.connection();
      db.transaction(() => {
        assertSchemaVersion(db, supportedSchemaVersion(sqliteMigrations));
        const insert = db.prepare(
          'INSERT OR IGNORE INTO downloads_hidden (job_id) VALUES (?)',
        );
        for (const jobId of jobIds) insert.run(jobId);
      }).immediate();
    } catch (error) {
      throw safeStoreError(error);
    }
  }
  public hidden(): readonly string[] {
    return (
      this.connection().prepare('SELECT job_id FROM history_hidden').all() as {
        job_id: string;
      }[]
    ).map((row) => row.job_id);
  }
  public hide(jobId: string) {
    try {
      const db = this.connection();
      db.transaction(() => {
        assertSchemaVersion(db, supportedSchemaVersion(sqliteMigrations));
        db.prepare(
          'INSERT OR IGNORE INTO history_hidden (job_id) VALUES (?)',
        ).run(jobId);
      }).immediate();
    } catch (error) {
      throw safeStoreError(error);
    }
  }
  public diagnostics(): SavedDiagnostics | null {
    return this.read('desktop_diagnostics', 1) as SavedDiagnostics | null;
  }
  public saveDiagnostics(value: SavedDiagnostics) {
    this.write('desktop_diagnostics', 1, safeDiagnostics(value));
  }
  public close() {
    this.db?.close();
    this.db = undefined;
  }
}

/** Снимок хранит только source и эффективные параметры, без случайных полей запроса. */
function effectiveDownload(value: EffectiveDownload): EffectiveDownload {
  const settings = desktopSettings({
    ...defaultDesktopSettings,
    outputDirectory: value.destination,
    quality: value.quality,
    overwrite: value.overwrite,
    naming: value.naming,
    writeTags: value.writeTags,
    saveCoverFile: value.saveCoverFile,
    writeM3u8: value.writeM3u8,
  });
  // F-001: непрозрачный ID сохраняется буквально; символы /, . и % встречаются в ID плейлистов.
  // Грамматика provider не дублируется в persistence; URL с параметрами и управляющие символы не принимаются.
  if (
    !value.source ||
    !['track', 'album', 'playlist'].includes(value.source.kind) ||
    !/^[\w-]+$/.test(value.source.provider) ||
    typeof value.source.id !== 'string' ||
    value.source.id.length === 0 ||
    /[?#]/.test(value.source.id) ||
    [...value.source.id].some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  )
    throw new ValidationError();
  return {
    source: {
      provider: value.source.provider,
      kind: value.source.kind,
      id: value.source.id,
    },
    destination: settings.outputDirectory!,
    quality: settings.quality,
    overwrite: settings.overwrite,
    naming: settings.naming,
    writeTags: settings.writeTags,
    saveCoverFile: settings.saveCoverFile,
    writeM3u8: settings.writeM3u8,

    ...(value.variantSelection === undefined
      ? {}
      : { variantSelection: variantSelection(value.variantSelection) }),
    // Повтор из истории загружает тот же выбор треков, а не весь источник.
    ...(value.trackPositions === undefined
      ? {}
      : { trackPositions: trackPositions(value.trackPositions) }),
  };
}

function trackPositions(value: unknown): readonly number[] {
  const items: readonly unknown[] = Array.isArray(value) ? value : [];
  const positions = items.filter(
    (item): item is number => Number.isSafeInteger(item) && Number(item) >= 1,
  );
  if (
    positions.length === 0 ||
    positions.length !== items.length ||
    new Set(positions).size !== positions.length
  )
    throw new ValidationError();
  return positions;
}

/** Allowlist doctor исключает сообщения, account и raw provider данные до SQLite/WAL/backup. */
export function safeDiagnostics(value: SavedDiagnostics): SavedDiagnostics {
  const input = value.diagnostics.configuration;
  const checks: Record<
    string,
    { status: string; code?: string; optional?: boolean }
  > = {};
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
    'ffmpeg',
    'tokenPermissions',
  ];
  const codes = new Set([
    'NOT_APPLICABLE',
    'DEPENDENCY_FAILED',
    'UNSUPPORTED_RUNTIME',
    'PERMISSION_DENIED',
    'ABSENT',
    'CORRUPT',
    'UNAVAILABLE',
    'EXPIRED',
    'AUTH_ERROR',
    'NETWORK_ERROR',
    'API_CHANGED',
    'PROVIDER_RESPONSE_INVALID',
    'SERVICE_UNAVAILABLE',
    'QUALITY_UNAVAILABLE',
    'DOWNLOAD_ERROR',
    'DISK_FULL',
    'VALIDATION_ERROR',
    'STATE_SCHEMA_UNSUPPORTED',
    'NOT_INSTALLED',
  ]);
  const raw = input?.checks;
  if (raw && typeof raw === 'object' && !Array.isArray(raw))
    for (const key of allowed) {
      const item = (raw as Record<string, JsonValue>)[key];
      const check = item as JsonObject | null | undefined;
      if (
        !check ||
        typeof check !== 'object' ||
        Array.isArray(check) ||
        !['ok', 'failed', 'api-changed', 'skipped', 'optional'].includes(
          String(check.status),
        )
      )
        continue;
      checks[key] = {
        status: String(check.status),
        ...(typeof check.code === 'string' && codes.has(check.code)
          ? { code: check.code }
          : {}),
        ...(check.optional === true ? { optional: true } : {}),
      };
    }
  if (!Number.isFinite(Date.parse(value.checkedAt)))
    throw new ValidationError();
  return {
    checkedAt: new Date(value.checkedAt).toISOString(),
    diagnostics: {
      available: value.diagnostics.available === true,
      backend: value.diagnostics.backend === 'sqlite' ? 'sqlite' : 'injected',
      configuration: {
        checks,
        configurationConfirmed: false,
        ...(typeof input?.schemaVersion === 'string' &&
        /^\d+\.\d+\.\d+$/.test(input.schemaVersion)
          ? { schemaVersion: input.schemaVersion }
          : {}),
        credentialBackend:
          input?.credentialBackend === 'native-keyring'
            ? 'native-keyring'
            : 'injected-provider',
      },
    },
  };
}
