import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash, generateKeyPairSync, sign, verify } from 'node:crypto';
import { PortableUpdates, newer } from '../dist/main/update/service.js';
import { initializeKey, signDescriptor } from './release-key.mjs';
import { fixtureServer } from './update-fixture.mjs';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const pair = generateKeyPairSync('ed25519');
const publicKey = pair.publicKey
  .export({ type: 'spki', format: 'pem' })
  .toString();
const payload = Buffer.from('проверочный portable-пакет');
const descriptor = (origin) => ({
  schemaVersion: 1,
  version: '0.0.1',
  channel: 'stable',
  target: 'linux-x64',
  url: origin + '/payload',
  size: payload.length,
  sha256: sha(payload),
});

/** REQ-055: проверяется реальный HTTPS download через production main service и временный отдельный CA. */
test('валидная подпись и HTTPS: пакет готов только после проверки; подмена файла не открывается', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ymd-update-'));
  let bytes, signature;
  const server = await fixtureServer(directory, (request, response) =>
    response.end(
      request.url.endsWith('.sig')
        ? signature
        : request.url === '/payload'
          ? payload
          : bytes,
    ),
  );
  try {
    bytes = Buffer.from(JSON.stringify(descriptor(server.origin)));
    signature = sign(null, bytes, pair.privateKey);
    const revealed = [];
    const updates = new PortableUpdates({
      trust: {
        feedBaseUrl: server.origin,
        publicKey,
        origins: [server.origin],
        channel: 'stable',
      },
      currentVersion: '0.0.0',
      target: 'linux-x64',
      directory: path.join(directory, 'downloads'),
      fetch: server.fetch,
      reveal: (file) => revealed.push(file),
    });
    assert.equal((await updates.check()).status, 'available');
    assert.equal(revealed.length, 0);
    assert.equal((await updates.download()).status, 'ready');
    assert.equal(revealed.length, 0);
    assert.equal((await updates.reveal()).status, 'ready');
    assert.equal(revealed.length, 1);
    assert.deepEqual(await readFile(revealed[0]), payload);
    await writeFile(revealed[0], 'подмена');
    assert.equal((await updates.reveal()).status, 'error');
    assert.equal(revealed.length, 1);
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

for (const scenario of [
  'version',
  'signature',
  'key',
  'target',
  'channel',
  'http',
  'origin',
  'redirect',
  'hash',
  'size',
  'short',
]) {
  test(`REQ-055: отказ без готового файла и запуска — ${scenario}`, async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'ymd-reject-'));
    try {
      const origin = 'https://updates.example';
      const value = descriptor(origin);
      if (scenario === 'version') value.version = '0.0.0';
      if (scenario === 'target') value.target = 'darwin-x64';
      if (scenario === 'channel') value.channel = 'other';
      if (scenario === 'http') value.url = 'http://updates.example/payload';
      if (scenario === 'origin') value.url = 'https://foreign.example/payload';
      if (scenario === 'hash') value.sha256 = '0'.repeat(64);
      if (scenario === 'size') value.size--;
      const bytes = Buffer.from(JSON.stringify(value));
      const signature = sign(null, bytes, pair.privateKey);
      if (scenario === 'signature') signature[0] ^= 1;
      let reveals = 0;
      const requested = [];
      const updates = new PortableUpdates({
        trust: {
          feedBaseUrl: origin,
          publicKey:
            scenario === 'key'
              ? generateKeyPairSync('ed25519')
                  .publicKey.export({ type: 'spki', format: 'pem' })
                  .toString()
              : publicKey,
          origins: [origin],
          channel: 'stable',
        },
        currentVersion: '0.0.0',
        target: 'linux-x64',
        directory,
        reveal: () => reveals++,
        fetch: async (url) => {
          requested.push(url);
          if (scenario === 'redirect')
            return new Response(null, {
              status: 302,
              headers: { location: 'https://foreign.example/latest.json' },
            });
          return new Response(
            url.endsWith('.sig')
              ? signature
              : url.endsWith('/payload')
                ? scenario === 'short'
                  ? payload.subarray(1)
                  : payload
                : bytes,
          );
        },
      });
      const checked = await updates.check();
      if (['hash', 'size', 'short'].includes(scenario)) {
        assert.equal(checked.status, 'available');
        assert.equal((await updates.download()).status, 'error');
      } else {
        assert.equal(
          checked.status,
          scenario === 'version' ? 'current' : 'error',
        );
        assert(
          !requested.some((url) => url.startsWith('https://foreign.example')),
        );
      }
      assert.equal((await updates.reveal()).status, 'error');
      assert.equal(reveals, 0);
      assert.deepEqual(await readdir(directory), []);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}
test('REQ-055: ключ остаётся в OS entry, повторная генерация не меняет доверие, ошибки не дают подпись', () => {
  let secret;
  let writes = 0;
  const entry = {
    getPassword: () => secret,
    setPassword: (value) => {
      secret = value;
      writes++;
    },
  };
  const publicPem = initializeKey(entry);
  assert.equal(initializeKey(entry), publicPem);
  assert.equal(writes, 1);
  const bytes = Buffer.from('descriptor');
  assert(verify(null, bytes, publicPem, signDescriptor(entry, bytes)));
  assert.throws(() => signDescriptor({ getPassword: () => null }, bytes));
  assert.throws(() =>
    initializeKey({
      getPassword: () => {
        throw new Error('store unavailable');
      },
    }),
  );
});
test('REQ-055: без trust/feed нет сети; старые версии не считаются обновлением, SemVer сравнивается корректно', async () => {
  const updates = new PortableUpdates({
    trust: {
      feedBaseUrl: null,
      publicKey: null,
      origins: [],
      channel: 'stable',
    },
    currentVersion: '0.0.0',
    target: 'linux-x64',
    directory: '/unused',
    reveal: () => assert.fail(),
    fetch: () => assert.fail(),
  });
  assert.equal((await updates.check()).status, 'disabled');
  assert.equal(newer('0.0.1', '0.0.0'), true);
  assert.equal(newer('1.0.0', '1.0.0-beta.1'), true);
  assert.equal(newer('1.0.0-beta.10', '1.0.0-beta.2'), true);
  assert.equal(newer('0.0.0', '0.0.1'), false);
  assert.equal(newer('0.0.1', '0.0.1'), false);
  assert.throws(() => newer('../bad', '0.0.0'));
});
