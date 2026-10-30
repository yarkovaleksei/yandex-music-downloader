import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { createMemoryCredentialStore, runProvider } from './runner.mjs';

const canary = 'provider-test-canary';

function validProvider({ failAt } = {}) {
  const calls = [];
  const provider = {
    async getAccount() {
      calls.push('account');
      if (failAt === 'account') throw { code: 'AUTH_ERROR', message: canary };
      return { id: 'account-1' };
    },
    async getTrack(id) {
      calls.push(`track:${id}`);
      if (failAt === 'track') throw { code: 'API_CHANGED', message: canary };
      return { id, availability: 'available', title: 'track', artists: [] };
    },
    async getAlbum(id) {
      calls.push(`album:${id}`);
      return { id, title: 'album', artists: [], tracks: [] };
    },
    async getPlaylist(id) {
      calls.push(`playlist:${id}`);
      return { id, title: 'playlist', tracks: [] };
    },
    async getAudioVariants(id) {
      calls.push(`variants:${id}`);
      return [
        {
          key: canary,
          codec: 'aac',
          container: 'm4a',
          bitrate: 128,
          lossless: false,
        },
      ];
    },
    async logout() {
      calls.push('logout');
    },
  };
  return { provider, calls };
}

test('H-001: отсутствие и пустой token пропускают factory до загрузки provider', async () => {
  let factoryCalls = 0;
  const lines = [];
  const factory = async () => {
    factoryCalls += 1;
    throw new Error('fetch:' + canary);
  };
  assert.equal(
    await runProvider({
      token: undefined,
      factory,
      emit: (line) => lines.push(line),
    }),
    0,
  );
  assert.equal(
    await runProvider({
      token: '  ',
      factory,
      emit: (line) => lines.push(line),
    }),
    0,
  );
  assert.equal(factoryCalls, 0);
  assert.deepEqual(lines, [
    'PROVIDER_TEST: SKIP TOKEN_MISSING',
    'PROVIDER_TEST: SKIP TOKEN_MISSING',
  ]);
});

test('H-001: entry удаляет родительский token и сообщает SKIP без provider build', () => {
  const environment = { ...process.env, PROVIDER_TEST_TOKEN: canary };
  delete environment.PROVIDER_TEST_TOKEN;
  const result = spawnSync(
    process.execPath,
    ['packages/providers/yandex-music/test-live/run.mjs'],
    {
      cwd: new URL('../../../../', import.meta.url),
      env: environment,
      encoding: 'utf8',
    },
  );
  assert.equal(result.status, 0);
  assert.equal(result.stdout, 'PROVIDER_TEST: SKIP TOKEN_MISSING\n');
  assert.equal(result.stderr, '');
});

test('H-002: synthetic public contract проходит и очищает test-only memory', async () => {
  const lines = [];
  const { provider, calls } = validProvider();
  const store = createMemoryCredentialStore(canary, 1);
  const code = await runProvider({
    token: canary,
    factory: async () => ({
      provider,
      credentialStore: store,
      schemaVersion: '1.1.0',
    }),
    emit: (line) => lines.push(line),
  });
  assert.equal(code, 0);
  assert.equal(store.isCleared(), true);
  assert.deepEqual(calls, [
    'account',
    'track:2224197',
    'album:221173',
    'playlist:users/account-1/playlists/1000',
    'variants:2224197',
    'logout',
  ]);
  assert.match(lines.join('\n'), /PROVIDER_TEST: PASS/);
  assert.match(lines.join('\n'), /PROVIDER_TEST: MEMORY_CLEANUP_PASS/);
  assert.doesNotMatch(lines.join('\n'), new RegExp(canary));
});

test('H-002: malformed public response и provider error возвращают безопасный failing stage', async () => {
  const lines = [];
  const { provider } = validProvider({ failAt: 'track' });
  const store = createMemoryCredentialStore(canary, 1);
  const code = await runProvider({
    token: canary,
    factory: async () => ({
      provider,
      credentialStore: store,
      schemaVersion: '1.1.0',
    }),
    emit: (line) => lines.push(line),
  });
  assert.equal(code, 1);
  assert.equal(store.isCleared(), true);
  assert.match(lines.join('\n'), /FAIL stage=TRACK code=API_CHANGED/);
  assert.doesNotMatch(lines.join('\n'), new RegExp(canary));

  const malformedLines = [];
  const malformed = validProvider();
  malformed.provider.getTrack = async () => ({ id: 'wrong', raw: canary });
  const malformedCode = await runProvider({
    token: canary,
    factory: async () => ({
      provider: malformed.provider,
      credentialStore: createMemoryCredentialStore(canary, 1),
      schemaVersion: '1.1.0',
    }),
    emit: (line) => malformedLines.push(line),
  });
  assert.equal(malformedCode, 1);
  assert.match(
    malformedLines.join('\n'),
    /FAIL stage=TRACK code=PROVIDER_RESPONSE_INVALID/,
  );
  assert.doesNotMatch(malformedLines.join('\n'), new RegExp(canary));
});

test('H-002: unsupported resource override не передаётся provider', async () => {
  const lines = [];
  const { provider, calls } = validProvider();
  const code = await runProvider({
    token: canary,
    environment: { PROVIDER_TEST_TRACK_ID: 'not-an-id' },
    factory: async () => ({
      provider,
      credentialStore: createMemoryCredentialStore(canary, 1),
      schemaVersion: '1.1.0',
    }),
    emit: (line) => lines.push(line),
  });
  assert.equal(code, 1);
  assert.deepEqual(calls, ['account', 'logout']);
  assert.match(
    lines.join('\n'),
    /FAIL stage=CONFIG code=PROVIDER_RESPONSE_INVALID/,
  );
  assert.doesNotMatch(lines.join('\n'), new RegExp(canary));
});
