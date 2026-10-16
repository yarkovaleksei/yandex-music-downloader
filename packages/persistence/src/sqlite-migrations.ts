import type Database from 'better-sqlite3';
import { schemaUnsupportedError } from './sqlite-errors.js';

/** Шаг forward-only миграции N-1 → N; выполняется внутри транзакции раннера. */
export interface SqliteMigration {
  readonly version: number;
  readonly up: (db: Database.Database) => void;
}

/**
 * Схема v1 (ADR-014): job хранит валидированный manifest v1 как JSON-документ.
 * Колонок для токенов, cookies, Authorization, credentials и signed URL нет (PRN-002).
 * file_imports — постоянный журнал импорта без FK на jobs: будущее удаление
 * записи истории (STEP-032) не должно блокироваться журналом.
 */
function createSchemaV1(db: Database.Database): void {
  db.exec(`
    CREATE TABLE schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE jobs (
      job_id TEXT PRIMARY KEY,
      manifest TEXT NOT NULL,
      control_state TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;
    CREATE TABLE leases (
      job_id TEXT PRIMARY KEY REFERENCES jobs (job_id) ON DELETE CASCADE,
      pid INTEGER NOT NULL,
      hostname TEXT NOT NULL,
      process_started_at TEXT NOT NULL,
      generation INTEGER NOT NULL,
      owner_token TEXT NOT NULL,
      acquired_at TEXT NOT NULL,
      heartbeat_at TEXT NOT NULL,
      released_at TEXT
    ) STRICT;
    CREATE TABLE control_requests (
      request_id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      command TEXT NOT NULL,
      created_at TEXT NOT NULL
    ) STRICT;
    CREATE INDEX control_requests_job ON control_requests (job_id, created_at);
    CREATE TABLE control_receipts (
      request_id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      receipt TEXT NOT NULL
    ) STRICT;
    CREATE TABLE file_imports (
      job_id TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      source_key TEXT NOT NULL,
      imported_at TEXT NOT NULL,
      UNIQUE (job_id, sha256)
    ) STRICT;
    CREATE TABLE import_skips (
      source_key TEXT PRIMARY KEY,
      reason TEXT NOT NULL,
      count INTEGER NOT NULL,
      observed_at TEXT NOT NULL
    ) STRICT;
  `);
}

/** Упорядоченный production-список; новые версии добавляются только в конец. */
export const sqliteMigrations: readonly SqliteMigration[] = [
  { version: 1, up: createSchemaV1 },
];

/** Последняя версия схемы, которую понимает этот процесс. */
export function supportedSchemaVersion(
  migrations: readonly SqliteMigration[],
): number {
  migrations.forEach((migration, index) => {
    // Пропуск промежуточных версий запрещён ADR-014.
    if (migration.version !== index + 1)
      throw new Error('Список миграций должен быть непрерывным с версии 1.');
  });
  return migrations.at(-1)?.version ?? 0;
}

export function readUserVersion(db: Database.Database): number {
  return db.pragma('user_version', { simple: true }) as number;
}

/**
 * Применяет миграции N → N+1 по одной, каждую в собственной BEGIN IMMEDIATE.
 * Перед шагом версия перечитывается: конкурентный процесс мог уже применить его.
 * При ошибке шага база остаётся в последней успешно применённой версии.
 */
export function runMigrations(
  db: Database.Database,
  migrations: readonly SqliteMigration[],
  now: () => string,
): void {
  const supported = supportedSchemaVersion(migrations);
  for (const migration of migrations) {
    db.transaction(() => {
      const current = readUserVersion(db);
      if (current > supported) throw schemaUnsupportedError();
      if (current >= migration.version) return;
      if (current !== migration.version - 1)
        throw new Error('Пропуск версии схемы запрещён.');
      migration.up(db);
      db.pragma(`user_version = ${migration.version}`);
      db.prepare(
        'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)',
      ).run(migration.version, now());
    }).immediate();
  }
}
