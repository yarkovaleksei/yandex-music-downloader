import { randomBytes } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  renameSync,
  rmSync,
} from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { ValidationError } from '@music-downloader/shared';
import {
  readUserVersion,
  runMigrations,
  sqliteMigrations,
  supportedSchemaVersion,
  type SqliteMigration,
} from './sqlite-migrations.js';
import { safeStoreError, schemaUnsupportedError } from './sqlite-errors.js';

/** Единая база состояния пользователя ОС: `<stateDir>/state.sqlite3` (ADR-014). */
export const stateDatabaseFile = 'state.sqlite3';
const busyTimeoutMs = 5_000;
const posix = process.platform !== 'win32';

export interface StateDatabaseOptions {
  readonly stateDir: string;
  /** Только для тестов: подмена упорядоченного списка миграций. */
  readonly migrations?: readonly SqliteMigration[];
}

export function stateDatabasePath(stateDir: string): string {
  return path.join(stateDir, stateDatabaseFile);
}

/** POSIX-права ADR-014: stateDir 0700, база создаётся 0600 до открытия SQLite. */
function prepareFiles(stateDir: string, file: string): void {
  mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  if (posix) chmodSync(stateDir, 0o700);
  // Флаг 'a' создаёт отсутствующий файл, не меняя содержимое существующего.
  closeSync(openSync(file, 'a', 0o600));
  if (posix) chmodSync(file, 0o600);
}

/** WAL/SHM наследуют режим базы; явный chmod страхует от чужого umask. */
function restrictSidecars(file: string): void {
  if (!posix) return;
  for (const suffix of ['-wal', '-shm']) {
    try {
      chmodSync(`${file}${suffix}`, 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}

function utcStamp(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

/**
 * Резервная копия средствами SQLite (VACUUM INTO) до первой миграции существующей базы.
 * Временный файл 0600 получает fsync и только потом атомарно переименовывается;
 * без успешной копии миграция не начинается (ADR-014).
 */
export function backupStateDatabase(
  db: Database.Database,
  file: string,
  version: number,
): string {
  const directory = path.dirname(file);
  const suffix = randomBytes(4).toString('hex');
  const temporary = path.join(
    directory,
    `.${path.basename(file)}.backup-${suffix}.tmp`,
  );
  closeSync(openSync(temporary, 'wx', 0o600));
  try {
    if (posix) chmodSync(temporary, 0o600);
    db.prepare('VACUUM INTO ?').run(temporary);
    const handle = openSync(temporary, 'r+');
    try {
      fsyncSync(handle);
    } finally {
      closeSync(handle);
    }
    const target = path.join(
      directory,
      `${path.basename(file)}.bak-v${version}-${utcStamp(new Date())}-${suffix}`,
    );
    renameSync(temporary, target);
    return target;
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
}

/**
 * Открывает базу для записи только после read-only проверки совместимости.
 * Закрытие writable-соединения способно выполнить checkpoint оставшегося WAL,
 * поэтому отказ новой схеме должен произойти до него.
 */
export function openStateDatabase(
  options: StateDatabaseOptions,
): Database.Database {
  const migrations = options.migrations ?? sqliteMigrations;
  const supported = supportedSchemaVersion(migrations);
  const file = stateDatabasePath(options.stateDir);
  let db: Database.Database | undefined;
  try {
    inspectStateDatabase(options);
    prepareFiles(options.stateDir, file);
    db = new Database(file, { timeout: busyTimeoutMs });
    db.pragma(`busy_timeout = ${busyTimeoutMs}`);
    const current = readUserVersion(db);
    if (current > supported) throw schemaUnsupportedError();
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = FULL');
    db.pragma('foreign_keys = ON');
    if (current >= 1 && current < supported)
      backupStateDatabase(db, file, current);
    runMigrations(db, migrations, () => new Date().toISOString());
    restrictSidecars(file);
    return db;
  } catch (error) {
    try {
      db?.close();
    } catch {
      // Закрытие после отказа не должно заменить исходную безопасную ошибку.
    }
    throw safeStoreError(error);
  }
}

/** Сверяет версию схемы внутри транзакции записи: расхождение — отказ без записи. */
export function assertSchemaVersion(
  db: Database.Database,
  supported: number,
): void {
  const current = readUserVersion(db);
  if (current > supported) throw schemaUnsupportedError();
  if (current !== supported) throw new ValidationError();
}

/**
 * Read-only проверка для doctor: отсутствующая база не создаётся,
 * более новая схема и повреждение сообщаются без изменения файла.
 */
export function inspectStateDatabase(
  options: StateDatabaseOptions,
): 'absent' | 'ok' {
  const supported = supportedSchemaVersion(
    options.migrations ?? sqliteMigrations,
  );
  const file = stateDatabasePath(options.stateDir);
  if (!existsSync(file)) return 'absent';
  let db: Database.Database | undefined;
  try {
    db = new Database(file, {
      readonly: true,
      fileMustExist: true,
      timeout: busyTimeoutMs,
    });
    const current = readUserVersion(db);
    if (current > supported) throw schemaUnsupportedError();
    if (current >= 1) db.prepare('SELECT count(*) FROM jobs').get();
    return 'ok';
  } catch (error) {
    throw safeStoreError(error);
  } finally {
    try {
      db?.close();
    } catch {
      // Ошибка закрытия read-only соединения не меняет результат проверки.
    }
  }
}
