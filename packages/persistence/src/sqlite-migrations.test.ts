import path from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { manifestFixture } from '@music-downloader/shared';
import { SqliteManifestStore } from './sqlite-manifest-store.js';
import {
  readUserVersion,
  runMigrations,
  sqliteMigrations,
  supportedSchemaVersion,
  type SqliteMigration,
} from './sqlite-migrations.js';
import {
  additiveV2,
  databaseFiles,
  inspectDatabase,
  removeDirectory,
  temporaryStateDir,
} from './fixtures/sqlite-test-support.js';

/** v1-фикстура с данными: job, аренда, control-запрос и receipt. */
async function seedV1(stateDir: string): Promise<void> {
  const store = new SqliteManifestStore({
    stateDir,
    migrations: sqliteMigrations.slice(0, 1),
  });
  try {
    await store.create(manifestFixture('a'));
    await store.create({
      ...manifestFixture('b'),
      control: { state: 'cancelled' },
    });
    const session = await store.acquire('a', {
      recover: async (item) => item,
    });
    const request = await store.sendControl('a', { command: 'pause' });
    await session.consumeControls(async (item) => ({
      requestId: item.requestId,
      accepted: true,
      completedAt: '2026-01-02T00:00:00.000Z',
    }));
    await store.sendControl('b', { command: 'resume' });
    await session.release();
    expect(await store.waitControlAck('a', request.requestId, 0)).toBeDefined();
  } finally {
    await store.close();
  }
}

function snapshot(stateDir: string) {
  return inspectDatabase(stateDir, (db) => ({
    jobs: db.prepare('SELECT * FROM jobs ORDER BY job_id').all(),
    leases: db.prepare('SELECT * FROM leases ORDER BY job_id').all(),
    requests: db
      .prepare('SELECT * FROM control_requests ORDER BY request_id')
      .all(),
    receipts: db
      .prepare('SELECT * FROM control_receipts ORDER BY request_id')
      .all(),
  }));
}

function versions(stateDir: string) {
  return inspectDatabase(stateDir, (db) => ({
    userVersion: readUserVersion(db),
    applied: (
      db
        .prepare('SELECT version FROM schema_migrations ORDER BY version')
        .all() as { version: number }[]
    ).map((row) => row.version),
  }));
}

describe('SQLite миграции', () => {
  it('отвергает список миграций с пропуском версии', () => {
    expect(() =>
      supportedSchemaVersion([
        sqliteMigrations[0]!,
        { version: 3, up: () => {} },
      ]),
    ).toThrow();
    expect(supportedSchemaVersion(sqliteMigrations)).toBe(3);
  });

  it('v1 fixture создаётся без резервной копии', async () => {
    const stateDir = await temporaryStateDir('sqlite-new-');
    try {
      await seedV1(stateDir);
      expect(versions(stateDir)).toEqual({ userVersion: 1, applied: [1] });
      expect(
        (await databaseFiles(stateDir)).filter((name) => name.includes('.bak')),
      ).toEqual([]);
    } finally {
      await removeDirectory(stateDir);
    }
  });

  it('production-список применяется к v1-фикстуре без потери данных', async () => {
    const stateDir = await temporaryStateDir('sqlite-v1-');
    try {
      await seedV1(stateDir);
      const before = snapshot(stateDir);
      const store = new SqliteManifestStore({ stateDir });
      try {
        expect((await store.list()).map((item) => item.jobId)).toEqual([
          'a',
          'b',
        ]);
      } finally {
        await store.close();
      }
      expect(snapshot(stateDir)).toEqual(before);
      expect(versions(stateDir)).toEqual({
        userVersion: 3,
        applied: [1, 2, 3],
      });
    } finally {
      await removeDirectory(stateDir);
    }
  });

  it('все миграции применяются последовательно к v1 с сохранением данных и копией', async () => {
    const stateDir = await temporaryStateDir('sqlite-v2-');
    try {
      await seedV1(stateDir);
      const before = snapshot(stateDir);
      const store = new SqliteManifestStore({
        stateDir,
        migrations: additiveV2,
      });
      try {
        expect((await store.list()).map((item) => item.jobId)).toEqual([
          'a',
          'b',
        ]);
        expect((await store.read('a'))?.lastControl?.accepted).toBe(true);
      } finally {
        await store.close();
      }
      const after = snapshot(stateDir);
      expect(after.leases).toEqual(before.leases);
      expect(after.requests).toEqual(before.requests);
      expect(after.receipts).toEqual(before.receipts);
      expect(after.jobs).toEqual(
        (before.jobs as Record<string, unknown>[]).map((row) => ({
          ...row,
          note: null,
        })),
      );
      expect(versions(stateDir)).toEqual({ userVersion: 2, applied: [1, 2] });
      const backups = (await databaseFiles(stateDir)).filter((name) =>
        /^state\.sqlite3\.bak-v1-\d{8}T\d{6}Z-[a-f0-9]{8}$/.test(name),
      );
      expect(backups).toHaveLength(1);
      const backup = new Database(path.join(stateDir, backups[0]!), {
        readonly: true,
      });
      try {
        expect(readUserVersion(backup)).toBe(1);
        expect(
          backup.prepare('SELECT * FROM jobs ORDER BY job_id').all(),
        ).toEqual(before.jobs);
      } finally {
        backup.close();
      }
    } finally {
      await removeDirectory(stateDir);
    }
  });

  it('ошибка шага оставляет последнюю успешную версию, повтор продолжает её', async () => {
    const stateDir = await temporaryStateDir('sqlite-step-fail-');
    try {
      await seedV1(stateDir);
      const before = snapshot(stateDir);
      let fail = true;
      const flaky: readonly SqliteMigration[] = [
        ...additiveV2,
        {
          version: 3,
          up: (db) => {
            db.exec('CREATE TABLE partial_v3 (value TEXT)');
            if (fail) throw new Error('шаг v3 не выполнен');
          },
        },
      ];
      const failing = new SqliteManifestStore({ stateDir, migrations: flaky });
      try {
        const error = await failing.list().catch((value: unknown) => value);
        expect(error).toMatchObject({ code: expect.any(String) });
        expect(JSON.stringify(error)).not.toContain('шаг v3');
      } finally {
        await failing.close();
      }
      expect(versions(stateDir)).toEqual({ userVersion: 2, applied: [1, 2] });
      inspectDatabase(stateDir, (db) =>
        expect(
          db
            .prepare("SELECT name FROM sqlite_master WHERE name = 'partial_v3'")
            .get(),
        ).toBeUndefined(),
      );
      fail = false;
      const retried = new SqliteManifestStore({ stateDir, migrations: flaky });
      try {
        expect((await retried.list()).map((item) => item.jobId)).toEqual([
          'a',
          'b',
        ]);
      } finally {
        await retried.close();
      }
      expect(versions(stateDir)).toEqual({
        userVersion: 3,
        applied: [1, 2, 3],
      });
      expect(snapshot(stateDir).leases).toEqual(before.leases);
      const backups = (await databaseFiles(stateDir)).filter((name) =>
        name.includes('.bak-'),
      );
      // Копия первой попытки (v1) не мешает повтору с v2.
      expect(backups.some((name) => name.includes('.bak-v1-'))).toBe(true);
      expect(backups.some((name) => name.includes('.bak-v2-'))).toBe(true);
    } finally {
      await removeDirectory(stateDir);
    }
  });

  it('раннер пропускает шаг, уже применённый конкурентным соединением', () => {
    const first = new Database(':memory:');
    try {
      runMigrations(first, sqliteMigrations, () => 'now');
      runMigrations(first, sqliteMigrations, () => 'later');
      expect(
        first
          .prepare('SELECT version, applied_at FROM schema_migrations')
          .all(),
      ).toEqual([
        { version: 1, applied_at: 'now' },
        { version: 2, applied_at: 'now' },
        { version: 3, applied_at: 'now' },
      ]);
    } finally {
      first.close();
    }
  });
});
