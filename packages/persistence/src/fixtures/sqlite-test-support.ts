import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import {
  sqliteMigrations,
  type SqliteMigration,
} from '../sqlite-migrations.js';

/** Тестовая v2: аддитивная колонка, чтения v1 продолжают работать. */
export const additiveV2: readonly SqliteMigration[] = [
  ...sqliteMigrations,
  {
    version: 2,
    up: (db) => db.exec('ALTER TABLE jobs ADD COLUMN note TEXT'),
  },
];

/** Тестовая v2, ломающая чтения v1: колонка manifest переименована. */
export const breakingV2: readonly SqliteMigration[] = [
  ...sqliteMigrations,
  {
    version: 2,
    up: (db) =>
      db.exec('ALTER TABLE jobs RENAME COLUMN manifest TO manifest_v2'),
  },
];

export async function temporaryStateDir(prefix: string): Promise<string> {
  return mkdtemp(path.join(tmpdir(), prefix));
}

export async function removeDirectory(directory: string): Promise<void> {
  await rm(directory, { recursive: true, force: true });
}

/** Read-only доступ к базе для проверок; соединение закрывается до возврата. */
export function inspectDatabase<T>(
  stateDir: string,
  operation: (db: Database.Database) => T,
): T {
  const db = new Database(path.join(stateDir, 'state.sqlite3'), {
    readonly: true,
    fileMustExist: true,
  });
  try {
    return operation(db);
  } finally {
    db.close();
  }
}

/** Все файлы базы: основной, WAL, SHM и резервные копии. */
export async function databaseFiles(stateDir: string): Promise<string[]> {
  return (await readdir(stateDir))
    .filter((name) => name.startsWith('state.sqlite3'))
    .sort();
}

export async function databaseBytes(stateDir: string): Promise<Buffer[]> {
  return Promise.all(
    (await databaseFiles(stateDir)).map((name) =>
      readFile(path.join(stateDir, name)),
    ),
  );
}
