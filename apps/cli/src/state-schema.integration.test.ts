import { mkdtemp, open, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApplication } from '@music-downloader/application';
import {
  isCommandResult,
  type MusicProvider,
} from '@music-downloader/application/contracts';
import { runCli } from './runner.js';

/** Команды jobs не обращаются к provider. */
const provider = {} as MusicProvider;

/** Поднимает user_version в заголовке SQLite (смещение 60, big-endian). */
async function bumpUserVersion(file: string, version: number): Promise<void> {
  const handle = await open(file, 'r+');
  try {
    const header = Buffer.alloc(4);
    header.writeUInt32BE(version);
    await handle.write(header, 0, 4, 60);
  } finally {
    await handle.close();
  }
}

describe('база состояния более новой версии', () => {
  let root: string | undefined;
  afterEach(async () => {
    if (root !== undefined) await rm(root, { recursive: true, force: true });
    root = undefined;
  });

  it('CLI сообщает несовместимость в обычном и --json выводе без изменения базы', async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'cli-state-schema-'));
    const stateDir = path.join(root, 'state');
    const seed = createApplication({ stateDir, providerOverride: provider });
    await seed.listJobs();
    await seed.shutdown();
    const file = path.join(stateDir, 'state.sqlite3');
    await bumpUserVersion(file, 99);
    const before = await readFile(file);
    const run = async (argv: string[]) => {
      const stdout: string[] = [];
      const stderr: string[] = [];
      const code = await runCli({
        argv,
        env: {},
        homedir: () => root!,
        stdout: (line) => stdout.push(line),
        stderr: (line) => stderr.push(line),
        signals: { on: () => undefined, off: () => undefined },
        createApplication: (adapters) =>
          createApplication({
            ...adapters,
            stateDir,
            providerOverride: provider,
          }),
      });
      return { code, stdout, stderr };
    };

    const plain = await run(['jobs']);
    expect(plain.code).toBe(3);
    expect(plain.stderr.join('\n')).toContain(
      'База состояния создана более новой версией приложения; обновите music-downloader.',
    );
    expect(plain.stderr.join('\n')).not.toContain(root);

    const json = await run(['jobs', '--json']);
    expect(json.code).toBe(3);
    expect(json.stdout).toHaveLength(1);
    const record: unknown = JSON.parse(json.stdout[0]!);
    expect(isCommandResult(record)).toBe(true);
    expect(record).toMatchObject({
      kind: 'error',
      error: {
        code: 'VALIDATION_ERROR',
        details: { reason: 'STATE_SCHEMA_UNSUPPORTED' },
      },
    });
    expect(json.stdout[0]).not.toContain(root);
    expect(await readFile(file)).toEqual(before);
  });
});
