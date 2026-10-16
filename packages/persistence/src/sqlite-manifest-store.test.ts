import { spawnSync } from 'node:child_process';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, describe, expect, it, vi } from 'vitest';
import {
  CommandRefusalError,
  manifestFixture,
  runManifestStoreContract,
  type JobManifestV1,
  type LeaseState,
} from '@music-downloader/shared';
import * as processIdentity from './process-identity.js';
import { SqliteManifestStore } from './sqlite-manifest-store.js';
import {
  additiveV2,
  breakingV2,
  databaseBytes,
  databaseFiles,
  inspectDatabase,
  removeDirectory,
  temporaryStateDir,
} from './fixtures/sqlite-test-support.js';

const stores: SqliteManifestStore[] = [];
function storeAt(
  stateDir: string,
  options: ConstructorParameters<typeof SqliteManifestStore>[0] = {},
): SqliteManifestStore {
  const store = new SqliteManifestStore({ ...options, stateDir });
  stores.push(store);
  return store;
}

/** Базы закрываются до удаления каталога: Windows не удаляет открытые файлы. */
async function cleanup(directory: string): Promise<void> {
  await Promise.all(stores.splice(0).map((store) => store.close()));
  await removeDirectory(directory);
}

function deadPid(): number {
  const child = spawnSync(process.execPath, ['-e', '']);
  return child.pid!;
}

const schemaRefusal = {
  code: 'VALIDATION_ERROR',
  reason: 'STATE_SCHEMA_UNSUPPORTED',
};

describe('SqliteManifestStore', () => {
  const contractDirectories: string[] = [];
  afterAll(async () => {
    await Promise.all(stores.splice(0).map((store) => store.close()));
    await Promise.all(contractDirectories.map(removeDirectory));
  });
  runManifestStoreContract({ describe, it, expect }, async () => {
    const directory = await temporaryStateDir('sqlite-contract-');
    contractDirectories.push(directory);
    return storeAt(directory);
  });

  it('открывает базу лениво и после close() не переоткрывает её', async () => {
    const directory = await temporaryStateDir('sqlite-lazy-');
    try {
      const stateDir = path.join(directory, 'state');
      const store = storeAt(stateDir);
      await expect(stat(stateDir)).rejects.toMatchObject({ code: 'ENOENT' });
      await store.close();
      await expect(store.list()).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
      });
      await expect(stat(stateDir)).rejects.toMatchObject({ code: 'ENOENT' });
      const reopened = storeAt(stateDir);
      await reopened.create(manifestFixture('job'));
      await reopened.close();
      await expect(reopened.read('job')).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
      });
    } finally {
      await cleanup(directory);
    }
  });

  it('повторяет временную ошибку открытия при следующем вызове', async () => {
    const directory = await temporaryStateDir('sqlite-retry-');
    try {
      const stateDir = path.join(directory, 'state');
      // Файл на месте каталога состояния — временная ошибка окружения, не отказ схемы.
      await writeFile(stateDir, 'not a directory');
      const store = storeAt(stateDir);
      const failure = await store.list().catch((error: unknown) => error);
      expect(failure).toMatchObject({ code: expect.any(String) });
      expect(JSON.stringify(failure)).not.toContain(directory);
      await removeDirectory(stateDir);
      expect(await store.list()).toEqual([]);
    } finally {
      await cleanup(directory);
    }
  });

  it('увеличивает generation, отвергает утраченного owner и foreign без force', async () => {
    const directory = await temporaryStateDir('sqlite-fence-');
    try {
      const store = storeAt(directory);
      await store.create(manifestFixture('job'));
      const first = await store.acquire('job', {
        recover: async (item) => item,
      });
      await first.release();
      const second = await store.acquire('job', {
        recover: async (item) => item,
      });
      const generation = () =>
        inspectDatabase(
          directory,
          (db) =>
            (
              db
                .prepare('SELECT generation FROM leases WHERE job_id = ?')
                .get('job') as { generation: number }
            ).generation,
        );
      expect(generation()).toBe(2);
      const writer = new Database(path.join(directory, 'state.sqlite3'));
      try {
        writer
          .prepare('UPDATE leases SET owner_token = ? WHERE job_id = ?')
          .run('other-owner', 'job');
      } finally {
        writer.close();
      }
      await expect(second.save(second.manifest)).rejects.toThrow();
      let sideEffect = false;
      await expect(
        second.runOwned(async () => {
          sideEffect = true;
        }),
      ).rejects.toThrow();
      expect(sideEffect).toBe(false);
      await second.release().catch(() => undefined);
    } finally {
      await cleanup(directory);
    }
  });

  it('разрешает foreign force только для наблюдавшегося generation', async () => {
    const directory = await temporaryStateDir('sqlite-force-');
    try {
      const old = storeAt(directory, { now: () => Date.parse('2000-01-01') });
      await old.create(manifestFixture('job'));
      const foreign = await old.acquire('job', {
        identity: {
          pid: 1,
          hostname: 'foreign.example',
          processStartedAt: 'foreign',
        },
        recover: async (item) => item,
      });
      const store = storeAt(directory);
      expect(await store.readLeaseState('job')).toBe('unknown');
      await expect(
        store.acquire('job', { recover: async (item) => item }),
      ).rejects.toThrow();
      await expect(
        store.acquire('job', {
          forceForeignLease: true,
          expectedGeneration: 2,
          recover: async (item) => item,
        }),
      ).rejects.toThrow();
      const session = await store.acquire('job', {
        forceForeignLease: true,
        expectedGeneration: 1,
        recover: async (item) => item,
      });
      await session.release();
      await foreign.release().catch(() => undefined);
    } finally {
      await cleanup(directory);
    }
  });

  it.each<[number, processIdentity.ProcessProbe, LeaseState]>([
    [0, 'missing', 'active'],
    [30_001, 'same', 'active'],
    [30_001, 'missing', 'inactive'],
    [30_001, 'unknown', 'unknown'],
  ])(
    'readLeaseState: age=%s probe=%s → %s по общей политике',
    async (age, probe, expected) => {
      const directory = await temporaryStateDir('sqlite-policy-');
      const base = Date.parse('2026-01-02T00:00:00.000Z');
      const check = vi
        .spyOn(processIdentity, 'probeLease')
        .mockResolvedValue(probe);
      try {
        const owner = storeAt(directory, { now: () => base });
        await owner.create(manifestFixture('job'));
        const session = await owner.acquire('job', {
          recover: async (item) => item,
        });
        const observer = storeAt(directory, { now: () => base + age });
        expect(await observer.readLeaseState('job')).toBe(expected);
        await session.release();
      } finally {
        check.mockRestore();
        await cleanup(directory);
      }
    },
  );

  it('reclaim-ит устаревшую аренду завершившегося процесса и выполняет recovery', async () => {
    const directory = await temporaryStateDir('sqlite-reclaim-');
    try {
      const old = storeAt(directory, { now: () => Date.parse('2000-01-01') });
      await old.create(manifestFixture('job'));
      const abandoned = await old.acquire('job', {
        identity: {
          pid: deadPid(),
          hostname: hostname(),
          processStartedAt: 'dead-birth',
        },
        recover: async (item) => item,
      });
      const store = storeAt(directory);
      expect(await store.readLeaseState('job')).toBe('inactive');
      let recovered = 0;
      const session = await store.acquire('job', {
        recover: async (item) => {
          recovered += 1;
          return { ...item, updatedAt: '2026-02-01T00:00:00.000Z' };
        },
      });
      expect(recovered).toBe(1);
      expect((await store.read('job'))?.updatedAt).toBe(
        '2026-02-01T00:00:00.000Z',
      );
      await expect(abandoned.save(abandoned.manifest)).rejects.toThrow();
      await session.release();
      await abandoned.release().catch(() => undefined);
    } finally {
      await cleanup(directory);
    }
  });

  it('освобождает аренду при ошибке recovery', async () => {
    const directory = await temporaryStateDir('sqlite-recover-fail-');
    try {
      const store = storeAt(directory);
      await store.create(manifestFixture('job'));
      await expect(
        store.acquire('job', {
          recover: async () => {
            throw new Error('recovery failed');
          },
        }),
      ).rejects.toThrow();
      expect(await store.readLeaseState('job')).toBe('inactive');
      const session = await store.acquire('job', {
        recover: async (item) => item,
      });
      await session.release();
    } finally {
      await cleanup(directory);
    }
  });

  it('объединяет только partial.bytes и сбрасывает его при release', async () => {
    const directory = await temporaryStateDir('sqlite-progress-');
    try {
      const store = storeAt(directory);
      const base = manifestFixture('job');
      await store.create({
        ...base,
        tracks: [
          {
            ...base.tracks[0]!,
            partial: { bytes: 1, variantKey: 'v', tagged: false },
          },
        ],
      });
      const session = await store.acquire('job', {
        recover: async (item) => item,
      });
      await session.save({
        ...session.manifest,
        tracks: [
          {
            ...session.manifest.tracks[0]!,
            partial: { bytes: 9, variantKey: 'v', tagged: false },
          },
        ],
      });
      expect((await store.read('job'))?.tracks[0]?.partial?.bytes).toBe(1);
      await session.release();
      expect((await store.read('job'))?.tracks[0]?.partial?.bytes).toBe(9);
    } finally {
      await cleanup(directory);
    }
  });

  it('публикует receipt только после durable save владельца и удаляет запрос', async () => {
    const directory = await temporaryStateDir('sqlite-control-');
    try {
      const store = storeAt(directory);
      await store.create(manifestFixture('job'));
      const session = await store.acquire('job', {
        recover: async (item) => item,
      });
      const request = await store.sendControl('job', { command: 'pause' });
      const receipts = await session.consumeControls(async (item) => {
        expect(await store.waitControlAck('job', item.requestId, 0)).toBe(
          undefined,
        );
        return {
          requestId: item.requestId,
          accepted: true,
          completedAt: '2026-01-03T00:00:00.000Z',
        };
      });
      expect(receipts).toHaveLength(1);
      expect(
        await store.waitControlAck('job', request.requestId, 100),
      ).toMatchObject({ requestId: request.requestId, accepted: true });
      expect((await store.read('job'))?.lastControl?.requestId).toBe(
        request.requestId,
      );
      expect(await session.consumeControls(async () => receipts[0]!)).toEqual(
        [],
      );
      await session.release();
    } finally {
      await cleanup(directory);
    }
  });

  it('не перезаписывает manifest будущей версии и не меняет план', async () => {
    const directory = await temporaryStateDir('sqlite-future-manifest-');
    try {
      const store = storeAt(directory);
      await store.create(manifestFixture('job'));
      const session = await store.acquire('job', {
        recover: async (item) => item,
      });
      await expect(
        session.save({
          ...session.manifest,
          plan: { ...session.manifest.plan, title: 'Другой план' },
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      const writer = new Database(path.join(directory, 'state.sqlite3'));
      const future = JSON.stringify({ ...manifestFixture('job'), version: 2 });
      try {
        writer
          .prepare('UPDATE jobs SET manifest = ? WHERE job_id = ?')
          .run(future, 'job');
      } finally {
        writer.close();
      }
      await expect(session.save(session.manifest)).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
      });
      inspectDatabase(directory, (db) =>
        expect(
          db.prepare('SELECT manifest FROM jobs WHERE job_id = ?').get('job'),
        ).toEqual({ manifest: future }),
      );
      await session.release();
    } finally {
      await cleanup(directory);
    }
  });

  it('отказывает для базы более новой версии без изменения файла и копий', async () => {
    const directory = await temporaryStateDir('sqlite-newer-');
    try {
      const file = path.join(directory, 'state.sqlite3');
      const seed = new Database(file);
      seed.exec('CREATE TABLE future (value TEXT); PRAGMA user_version = 7;');
      seed.close();
      const before = await readFile(file);
      const store = storeAt(directory);
      for (const operation of [
        () => store.list(),
        () => store.read('job'),
        () => store.create(manifestFixture('job')),
        () => store.readLeaseState('job'),
      ])
        await expect(operation()).rejects.toMatchObject(schemaRefusal);
      const error = await store.list().catch((value: unknown) => value);
      expect(error).toBeInstanceOf(CommandRefusalError);
      expect(JSON.stringify(error)).not.toContain(directory);
      expect(await readFile(file)).toEqual(before);
      expect(
        (await databaseFiles(directory)).filter((name) =>
          name.includes('.bak'),
        ),
      ).toEqual([]);
      expect(() => store.inspect()).toThrow(CommandRefusalError);
    } finally {
      await cleanup(directory);
    }
  });

  it('отказывает для повреждённой базы без пересоздания и изменения файла', async () => {
    const directory = await temporaryStateDir('sqlite-corrupt-');
    try {
      const file = path.join(directory, 'state.sqlite3');
      const garbage = Buffer.from('это не база SQLite '.repeat(64));
      await writeFile(file, garbage);
      const store = storeAt(directory);
      const error = await store.list().catch((value: unknown) => value);
      expect(error).toMatchObject({ code: 'VALIDATION_ERROR' });
      expect(JSON.stringify(error)).not.toMatch(/SQLITE|not a database/i);
      await expect(store.create(manifestFixture('job'))).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
      });
      expect(await readFile(file)).toEqual(garbage);
      expect(await databaseFiles(directory)).toEqual(['state.sqlite3']);
      expect(() => store.inspect()).toThrow();
    } finally {
      await cleanup(directory);
    }
  });

  it('соединение, открытое до миграции, после неё не пишет и сообщает несовместимость', async () => {
    const directory = await temporaryStateDir('sqlite-stale-writer-');
    try {
      const old = storeAt(directory);
      await old.create(manifestFixture('before'));
      const session = await old.acquire('before', {
        recover: async (item) => item,
      });
      const newer = storeAt(directory, { migrations: additiveV2 });
      expect((await newer.list()).map((item) => item.jobId)).toEqual([
        'before',
      ]);
      await expect(old.create(manifestFixture('after'))).rejects.toMatchObject(
        schemaRefusal,
      );
      await expect(session.heartbeat()).rejects.toMatchObject(schemaRefusal);
      await expect(
        old.sendControl('before', { command: 'pause' }),
      ).rejects.toMatchObject(schemaRefusal);
      // Аддитивная v2 оставляет чтения старого процесса рабочими.
      expect((await old.read('before'))?.jobId).toBe('before');
      expect(await newer.read('after')).toBeUndefined();
      await session.release().catch(() => undefined);
    } finally {
      await cleanup(directory);
    }
  });

  it('старое соединение сообщает несовместимость при чтении после ломающей v2', async () => {
    const directory = await temporaryStateDir('sqlite-stale-reader-');
    try {
      const old = storeAt(directory);
      await old.create(manifestFixture('job'));
      expect(await old.read('job')).toBeDefined();
      const newer = storeAt(directory, { migrations: breakingV2 });
      await newer.open();
      await expect(old.read('job')).rejects.toMatchObject(schemaRefusal);
      await expect(old.list()).rejects.toMatchObject(schemaRefusal);
    } finally {
      await cleanup(directory);
    }
  });

  it.skipIf(process.platform === 'win32')(
    'создаёт stateDir 0700, базу, WAL, SHM и копию 0600',
    async () => {
      const directory = await temporaryStateDir('sqlite-modes-');
      try {
        const stateDir = path.join(directory, 'state');
        const store = storeAt(stateDir);
        await store.create(manifestFixture('job'));
        const mode = async (name: string) =>
          (await stat(path.join(stateDir, name))).mode & 0o777;
        expect((await stat(stateDir)).mode & 0o777).toBe(0o700);
        // Соединение открыто: WAL и SHM существуют до checkpoint.
        expect(await databaseFiles(stateDir)).toEqual([
          'state.sqlite3',
          'state.sqlite3-shm',
          'state.sqlite3-wal',
        ]);
        for (const name of await databaseFiles(stateDir))
          expect(await mode(name)).toBe(0o600);
        await store.close();
        const migrated = storeAt(stateDir, { migrations: additiveV2 });
        await migrated.open();
        const backups = (await databaseFiles(stateDir)).filter((name) =>
          name.includes('.bak-v1-'),
        );
        expect(backups).toHaveLength(1);
        expect(await mode(backups[0]!)).toBe(0o600);
        expect(
          (await readdir(stateDir)).filter((name) => name.endsWith('.tmp')),
        ).toEqual([]);
      } finally {
        await cleanup(directory);
      }
    },
  );

  it('PRN-002: поле-маркер вне схемы manifest не попадает в файлы базы и копию', async () => {
    const directory = await temporaryStateDir('sqlite-secret-');
    const marker = 'step-029-secret-marker';
    try {
      const store = storeAt(directory);
      const base = manifestFixture('job');
      await store.create({
        ...base,
        token: marker,
        source: { ...base.source, authorization: `Bearer ${marker}` },
      } as unknown as JobManifestV1);
      const session = await store.acquire('job', {
        recover: async (item) => item,
      });
      await session.save({
        ...session.manifest,
        updatedAt: '2026-01-05T00:00:00.000Z',
        tracks: [
          {
            ...session.manifest.tracks[0]!,
            signedUrl: `https://cdn.example.test/?sig=${marker}`,
          } as unknown as JobManifestV1['tracks'][number],
        ],
      });
      // До checkpoint: WAL и SHM содержат последние транзакции.
      for (const bytes of await databaseBytes(directory))
        expect(bytes.includes(marker)).toBe(false);
      await session.release();
      await store.close();
      const migrated = storeAt(directory, { migrations: additiveV2 });
      expect(await migrated.read('job')).toBeDefined();
      const files = await databaseFiles(directory);
      expect(files.some((name) => name.includes('.bak-v1-'))).toBe(true);
      for (const bytes of await databaseBytes(directory))
        expect(bytes.includes(marker)).toBe(false);
    } finally {
      await cleanup(directory);
    }
  });
});
