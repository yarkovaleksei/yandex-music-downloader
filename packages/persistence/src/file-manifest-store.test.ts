import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it, vi } from 'vitest';
import { FileManifestStore } from './file-manifest-store.js';
import {
  runManifestStoreContract,
  ValidationError,
} from '@music-downloader/shared';

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
  });

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
