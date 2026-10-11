import { createHash } from 'node:crypto';
import { fork, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  decodeManifest,
  encodeManifest,
  type JobManifestV1,
  type LeaseSession,
} from '@music-downloader/shared';
import { FileManifestStore } from './file-manifest-store.js';
import * as atomicJson from './atomic-json.js';

const fixturePath = fileURLToPath(
  new URL('./fixtures/manifest-owner.mjs', import.meta.url),
);
const jobDirectory = (root: string, jobId: string) =>
  path.join(root, createHash('sha256').update(jobId).digest('hex'));
const manifest = (jobId: string) => ({
  version: 1 as const,
  jobId,
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
}, 30_000);

async function child(
  stateDir: string,
  jobId: string,
  mode: 'hold' | 'once',
  forceForeignLease = false,
) {
  const processChild = fork(fixturePath, [], {
    env: {
      ...process.env,
      // Vitest передаёт MODE=test; роль fixture изолирована ключом F-003.
      MODE: 'test',
      stateDir,
      jobId,
      MANIFEST_TEST_MODE: mode,
      forceForeignLease: String(forceForeignLease),
    },
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  });
  let stderr = '';
  processChild.stderr?.setEncoding('utf8');
  processChild.stderr?.on('data', (chunk: string) => {
    stderr += chunk;
  });
  // Регистрируем exit до первого IPC: одноразовый child может завершиться сразу
  // после сообщения, и поздний once иначе навсегда пропустит событие.
  const exited = once(processChild, 'exit');
  const message = await Promise.race([
    once(processChild, 'message').then(
      ([value]) => value as { status: string; message?: string },
    ),
    exited.then(([code]) => ({
      status: 'exited',
      message: `child exited ${String(code)}: ${stderr}`,
    })),
    new Promise<{ status: string; message: string }>((resolve) =>
      setTimeout(
        () =>
          resolve({
            status: 'timeout',
            message: 'child did not report lease result',
          }),
        15_000,
      ),
    ),
  ]);
  return { processChild, message, exited };
}

async function stopChild(
  processChild: ReturnType<typeof fork>,
  exited: Promise<unknown>,
): Promise<void> {
  if (processChild.exitCode === null && !processChild.killed)
    processChild.kill('SIGKILL');
  await exited;
}

describe('FileManifestStore child-process lease', () => {
  it('STEP-043 H-002: наблюдает живой/завершившийся процесс при неизменном pending manifest', async () => {
    const stateDir = await mkdtemp(
      path.join(os.tmpdir(), 'lease-observer-child-'),
    );
    const jobId = 'observed-job';
    let owner: Awaited<ReturnType<typeof child>> | undefined;
    try {
      const store = new FileManifestStore({ stateDir });
      await store.create({
        ...manifest(jobId),
        control: { state: 'running' },
        tracks: [{ ...manifest(jobId).tracks[0]!, status: 'downloading' }],
      });
      owner = await child(stateDir, jobId, 'hold');
      expect(owner.message.status).toBe('acquired');
      const directory = jobDirectory(stateDir, jobId);
      const snapshot = await readFile(
        path.join(directory, 'manifest.json'),
        'utf8',
      );
      const leasePath = path.join(directory, 'lease.json');
      const lease = JSON.parse(await readFile(leasePath, 'utf8')) as Record<
        string,
        unknown
      >;
      const observer = new FileManifestStore({ stateDir });
      expect(await observer.readLeaseState(jobId)).toBe('active');
      // Timeout сам по себе не делает живую аренду inactive (ADR-004).
      await writeFile(
        leasePath,
        JSON.stringify({ ...lease, heartbeatAt: '2000-01-01T00:00:00.000Z' }),
      );
      expect(await observer.readLeaseState(jobId)).toBe('active');
      owner.processChild.kill('SIGKILL');
      await owner.exited;
      // Сохраняем настоящий PID/birth умершего владельца, обновляя только freshness fixture.
      await writeFile(
        leasePath,
        JSON.stringify({ ...lease, heartbeatAt: new Date().toISOString() }),
      );
      expect(await observer.readLeaseState(jobId)).toBe('active');
      await writeFile(
        leasePath,
        JSON.stringify({ ...lease, heartbeatAt: '2000-01-01T00:00:00.000Z' }),
      );
      const restarted = new FileManifestStore({ stateDir });
      expect(await restarted.readLeaseState(jobId)).toBe('inactive');
      expect(
        await readFile(path.join(directory, 'manifest.json'), 'utf8'),
      ).toBe(snapshot);
      const pending = decodeManifest(snapshot);
      expect(pending.control.state).toBe('running');
      expect(pending.tracks[0]?.status).toBe('downloading');
      // Определённые active/inactive дают true/false агрегатору; его suite проверяет running/interrupted.
      expect((await restarted.readLeaseState(jobId)) === 'active').toBe(false);
    } finally {
      if (owner !== undefined)
        await stopChild(owner.processChild, owner.exited);
      await rm(stateDir, { recursive: true, force: true });
    }
  }, 30_000);

  it('STEP-043: heartbeat/release публикуют целые lease snapshots при наблюдении', async () => {
    const stateDir = await mkdtemp(
      path.join(os.tmpdir(), 'lease-observer-atomic-'),
    );
    const jobId = 'atomic-lease';
    let owner: LeaseSession | undefined;
    let unblock: (() => void) | undefined;
    let pending: Promise<void> | undefined;
    const write = atomicJson.writeAtomicJson;
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    try {
      const store = new FileManifestStore({ stateDir });
      const observer = new FileManifestStore({ stateDir });
      await store.create(manifest(jobId));
      owner = await store.acquire(jobId, { recover: async (item) => item });
      const target = path.join(jobDirectory(stateDir, jobId), 'lease.json');
      const snapshot = await readFile(
        path.join(jobDirectory(stateDir, jobId), 'manifest.json'),
        'utf8',
      );
      for (const operation of ['heartbeat', 'release'] as const) {
        let reached!: () => void;
        const barrier = new Promise<void>((resolve) => {
          reached = resolve;
        });
        const resume = new Promise<void>((resolve) => {
          unblock = resolve;
        });
        const writer = vi
          .spyOn(atomicJson, 'writeAtomicJson')
          .mockImplementation(async (destination, bytes) => {
            if (destination === target) {
              reached();
              await resume;
            }
            await write(destination, bytes);
          });
        pending = owner[operation]();
        await barrier;
        const before = await readFile(target, 'utf8');
        expect(await observer.readLeaseState(jobId)).toBe('active');
        expect(await readFile(target, 'utf8')).toBe(before);
        unblock?.();
        await pending;
        pending = undefined;
        writer.mockRestore();
        expect(await observer.readLeaseState(jobId)).toBe(
          operation === 'release' ? 'inactive' : 'active',
        );
        expect(
          await readFile(
            path.join(jobDirectory(stateDir, jobId), 'manifest.json'),
            'utf8',
          ),
        ).toBe(snapshot);
      }
    } finally {
      unblock?.();
      await pending;
      vi.restoreAllMocks();
      await owner?.release();
      vi.useRealTimers();
      await rm(stateDir, { recursive: true, force: true });
    }
  });

  it('H-002: list одновременно с owner save видит только целый старый или новый snapshot', async () => {
    const stateDir = await mkdtemp(
      path.join(os.tmpdir(), 'manifest-list-atomic-'),
    );
    const jobId = 'atomic-job';
    let owner: LeaseSession | undefined;
    let continueSave: (() => void) | undefined;
    let pendingSave: Promise<void> | undefined;
    const writeAtomicJson = atomicJson.writeAtomicJson;
    try {
      const store = new FileManifestStore({ stateDir });
      const reader = new FileManifestStore({ stateDir });
      await store.create(manifest(jobId));
      owner = await store.acquire(jobId, { recover: async (item) => item });
      let previous = (await store.read(jobId))!;
      for (let revision = 1; revision <= 6; revision += 1) {
        const at = `2026-01-0${revision + 1}T00:00:00.000Z`;
        const status = revision % 2 === 0 ? 'paused' : 'downloading';
        const next: JobManifestV1 = {
          ...previous,
          updatedAt: at,
          control: { state: revision % 2 === 0 ? 'paused' : 'running' },
          tracks: [
            {
              ...previous.tracks[0]!,
              status,
              attempts: revision,
              updatedAt: at,
              history: [{ at, status }],
            },
          ],
        };
        let started!: () => void;
        const writing = new Promise<void>((resolve) => {
          started = resolve;
        });
        const barrier = new Promise<void>((resolve) => {
          continueSave = resolve;
        });
        // Barrier удерживает принятый save до публикации; sleep и угадывание времени не нужны.
        const write = vi
          .spyOn(atomicJson, 'writeAtomicJson')
          .mockImplementation(async (target, bytes) => {
            if (
              target ===
              path.join(jobDirectory(stateDir, jobId), 'manifest.json')
            ) {
              started();
              await barrier;
            }
            await writeAtomicJson(target, bytes);
          });
        try {
          pendingSave = owner.save(next);
          await writing;
          expect(await reader.list()).toEqual([previous]);
          continueSave!();
          const [, during] = await Promise.all([pendingSave, reader.list()]);
          pendingSave = undefined;
          const canonicalNext = decodeManifest(encodeManifest(next));
          expect([
            JSON.stringify([previous]),
            JSON.stringify([canonicalNext]),
          ]).toContain(JSON.stringify(during));
          expect(await reader.list()).toEqual([canonicalNext]);
          previous = canonicalNext;
        } finally {
          continueSave?.();
          await pendingSave;
          write.mockRestore();
        }
      }
    } finally {
      continueSave?.();
      vi.restoreAllMocks();
      await owner?.release();
      await rm(stateDir, { recursive: true, force: true });
    }
  });

  it('отклоняет второго живого owner и выбирает ровно одного stale contender', async () => {
    const stateDir = await mkdtemp(path.join(os.tmpdir(), 'manifest-child-'));
    const jobId = 'child-job';
    let owner: Awaited<ReturnType<typeof child>> | undefined;
    let live: Awaited<ReturnType<typeof child>> | undefined;
    let contenders: readonly Awaited<ReturnType<typeof child>>[] = [];
    try {
      const store = new FileManifestStore({ stateDir });
      const guardedPart = path.join(stateDir, 'guard.part');
      await writeFile(guardedPart, Buffer.from([1, 2, 3]));
      await store.create({
        ...manifest(jobId),
        tracks: [{ ...manifest(jobId).tracks[0]!, partPath: guardedPart }],
      });
      owner = await child(stateDir, jobId, 'hold');
      expect(owner.message.status).toBe('acquired');
      const snapshot = await readFile(
        path.join(jobDirectory(stateDir, jobId), 'manifest.json'),
      );
      live = await child(stateDir, jobId, 'once');
      expect(live.message.status).toBe('rejected');
      await live.exited;
      expect(
        await readFile(
          path.join(jobDirectory(stateDir, jobId), 'manifest.json'),
        ),
      ).toEqual(snapshot);
      expect(await readFile(guardedPart)).toEqual(Buffer.from([1, 2, 3]));
      owner.processChild.kill('SIGKILL');
      await owner.exited;
      const leasePath = path.join(jobDirectory(stateDir, jobId), 'lease.json');
      const lease = JSON.parse(await readFile(leasePath, 'utf8')) as Record<
        string,
        unknown
      >;
      await writeFile(
        leasePath,
        JSON.stringify({
          ...lease,
          pid: 999999,
          processStartedAt: 'linux:missing',
          heartbeatAt: '2000-01-01T00:00:00.000Z',
        }),
      );
      const [left, right] = await Promise.all([
        child(stateDir, jobId, 'hold'),
        child(stateDir, jobId, 'hold'),
      ]);
      contenders = [left, right];
      expect(
        [left.message.status, right.message.status].filter(
          (status) => status === 'acquired',
        ),
      ).toHaveLength(1);
      for (const contender of [left, right]) {
        if (contender.message.status === 'acquired')
          contender.processChild.send('release');
      }
      await Promise.all([left.exited, right.exited]);
    } finally {
      await Promise.all([
        ...(owner === undefined
          ? []
          : [stopChild(owner.processChild, owner.exited)]),
        ...(live === undefined
          ? []
          : [stopChild(live.processChild, live.exited)]),
        ...contenders.map((entry) =>
          stopChild(entry.processChild, entry.exited),
        ),
      ]);
      await rm(stateDir, { recursive: true, force: true });
    }
  }, 30_000);

  it('F-014 reclaim-ит stale lease с PID реально живого процесса и другим birth', async () => {
    const stateDir = await mkdtemp(path.join(os.tmpdir(), 'manifest-birth-'));
    const jobId = 'birth-job';
    let contender: Awaited<ReturnType<typeof child>> | undefined;
    try {
      const store = new FileManifestStore({ stateDir });
      await store.create(manifest(jobId));
      await writeFile(
        path.join(jobDirectory(stateDir, jobId), 'lease.json'),
        JSON.stringify({
          pid: process.pid,
          hostname: os.hostname(),
          processStartedAt: 'reused-birth',
          generation: 1,
          ownerToken: 'stale-owner',
          acquiredAt: '2000-01-01T00:00:00.000Z',
          heartbeatAt: '2000-01-01T00:00:00.000Z',
        }),
      );
      expect(
        await new FileManifestStore({ stateDir }).readLeaseState(jobId),
      ).toBe('inactive');
      contender = await child(stateDir, jobId, 'once');
      expect(contender.message.status).toBe('acquired');
      await contender.exited;
    } finally {
      if (contender !== undefined)
        await stopChild(contender.processChild, contender.exited);
      await rm(stateDir, { recursive: true, force: true });
    }
  }, 30_000);

  it('не reclaim-ит foreign lease без force и принимает explicit force', async () => {
    const stateDir = await mkdtemp(path.join(os.tmpdir(), 'manifest-foreign-'));
    const jobId = 'foreign-job';
    let denied: Awaited<ReturnType<typeof child>> | undefined;
    let forced: Awaited<ReturnType<typeof child>> | undefined;
    try {
      const store = new FileManifestStore({ stateDir });
      await store.create(manifest(jobId));
      const directory = jobDirectory(stateDir, jobId);
      await writeFile(
        path.join(directory, 'lease.json'),
        JSON.stringify({
          pid: 1,
          hostname: 'foreign.example',
          processStartedAt: 'foreign',
          acquiredAt: '2000-01-01T00:00:00.000Z',
          heartbeatAt: '2000-01-01T00:00:00.000Z',
        }),
      );
      denied = await child(stateDir, jobId, 'once');
      expect(denied.message.status).toBe('rejected');
      await denied.exited;
      forced = await child(stateDir, jobId, 'once', true);
      expect(forced.message.status).toBe('acquired');
      await forced.exited;
    } finally {
      await Promise.all([
        ...(denied === undefined
          ? []
          : [stopChild(denied.processChild, denied.exited)]),
        ...(forced === undefined
          ? []
          : [stopChild(forced.processChild, forced.exited)]),
      ]);
      await rm(stateDir, { recursive: true, force: true });
    }
  }, 30_000);
});
