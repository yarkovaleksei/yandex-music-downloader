import { createHash } from 'node:crypto';
import { fork, spawnSync, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { FileManifestStore } from '@music-downloader/persistence';
import type { JobManifestV1 } from '@music-downloader/shared';

const fixturePath = fileURLToPath(
  new URL('./fixtures/download-manager-owner.mjs', import.meta.url),
);
const root = path.resolve(path.dirname(fixturePath), '../../../..');

/** Fixture исполняет built core: настоящий owner не подменяется тестовой state machine. */
beforeAll(() => {
  const result = spawnSync(
    process.execPath,
    ['packages/testing/scripts/run-yarn.mjs', 'build'],
    { cwd: root, encoding: 'utf8' },
  );
  if (result.status !== 0)
    throw new Error(
      result.stderr || 'Не удалось собрать fixture Download Manager.',
    );
}, 30_000);

interface FixtureMessage {
  readonly event: string;
  readonly trackKey?: string;
  readonly message?: string;
  readonly offset?: number;
  readonly bytes?: number[];
}

async function startOwner(stateDir: string, jobId: string, mode = 'download') {
  const child = fork(fixturePath, [], {
    env: { ...process.env, stateDir, jobId, DOWNLOADER_TEST_MODE: mode },
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  });
  let stderr = '';
  child.stderr?.setEncoding('utf8');
  child.stderr?.on('data', (chunk: string) => {
    stderr += chunk;
  });
  const exited = once(child, 'exit');
  const messages: FixtureMessage[] = [];
  child.on('message', (message: FixtureMessage) => messages.push(message));
  const wait = async (event: string, trackKey?: string) => {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const message = messages.find(
        (item) =>
          item.event === event &&
          (trackKey === undefined || item.trackKey === trackKey),
      );
      if (message !== undefined) return message;
      if (child.exitCode !== null)
        throw new Error(`Owner завершился до ${event}: ${stderr}`);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`Owner не сообщил ${event}: ${stderr}`);
  };
  return { child, exited, messages, wait };
}

async function stopOwner(child: ChildProcess, exited: Promise<unknown>) {
  if (child.exitCode === null && child.signalCode === null)
    child.kill('SIGKILL');
  await exited;
}

/** Состариваем только аренду уже умершего fixture, сохраняя реальный acquire/recovery. */
async function expireDeadLease(stateDir: string, jobId: string) {
  const directory = path.join(
    stateDir,
    createHash('sha256').update(jobId).digest('hex'),
  );
  const target = path.join(directory, 'lease.json');
  const lease = JSON.parse(await readFile(target, 'utf8')) as Record<
    string,
    unknown
  >;
  await writeFile(
    target,
    JSON.stringify({ ...lease, heartbeatAt: '2000-01-01T00:00:00.000Z' }),
  );
}

function fixtureManifest(
  stateDir: string,
  jobId: string,
  count = 2,
): JobManifestV1 {
  const at = '2026-01-01T00:00:00.000Z';
  const source = { provider: 'mock', kind: 'playlist' as const, id: 'список' };
  return {
    version: 1,
    jobId,
    provider: 'mock',
    source,
    quality: 'best',
    destination: stateDir,
    createdAt: at,
    updatedAt: at,
    control: { state: 'running' },
    plan: {
      source,
      title: 'Интеграционная загрузка',
      tracks: Array.from({ length: count }, (_, index) => ({
        position: index + 1,
        trackKey: String(index + 1),
        track: {
          id: String(index + 1),
          availability: 'available',
          title: `Трек ${index + 1}`,
          artists: [],
        },
      })),
    },
    tracks: Array.from({ length: count }, (_, index) => ({
      position: index + 1,
      trackKey: String(index + 1),
      status: 'queued',
      attempts: 0,
      history: [],
      updatedAt: at,
    })),
  };
}

describe('Download Manager: реальные файлы и два процесса', () => {
  it('remote cancel применяется при частом progress и удаляет part', async () => {
    const stateDir = await mkdtemp(path.join(os.tmpdir(), 'download-control-'));
    const jobId = 'remote-cancel';
    const store = new FileManifestStore({ stateDir });
    await store.create(fixtureManifest(stateDir, jobId));
    const owner = await startOwner(stateDir, jobId);
    try {
      await owner.wait('track.progress', '2');
      const live = await store.read(jobId);
      const partPath = live?.tracks[1]?.partPath;
      expect(partPath).toBeDefined();
      expect((await readFile(partPath!)).length).toBeGreaterThan(0);
      const beforePrefix = await readFile(partPath!);
      const stable = (value: JobManifestV1 | undefined) => ({
        control: value?.control,
        tracks: value?.tracks.map((track) => ({
          status: track.status,
          variantKey: track.variantKey,
          resultPath: track.resultPath,
          partPath: track.partPath,
        })),
      });
      const beforeResume = stable(await store.read(jobId));
      const resume = await store.sendControl(jobId, { command: 'resume' });
      expect(
        (await store.waitControlAck(jobId, resume.requestId, 5000))?.accepted,
      ).toBe(false);
      // F-009: законный progress может продолжиться; стабильные fields и старый prefix не меняются.
      expect(stable(await store.read(jobId))).toEqual(beforeResume);
      const afterPrefix = await readFile(partPath!);
      expect(afterPrefix.subarray(0, beforePrefix.length)).toEqual(
        beforePrefix,
      );
      expect(
        owner.messages.filter((message) => message.event === 'opened'),
      ).toHaveLength(2);
      const cancel = await store.sendControl(jobId, { command: 'cancel' });
      expect(
        (await store.waitControlAck(jobId, cancel.requestId, 5000))?.accepted,
      ).toBe(true);
      const manifest = await store.read(jobId);
      expect(manifest?.control.state).toBe('cancelled');
      expect(manifest?.tracks.map((track) => track.status)).toEqual([
        'completed',
        'cancelled',
      ]);
      await expect(readFile(partPath!)).rejects.toMatchObject({
        code: 'ENOENT',
      });
    } finally {
      await stopOwner(owner.child, owner.exited);
      await rm(stateDir, { recursive: true, force: true });
    }
  }, 15_000);

  it('SIGINT сохраняет part и resume открывает только незавершённый трек с Range', async () => {
    const stateDir = await mkdtemp(path.join(os.tmpdir(), 'download-pause-'));
    const jobId = 'sigint-pause';
    const store = new FileManifestStore({ stateDir });
    await store.create(fixtureManifest(stateDir, jobId));
    const owner = await startOwner(stateDir, jobId);
    let resumed: Awaited<ReturnType<typeof startOwner>> | undefined;
    try {
      await owner.wait('track.progress', '2');
      owner.child.kill('SIGINT');
      await owner.wait('stopped');
      await owner.exited;
      const paused = await store.read(jobId);
      expect(paused?.control.state).toBe('paused');
      expect(paused?.tracks.map((track) => track.status)).toEqual([
        'completed',
        'paused',
      ]);
      const part = paused?.tracks[1]?.partPath;
      const prefixSize = (await readFile(part!)).length;
      expect(prefixSize).toBeGreaterThan(0);
      resumed = await startOwner(stateDir, jobId, 'resume');
      await resumed.wait('job.completed');
      const complete = await store.read(jobId);
      expect(complete?.tracks.map((track) => track.status)).toEqual([
        'completed',
        'completed',
      ]);
      expect(
        resumed.messages
          .filter((message) => message.event === 'opened')
          .map((message) => message.trackKey),
      ).toEqual(['2']);
      // F-006/F-001: реальный новый process использует prefix и готовые cache bytes.
      expect(
        resumed.messages.filter((message) => message.event === 'opened')[0]
          ?.offset,
      ).toBe(prefixSize);
      expect(
        resumed.messages
          .filter((message) => message.event === 'processing-artwork')
          .map((message) => message.bytes),
      ).toEqual([[1]]);
      expect((await readFile(path.join(stateDir, '2.mp3'))).length).toBe(
        262144,
      );
    } finally {
      await stopOwner(owner.child, owner.exited);
      if (resumed !== undefined) await stopOwner(resumed.child, resumed.exited);
      await rm(stateDir, { recursive: true, force: true });
    }
  }, 15_000);

  it('crash recovery после устаревания аренды не загружает completed повторно', async () => {
    const stateDir = await mkdtemp(path.join(os.tmpdir(), 'download-crash-'));
    const jobId = 'crash-resume';
    const store = new FileManifestStore({ stateDir });
    await store.create(fixtureManifest(stateDir, jobId));
    const owner = await startOwner(stateDir, jobId);
    let resumed: Awaited<ReturnType<typeof startOwner>> | undefined;
    try {
      await owner.wait('track.progress', '2');
      owner.child.kill('SIGKILL');
      await owner.exited;
      await expireDeadLease(stateDir, jobId);
      resumed = await startOwner(stateDir, jobId);
      await resumed.wait('job.completed');
      expect(
        (await store.read(jobId))?.tracks.map((track) => track.status),
      ).toEqual(['completed', 'completed']);
      expect(
        resumed.messages
          .filter((message) => message.event === 'opened')
          .map((message) => message.trackKey),
      ).toEqual(['2']);
    } finally {
      await stopOwner(owner.child, owner.exited);
      if (resumed !== undefined) await stopOwner(resumed.child, resumed.exited);
      await rm(stateDir, { recursive: true, force: true });
    }
  }, 15_000);

  it('таймаут processing не заявляет освобождение аренды', async () => {
    const stateDir = await mkdtemp(path.join(os.tmpdir(), 'download-timeout-'));
    const jobId = 'processing-timeout';
    const store = new FileManifestStore({ stateDir });
    await store.create(fixtureManifest(stateDir, jobId, 1));
    const owner = await startOwner(stateDir, jobId, 'hang');
    try {
      await owner.wait('processing');
      owner.child.kill('SIGINT');
      await owner.wait('stop-timeout');
      const directory = path.join(
        stateDir,
        createHash('sha256').update(jobId).digest('hex'),
      );
      const lease = JSON.parse(
        await readFile(path.join(directory, 'lease.json'), 'utf8'),
      ) as Record<string, unknown>;
      expect(lease.releasedAt).toBeUndefined();
      await expect(
        store.acquire(jobId, { recover: async (manifest) => manifest }),
      ).rejects.toThrow();
    } finally {
      await stopOwner(owner.child, owner.exited);
      await rm(stateDir, { recursive: true, force: true });
    }
  }, 15_000);
});
