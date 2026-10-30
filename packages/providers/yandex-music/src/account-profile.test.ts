import { expect, it, vi } from 'vitest';
import { fetchAccountPortrait } from './account-profile.js';
import { YandexMusicProviderAuth } from './yandex-music-auth.js';
import type { AuthFetch, AuthFetchResponse } from './auth-transport.js';

function response(
  bytes: Uint8Array,
  mime = 'application/json',
  status = 200,
): AuthFetchResponse {
  return {
    status,
    headers: new Headers({ 'content-type': mime }),
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    }),
    arrayBuffer: async () => Uint8Array.from(bytes).buffer,
  };
}
const profile = (value: unknown) =>
  response(new TextEncoder().encode(JSON.stringify(value)));
it('fixed profile OAuth, составной ID, CDN без credentials/redirect, только image bytes', async () => {
  const fetch = vi
    .fn<AuthFetch>()
    .mockResolvedValueOnce(
      profile({
        is_avatar_empty: false,
        default_avatar_id: '12345/synthetic-avatar',
        token: 'synthetic-secret',
      }),
    )
    .mockResolvedValueOnce(response(new Uint8Array([1, 2, 3]), 'image/jpeg'));
  expect(await fetchAccountPortrait(fetch, 'synthetic-secret')).toEqual({
    bytes: new Uint8Array([1, 2, 3]),
    mimeType: 'image/jpeg',
  });
  expect(fetch.mock.calls[0]?.[0]).toBe('https://login.yandex.ru/info');
  expect(fetch.mock.calls[0]?.[1]).toMatchObject({
    headers: { Authorization: 'OAuth synthetic-secret' },
    redirect: 'error',
  });
  expect(fetch.mock.calls[1]?.[0]).toBe(
    'https://avatars.yandex.net/get-yapic/12345/synthetic-avatar/islands-200',
  );
  expect(fetch.mock.calls[1]?.[1]).toMatchObject({
    headers: { Accept: 'image/*' },
    redirect: 'error',
  });
  expect(fetch.mock.calls[1]?.[1].headers).not.toHaveProperty('Authorization');
});
it.each([{ is_avatar_empty: true, default_avatar_id: 'default' }, {}])(
  'no-photo/нет прав оставляют fallback: %j',
  async (value) => {
    const fetch = vi.fn<AuthFetch>().mockResolvedValue(profile(value));
    expect(await fetchAccountPortrait(fetch, 'synthetic')).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  },
);
it('отказ profile, MIME и oversized поток оставляют fallback', async () => {
  expect(
    await fetchAccountPortrait(
      async () => response(new Uint8Array(), 'application/json', 403),
      'synthetic',
    ),
  ).toBeNull();
  for (const image of [
    response(new Uint8Array([1]), 'image/svg+xml'),
    response(new Uint8Array(2 * 1024 * 1024 + 1), 'image/png'),
  ]) {
    const fetch = vi
      .fn<AuthFetch>()
      .mockResolvedValueOnce(
        profile({ is_avatar_empty: false, default_avatar_id: '123' }),
      )
      .mockResolvedValueOnce(image);
    expect(await fetchAccountPortrait(fetch, 'synthetic')).toBeNull();
  }
});
it('logout во время CDN исключает публикацию старого avatar', async () => {
  let finish!: (response: AuthFetchResponse) => void;
  let requested!: () => void;
  const started = new Promise<void>((resolve) => {
    requested = resolve;
  });
  const provider = new YandexMusicProviderAuth({
    credentialStore: {
      read: async () =>
        JSON.stringify({
          schemaVersion: 1,
          accessToken: 'synthetic',
          accountId: '1',
          issuedAt: 0,
        }),
      write: async () => {},
      clear: async () => {},
    },
    authInteraction: { notify() {} },
    fetch: async (url) =>
      url.startsWith('https://login.yandex.ru/')
        ? profile({ is_avatar_empty: false, default_avatar_id: '123' })
        : new Promise((resolve) => {
            finish = resolve;
            requested();
          }),
  });
  const pending = provider.fetchAccountAvatar();
  await started;
  await provider.logout();
  finish(response(new Uint8Array([1]), 'image/png'));
  expect(await pending).toBeNull();
});
