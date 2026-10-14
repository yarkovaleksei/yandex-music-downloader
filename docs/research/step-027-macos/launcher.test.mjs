import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(directory, '../../..');
const cache = path.join(repository, '.cache/checks');
const sums = {
  arm64: 'bed7eea5325e1108f32ce5228ddd6a5f0f08a499ee42aa7442aea583702f6057',
  x64: '1462cb3b3046b815cf8ea436d3da450ec1a9f11dac7e5a46b0ada5305d7e8097',
};

async function executable(file, text) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, '#!/bin/bash\n' + text, { mode: 0o755 });
}

/** PATH-адаптеры моделируют macOS-команды; Darwin runtime на Linux не исполняется.
 * Исходный launcher не меняется: проверяются выбор архива, argv, cwd, окружение и ошибки. */
async function fixture(options = {}) {
  await fs.mkdir(cache, { recursive: true });
  const base = await fs.mkdtemp(path.join(cache, 'mac-launcher-'));
  const root = path.join(base, 'Проверка музыки с пробелами');
  const mocks = path.join(base, 'mock-bin');
  await fs.mkdir(path.join(root, 'runtimes'), { recursive: true });
  await fs.copyFile(
    path.join(directory, 'START_MACOS.command'),
    path.join(root, 'START_MACOS.command'),
  );
  for (const arch of Object.keys(sums)) {
    await fs.writeFile(
      path.join(root, `runtimes/node-v24.21.0-darwin-${arch}.tar.gz`),
      'fixture',
    );
  }
  await executable(
    path.join(mocks, 'uname'),
    `if [ "$1" = -s ]; then printf '%s\\n' "$MOCK_OS"; else printf '%s\\n' "$MOCK_ARCH"; fi\n`,
  );
  await executable(
    path.join(mocks, 'sw_vers'),
    `printf '%s\\n' "$MOCK_VERSION"\n`,
  );
  // BSD dirname не должен получать GNU-only параметры; копируется production launcher.
  await executable(
    path.join(mocks, 'dirname'),
    '[ "$#" -eq 1 ] || exit 10\nexec /usr/bin/dirname "$1"\n',
  );
  await executable(
    path.join(mocks, 'shasum'),
    `if [ "$MOCK_SUM" = bad ]; then echo 'bad  fixture'; elif [[ "$3" = *arm64* ]]; then echo '${sums.arm64}  fixture'; else echo '${sums.x64}  fixture'; fi\n`,
  );
  const fakeNode = `if [ "$1" = --version ]; then
  if [ "$MOCK_NODE_FAIL" = yes ]; then echo 'synthetic-secret' >&2; exit 5; fi
  printf '%s\\n' "$MOCK_NODE_VERSION"; exit 0
fi
printf '%s\\n' "$PWD" "$PATH" "$TMPDIR" "$TMP" "$TEMP" "$1" "$2" > "$MOCK_MARKER"
exit "$MOCK_RUN_CODE"
`;
  const fakeCorepack = `if [ "$MOCK_COREPACK_FAIL" = yes ]; then echo 'synthetic-secret' >&2; exit 6; fi\necho 0.36.0\n`;
  const templates = path.join(base, 'templates');
  await executable(path.join(templates, 'node'), fakeNode);
  await executable(path.join(templates, 'corepack'), fakeCorepack);
  await executable(
    path.join(mocks, 'tar'),
    `
[ "$MOCK_TAR_FAIL" != yes ] || exit 9
[ "$1" = -xzf ] && [ "$3" = -C ] || exit 8
prefix="$(basename "$2" .tar.gz)"
mkdir -p "$4/$prefix/bin" "$4/$prefix/lib/node_modules/corepack/dist"
cp "$MOCK_TEMPLATES/node" "$4/$prefix/bin/node"
if [ "$MOCK_COREPACK_MISSING" != yes ]; then
  cp "$MOCK_TEMPLATES/corepack" "$4/$prefix/lib/node_modules/corepack/dist/corepack.js"
  ln -s ../lib/node_modules/corepack/dist/corepack.js "$4/$prefix/bin/corepack"
fi
`,
  );
  const env = {
    ...process.env,
    PATH: mocks + path.delimiter + process.env.PATH,
    MOCK_OS: 'Darwin',
    MOCK_ARCH: 'arm64',
    MOCK_VERSION: '15.7.7',
    MOCK_NODE_VERSION: 'v24.21.0',
    MOCK_NODE_FAIL: 'no',
    MOCK_SUM: 'good',
    MOCK_TAR_FAIL: 'no',
    MOCK_COREPACK_FAIL: 'no',
    MOCK_COREPACK_MISSING: 'no',
    MOCK_RUN_CODE: '0',
    MOCK_MARKER: path.join(base, 'marker'),
    MOCK_TEMPLATES: templates,
    ...options,
  };
  const result = spawnSync(
    'bash',
    [path.join(root, 'START_MACOS.command'), '--no-prepare'],
    {
      cwd: os.tmpdir(),
      env,
      encoding: 'utf8',
      timeout: 10000,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let report;
  try {
    report = JSON.parse(
      await fs.readFile(path.join(root, 'START_REPORT.json'), 'utf8'),
    );
  } catch {
    report = undefined;
  }
  return { base, root, result, report, marker: env.MOCK_MARKER };
}

for (const [machine, arch] of [
  ['arm64', 'arm64'],
  ['x86_64', 'x64'],
]) {
  test(`launcher выбирает ${arch}, сохраняет cwd/PATH/TMP и argv без глобального Node`, async () => {
    const f = await fixture({ MOCK_ARCH: machine });
    try {
      assert.equal(f.result.status, 0, f.result.stderr);
      assert.equal(f.report.architecture, arch);
      const lines = (await fs.readFile(f.marker, 'utf8')).trimEnd().split('\n');
      assert.equal(lines[0], f.root);
      assert.match(
        lines[1],
        new RegExp(
          `^${f.root}/.cache/runtime/node\\.[^/]+/node-v24\\.21\\.0-darwin-${arch}/bin:`,
        ),
      );
      for (const value of lines.slice(2, 5))
        assert.equal(value, path.join(f.root, '.cache/checks'));
      assert.equal(
        lines[5],
        path.join(f.root, 'docs/research/step-027-acceptance/run.mjs'),
      );
      assert.equal(lines[6], '--no-prepare');
    } finally {
      await fs.rm(f.base, { recursive: true, force: true });
    }
  });
}

for (const [options, code] of [
  [{ MOCK_OS: 'Linux' }, 'MACOS_REQUIRED'],
  [{ MOCK_ARCH: 'ppc64' }, 'ARCHITECTURE_UNSUPPORTED'],
  [{ MOCK_VERSION: '13.4.1' }, 'MACOS_13_5_REQUIRED'],
  [{ MOCK_VERSION: 'unknown' }, 'MACOS_VERSION_UNAVAILABLE'],
  [{ MOCK_SUM: 'bad' }, 'NODE_CHECKSUM_MISMATCH'],
  [{ MOCK_TAR_FAIL: 'yes' }, 'NODE_EXTRACT_FAILED'],
  [{ MOCK_NODE_FAIL: 'yes' }, 'NODE_RUNTIME_FAILED'],
  [{ MOCK_NODE_VERSION: 'v22.13.0' }, 'NODE_VERSION_MISMATCH'],
  [{ MOCK_COREPACK_MISSING: 'yes' }, 'COREPACK_MISSING'],
  [{ MOCK_COREPACK_FAIL: 'yes' }, 'COREPACK_RUNTIME_FAILED'],
]) {
  test(`launcher сохраняет безопасный ${code} до запуска runner`, async () => {
    const f = await fixture(options);
    try {
      assert.equal(f.result.status, 1);
      assert.equal(f.report.code, code);
      await assert.rejects(fs.access(f.marker));
      assert.equal(
        (f.result.stdout + f.result.stderr + JSON.stringify(f.report)).includes(
          'synthetic-secret',
        ),
        false,
      );
    } finally {
      await fs.rm(f.base, { recursive: true, force: true });
    }
  });
}

test('launcher передаёт отказ runner и сохраняет START_REPORT', async () => {
  const f = await fixture({ MOCK_RUN_CODE: '3' });
  try {
    assert.equal(f.result.status, 3);
    assert.equal(f.report.code, 'RUNNER_EXITED');
    assert.equal(f.report.exitCode, 3);
  } finally {
    await fs.rm(f.base, { recursive: true, force: true });
  }
});
