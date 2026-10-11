import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { tmpdir, hostname } from 'node:os';
import { describe, expect, it, vi } from 'vitest';
import { FileManifestStore } from './file-manifest-store.js';
import {
  runManifestStoreContract,
  manifestFixture,
  type JobManifestV1,
  type LeaseSession,
  type LeaseRecord,
  type LeaseState,
  ValidationError,
} from '@music-downloader/shared';
import * as atomicJson from './atomic-json.js';
import * as processIdentity from './process-identity.js';

const fixture = () => ({
  version: 1 as const,
  jobId: 'job',
  provider: 'test',
  source: { provider: 'test', kind: 'track' as const, id: 'source' },
  quality: 'best',
  destination: '/music',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  control: { state: 'paused' as const },
  plan: {
    source: { provider: 'test', kind: 'track' as const, id: 'source' },
    title: 'Трек',
    tracks: [
      {
        position: 1,
        trackKey: '1',
        track: { id: 'track', availability: 'unknown' as const },
      },
    ],
  },
  tracks: [
    {
      position: 1,
      trackKey: '1',
      status: 'paused' as const,
      attempts: 0,
      history: [],
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
});
const leasePath = (directory: string) =>
  path.join(
    directory,
    createHash('sha256').update('job').digest('hex'),
    'lease.json',
  );
const manifestPath = (directory: string) =>
  path.join(
    directory,
    createHash('sha256').update('job').digest('hex'),
    'manifest.json',
  );
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  return {
    promise: new Promise<T>((done) => {
      resolve = done;
    }),
    resolve,
  };
};

describe('FileManifestStore', () => {
  it('readLeaseState не создаёт отсутствующий namespace и не требует manifest', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'lease-absent-'));
    try {
      const absent = path.join(directory, 'absent');
      expect(
        await new FileManifestStore({ stateDir: absent }).readLeaseState('job'),
      ).toBe('inactive');
      await expect(stat(absent)).rejects.toMatchObject({ code: 'ENOENT' });
      const store = new FileManifestStore({ stateDir: directory });
      expect(await store.readLeaseState('job')).toBe('inactive');
      expect(await readdir(directory)).toEqual([]);
      await store.create(fixture());
      expect(await store.readLeaseState('job')).toBe('inactive');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  // Матрица существующей политики ADR-004, включая точную границу freshness.
  it.each<[number, processIdentity.ProcessProbe, boolean, boolean, LeaseState]>(
    [
      [0, 'missing', false, false, 'active'],
      [30_000, 'missing', false, false, 'active'],
      [30_001, 'same', false, false, 'active'],
      [30_001, 'missing', false, false, 'inactive'],
      [30_001, 'different', false, false, 'inactive'],
      [30_001, 'unknown', false, false, 'unknown'],
      [0, 'same', true, false, 'unknown'],
      [30_001, 'missing', true, false, 'unknown'],
      [0, 'same', false, true, 'inactive'],
      [30_001, 'unknown', true, true, 'inactive'],
    ],
  )(
    'readLeaseState: age=%s probe=%s foreign=%s released=%s → %s',
    async (age, probe, foreign, released, expected) => {
      const directory = await mkdtemp(path.join(tmpdir(), 'lease-policy-'));
      const now = Date.parse('2026-01-02T00:00:00.000Z');
      const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
      const check = vi
        .spyOn(processIdentity, 'probeLease')
        .mockResolvedValue(probe);
      try {
        const target = leasePath(directory);
        await mkdir(path.dirname(target));
        const record: LeaseRecord = {
          pid: process.pid,
          hostname: foreign ? 'foreign.example' : hostname(),
          processStartedAt: 'fixture-birth',
          generation: 1,
          ownerToken: 'fixture-owner',
          acquiredAt: '2026-01-01T00:00:00.000Z',
          heartbeatAt: new Date(now - age).toISOString(),
          ...(released ? { releasedAt: new Date(now).toISOString() } : {}),
        };
        const bytes = JSON.stringify(record);
        await writeFile(target, bytes);
        expect(
          await new FileManifestStore({ stateDir: directory }).readLeaseState(
            'job',
          ),
        ).toBe(expected);
        expect(await readFile(target, 'utf8')).toBe(bytes);
        expect(check).toHaveBeenCalledTimes(
          !released && !foreign && age > 30_000 ? 1 : 0,
        );
      } finally {
        clock.mockRestore();
        check.mockRestore();
        await rm(directory, { recursive: true, force: true });
      }
    },
  );

  it.each([
    '{',
    'null',
    '[]',
    '{}',
    ...[
      'pid',
      'hostname',
      'processStartedAt',
      'generation',
      'ownerToken',
      'acquiredAt',
      'heartbeatAt',
      'releasedAt',
    ].map((key) =>
      JSON.stringify({
        pid: 1,
        hostname: hostname(),
        processStartedAt: 'birth',
        generation: 1,
        ownerToken: 'fixture-owner',
        acquiredAt: '2026-01-01T00:00:00.000Z',
        heartbeatAt: '2026-01-01T00:00:00.000Z',
        [key]: null,
      }),
    ),
    ...['acquiredAt', 'heartbeatAt', 'releasedAt'].map((key) =>
      JSON.stringify({
        pid: 1,
        hostname: hostname(),
        processStartedAt: 'birth',
        generation: 1,
        ownerToken: 'fixture-owner',
        acquiredAt: '2026-01-01T00:00:00.000Z',
        heartbeatAt: '2026-01-01T00:00:00.000Z',
        [key]: 'invalid-date',
      }),
    ),
  ])(
    'readLeaseState отвергает повреждение без raw cause: %s',
    async (bytes) => {
      const read = vi
        .spyOn(atomicJson, 'readJsonIfPresent')
        .mockResolvedValueOnce(bytes);
      try {
        const error: unknown = await new FileManifestStore()
          .readLeaseState('job')
          .catch((value: unknown) => value);
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as Error).cause).toBeUndefined();
        expect(JSON.stringify(error)).not.toContain('fixture-owner');
      } finally {
        read.mockRestore();
      }
    },
  );

  it.each([
    ['EACCES', 'PERMISSION_DENIED'],
    ['EIO', 'DOWNLOAD_ERROR'],
  ])(
    'readLeaseState нормализует %s без исходной ошибки',
    async (code, expected) => {
      const read = vi
        .spyOn(atomicJson, 'readJsonIfPresent')
        .mockRejectedValueOnce(
          Object.assign(new Error('fixture-owner /private/path'), { code }),
        );
      try {
        const error: unknown = await new FileManifestStore()
          .readLeaseState('job')
          .catch((value: unknown) => value);
        expect(error).toMatchObject({ code: expected, retryable: false });
        expect(error).not.toHaveProperty('cause');
        expect(String(error)).not.toContain('fixture-owner');
        expect(JSON.stringify(error)).not.toContain('/private/path');
      } finally {
        read.mockRestore();
      }
    },
  );

  it('list не создаёт отсутствующий root и не изменяет пустой каталог', async () => {
    const directory = await mkdtemp(
      path.join(tmpdir(), 'manifest-list-empty-'),
    );
    try {
      const absent = path.join(directory, 'absent');
      expect(await new FileManifestStore({ stateDir: absent }).list()).toEqual(
        [],
      );
      await expect(stat(absent)).rejects.toMatchObject({ code: 'ENOENT' });
      expect(
        await new FileManifestStore({ stateDir: directory }).list(),
      ).toEqual([]);
      expect(await readdir(directory)).toEqual([]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('list после перезапуска возвращает все job и пропускает служебные записи', async () => {
    const directory = await mkdtemp(
      path.join(tmpdir(), 'manifest-list-restart-'),
    );
    try {
      const store = new FileManifestStore({ stateDir: directory });
      const completed: JobManifestV1 = {
        ...manifestFixture('z'),
        control: { state: 'running' },
        tracks: [
          {
            ...manifestFixture().tracks[0]!,
            status: 'completed',
            resultPath: '/music/final.mp3',
          },
        ],
      };
      const cancelled: JobManifestV1 = {
        ...manifestFixture('a'),
        control: { state: 'cancelled' },
        tracks: [{ ...manifestFixture().tracks[0]!, status: 'cancelled' }],
      };
      for (const item of [completed, manifestFixture('m'), cancelled])
        await store.create(item);
      await writeFile(path.join(directory, 'service.json'), 'служебная запись');
      await writeFile(path.join(directory, 'f'.repeat(64)), 'не каталог');
      await mkdir(path.join(directory, 'requests'));
      await writeFile(path.join(directory, 'requests', 'manifest.json'), '{}');
      const emptyNamespace = path.join(directory, '0'.repeat(64));
      await mkdir(emptyNamespace);
      await writeFile(
        path.join(emptyNamespace, '.manifest.json.pending.tmp'),
        '{}',
      );
      // Дополнительная копия проверяет обязательную уникальность jobId без нового индекса.
      const duplicate = path.join(directory, '1'.repeat(64));
      await mkdir(duplicate);
      const stored = await store.read('m');
      await writeFile(
        path.join(duplicate, 'manifest.json'),
        JSON.stringify(stored),
      );
      const restarted = new FileManifestStore({ stateDir: directory });
      expect(await restarted.list()).toEqual([
        await store.read('a'),
        stored,
        await store.read('z'),
      ]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it.each([
    '{',
    JSON.stringify({ version: 1 }),
    JSON.stringify({ version: 2 }),
  ])(
    'list явно отвергает повреждённый/будущий manifest без изменения bytes: %s',
    async (bytes) => {
      const directory = await mkdtemp(
        path.join(tmpdir(), 'manifest-list-invalid-'),
      );
      try {
        const store = new FileManifestStore({ stateDir: directory });
        await store.create(fixture());
        await store.create(manifestFixture('valid-job'));
        await writeFile(manifestPath(directory), bytes);
        await expect(store.list()).rejects.toBeInstanceOf(ValidationError);
        expect(await readFile(manifestPath(directory), 'utf8')).toBe(bytes);
        expect(await store.read('valid-job')).toEqual(
          await new FileManifestStore({ stateDir: directory }).read(
            'valid-job',
          ),
        );
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  );

  it('list пробрасывает не-ENOENT ошибку чтения вместо пустой истории', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'manifest-list-io-'));
    try {
      const store = new FileManifestStore({ stateDir: directory });
      await store.create(fixture());
      const failure = Object.assign(
        new Error('Контролируемая ошибка чтения.'),
        { code: 'EACCES' },
      );
      const read = vi
        .spyOn(atomicJson, 'readJsonIfPresent')
        .mockRejectedValueOnce(failure);
      try {
        await expect(store.list()).rejects.toBe(failure);
      } finally {
        read.mockRestore();
      }
      expect(await store.read('job')).toBeDefined();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('list использует проекцию decoder без runtime-секретов и lease ownerToken', async () => {
    const directory = await mkdtemp(
      path.join(tmpdir(), 'manifest-list-projection-'),
    );
    try {
      const store = new FileManifestStore({ stateDir: directory });
      await store.create(fixture());
      await writeFile(
        manifestPath(directory),
        JSON.stringify({
          ...fixture(),
          token: 'fixture-secret',
          signedUrl: 'https://fixture.invalid/?signature=fixture-secret',
          ownerToken: 'fixture-owner',
        }),
      );
      const [listed] = await store.list();
      expect(listed).toEqual(await store.read('job'));
      expect(JSON.stringify(listed)).not.toContain('fixture-secret');
      expect(listed).not.toHaveProperty('ownerToken');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('H-001: list при живом owner не изменяет manifest, lease, inbox и .part', async () => {
    const directory = await mkdtemp(
      path.join(tmpdir(), 'manifest-list-owner-'),
    );
    let owner: LeaseSession | undefined;
    // Останавливаем только автоматический heartbeat, сохраняя настоящий файловый I/O.
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    try {
      const store = new FileManifestStore({ stateDir: directory });
      const reader = new FileManifestStore({ stateDir: directory });
      await store.create(fixture());
      const recover = vi.fn(async (item: JobManifestV1) => item);
      owner = await store.acquire('job', { recover });
      const request = await reader.sendControl('job', { command: 'pause' });
      await writeFile(
        path.join(directory, 'guard.part'),
        Buffer.from([1, 2, 3]),
      );
      const snapshot = async () => {
        const result: Record<string, string> = {};
        for (const name of (
          await readdir(directory, { recursive: true })
        ).sort()) {
          const target = path.join(directory, name);
          const metadata = await stat(target);
          // Windows удерживает mutex.lock kernel-lock'ом: наблюдаем его метаданные,
          // сохраняя проверку имени, размера, времени изменения и inode без read EBUSY.
          result[name] = metadata.isDirectory()
            ? 'directory'
            : name.endsWith('mutex.lock')
              ? JSON.stringify({
                  size: metadata.size,
                  mtimeMs: metadata.mtimeMs,
                  ino: metadata.ino,
                })
              : (await readFile(target)).toString('hex');
        }
        return result;
      };
      const before = await snapshot();
      const acquire = vi.spyOn(reader, 'acquire');
      const control = vi.spyOn(reader, 'sendControl');
      expect(await reader.list()).toEqual([await store.read('job')]);
      expect(await reader.readLeaseState('job')).toBe('active');
      expect(
        await new FileManifestStore({ stateDir: directory }).readLeaseState(
          'job',
        ),
      ).toBe('active');
      expect(await snapshot()).toEqual(before);
      expect(acquire).not.toHaveBeenCalled();
      expect(control).not.toHaveBeenCalled();
      expect(recover).toHaveBeenCalledTimes(1);
      await expect(reader.acquire('job', { recover })).rejects.toBeInstanceOf(
        ValidationError,
      );
      expect(recover).toHaveBeenCalledTimes(1);
      await owner.save({
        ...owner.manifest,
        updatedAt: '2026-01-03T00:00:00.000Z',
      });
      expect((await reader.list())[0]?.updatedAt).toBe(
        '2026-01-03T00:00:00.000Z',
      );
      const requestPath = path.join(
        path.dirname(manifestPath(directory)),
        'requests',
        `${request.requestId}.json`,
      );
      expect(JSON.parse(await readFile(requestPath, 'utf8'))).toEqual(request);
    } finally {
      await owner?.release();
      vi.restoreAllMocks();
      vi.useRealTimers();
      await rm(directory, { recursive: true, force: true });
    }
  }, 20_000);

  it('выполняет recovery до выдачи previously released paused аренды', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'manifest-store-'));
    try {
      const store = new FileManifestStore({ stateDir: directory });
      await store.create(fixture());
      const first = await store.acquire('job', {
        recover: async (item) => item,
      });
      await first.release();
      let recovered = false;
      const second = await store.acquire('job', {
        recover: async (item) => {
          recovered = true;
          return { ...item, updatedAt: '2026-01-02T00:00:00.000Z' };
        },
      });
      expect(recovered).toBe(true);
      expect(second.manifest.updatedAt).toBe('2026-01-02T00:00:00.000Z');
      await second.release();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 25_000);

  it('увеличивает generation после release и отвергает утраченный ownerToken', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'manifest-fence-'));
    try {
      const store = new FileManifestStore({ stateDir: directory });
      await store.create(fixture());
      const first = await store.acquire('job', {
        recover: async (item) => item,
      });
      const before = JSON.parse(
        await readFile(leasePath(directory), 'utf8'),
      ) as {
        generation: number;
      };
      await first.release();
      const second = await store.acquire('job', {
        recover: async (item) => item,
      });
      const current = JSON.parse(
        await readFile(leasePath(directory), 'utf8'),
      ) as Record<string, unknown>;
      expect(current.generation).toBe(before.generation + 1);
      await writeFile(
        leasePath(directory),
        JSON.stringify({ ...current, ownerToken: 'other-owner' }),
      );
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
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('объединяет только partial.bytes и сбрасывает его при release', async () => {
    vi.useFakeTimers();
    const directory = await mkdtemp(path.join(tmpdir(), 'manifest-progress-'));
    try {
      const store = new FileManifestStore({ stateDir: directory });
      await store.create({
        ...fixture(),
        tracks: [
          {
            ...fixture().tracks[0]!,
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
      vi.useRealTimers();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('разрешает foreign force только для наблюдавшегося generation', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'manifest-force-'));
    try {
      const store = new FileManifestStore({ stateDir: directory });
      await store.create(fixture());
      await writeFile(
        leasePath(directory),
        JSON.stringify({
          pid: 1,
          hostname: 'foreign.example',
          processStartedAt: 'foreign',
          generation: 7,
          ownerToken: 'foreign-owner',
          acquiredAt: '2000-01-01T00:00:00.000Z',
          heartbeatAt: '2000-01-01T00:00:00.000Z',
        }),
      );
      await expect(
        store.acquire('job', {
          forceForeignLease: true,
          expectedGeneration: 6,
          recover: async (item) => item,
        }),
      ).rejects.toThrow();
      const session = await store.acquire('job', {
        forceForeignLease: true,
        expectedGeneration: 7,
        recover: async (item) => item,
      });
      await session.release();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('не применяет старый progress после completed transition и release', async () => {
    const directory = await mkdtemp(
      path.join(tmpdir(), 'manifest-transition-'),
    );
    try {
      const store = new FileManifestStore({ stateDir: directory });
      await store.create({
        ...fixture(),
        tracks: [
          {
            ...fixture().tracks[0]!,
            status: 'downloading',
            partial: { bytes: 2, variantKey: 'v', tagged: false },
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
      await session.save({
        ...session.manifest,
        tracks: [
          {
            ...session.manifest.tracks[0]!,
            status: 'completed',
            partial: undefined,
          },
        ],
      });
      await session.release();
      expect((await store.read('job'))?.tracks[0]?.status).toBe('completed');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('публикует ack только после handler с durable owner save', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'manifest-control-'));
    try {
      const store = new FileManifestStore({ stateDir: directory });
      await store.create(fixture());
      const session = await store.acquire('job', {
        recover: async (item) => item,
      });
      const request = await store.sendControl('job', { command: 'pause' });
      await session.consumeControls(async (item) => {
        await session.save({
          ...session.manifest,
          control: { state: 'paused', pauseReason: item.command },
          updatedAt: item.createdAt,
        });
        return {
          requestId: item.requestId,
          accepted: true,
          completedAt: item.createdAt,
        };
      });
      expect(
        (await store.waitControlAck('job', request.requestId, 10))?.accepted,
      ).toBe(true);
      expect((await store.read('job'))?.lastControl?.requestId).toBe(
        request.requestId,
      );
      await session.release();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('release ждёт accepted owner effect и разрешает его checkpoint', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'manifest-release-'));
    try {
      const store = new FileManifestStore({ stateDir: directory });
      await store.create(fixture());
      const session = await store.acquire('job', {
        recover: async (item) => item,
      });
      const started = deferred<void>();
      const continueEffect = deferred<void>();
      const effect = session.runOwned(async () => {
        started.resolve();
        await continueEffect.promise;
        let nestedRan = false;
        await expect(
          session.runOwned(async () => {
            nestedRan = true;
          }),
        ).rejects.toThrow();
        expect(nestedRan).toBe(false);
        await session.save({
          ...session.manifest,
          updatedAt: '2026-01-03T00:00:00.000Z',
        });
      });
      await started.promise;
      const release = session.release();
      await expect(session.runOwned(async () => undefined)).rejects.toThrow();
      continueEffect.resolve();
      await effect;
      await release;
      expect((await store.read('job'))?.updatedAt).toBe(
        '2026-01-03T00:00:00.000Z',
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('отвергает bytes-only save после release без изменения memory или disk (F-008)', async () => {
    const directory = await mkdtemp(
      path.join(tmpdir(), 'manifest-released-progress-'),
    );
    try {
      const store = new FileManifestStore({ stateDir: directory });
      await store.create({
        ...fixture(),
        tracks: [
          {
            ...fixture().tracks[0]!,
            partial: { bytes: 1, variantKey: 'v', tagged: false },
          },
        ],
      });
      const session = await store.acquire('job', {
        recover: async (item) => item,
      });
      await session.release();
      await expect(
        session.save({
          ...session.manifest,
          tracks: [
            {
              ...session.manifest.tracks[0]!,
              partial: { bytes: 9, variantKey: 'v', tagged: false },
            },
          ],
        }),
      ).rejects.toThrow();
      expect((await store.read('job'))?.tracks[0]?.partial?.bytes).toBe(1);
      expect(session.manifest.tracks[0]?.partial?.bytes).toBe(1);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('F-013 не перезаписывает существующий manifest будущей версии', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'manifest-future-'));
    try {
      const store = new FileManifestStore({ stateDir: directory });
      await store.create(fixture());
      const target = manifestPath(directory);
      const future = JSON.stringify({ version: 2, token: 'не менять' });
      await writeFile(target, future);
      await expect(store.read('job')).rejects.toBeInstanceOf(ValidationError);
      await expect(store.read('job')).rejects.toThrow('проверку');
      await expect(
        store.acquire('job', { recover: async (item) => item }),
      ).rejects.toBeInstanceOf(ValidationError);
      await expect(
        store.acquire('job', { recover: async (item) => item }),
      ).rejects.toThrow('проверку');
      expect(await readFile(target, 'utf8')).toBe(future);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

runManifestStoreContract({ describe, it, expect }, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'manifest-contract-'));
  return new FileManifestStore({ stateDir: directory });
});
