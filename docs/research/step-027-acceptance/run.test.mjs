import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {
  createPreparationDiagnostics,
  probeEndpoint,
} from './install-diagnostics.mjs';
import {
  capture,
  digestFiles,
  privacyCheck,
  retryableDoctor,
  resolveSources,
  safeEvent,
  startNode,
  processCheck,
  root,
  defaultReportBase,
} from './run.mjs';
import { applyUpdate } from './apply-update.mjs';

async function scratch(prefix) {
  const directory = path.join(root, '.cache', 'checks');
  await fs.mkdir(directory, { recursive: true });
  return fs.mkdtemp(path.join(directory, prefix));
}

async function updateFixture({
  digest = true,
  sourceFiles = ['fixture.txt'],
} = {}) {
  const baseRoot = await scratch('acceptance-update-root-');
  const baseDirectory = path.join(
    baseRoot,
    'docs/research/step-027-acceptance',
  );
  await fs.mkdir(baseDirectory, { recursive: true });
  await fs.writeFile(path.join(baseRoot, 'fixture.txt'), 'fixture');
  const hash = crypto.createHash('sha256');
  hash.update('fixture.txt\0');
  hash.update(crypto.createHash('sha256').update('fixture').digest());
  const expectedSourceDigest = `sha256:${hash.digest('hex')}`;
  const config = {
    gitHead: 'old',
    expectedSourceDigest: 'sha256:old',
    sourceFiles,
    sources: { track: 'https://music.yandex.ru/album/1/track/2' },
    extra: 'keep',
  };
  const subject = {
    gitHead: 'new',
    expectedSourceDigest: digest
      ? expectedSourceDigest
      : 'sha256:' + '0'.repeat(64),
    sourceFiles,
  };
  await fs.writeFile(
    path.join(baseDirectory, 'config.json'),
    JSON.stringify(config),
  );
  await fs.writeFile(
    path.join(baseDirectory, 'subject.json'),
    JSON.stringify(subject),
  );
  return { baseRoot, baseDirectory, config };
}

test('runner по умолчанию создаёт отчёт в текущей папке', () => {
  assert.equal(defaultReportBase(), process.cwd());
});

test('apply-update сохраняет sources и посторонние ключи после проверки subject', async () => {
  const fixture = await updateFixture();
  try {
    await assert.doesNotReject(() => applyUpdate(fixture));
    const updated = JSON.parse(
      await fs.readFile(
        path.join(fixture.baseDirectory, 'config.json'),
        'utf8',
      ),
    );
    assert.equal(updated.gitHead, 'new');
    assert.deepEqual(updated.sources, fixture.config.sources);
    assert.equal(updated.extra, 'keep');
  } finally {
    await fs.rm(fixture.baseRoot, { recursive: true, force: true });
  }
});

test('apply-update отказывает до записи при несовпадении digest или недопустимом пути', async () => {
  for (const options of [{ digest: false }, { sourceFiles: ['../secret'] }]) {
    const fixture = await updateFixture(options);
    try {
      const before = await fs.readFile(
        path.join(fixture.baseDirectory, 'config.json'),
        'utf8',
      );
      await assert.rejects(() => applyUpdate(fixture), {
        code:
          options.digest === false
            ? 'UPDATE_SOURCE_MISMATCH'
            : 'UPDATE_METADATA_INVALID',
      });
      assert.equal(
        await fs.readFile(
          path.join(fixture.baseDirectory, 'config.json'),
          'utf8',
        ),
        before,
      );
    } finally {
      await fs.rm(fixture.baseRoot, { recursive: true, force: true });
    }
  }
});

test('диагностика установки сохраняет коды через границы chunks, но не raw ошибки/секреты', () => {
  const diagnostics = createPreparationDiagnostics();
  diagnostics.write(Buffer.from('YN00'), 'stdout');
  diagnostics.write(
    Buffer.from(
      '01 RequestError ENOTFOUND https://private.test/?token=synthetic-secret\n',
    ),
    'stdout',
  );
  diagnostics.write(
    Buffer.from(
      'Authorization: Bearer synthetic-secret; Cannot find matching keyid\n',
    ),
    'stderr',
  );
  const result = diagnostics.finish();
  assert.deepEqual(result.observedCodes, ['ENOTFOUND', 'YN0001']);
  assert.deepEqual(result.observedMarkers, [
    'COREPACK_SIGNATURE_KEY_MISMATCH',
    'REQUEST_FAILED',
  ]);
  assert.equal(JSON.stringify(result).includes('synthetic-secret'), false);
  assert.equal(JSON.stringify(result).includes('private.test'), false);
});

test('версия Corepack распознаётся только как отдельная semver строка', () => {
  const diagnostics = createPreparationDiagnostics({ captureVersion: true });
  diagnostics.write(Buffer.from('0.34.'), 'stdout');
  diagnostics.write(Buffer.from('6\n'), 'stdout');
  assert.equal(diagnostics.finish().version, '0.34.6');
  const invalid = createPreparationDiagnostics({ captureVersion: true });
  invalid.write(
    Buffer.from('https://private.test/0.34.6?token=secret\n'),
    'stdout',
  );
  assert.equal(invalid.finish().version, undefined);
});

test('неуспешный реальный processCheck сохраняет диагностику без исходного stdout/stderr', async () => {
  const result = await processCheck(
    [
      '-e',
      "process.stdout.write('YN0028 ENOSPC private-token');process.stderr.write('Authorization: Bearer private-token');process.exit(1)",
    ],
    process.env,
  );
  assert.equal(result.code, 1);
  assert.deepEqual(result.diagnostics.observedCodes, ['ENOSPC', 'YN0028']);
  // argv — наши тестовые аргументы; проверяется именно отсутствие raw captured streams.
  const { args, ...captured } = result;
  assert.ok(args.length);
  assert.equal(JSON.stringify(captured).includes('private-token'), false);
});

test('отсутствующий executable даёт сохраняемый ENOENT вместо потери отчёта', async () => {
  const result = await processCheck([], process.env, {
    command: path.join(
      root,
      '.cache',
      'checks',
      'step027-nonexistent-corepack-executable',
    ),
  });
  assert.equal(result.code, null);
  assert.equal(result.launchErrorCode, 'ENOENT');
});

test('network probe сохраняет только host/status и нормализует timeout, без response body/headers', async () => {
  const server = http.createServer((request, response) => {
    if (request.url === '/timeout') return;
    response.setHeader('Authorization', 'Bearer synthetic-secret');
    response.end('synthetic-secret');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = `http://127.0.0.1:${server.address().port}`;
    const result = await probeEndpoint(address);
    assert.equal(result.reachable, true);
    assert.equal(result.statusCode, 200);
    assert.equal(JSON.stringify(result).includes('synthetic-secret'), false);
    const timeout = await probeEndpoint(address + '/timeout', 40);
    assert.equal(timeout.reachable, false);
    assert.equal(timeout.code, 'PROBE_TIMEOUT');
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('пустой config запрашивает три ссылки проверяющего; готовые ссылки не запрашиваются повторно', async () => {
  const kinds = ['track', 'album', 'playlist'];
  const answers = [
    'https://music.yandex.ru/album/100/track/200',
    'https://music.yandex.ru/album/100',
    'https://music.yandex.ru/playlists/lk.00000000-0000-4000-8000-000000000001',
  ];
  let requested = 0;
  const result = await resolveSources(
    { track: '', album: '', playlist: '' },
    kinds,
    async () => answers[requested++],
  );
  assert.equal(requested, 3);
  assert.deepEqual(Object.values(result), answers);
  assert.deepEqual(
    await resolveSources(result, kinds, async () => {
      throw new Error('UNEXPECTED_PROMPT');
    }),
    result,
  );
  await assert.rejects(
    resolveSources(
      { track: 'https://other.example/music' },
      ['track'],
      async () => '',
    ),
    /INVALID_SOURCE_URL/,
  );
  await assert.rejects(
    resolveSources(
      { track: 'https://music.yandex.ru/album/100?token=private' },
      ['track'],
      async () => '',
    ),
    /INVALID_SOURCE_URL/,
  );
});

for (const host of [
  'music.yandex.ru',
  'music.yandex.by',
  'music.yandex.kz',
  'music.yandex.com',
  'music.yandex.uz',
]) {
  test(`приёмка принимает track/album/playlist и «Мне нравится» на ${host}`, async () => {
    const sources = {
      track: `https://${host}/album/100/track/200?utm_source=share`,
      album: `https://${host}/album/100`,
      playlist: `https://${host}/playlists/00000000-0000-4000-8000-000000000001`,
    };
    const ask = async () => {
      throw new Error('UNEXPECTED_PROMPT');
    };
    assert.deepEqual(
      await resolveSources(sources, Object.keys(sources), ask),
      sources,
    );
    sources.playlist = `https://${host}/playlists/lk.00000000-0000-4000-8000-000000000001`;
    assert.deepEqual(await resolveSources(sources, ['playlist'], ask), {
      playlist: sources.playlist,
    });
  });
}

test('приёмка не принимает подмену домена, credentials и секретные query-параметры', async () => {
  for (const track of [
    'https://music.yandex.com.evil.example/track/200',
    'https://music.yandex.com@evil.example/track/200',
    'https://name:password@music.yandex.com/track/200',
    'https://music.yandex.com/track/200?token=private',
    'http://music.yandex.com/track/200',
  ]) {
    await assert.rejects(
      resolveSources({ track }, ['track'], async () => ''),
      /INVALID_SOURCE_URL/,
    );
  }
});

test('doctor повторяется только при NETWORK_ERROR с пройденной privacy проверкой', () => {
  assert.equal(
    retryableDoctor({
      privacyPassed: true,
      checks: {
        provider: { status: 'failed', code: 'NETWORK_ERROR' },
        account: { status: 'skipped', code: 'DEPENDENCY_FAILED' },
      },
    }),
    true,
  );
  assert.equal(
    retryableDoctor({
      privacyPassed: true,
      checks: { provider: { status: 'failed', code: 'API_CHANGED' } },
    }),
    false,
  );
  assert.equal(
    retryableDoctor({
      privacyPassed: false,
      checks: { provider: { status: 'failed', code: 'NETWORK_ERROR' } },
    }),
    false,
  );
});

test('privacy проверяет исходные значения и signed URL, safeEvent не переносит raw payload/errors', () => {
  assert.equal(
    privacyCheck('hello synthetic-secret', ['synthetic-secret']),
    false,
  );
  assert.equal(privacyCheck('https://cdn.test/audio?sign=private'), false);
  assert.equal(privacyCheck('public job facts'), true);
  const safe = safeEvent({
    event: 'track.failed',
    seq: 'secret',
    jobId: 'secret',
    trackKey: 'secret',
    payload: { bytes: 20, credential: 'secret', details: { url: 'private' } },
  });
  assert.deepEqual(safe.payload, { bytes: 20 });
  assert.equal(safe.seq, undefined);
  assert.equal(safe.jobId, undefined);
  assert.equal(safe.trackKey, undefined);
  assert.deepEqual(
    safeEvent({
      kind: 'error',
      error: {
        code: 'API_CHANGED',
        message: 'secret',
        details: { token: 'private' },
      },
    }),
    { kind: 'error', code: 'API_CHANGED', retryable: false },
  );
});

test('capture выявляет секрет на границе stderr chunks и не сохраняет сырую строку', async () => {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  const promise = capture([], {
    secrets: ['synthetic-secret'],
    launch: () => ({ child, pause() {}, stop() {} }),
  });
  child.stderr.write('synthetic-');
  child.stderr.write('secret');
  child.stdout.write(
    JSON.stringify({
      kind: 'error',
      error: { code: 'DOWNLOAD_ERROR', message: 'synthetic-secret' },
    }) + '\n',
  );
  child.emit('close', 3, null);
  const { record } = await promise;
  assert.equal(record.privacyPassed, false);
  assert.equal(JSON.stringify(record).includes('synthetic-secret'), false);
  assert.equal(record.code, 3);
});

test('capture прерывает коллекцию только после completed и физического progress', async () => {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  let pauses = 0;
  const promise = capture([], {
    pause: true,
    kind: 'playlist',
    launch: () => ({
      child,
      pause() {
        pauses++;
      },
      stop() {},
    }),
  });
  const progress = {
    event: 'track.progress',
    seq: 1,
    trackKey: '2',
    payload: { bytes: 300000 },
  };
  child.stdout.write(JSON.stringify(progress) + '\n');
  assert.equal(pauses, 0);
  child.stdout.write(
    JSON.stringify({
      event: 'job.progress',
      payload: { completed: 1, total: 2 },
    }) + '\n',
  );
  child.stdout.write(JSON.stringify(progress) + '\n');
  child.stdout.write(JSON.stringify(progress) + '\n');
  assert.equal(pauses, 1);
  child.emit('close', 4, null);
  const { record } = await promise;
  assert.equal(record.code, 4);
  assert.equal(record.signalBytes, 300000);
  assert.equal(record.progressByTrack['2'].count, 3);
});

test('source digest зависит от имени и байтов, а не времени файла или порядка списка', async () => {
  const folder = await scratch('acceptance-digest-');
  try {
    await fs.writeFile(path.join(folder, 'a'), 'first');
    await fs.writeFile(path.join(folder, 'b'), 'second');
    const original = await digestFiles(['a', 'b'], folder);
    assert.equal(await digestFiles(['b', 'a'], folder), original);
    await fs.writeFile(path.join(folder, 'b'), 'changed');
    assert.notEqual(await digestFiles(['a', 'b'], folder), original);
  } finally {
    await fs.rm(folder, { recursive: true, force: true });
  }
});

test('быстрый exit 4 после Ctrl+C не теряет подтверждение Windows helper', async () => {
  // Probe сразу завершает Node после SIGINT: это воспроизводит гонку с control-потоком.
  // Повтор на Windows проверяет именно native helper, а не имитацию child.kill.
  for (
    let attempt = 0;
    attempt < (process.platform === 'win32' ? 3 : 1);
    attempt++
  ) {
    const { record } = await capture(
      ['docs/research/step-027-acceptance/signal-probe.mjs'],
      { pause: true, kind: 'track', launch: startNode, timeoutMs: 30000 },
    );
    assert.equal(record.code, 4);
    assert.ok(record.signalAt);
    assert.equal(record.signalBytes, 300000);
    assert.equal(record.timedOut, undefined);
    assert.equal(record.controllerFailure, undefined);
    assert.deepEqual(record.events.at(-1), {
      kind: 'result',
      status: 'paused',
    });
    if (process.platform === 'win32') assert.equal(record.ctrlCSent, true);
  }
});
