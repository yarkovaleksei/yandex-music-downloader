import { fork, spawnSync, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { hostname } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { beforeAll, describe, expect, it } from 'vitest';
import { manifestFixture } from '@music-downloader/shared';
import { readUserVersion } from './sqlite-migrations.js';
import { SqliteManifestStore } from './sqlite-manifest-store.js';
import {
  inspectDatabase,
  removeDirectory,
  temporaryStateDir,
} from './fixtures/sqlite-test-support.js';

const fixturePath = fileURLToPath(
  new URL('./fixtures/sqlite-owner.mjs', import.meta.url),
);

beforeAll(() => {
  const root = path.resolve(path.dirname(fixturePath), '../../../..');
  const result = spawnSync(
    process.execPath,
    ['packages/testing/scripts/run-yarn.mjs', 'build'],
    { cwd: root, encoding: 'utf8' },
  );
  if (result.status !== 0)
    throw new Error(
      result.stderr || 'Не удалось собрать workspace для fixture.',
    );
}, 60_000);

type Report = {
  status: string;
  code?: string;
  reason?: string;
};

/** Child на built dist; сообщения копятся, чтобы не пропустить ранний IPC. */
function child(
  stateDir: string,
  mode: string,
  extra: Record<string, string> = {},
) {
  const processChild: ChildProcess = fork(fixturePath, [], {
    env: {
      ...process.env,
      MODE: 'test',
      stateDir,
      jobId: 'job',
      SQLITE_TEST_MODE: mode,
      ...extra,
    },
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  });
  let stderr = '';
  processChild.stderr?.setEncoding('utf8');
  processChild.stderr?.on('data', (chunk: string) => {
    stderr += chunk;
  });
  const messages: Report[] = [];
  processChild.on('message', (message) => messages.push(message as Report));
  const exited = once(processChild, 'exit');
  const next = async (index: number): Promise<Report> => {
    await expect
      .poll(() => messages.length > index || processChild.exitCode !== null, {
        timeout: 20_000,
        interval: 10,
      })
      .toBe(true);
    const message = messages[index];
    if (message === undefined)
      throw new Error(`child завершился без отчёта: ${stderr}`);
    return message;
  };
  return { processChild, next, exited, messages };
}

async function stop(owner: ReturnType<typeof child>): Promise<void> {
  if (owner.processChild.exitCode === null && !owner.processChild.killed)
    owner.processChild.kill('SIGKILL');
  await owner.exited;
}

function deadPid(): number {
  return spawnSync(process.execPath, ['-e', '']).pid!;
}

/** Устаревшая аренда завершившегося процесса (того же или другого хоста). */
async function seedStaleLease(stateDir: string, foreign = false) {
  const store = new SqliteManifestStore({ stateDir });
  try {
    await store.create(manifestFixture('job'));
  } finally {
    await store.close();
  }
  const db = new Database(path.join(stateDir, 'state.sqlite3'));
  try {
    db.prepare(
      `INSERT INTO leases (job_id, pid, hostname, process_started_at, generation,
         owner_token, acquired_at, heartbeat_at, released_at)
       VALUES ('job', ?, ?, 'dead-birth', 1, 'dead-owner', ?, ?, NULL)`,
    ).run(
      deadPid(),
      foreign ? 'foreign.example' : hostname(),
      '2000-01-01T00:00:00.000Z',
      '2000-01-01T00:00:00.000Z',
    );
  } finally {
    db.close();
  }
}

describe('SqliteManifestStore: межпроцессная аренда и миграции', () => {
  it('отклоняет второго живого владельца', async () => {
    const stateDir = await temporaryStateDir('sqlite-owners-');
    const owners: ReturnType<typeof child>[] = [];
    try {
      const store = new SqliteManifestStore({ stateDir });
      await store.create(manifestFixture('job'));
      await store.close();
      const first = child(stateDir, 'hold');
      owners.push(first);
      expect(await first.next(0)).toMatchObject({ status: 'acquired' });
      const second = child(stateDir, 'once');
      owners.push(second);
      expect(await second.next(0)).toMatchObject({
        status: 'rejected',
        code: 'VALIDATION_ERROR',
      });
      first.processChild.send('release');
      expect(await first.next(1)).toMatchObject({ status: 'released' });
      const third = child(stateDir, 'once');
      owners.push(third);
      expect(await third.next(0)).toMatchObject({ status: 'acquired' });
    } finally {
      await Promise.all(owners.map(stop));
      await removeDirectory(stateDir);
    }
  }, 60_000);

  it('конкурентный reclaim устаревшей аренды даёт ровно одного победителя', async () => {
    const stateDir = await temporaryStateDir('sqlite-reclaim-race-');
    const owners: ReturnType<typeof child>[] = [];
    try {
      await seedStaleLease(stateDir);
      const left = child(stateDir, 'barrier');
      const right = child(stateDir, 'barrier');
      owners.push(left, right);
      // Оба участника прошли наблюдение и probe до CAS; барьер исключает гонку старта.
      expect(await left.next(0)).toMatchObject({ status: 'barrier' });
      expect(await right.next(0)).toMatchObject({ status: 'barrier' });
      left.processChild.send('go');
      right.processChild.send('go');
      const results = [await left.next(1), await right.next(1)];
      expect(results.map((item) => item.status).sort()).toEqual([
        'acquired',
        'rejected',
      ]);
      expect(
        inspectDatabase(stateDir, (db) =>
          db.prepare('SELECT generation FROM leases').get(),
        ),
      ).toEqual({ generation: 2 });
    } finally {
      await Promise.all(owners.map(stop));
      await removeDirectory(stateDir);
    }
  }, 60_000);

  it('снимает аренду другого хоста только явной командой', async () => {
    const stateDir = await temporaryStateDir('sqlite-foreign-');
    const owners: ReturnType<typeof child>[] = [];
    try {
      await seedStaleLease(stateDir, true);
      const plain = child(stateDir, 'once');
      owners.push(plain);
      expect(await plain.next(0)).toMatchObject({ status: 'rejected' });
      const forced = child(stateDir, 'once', {
        forceForeignLease: 'true',
        expectedGeneration: '1',
      });
      owners.push(forced);
      expect(await forced.next(0)).toMatchObject({ status: 'acquired' });
    } finally {
      await Promise.all(owners.map(stop));
      await removeDirectory(stateDir);
    }
  }, 60_000);

  it('одновременная миграция двумя процессами применяет каждый шаг один раз', async () => {
    const stateDir = await temporaryStateDir('sqlite-migrate-race-');
    const owners: ReturnType<typeof child>[] = [];
    try {
      const store = new SqliteManifestStore({ stateDir });
      await store.create(manifestFixture('job'));
      await store.close();
      const left = child(stateDir, 'migrate');
      const right = child(stateDir, 'migrate');
      owners.push(left, right);
      expect(await left.next(0)).toMatchObject({ status: 'migrated' });
      expect(await right.next(0)).toMatchObject({ status: 'migrated' });
      expect(
        inspectDatabase(stateDir, (db) => ({
          version: readUserVersion(db),
          applied: db
            .prepare('SELECT version FROM schema_migrations ORDER BY version')
            .all(),
          jobs: db.prepare('SELECT job_id FROM jobs').all(),
        })),
      ).toEqual({
        version: 2,
        applied: [{ version: 1 }, { version: 2 }],
        jobs: [{ job_id: 'job' }],
      });
    } finally {
      await Promise.all(owners.map(stop));
      await removeDirectory(stateDir);
    }
  }, 60_000);

  it('процесс, открывший базу до миграции другим процессом, после неё не пишет', async () => {
    const stateDir = await temporaryStateDir('sqlite-stale-process-');
    const owners: ReturnType<typeof child>[] = [];
    try {
      const store = new SqliteManifestStore({ stateDir });
      await store.create(manifestFixture('job'));
      await store.close();
      const stale = child(stateDir, 'stale-writer');
      owners.push(stale);
      expect(await stale.next(0)).toMatchObject({ status: 'opened' });
      const migrator = child(stateDir, 'migrate');
      owners.push(migrator);
      expect(await migrator.next(0)).toMatchObject({ status: 'migrated' });
      stale.processChild.send('write');
      expect(await stale.next(1)).toMatchObject({
        status: 'refused',
        code: 'VALIDATION_ERROR',
        reason: 'STATE_SCHEMA_UNSUPPORTED',
      });
      expect(
        inspectDatabase(stateDir, (db) =>
          db.prepare('SELECT count(*) AS count FROM control_requests').get(),
        ),
      ).toEqual({ count: 0 });
    } finally {
      await Promise.all(owners.map(stop));
      await removeDirectory(stateDir);
    }
  }, 60_000);
});
