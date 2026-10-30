import path from 'node:path';
import { readFile, mkdir, rm, writeFile, cp } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { root, output, json, save, sha } from '../packaging/lib.mjs';

/**  Извлечённый настоящий AppImage запускается в чистой ОС без dev runtime. */
const manifest = await json(path.join(output, 'manifest.json'));
const checkOnly = process.argv.includes('--check');
const verification = await json(path.join(output, 'verification.json'));
assert.equal(verification.status, 'PASS');
const target = verification.targets['linux-x64'];
const artifact = path.join(output, manifest.targets['linux-x64'].artifact);
assert.equal(sha(await readFile(artifact)), target.artifactSha256);
const report = path.join(output, 'clean-linux');
await rm(report, { recursive: true, force: true });
await mkdir(report, { recursive: true });
const invoke = (args, timeout = 300_000, logFile) => {
  const result = spawnSync(
    'docker',
    [
      '--config',
      path.join(root, '.cache/desktop-packaging/docker-config'),
      ...args,
    ],
    {
      cwd: root,
      encoding: 'utf8',
      timeout,
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  if (logFile)
    writeFileSync(logFile, (result.stdout ?? '') + (result.stderr ?? ''));
  if (result.error || result.status !== 0)
    throw result.error ?? new Error(result.stderr + result.stdout);
  return result.stdout;
};
const image = 'yandex-downloader-package-smoke';
const buildLog = invoke([
  'build',
  '--file',
  'apps/desktop/packaging/Dockerfile.smoke',
  '--tag',
  image,
  'apps/desktop/packaging',
]);
await writeFile(path.join(report, 'image-build.log'), buildLog);
const imageId = invoke([
  'image',
  'inspect',
  '--format',
  '{{.Id}}',
  image,
]).trim();
const container = `ymd-package-smoke-${process.pid}`;
let log;
try {
  log = invoke(
    [
      'run',
      '--rm',
      '--init',
      '--name',
      container,
      '--network',
      'none',
      '--mount',
      `type=bind,source=${path.join(output, target.extracted)},target=/app,readonly`,
      '--mount',
      `type=bind,source=${report},target=/report`,
      image,
    ],
    90_000,
    path.join(report, 'console.log'),
  );
} finally {
  // Удаляем только собственный одноразовый контейнер, включая случай таймаута.
  spawnSync('docker', ['rm', '-f', container], { stdio: 'ignore' });
}
assert(log.includes('NODE_ABSENT') && log.includes('FFMPEG_ABSENT'));
const window = await json(path.join(report, 'window/window-report.json'));
assert.equal(window.status, 'PASS');
assert.equal(window.uiReady, true);
for (const name of [
  'requireAbsent',
  'processAbsent',
  'ipcRendererAbsent',
  'apiPresent',
])
  assert.equal(window.isolation[name], true, name);
assert.equal(window.platform, 'linux');
assert.equal(window.arch, 'x64');
const database = await readFile(
  path.join(report, 'state/music-downloader/state.sqlite3'),
);
assert.equal(database.subarray(0, 16).toString(), 'SQLite format 3\0');
const screenshot = await readFile(path.join(report, 'window/window.png'));
assert.equal(screenshot.subarray(1, 4).toString(), 'PNG');
const result = {
  status: 'PASS',
  version: manifest.version,
  artifactSha256: target.artifactSha256,
  imageId,
  baseImage:
    'ubuntu:24.04@sha256:fe81560990fae86dc4743202b2cb4d3df98d0bcf949173cecef15ce1127ef852',
  installedNode: false,
  installedFfmpeg: false,
  network: 'none',
  window,
  sqliteHeader: true,
  screenshotSha256: sha(screenshot),
  limitations: [
    'Извлечённый AppImage: FUSE/desktop integration не проверялись',
    'Контейнерный запуск с --no-sandbox; shipping fuses и BrowserWindow preferences не изменены',
    'Это не Windows/macOS qualification и не проверка signing/updater',
  ],
};
await save(path.join(report, 'report.json'), result);
// Результаты запусков остаются в игнорируемом кеше, отдельно от исходников.
const evidence = path.join(root, '.cache/checks/package-smoke');
if (!checkOnly) {
  await mkdir(evidence, { recursive: true });
  await cp(
    path.join(report, 'window/window.png'),
    path.join(evidence, 'linux-window.png'),
  );
  await save(path.join(evidence, 'linux-smoke.json'), result);
}
console.log(JSON.stringify(result, null, 2));
