import { fork, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApplication } from '@music-downloader/application';
import {
  isJobEvent,
  isCommandResult,
  type MusicProvider,
} from '@music-downloader/application/contracts';

const fixture = fileURLToPath(
  new URL('./fixtures/headless-owner.mjs', import.meta.url),
);
const repository = path.resolve(path.dirname(fixture), '../../../..');
const token = 'headless-token-marker';
const signedUrl =
  'https://cdn.example.test/audio?signature=headless-signature-marker';
const sample = await readFile(
  new URL(
    '../../../packages/core/validation/src/fixtures/sample.mp3',
    import.meta.url,
  ),
);

/** Processing изменяет теги; одинаковые MPEG bytes доказывают побайтное продолжение после crash. */
function audioPayload(buffer: Buffer): Buffer {
  const start =
    buffer.toString('ascii', 0, 3) === 'ID3'
      ? 10 +
        ((buffer[6]! & 0x7f) << 21) +
        ((buffer[7]! & 0x7f) << 14) +
        ((buffer[8]! & 0x7f) << 7) +
        (buffer[9]! & 0x7f)
      : 0;
  const end =
    buffer.toString('ascii', buffer.length - 128, buffer.length - 125) === 'TAG'
      ? buffer.length - 128
      : buffer.length;
  return buffer.subarray(start, end);
}

beforeAll(() => {
  const result = spawnSync(
    process.execPath,
    ['packages/testing/scripts/run-yarn.mjs', 'build'],
    { cwd: repository, encoding: 'utf8' },
  );
  if (result.status !== 0)
    throw new Error(
      result.stderr || result.stdout || 'Не удалось собрать CLI fixture.',
    );
}, 30_000);

function owner(root: string, stateDir: string, crash: boolean, argv: string[]) {
  const child = fork(fixture, argv, {
    env: {
      ...process.env,
      HEADLESS_TEST_ROOT: root,
      HEADLESS_TEST_STATE_DIR: stateDir,
      ...(crash ? { HEADLESS_TEST_CRASH: '1' } : {}),
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  const messages: Record<string, unknown>[] = [];
  let stderr = '';
  let stdout = '';
  const exited = once(child, 'exit');
  child.stdout?.on('data', (chunk) => {
    stdout += String(chunk);
  });
  child.stderr?.on('data', (chunk) => {
    stderr += String(chunk);
  });
  child.on('message', (message) =>
    messages.push(message as Record<string, unknown>),
  );
  const wait = async (type: string) => {
    await expect
      .poll(() => messages.find((message) => message.type === type), {
        timeout: 15_000,
        interval: 20,
      })
      .toBeDefined();
    return messages.find((message) => message.type === type)!;
  };
  return {
    child,
    exited,
    messages,
    wait,
    stderr: () => stderr,
    stdout: () => stdout,
  };
}

/** REQ-039: байты базы, WAL, SHM и резервных копий SQLite store. */
async function stateDatabaseBytes(stateDir: string): Promise<string[]> {
  const files = (await readdir(stateDir)).filter((name) =>
    name.startsWith('state.sqlite3'),
  );
  expect(files).toContain('state.sqlite3');
  return Promise.all(
    files.map(async (name) =>
      (await readFile(path.join(stateDir, name))).toString('latin1'),
    ),
  );
}

/** Наблюдатель только читает job: provider не вызывается. */
const readOnlyProvider = {} as MusicProvider;

async function partFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, {
    recursive: true,
    withFileTypes: true,
  });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.part'))
    .map((entry) => path.join(entry.parentPath, entry.name));
}

describe('CLI crash resume', () => {
  it('CLI crash resume запускает новый process с реальным SQLite store', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'headless-cli-'));
    const stateDir = path.join(root, 'state');
    let first;
    let second;
    try {
      first = owner(root, stateDir, true, [
        'download',
        'offline://playlist/source',
        '--json',
        '--log-file',
        path.join(root, 'diagnostics.jsonl'),
        '--output',
        path.join(root, 'music'),
      ]);
      const prefix = await first.wait('prefix');
      const jobId = String(prefix.jobId);
      expect(prefix.bytes).toBe(32);
      expect(await readFile(String(prefix.partPath))).toEqual(
        sample.subarray(0, 32),
      );
      const firstResult = String(prefix.firstResult);
      const firstBytes = await readFile(firstResult);
      first.child.kill('SIGKILL');
      await first.exited;
      // WAL убитого процесса не прошёл checkpoint: проверяем и его байты.
      const crashedState = await stateDatabaseBytes(stateDir);
      // Реальное устаревание: heartbeat старше 30 с и процесс-владелец отсутствует.
      const observer = createApplication({
        stateDir,
        providerOverride: readOnlyProvider,
      });
      try {
        await expect
          .poll(
            async () => {
              const job = await observer.getJob(jobId);
              return job.kind === 'result' ? job.data?.status : job.kind;
            },
            { timeout: 45_000, interval: 500 },
          )
          .not.toBe('running');
      } finally {
        await observer.shutdown();
      }
      second = owner(root, stateDir, false, [
        'resume',
        jobId,
        '--json',
        '--log-file',
        path.join(root, 'diagnostics.jsonl'),
      ]);
      const done = await second.wait('done');
      await second.exited;
      expect(done.code).toBe(0);
      expect(done.networkRequests).toBe(0);
      expect(
        second.messages.filter(
          (message) => message.type === 'open' && message.id === '1',
        ),
      ).toHaveLength(0);
      expect(
        second.messages.some(
          (message) =>
            message.type === 'open' &&
            message.id === '2' &&
            Number(message.offset) === 32,
        ),
      ).toBe(true);
      const reader = createApplication({
        stateDir,
        providerOverride: readOnlyProvider,
      });
      let final;
      try {
        final = await reader.getJob(jobId);
      } finally {
        await reader.shutdown();
      }
      expect(final).toMatchObject({
        kind: 'result',
        data: {
          status: 'completed',
          tracks: [{ status: 'completed' }, { status: 'completed' }],
        },
      });
      if (final.kind !== 'result' || final.data === null)
        throw new Error('Итоговое состояние job не прочитано.');
      expect(await readFile(firstResult)).toEqual(firstBytes);
      for (const entry of final.data.tracks) {
        expect(audioPayload(await readFile(entry.resultPath!))).toEqual(
          audioPayload(sample),
        );
      }
      expect(await partFiles(path.join(root, 'music'))).toEqual([]);
      const finalState = await stateDatabaseBytes(stateDir);
      const logFile = await readFile(
        path.join(root, 'diagnostics.jsonl'),
        'utf8',
      );
      expect(logFile.trim().length).toBeGreaterThan(0);
      for (const processOwner of [first, second]) {
        expect(
          processOwner.messages.some(
            (message) => message.type === 'fault-reached',
          ),
        ).toBe(true);
        const records: unknown[] = processOwner
          .stdout()
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line) as unknown);
        expect(
          records.every(
            (record) => isJobEvent(record) || isCommandResult(record),
          ),
        ).toBe(true);
        expect(records.some(isJobEvent)).toBe(true);
      }
      for (const surface of [
        first.stdout(),
        first.stderr(),
        second.stdout(),
        second.stderr(),
        logFile,
        ...crashedState,
        ...finalState,
      ]) {
        expect(surface).not.toContain(token);
        expect(surface).not.toContain(signedUrl);
      }
    } finally {
      for (const processOwner of [first, second]) {
        if (processOwner === undefined) continue;
        if (
          processOwner.child.exitCode === null &&
          processOwner.child.signalCode === null
        )
          processOwner.child.kill('SIGKILL');
        await processOwner.exited;
      }
      await rm(root, { recursive: true, force: true });
    }
  }, 120_000);
});
