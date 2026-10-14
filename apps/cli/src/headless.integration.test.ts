import { fork, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  isJobEvent,
  isCommandResult,
  type JobManifestV1,
} from '@music-downloader/application/contracts';

const fixture = fileURLToPath(
  new URL('./fixtures/headless-owner.mjs', import.meta.url),
);
const repository = path.resolve(path.dirname(fixture), '../../../..');
const token = 'step-026-token-marker';
const signedUrl =
  'https://cdn.example.test/audio?signature=step-026-signature-marker';
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
      STEP_026_ROOT: root,
      STEP_026_STATE_DIR: stateDir,
      ...(crash ? { STEP_026_CRASH: '1' } : {}),
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

async function expireDeadLease(stateDir: string, jobId: string) {
  const directory = createHash('sha256').update(jobId).digest('hex');
  const target = path.join(stateDir, directory, 'lease.json');
  const lease = JSON.parse(await readFile(target, 'utf8'));
  await writeFile(
    target,
    JSON.stringify({ ...lease, heartbeatAt: '2000-01-01T00:00:00.000Z' }),
  );
}

describe('STEP-026: CLI crash resume', () => {
  it('CLI crash resume запускает новый process с реальным FileManifestStore', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'step-026-cli-'));
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
      const manifests = first.messages
        .filter((message) => message.type === 'manifest')
        .map((message) => JSON.parse(String(message.text)) as JobManifestV1);
      const jobId = manifests.at(-1)!.jobId;
      expect(prefix.bytes).toBe(32);
      expect(manifests.at(-1)!.tracks[0]!.status).toBe('completed');
      expect(await readFile(String(prefix.partPath))).toEqual(
        sample.subarray(0, 32),
      );
      const firstResult = manifests.at(-1)!.tracks[0]!.resultPath!;
      const firstBytes = await readFile(firstResult);
      first.child.kill('SIGKILL');
      await first.exited;
      await expireDeadLease(stateDir, jobId);
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
      expect(
        [...first.messages, ...second.messages].filter(
          (message) => message.type === 'manifest',
        ),
      ).not.toHaveLength(0);
      const allSnapshots = [...first.messages, ...second.messages]
        .filter((message) => message.type === 'manifest')
        .map((message) => String(message.text));
      const final = JSON.parse(allSnapshots.at(-1)!) as JobManifestV1;
      expect(final.tracks.map((entry) => entry.status)).toEqual([
        'completed',
        'completed',
      ]);
      expect(await readFile(firstResult)).toEqual(firstBytes);
      for (const entry of final.tracks) {
        expect(audioPayload(await readFile(entry.resultPath!))).toEqual(
          audioPayload(sample),
        );
        await expect(readFile(entry.partPath!)).rejects.toMatchObject({
          code: 'ENOENT',
        });
      }
      const directory = createHash('sha256').update(jobId).digest('hex');
      const finalText = await readFile(
        path.join(stateDir, directory, 'manifest.json'),
        'utf8',
      );
      expect(JSON.parse(finalText)).toEqual(final);
      expect(
        JSON.parse(
          await readFile(path.join(stateDir, directory, 'lease.json'), 'utf8'),
        ).releasedAt,
      ).toEqual(expect.any(String));
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
        expect(
          processOwner.messages.filter((message) => message.type === 'manifest')
            .length,
        ).toBeGreaterThan(1);
      }
      for (const surface of [
        first.stdout(),
        first.stderr(),
        second.stdout(),
        second.stderr(),
        logFile,
        finalText,
        ...allSnapshots,
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
  }, 40_000);
});
