import { createHash } from 'node:crypto';
import {
  mkdtemp,
  readdir,
  readFile,
  rm,
  mkdir,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';
import {
  defaultDesktopSettings,
  manifestFixture,
} from '@music-downloader/shared';
import { SqliteDesktopStateStore } from './desktop-state-store.js';
import { SqliteManifestStore } from './sqlite-manifest-store.js';
import { sqliteMigrations } from './sqlite-migrations.js';
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
async function root() {
  const value = await mkdtemp(path.join(tmpdir(), 'desktop-state-'));
  roots.push(value);
  return value;
}

it('REQ-033/052: все настройки и tombstone переживают reopen и повторный импорт без удаления manifest', async () => {
  const stateDir = await root();
  // Реальный импорт v1 и повторное открытие проверяют независимость tombstone от jobs.
  const legacyDir = path.join(
    stateDir,
    createHash('sha256').update('legacy').digest('hex'),
  );
  await mkdir(legacyDir, { recursive: true });
  await writeFile(
    path.join(legacyDir, 'manifest.json'),
    JSON.stringify(manifestFixture('legacy')),
  );
  const jobs = new SqliteManifestStore({ stateDir });
  await jobs.open();
  const store = new SqliteDesktopStateStore({ stateDir });
  const settings = {
    ...defaultDesktopSettings,
    outputDirectory: path.join(stateDir, 'music'),
    quality: 'high' as const,
    concurrency: 2,
    naming: 'album' as const,
    overwrite: true,
    logging: 'debug' as const,
    ffmpegPath: path.join(stateDir, 'ffmpeg'),
  };
  store.saveSettings(settings);
  store.hide('legacy');
  store.close();
  await jobs.close();
  const reopened = new SqliteDesktopStateStore({ stateDir });
  const imported = new SqliteManifestStore({ stateDir });
  try {
    expect(reopened.settings()).toEqual(settings);
    expect(reopened.hidden()).toEqual(['legacy']);
    expect((await imported.read('legacy'))?.jobId).toBe('legacy');
  } finally {
    reopened.close();
    await imported.close();
  }
});
it('ADR-014: populated production v1→v2 сохраняет job/import и создаёт резервную копию', async () => {
  const stateDir = await root();
  const before = new SqliteManifestStore({
    stateDir,
    migrations: sqliteMigrations.slice(0, 1),
  });
  await before.create(manifestFixture('old'));
  await before.close();
  const db = new Database(path.join(stateDir, 'state.sqlite3'));
  db.prepare('INSERT INTO file_imports VALUES (?,?,?,?)').run(
    'old',
    'hash',
    'fixture',
    'now',
  );
  db.close();
  const state = new SqliteDesktopStateStore({ stateDir });
  expect(state.settings()).toEqual(defaultDesktopSettings);
  state.close();
  const after = new Database(path.join(stateDir, 'state.sqlite3'));
  expect(after.pragma('user_version', { simple: true })).toBe(2);
  expect(after.prepare('SELECT job_id FROM jobs').all()).toEqual([
    { job_id: 'old' },
  ]);
  expect(after.prepare('SELECT sha256 FROM file_imports').all()).toEqual([
    { sha256: 'hash' },
  ]);
  after.close();
  expect(
    (await readdir(stateDir)).filter((name) => name.includes('.bak-v1-')),
  ).toHaveLength(1);
});
it('ADR-014: stale соединение запрещает каждую desktop запись; будущая схема не изменяется', async () => {
  const stateDir = await root();
  const state = new SqliteDesktopStateStore({ stateDir });
  state.settings();
  const other = new Database(path.join(stateDir, 'state.sqlite3'));
  other.pragma('user_version = 99');
  const snapshot = {
    source: { provider: 'mock', kind: 'track' as const, id: '1' },
    quality: 'best' as const,
    destination: path.join(stateDir, 'music'),
    overwrite: false,
    naming: 'collection' as const,
  };
  for (const write of [
    () => state.saveSettings(defaultDesktopSettings),
    () => state.hide('old'),
    () => state.saveSnapshot('old', snapshot),
    () =>
      state.saveDiagnostics({
        checkedAt: new Date().toISOString(),
        diagnostics: { available: true },
      }),
  ])
    expect(write).toThrow(
      expect.objectContaining({ reason: 'STATE_SCHEMA_UNSUPPORTED' }),
    );
  state.close();
  other.close();
  const file = path.join(stateDir, 'state.sqlite3');
  const before = await readFile(file);
  const future = new SqliteDesktopStateStore({ stateDir });
  expect(() => future.settings()).toThrow();
  future.close();
  expect(await readFile(file)).toEqual(before);
});
it('PRN-002: allowlist diagnostics исключает fixture secrets из DTO, базы, WAL и backup', async () => {
  const stateDir = await root();
  const state = new SqliteDesktopStateStore({ stateDir });
  const secret = 'fixture-desktop-secret';
  state.saveDiagnostics({
    checkedAt: new Date().toISOString(),
    diagnostics: {
      available: false,
      backend: 'sqlite',
      configuration: {
        schemaVersion: '1.1.0',
        token: secret,
        checks: {
          provider: { status: 'failed', code: secret, message: secret },
          filesystem: {
            status: 'ok',
            signedUrl: `https://cdn.test/audio?signature=${secret}`,
          },
          [secret]: { status: 'ok' },
        },
      },
    },
  });
  expect(JSON.stringify(state.diagnostics())).not.toContain(secret);
  for (const name of (await readdir(stateDir)).filter((name) =>
    name.startsWith('state.sqlite3'),
  ))
    expect((await readFile(path.join(stateDir, name))).includes(secret)).toBe(
      false,
    );
  state.close();
  // Следующая миграция использует штатный backup runner, а не копирование файлов.
  const migrated = new SqliteManifestStore({
    stateDir,
    migrations: [
      ...sqliteMigrations,
      {
        version: 3,
        up: (db) => {
          db.exec('CREATE TABLE future_fixture (id INTEGER)');
        },
      },
    ],
  });
  await migrated.open();
  await migrated.close();
  for (const name of (await readdir(stateDir)).filter((name) =>
    name.startsWith('state.sqlite3'),
  ))
    expect((await readFile(path.join(stateDir, name))).includes(secret)).toBe(
      false,
    );
});
