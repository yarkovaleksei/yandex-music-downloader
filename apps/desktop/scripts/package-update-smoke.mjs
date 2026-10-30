import path from 'node:path';
import { readFile, mkdir, rm, chmod, cp } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { generateKeyPairSync, sign } from 'node:crypto';
import assert from 'node:assert/strict';
import { root, output, json, save, sha } from '../packaging/lib.mjs';
import { fixtureServer } from '../packaging/update-fixture.mjs';
import { PortableUpdates } from '../dist/main/update/service.js';

/**  Реальные приложения двух версий, production download и общий SQLite state. */
const checkOnly = process.argv.includes('--check');
const nextRoot = path.join(root, '.cache/desktop-packaging/local-0.0.1');
const before = await json(path.join(output, 'manifest.json'));
const next = await json(path.join(nextRoot, 'manifest.json'));
assert.equal(before.version, '0.0.0');
assert.equal(next.version, '0.0.1');
for (const manifest of [before, next]) {
  assert.equal(manifest.local, true);
  assert.equal(manifest.tag, null);
  for (const [file, hash] of Object.entries(manifest.inputs))
    assert.equal(
      sha(await readFile(path.join(root, file))),
      hash,
      `Устаревший ${file}`,
    );
}
const run = (command, args, timeout = 300_000) => {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    timeout,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error || result.status !== 0)
    throw result.error ?? new Error(result.stderr + result.stdout);
  return result.stdout + result.stderr;
};
run('node', [
  'apps/desktop/scripts/verify-package.mjs',
  nextRoot,
  '--linux-only',
]);
const verified = await json(path.join(output, 'verification.json'));
assert.equal(verified.status, 'PASS');
const reportRoot = path.join(root, '.cache/desktop-packaging/update-smoke');
await rm(reportRoot, { recursive: true, force: true });
await mkdir(reportRoot, { recursive: true });
const nextArtifact = path.join(nextRoot, next.targets['linux-x64'].artifact);
const payload = await readFile(nextArtifact);
assert.equal(sha(payload), next.targets['linux-x64'].sha256);
let descriptorBytes, signature;
const server = await fixtureServer(reportRoot, (request, response) =>
  response.end(
    request.url.endsWith('.sig')
      ? signature
      : request.url === '/payload'
        ? payload
        : descriptorBytes,
  ),
);
let downloaded;
try {
  const pair = generateKeyPairSync('ed25519');
  const descriptor = {
    schemaVersion: 1,
    version: next.version,
    channel: 'stable',
    target: 'linux-x64',
    url: server.origin + '/payload',
    size: payload.length,
    sha256: sha(payload),
  };
  descriptorBytes = Buffer.from(JSON.stringify(descriptor));
  signature = sign(null, descriptorBytes, pair.privateKey);
  const updates = new PortableUpdates({
    trust: {
      feedBaseUrl: server.origin,
      origins: [server.origin],
      publicKey: pair.publicKey
        .export({ type: 'spki', format: 'pem' })
        .toString(),
      channel: 'stable',
    },
    currentVersion: before.version,
    target: 'linux-x64',
    directory: path.join(reportRoot, 'download'),
    fetch: server.fetch,
    reveal: (file) => {
      downloaded = file;
    },
  });
  assert.equal((await updates.check()).status, 'available');
  assert.equal((await updates.download()).status, 'ready');
  assert.equal((await updates.reveal()).status, 'ready');
} finally {
  await server.close();
}
assert(downloaded);
assert.equal(sha(await readFile(downloaded)), sha(payload));
await chmod(downloaded, 0o700);
const offset = run(downloaded, ['--appimage-offset']).trim();
assert.match(offset, /^\d+$/);
const replacement = path.join(reportRoot, 'replacement');
run('unsquashfs', ['-quiet', '-d', replacement, '-o', offset, downloaded]);
const docker = (args) =>
  run('docker', [
    '--config',
    path.join(root, '.cache/desktop-packaging/docker-config'),
    ...args,
  ]);
const image = 'ymd-portable-update-smoke';
docker([
  'build',
  '--file',
  'apps/desktop/packaging/Dockerfile.smoke',
  '--tag',
  image,
  'apps/desktop/packaging',
]);
const imageId = docker([
  'image',
  'inspect',
  '--format',
  '{{.Id}}',
  image,
]).trim();
const windows = [];
for (const [name, application, seed, expectedVersion] of [
  [
    'n',
    path.join(output, verified.targets['linux-x64'].extracted),
    true,
    before.version,
  ],
  ['n-plus-1', replacement, false, next.version],
]) {
  const container = `ymd-portable-update-${process.pid}-${name}`;
  let log;
  try {
    log = docker([
      'run',
      '--rm',
      '--init',
      '--name',
      container,
      '--network',
      'none',
      '--env',
      `MUSIC_DOWNLOADER_SMOKE_DIR=/report/${name}`,
      '--env',
      `MUSIC_DOWNLOADER_SMOKE_SEED_SETTINGS=${seed ? '1' : '0'}`,
      '--mount',
      `type=bind,source=${application},target=/app,readonly`,
      '--mount',
      `type=bind,source=${reportRoot},target=/report`,
      image,
    ]);
  } finally {
    spawnSync('docker', ['rm', '-f', container], { stdio: 'ignore' });
  }
  assert(log.includes('NODE_ABSENT') && log.includes('FFMPEG_ABSENT'));
  const window = await json(path.join(reportRoot, name, 'window-report.json'));
  assert.equal(window.status, 'PASS');
  assert.equal(window.uiReady, true);
  assert.equal(window.appVersion, expectedVersion);
  for (const value of Object.values(window.isolation))
    assert.equal(value, true);
  assert.deepEqual(window.settings, {
    quality: 'normal',
    logging: 'debug',
    concurrency: 3,
  });
  windows.push(window);
}
const database = await readFile(
  path.join(reportRoot, 'state/music-downloader/state.sqlite3'),
);
assert.equal(database.subarray(0, 16).toString(), 'SQLite format 3\0');
const result = {
  status: 'PASS',
  from: before.version,
  to: next.version,
  artifactBeforeSha256: before.targets['linux-x64'].sha256,
  artifactAfterSha256: sha(payload),
  descriptorSha256: sha(descriptorBytes),
  signatureVerified: true,
  productionDownloadVerified: true,
  imageId,
  installedNode: false,
  installedFfmpeg: false,
  runtimeNetwork: 'none',
  statePreserved: true,
  windows,
  limitations: [
    'Временный тестовый Ed25519 ключ и отдельный HTTPS fixture CA; production trust/feed не настроены',
    'Ручная замена: между двумя запусками /app заменён извлечённым скачанным AppImage, общий stateDir сохранён',
    'Контейнерный --no-sandbox, без FUSE/desktop integration, без авторизации и native Windows/macOS',
  ],
};
await save(path.join(reportRoot, 'report.json'), result);
if (!checkOnly) {
  // Повторный запуск не восстанавливает удалённый архив отчётов в исходниках.
  const evidence = path.join(root, '.cache/checks/package-update-smoke');
  await mkdir(evidence, { recursive: true });
  await save(path.join(evidence, 'linux-update.json'), result);
  for (const name of ['n', 'n-plus-1'])
    await cp(
      path.join(reportRoot, name, 'window.png'),
      path.join(evidence, `${name}.png`),
    );
}
console.log(JSON.stringify(result, null, 2));
