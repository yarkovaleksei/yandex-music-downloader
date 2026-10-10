import {
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { fork, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeStreamToPart } from '@music-downloader/core-filesystem';
import {
  consumeManifestControls,
  finalizeWithManifestCheckpoint,
  openRecoveredJob,
  prepareRangeCandidate,
} from '@music-downloader/core-manifest';
import { FileManifestStore } from '@music-downloader/persistence';
import { beforeAll, describe, expect, it } from 'vitest';

const stream = (data: readonly number[]) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new Uint8Array(data));
      c.close();
    },
  });
async function size(target: string): Promise<number | undefined> {
  try {
    return (await stat(target)).size;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

const fixturePath = fileURLToPath(
  new URL('./fixtures/recovery-owner.mjs', import.meta.url),
);
beforeAll(() => {
  const result = spawnSync(
    process.execPath,
    ['packages/testing/scripts/run-yarn.mjs', 'build'],
    {
      cwd: path.resolve(path.dirname(fixturePath), '../../../..'),
      encoding: 'utf8',
      timeout: 30_000,
    },
  );
  if (result.status !== 0)
    throw new Error(
      result.stderr || result.stdout || 'Не удалось собрать fixture.',
    );
}, 35_000);

interface ChildMessage {
  readonly status: string;
  readonly statuses?: readonly string[];
  readonly message?: string;
}

function startChild(stateDir: string, counterPath: string, mode: string) {
  const child = fork(fixturePath, [], {
    env: { ...process.env, stateDir, jobId: 'crash-job', counterPath, mode },
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  });
  let stderr = '';
  child.stderr?.on('data', (value: Buffer) => {
    stderr += value.toString();
  });
  const messages: ChildMessage[] = [];
  child.on('message', (message: ChildMessage) => {
    messages.push(message);
  });
  const exited = once(child, 'exit');
  void exited.catch(() => undefined);
  const waitFor = async (status: string): Promise<ChildMessage> => {
    const cached = messages.find(
      (message) => message.status === status || message.status === 'error',
    );
    if (cached !== undefined) {
      if (cached.status === 'error') throw new Error(cached.message);
      return cached;
    }
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        child.off('message', onMessage);
        child.off('exit', onExit);
      };
      const onMessage = (message: ChildMessage) => {
        if (message.status !== status && message.status !== 'error') return;
        cleanup();
        if (message.status === 'error') reject(new Error(message.message));
        else resolve(message);
      };
      const onExit = () => {
        cleanup();
        reject(new Error(`Child завершился до ${status}: ${stderr}`));
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Нет IPC ${status}: ${stderr}`));
      }, 10_000);
      child.on('message', onMessage);
      child.on('exit', onExit);
    });
  };
  return { child, exited, waitFor };
}

async function stopChild(entry: ReturnType<typeof startChild>): Promise<void> {
  if (entry.child.exitCode === null && entry.child.signalCode === null)
    entry.child.kill('SIGKILL');
  await entry.exited;
}

/** Composition test связывает production store, recovery и writer без нарушения слоёв ADR-001. */
describe('manifest recovery composition', () => {
  it('после SIGKILL продолжает только незавершённый трек playlist через реальные exports', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'manifest-crash-'));
    const stateDir = path.join(root, 'state');
    const counterPath = path.join(root, 'opens.txt');
    const children: ReturnType<typeof startChild>[] = [];
    try {
      const store = new FileManifestStore({ stateDir });
      const source = { provider: 'test', kind: 'playlist' as const, id: 'p' };
      const timestamp = '2026-01-01T00:00:00.000Z';
      await store.create({
        version: 1,
        jobId: 'crash-job',
        provider: 'test',
        source,
        quality: 'best',
        destination: root,
        createdAt: timestamp,
        updatedAt: timestamp,
        control: { state: 'running' },
        plan: {
          source,
          title: 'Playlist',
          tracks: [1, 2].map((position) => ({
            position,
            trackKey: String(position),
            track: { id: String(position), availability: 'unknown' },
          })),
        },
        tracks: [1, 2].map((position) => ({
          position,
          trackKey: String(position),
          status: 'queued',
          attempts: 0,
          history: [],
          updatedAt: timestamp,
          partPath: path.join(root, `${position}.part`),
          resultPath: path.join(root, `${position}.bin`),
        })),
      });
      const first = startChild(stateDir, counterPath, 'first');
      children.push(first);
      await first.waitFor('midpoint');
      expect(await readFile(path.join(root, '1.bin'))).toEqual(
        Buffer.from([9, 8, 7]),
      );
      expect(await readFile(path.join(root, '2.part'))).toEqual(
        Buffer.from([1, 2]),
      );
      first.child.kill('SIGKILL');
      await first.exited;
      // Ускоряем только истечение heartbeat. PID и birth остаются от действительно убитого child.
      const directory = createHash('sha256').update('crash-job').digest('hex');
      const leasePath = path.join(stateDir, directory, 'lease.json');
      const lease = JSON.parse(await readFile(leasePath, 'utf8')) as Record<
        string,
        unknown
      >;
      await writeFile(
        leasePath,
        JSON.stringify({ ...lease, heartbeatAt: timestamp }),
      );
      const restarted = startChild(stateDir, counterPath, 'restart');
      children.push(restarted);
      expect((await restarted.waitFor('recovered')).statuses).toEqual([
        'completed',
        'queued',
      ]);
      await restarted.waitFor('completed');
      expect((await restarted.exited)[0]).toBe(0);
      expect(await readFile(path.join(root, '2.bin'))).toEqual(
        Buffer.from([1, 2, 3, 4]),
      );
      expect((await readFile(counterPath, 'utf8')).trim().split('\n')).toEqual([
        '1:first',
        '2:first',
        '2:restart',
      ]);
      expect(
        (await store.read('crash-job'))?.tracks.map((track) => track.status),
      ).toEqual(['completed', 'completed']);
    } finally {
      await Promise.all(children.map(stopChild));
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);
  it('F-009 восстанавливает checkpoint после rename и SIGKILL до completed snapshot', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'manifest-rename-gap-'));
    const stateDir = path.join(root, 'state');
    const counterPath = path.join(root, 'opens.txt');
    const children: ReturnType<typeof startChild>[] = [];
    try {
      const store = new FileManifestStore({ stateDir });
      const source = { provider: 'test', kind: 'track' as const, id: 'source' };
      const timestamp = '2026-01-01T00:00:00.000Z';
      await store.create({
        version: 1,
        jobId: 'crash-job',
        provider: 'test',
        source,
        quality: 'best',
        destination: root,
        createdAt: timestamp,
        updatedAt: timestamp,
        control: { state: 'running' },
        plan: {
          source,
          title: 'Трек',
          tracks: [
            {
              position: 1,
              trackKey: '1',
              track: { id: '1', availability: 'unknown' },
            },
          ],
        },
        tracks: [
          {
            position: 1,
            trackKey: '1',
            status: 'queued',
            attempts: 0,
            history: [],
            updatedAt: timestamp,
            partPath: path.join(root, '1.part'),
            resultPath: path.join(root, '1.bin'),
          },
        ],
      });
      const first = startChild(stateDir, counterPath, 'rename-gap');
      children.push(first);
      await first.waitFor('renamed');
      expect(await readFile(path.join(root, '1.bin'))).toEqual(
        Buffer.from([9, 8, 7]),
      );
      first.child.kill('SIGKILL');
      await first.exited;
      const leasePath = path.join(
        stateDir,
        createHash('sha256').update('crash-job').digest('hex'),
        'lease.json',
      );
      const lease = JSON.parse(await readFile(leasePath, 'utf8')) as Record<
        string,
        unknown
      >;
      await writeFile(
        leasePath,
        JSON.stringify({ ...lease, heartbeatAt: timestamp }),
      );
      const restarted = startChild(stateDir, counterPath, 'restart');
      children.push(restarted);
      expect((await restarted.waitFor('recovered')).statuses).toEqual([
        'completed',
      ]);
      await restarted.waitFor('completed');
      expect((await store.read('crash-job'))?.tracks[0]?.status).toBe(
        'completed',
      );
    } finally {
      await Promise.all(children.map(stopChild));
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);
  it('восстанавливает только unfinished трек и дописывает Range candidate побайтно', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'manifest-composition-'));
    const part = path.join(root, 'next.part');
    try {
      await writeFile(part, new Uint8Array([1, 2]));
      const store = new FileManifestStore({
        stateDir: path.join(root, 'state'),
      });
      await store.create({
        version: 1,
        jobId: 'job',
        provider: 'test',
        source: { provider: 'test', kind: 'playlist', id: 'p' },
        quality: 'best',
        destination: root,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        control: { state: 'paused' },
        plan: {
          source: { provider: 'test', kind: 'playlist', id: 'p' },
          title: 'P',
          tracks: [
            {
              position: 1,
              trackKey: '1',
              track: { id: 'a', availability: 'unknown' },
            },
            {
              position: 2,
              trackKey: '2',
              track: { id: 'b', availability: 'unknown' },
            },
          ],
        },
        tracks: [
          {
            position: 1,
            trackKey: '1',
            status: 'completed',
            attempts: 1,
            history: [],
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
          {
            position: 2,
            trackKey: '2',
            status: 'downloading',
            attempts: 1,
            history: [],
            partPath: part,
            partial: {
              bytes: 0,
              expectedSize: 4,
              variantKey: 'v',
              tagged: false,
            },
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      });
      const { session } = await openRecoveredJob(store, 'job', {
        exists: async (target) => (await size(target)) !== undefined,
        size,
        validateFinal: async () => true,
      });
      expect(session.manifest.tracks.map((track) => track.status)).toEqual([
        'completed',
        'queued',
      ]);
      await prepareRangeCandidate(
        {
          stat: size,
          read: async (target) => new Uint8Array(await readFile(target)),
          candidatePath: (canonical) => `${canonical}.candidate`,
          writeStreamToPart: async (value, target, expected) => {
            await writeStreamToPart(value, target, { expectedSize: expected });
          },
          promote: rename,
        },
        part,
        session.manifest.tracks[1]?.partial,
        'v',
        {
          acceptsRanges: true,
          startOffset: 2,
          contentLength: 4,
          stream: stream([3, 4]),
        },
      );
      expect(await readFile(part)).toEqual(Buffer.from([1, 2, 3, 4]));
      await session.release();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('F-007/F-015 заменяет несовместимый или запрещённый Range prefix полным payload', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'manifest-restart-'));
    const part = path.join(root, 'track.part');
    try {
      await writeFile(part, new Uint8Array([1, 2]));
      await prepareRangeCandidate(
        {
          stat: size,
          read: async (target) => new Uint8Array(await readFile(target)),
          candidatePath: (canonical) => `${canonical}.candidate`,
          writeStreamToPart: async (value, target, expected) => {
            await writeStreamToPart(value, target, { expectedSize: expected });
          },
          promote: rename,
          reopenAtZero: async () => ({
            acceptsRanges: false,
            startOffset: 0,
            contentLength: 4,
            stream: stream([9, 8, 7, 6]),
          }),
        },
        part,
        { bytes: 2, expectedSize: 4, variantKey: 'v', tagged: true },
        'v',
        {
          acceptsRanges: true,
          startOffset: 2,
          contentLength: 4,
          stream: stream([3, 4]),
        },
      );
      expect(await readFile(part)).toEqual(Buffer.from([9, 8, 7, 6]));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it('F-007 сохраняет canonical prefix при неудачной полной замене candidate', async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), 'manifest-candidate-fail-'),
    );
    const part = path.join(root, 'track.part');
    try {
      await writeFile(part, new Uint8Array([1, 2]));
      await expect(
        prepareRangeCandidate(
          {
            stat: size,
            read: async (target) => new Uint8Array(await readFile(target)),
            candidatePath: (canonical) => `${canonical}.candidate`,
            writeStreamToPart: async (value, target, expected) => {
              await writeStreamToPart(value, target, {
                expectedSize: expected,
              });
            },
            promote: rename,
            reopenAtZero: async () => ({
              acceptsRanges: false,
              startOffset: 0,
              contentLength: 4,
              stream: stream([9]),
            }),
          },
          part,
          { bytes: 2, expectedSize: 4, variantKey: 'v', tagged: true },
          'v',
          {
            acceptsRanges: true,
            startOffset: 2,
            contentLength: 4,
            stream: stream([3, 4]),
          },
        ),
      ).rejects.toThrow();
      expect(await readFile(part)).toEqual(Buffer.from([1, 2]));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('F-012 удерживает аренду до окончания public finalization и не допускает effect released session', async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), 'manifest-finalize-owner-'),
    );
    const part = path.join(root, 'track.part');
    try {
      await writeFile(part, new Uint8Array([1, 2]));
      const store = new FileManifestStore({
        stateDir: path.join(root, 'state'),
      });
      const source = { provider: 'test', kind: 'track' as const, id: 'source' };
      await store.create({
        version: 1,
        jobId: 'job',
        provider: 'test',
        source,
        quality: 'best',
        destination: root,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        control: { state: 'running' },
        plan: {
          source,
          title: 'Трек',
          tracks: [
            {
              position: 1,
              trackKey: '1',
              track: { id: 'track', availability: 'unknown' },
            },
          ],
        },
        tracks: [
          {
            position: 1,
            trackKey: '1',
            status: 'downloading',
            attempts: 0,
            history: [],
            updatedAt: '2026-01-01T00:00:00.000Z',
            partPath: part,
            resultPath: path.join(root, 'track.bin'),
            partial: {
              bytes: 2,
              expectedSize: 4,
              variantKey: 'v',
              tagged: false,
            },
          },
        ],
      });
      const session = await store.acquire('job', {
        recover: async (item) => item,
      });
      let begin!: () => void;
      const started = new Promise<void>((resolve) => {
        begin = resolve;
      });
      let continueMutation!: () => void;
      const blocked = new Promise<void>((resolve) => {
        continueMutation = resolve;
      });
      const finalizing = finalizeWithManifestCheckpoint(session, '1', {
        mutateAndValidate: async () => {
          begin();
          await blocked;
          throw new Error('stopped after guard');
        },
        size: async () => 2,
        rename: async () => {
          throw new Error('rename must not run');
        },
      });
      await started;
      const release = session.release();
      await expect(
        store.acquire('job', { recover: async (item) => item }),
      ).rejects.toThrow();
      continueMutation();
      await expect(finalizing).rejects.toThrow('stopped after guard');
      await release;
      expect((await store.read('job'))?.tracks[0]?.partial?.tagged).toBe(true);
      let effect = false;
      await expect(
        finalizeWithManifestCheckpoint(session, '1', {
          mutateAndValidate: async () => {
            effect = true;
          },
          size: async () => 2,
          rename: async () => undefined,
        }),
      ).rejects.toThrow();
      expect(effect).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('F-016 выполняет recovery released-paused job до owner resume и не повторяет committed request', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'manifest-resume-'));
    try {
      const store = new FileManifestStore({
        stateDir: path.join(root, 'state'),
      });
      const source = { provider: 'test', kind: 'track' as const, id: 'source' };
      await store.create({
        version: 1,
        jobId: 'job',
        provider: 'test',
        source,
        quality: 'best',
        destination: root,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        control: { state: 'paused' },
        plan: {
          source,
          title: 'Трек',
          tracks: [
            {
              position: 1,
              trackKey: '1',
              track: { id: 'track', availability: 'unknown' },
            },
          ],
        },
        tracks: [
          {
            position: 1,
            trackKey: '1',
            status: 'downloading',
            attempts: 0,
            history: [],
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      });
      const released = await store.acquire('job', {
        recover: async (item) => item,
      });
      await released.release();
      const request = await store.sendControl('job', { command: 'resume' });
      expect((await store.read('job'))?.control.state).toBe('paused');
      const recovered = await openRecoveredJob(store, 'job', {
        exists: async () => false,
        size: async () => undefined,
        validateFinal: async () => false,
      });
      expect(recovered.manifest.tracks[0]?.status).toBe('queued');
      let calls = 0;
      await consumeManifestControls(recovered.session, async (item) => {
        calls += 1;
        await recovered.session.save({
          ...recovered.session.manifest,
          control: { state: 'running' },
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
      expect((await store.read('job'))?.control.state).toBe('running');
      await consumeManifestControls(recovered.session, async () => {
        calls += 1;
        throw new Error('committed request cannot replay');
      });
      expect(calls).toBe(1);
      await recovered.session.release();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
