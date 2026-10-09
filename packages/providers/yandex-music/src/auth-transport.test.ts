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
