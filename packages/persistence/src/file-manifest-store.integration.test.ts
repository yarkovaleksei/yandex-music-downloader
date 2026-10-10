import { createHash } from 'node:crypto';
import { fork, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { FileManifestStore } from './file-manifest-store.js';

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
      stateDir,
      jobId,
      mode,
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
        5_000,
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
