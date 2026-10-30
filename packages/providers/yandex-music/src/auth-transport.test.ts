import { describe, expect, it } from 'vitest';
import type { ProviderError } from '@music-downloader/shared';
import { createAuthFetch, type AuthFetch } from './auth-transport.js';

function response(status: number, body: string) {
  return {
    status,
    arrayBuffer: async () => new TextEncoder().encode(body).buffer,
  };
}

describe('auth transport', () => {
  it('передаёт валидный JSON без повторного запроса', async () => {
    let calls = 0;
    const fetch: AuthFetch = async () => {
      calls += 1;
      return response(
        200,
        '{"result":{"account":{"uid":1,"displayName":"Тест"},"extra":true}}',
      );
    };
    const result = await createAuthFetch(fetch)(
      'https://api.music.yandex.net/account/status',
      {
        method: 'GET',
        headers: {},
        signal: new AbortController().signal,
      },
    );
    expect(result.status).toBe(200);
    expect(calls).toBe(1);
  });

  it('отклоняет повреждённый успешный ответ и не раскрывает тело', async () => {
    const fetch: AuthFetch = async () =>
      response(200, 'private-token-not-json');
    await expect(
      createAuthFetch(fetch)('https://oauth.yandex.ru/token', {
        method: 'POST',
        headers: {},
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({
      code: 'PROVIDER_RESPONSE_INVALID',
    } satisfies Partial<ProviderError>);
  });

  it.each([
    ['https://oauth.yandex.ru/device/code', '{"device_code":"d"}'],
    [
      'https://oauth.yandex.ru/token',
      '{"access_token":"a","token_type":false}',
    ],
    [
      'https://api.music.yandex.net/account/status',
      '{"result":{"account":{"uid":1}}}',
    ],
  ])('отклоняет критичное raw поле %s до модели', async (url, body) => {
    const fetch: AuthFetch = async () => response(200, body);
    await expect(
      createAuthFetch(fetch)(url, {
        method: 'POST',
        headers: {},
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code: 'PROVIDER_RESPONSE_INVALID' });
  });

  it('преобразует сетевой отказ в NETWORK_ERROR', async () => {
    const fetch: AuthFetch = async () => {
      throw new Error('private url');
    };
    await expect(
      createAuthFetch(fetch)('https://oauth.yandex.ru/token', {
        method: 'POST',
        headers: {},
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });

  it.each([
    [401, 'AUTH_ERROR'],
    [403, 'AUTH_ERROR'],
    [429, 'SERVICE_UNAVAILABLE'],
    [500, 'SERVICE_UNAVAILABLE'],
  ])('маппит HTTP %s одним запросом', async (status, code) => {
    let calls = 0;
    const fetch: AuthFetch = async () => {
      calls += 1;
      return response(status, '{"error":"denied"}');
    };
    await expect(
      createAuthFetch(fetch)('https://oauth.yandex.ru/token', {
        method: 'POST',
        headers: {},
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code });
    expect(calls).toBe(1);
  });
});

it('запрашивает только музыку, чтение плейлистов и аватар, сохраняя параметры устройства', async () => {
  let outgoing = new URLSearchParams();
  let calls = 0;
  const fetch: AuthFetch = async (_url, init) => {
    calls++;
    outgoing = new URLSearchParams(init.body);
    return response(
      200,
      JSON.stringify({
        device_code: 'test-device-code',
        user_code: 'test-user-code',
        verification_url: 'https://ya.ru/device',
        expires_in: 600,
        interval: 5,
      }),
    );
  };
  await createAuthFetch(fetch)('https://oauth.yandex.ru/device/code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    signal: new AbortController().signal,
    body: new URLSearchParams({
      client_id: 'test-client',
      device_id: 'test-device',
      device_name: 'Тестовое устройство',
      scope: 'payments:all',
      optional_scope: 'yadisk:disk',
    }).toString(),
  });
  expect(outgoing.get('scope')).toBe('music:content music:read login:avatar');
  expect(outgoing.has('optional_scope')).toBe(false);
  expect(outgoing.get('client_id')).toBe('test-client');
  expect(outgoing.get('device_id')).toBe('test-device');
  expect(outgoing.get('device_name')).toBe('Тестовое устройство');
  expect(calls).toBe(1);
});

it('отказ ограниченных прав не запускает повтор с полными правами', async () => {
  const scopes: (string | null)[] = [];
  const fetch: AuthFetch = async (_url, init) => {
    scopes.push(new URLSearchParams(init.body).get('scope'));
    return response(400, '{"error":"invalid_scope"}');
  };
  const result = await createAuthFetch(fetch)(
    'https://oauth.yandex.ru/device/code',
    {
      method: 'POST',
      headers: {},
      signal: new AbortController().signal,
      body: 'client_id=test-client',
    },
  );
  expect(result.status).toBe(400);
  expect(scopes).toEqual(['music:content music:read login:avatar']);
});
