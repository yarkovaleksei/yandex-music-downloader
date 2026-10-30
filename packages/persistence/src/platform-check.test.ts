import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { beforeAll, describe, expect, it } from 'vitest';

const kitDirectory = fileURLToPath(
  new URL('../platform-check/', import.meta.url),
);
const repository = path.resolve(kitDirectory, '../../..');

beforeAll(() => {
  const result = spawnSync(
    process.execPath,
    ['packages/testing/scripts/run-yarn.mjs', 'build'],
    { cwd: repository, encoding: 'utf8' },
  );
  if (result.status !== 0)
    throw new Error(result.stderr || 'Не удалось собрать dist для check.mjs.');
}, 60_000);

describe('самодостаточный набор платформенной проверки', () => {
  it('check.mjs проходит текущим Node.js и пишет отчёт только из разрешённых полей', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'platform-check-'));
    try {
      const result = spawnSync(
        process.execPath,
        [path.join(kitDirectory, 'check.mjs'), '--report-dir', directory],
        { encoding: 'utf8', timeout: 120_000 },
      );
      expect(result.status, result.stdout + result.stderr).toBe(0);
      const name = `report-${process.platform}-${process.arch}.json`;
      const text = await readFile(path.join(directory, name), 'utf8');
      const report = JSON.parse(text) as Record<string, unknown>;
      expect(report).toMatchObject({
        schema: 1,
        status: 'PASS',
        platform: process.platform,
        arch: process.arch,
        proc_translated: false,
        binding: `prebuilds/${process.platform}-${process.arch}`,
        versions: { node: process.versions.node, betterSqlite3: '13.0.3' },
        kitManifest: null,
      });
      expect(Object.keys(report).sort()).toEqual(
        [
          'arch',
          'binding',
          'checks',
          'kitManifest',
          'platform',
          'proc_translated',
          'schema',
          'status',
          'versions',
        ].sort(),
      );
      for (const forbidden of [
        os.hostname(),
        os.userInfo().username,
        directory,
        repository,
      ])
        expect(text).not.toContain(forbidden);
      // Отчёт кладётся в репозиторий побайтно: Prettier не должен его менять.
      const options = await resolveConfig(path.join(kitDirectory, name));
      expect(await format(text, { ...options, parser: 'json' })).toBe(text);
      expect(text.includes('\r')).toBe(false);
      expect(result.stdout).toContain(
        createHash('sha256').update(text).digest('hex'),
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 180_000);

  it.skipIf(process.platform === 'win32')(
    'launcher macOS синтаксически корректен и сверяет SHA-256 runtime',
    async () => {
      const launcher = path.join(kitDirectory, 'run-macos.command');
      expect(spawnSync('bash', ['-n', launcher]).status).toBe(0);
      const kit = await mkdtemp(path.join(os.tmpdir(), 'platform-launcher-'));
      try {
        const runtime = path.join(kit, 'runtime/darwin-arm64/bin/node');
        await mkdir(path.dirname(runtime), { recursive: true });
        await writeFile(runtime, 'runtime-fixture');
        await copyFile(launcher, path.join(kit, 'run-macos.command'));
        const digest = createHash('sha256')
          .update('runtime-fixture')
          .digest('hex');
        const run = () =>
          spawnSync('bash', [path.join(kit, 'run-macos.command')], {
            env: {
              ...process.env,
              PLATFORM_CHECK_VERIFY_ONLY: '1',
              PLATFORM_CHECK_NO_PAUSE: '1',
            },
            encoding: 'utf8',
          });
        await writeFile(
          path.join(kit, 'runtime/SHA256SUMS'),
          `${digest}  runtime/darwin-arm64/bin/node\n`,
        );
        expect(run().status).toBe(0);
        await writeFile(
          path.join(kit, 'runtime/SHA256SUMS'),
          `${'0'.repeat(64)}  runtime/darwin-arm64/bin/node\n`,
        );
        const mismatch = run();
        expect(mismatch.status).toBe(1);
        expect(mismatch.stdout).toContain('не совпадает');
      } finally {
        await rm(kit, { recursive: true, force: true });
      }
    },
  );
});
