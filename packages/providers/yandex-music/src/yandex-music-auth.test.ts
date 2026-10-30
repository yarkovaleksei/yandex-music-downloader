import { describe, expect, it, vi } from 'vitest';
import {
  AuthenticationError,
  DownloadError,
  PermissionError,
  type CredentialStore,
} from '@music-downloader/shared';
import { YandexMusicProviderAuth } from './yandex-music-auth.js';

function response(status: number, body: unknown) {
  return {
    status,
    arrayBuffer: async () =>
      new TextEncoder().encode(JSON.stringify(body)).buffer,
  };
}

function store(
  value: string | null,
): CredentialStore & { value: string | null; clears: number } {
  return {
    value,
    clears: 0,
    async read() {
      return this.value;
    },
    async write(next) {
      this.value = next;
    },
    async clear() {
      this.clears += 1;
      this.value = null;
    },
  };
}

describe('YandexMusicProviderAuth', () => {
  it('проверяет account до успешной записи credentials', async () => {
    const events: string[] = [];
    const credentials: CredentialStore = {
      async read() {
        return null;
      },
      async write(value) {
        events.push(
          value.includes('canary-access') ? 'write' : 'invalid-write',
        );
      },
      async clear() {},
    };
    const provider = new YandexMusicProviderAuth({
      credentialStore: credentials,
      authInteraction: {
        notify: () => {
          events.push('notify');
        },
      },
      browser: {
        async open() {
          events.push('browser');
        },
      },
      now: () => 100,
      fetch: async (url) => {
        if (url.includes('/device/code'))
          return response(200, {
            device_code: 'canary-device',
            user_code: 'canary-user',
            verification_url: 'https://ya.ru/device',
            expires_in: 60,
            interval: 1,
          });
        if (url.includes('/token'))
          return response(200, {
            access_token: 'canary-access',
            token_type: 'bearer',
            expires_in: 10,
          });
        events.push('account');
        return response(200, {
          result: { account: { uid: 1, displayName: 'Тест' } },
        });
      },
    });
    await expect(provider.authenticate()).resolves.toEqual({
      id: '1',
      displayName: 'Тест',
      subscriptionReason:
        'Сервис не передал достаточно данных, чтобы определить подписку.',
    });
    expect(events).toEqual(['browser', 'notify', 'account', 'write']);
  });

  it('продолжает authorization_pending без retry и завершает следующий poll', async () => {
    let polls = 0;
    let sleeps = 0;
    const provider = new YandexMusicProviderAuth({
      credentialStore: store(null),
      authInteraction: { notify: () => undefined },
      browser: { async open() {} },
      sleep: async () => {
        sleeps += 1;
      },
      fetch: async (url) => {
        if (url.includes('/device/code'))
          return response(200, {
            device_code: 'device',
            user_code: 'code',
            verification_url: 'https://ya.ru/device',
            expires_in: 60,
            interval: 1,
          });
        if (url.includes('/token')) {
          polls += 1;
          return polls === 1
            ? response(400, { error: 'authorization_pending' })
            : response(200, {
                access_token: 'canary-access',
                token_type: 'bearer',
              });
        }
        return response(200, {
          result: { account: { uid: 1, displayName: 'Тест' } },
        });
      },
    });
    await expect(provider.authenticate()).resolves.toEqual({
      id: '1',
      displayName: 'Тест',
      subscriptionReason:
        'Сервис не передал достаточно данных, чтобы определить подписку.',
    });
    expect(polls).toBe(2);
    expect(sleeps).toBe(2);
  });

  it('увеличивает server interval после slow_down', async () => {
    const intervals: number[] = [];
    let polls = 0;
    const provider = new YandexMusicProviderAuth({
      credentialStore: store(null),
      authInteraction: { notify: () => undefined },
      browser: { async open() {} },
      sleep: async (ms) => {
        intervals.push(ms);
      },
      fetch: async (url) => {
        if (url.includes('/device/code'))
          return response(200, {
            device_code: 'd',
            user_code: 'u',
            verification_url: 'https://ya.ru/a',
            expires_in: 60,
            interval: 1,
          });
        if (url.includes('/token')) {
          polls += 1;
          return polls === 1
            ? response(400, { error: 'slow_down' })
            : response(200, { access_token: 'a', token_type: 'bearer' });
        }
        return response(200, {
          result: { account: { uid: 1, displayName: 'Тест' } },
        });
      },
    });
    await provider.authenticate();
    expect(intervals).toEqual([1000, 6000]);
  });

  it.each(['access_denied', 'invalid_client'])(
    'останавливает initial OAuth отказ %s без account и записи (F-003)',
    async (oauthError) => {
      let account = 0;
      const credentials = store(null);
      const provider = new YandexMusicProviderAuth({
        credentialStore: credentials,
        authInteraction: { notify: () => undefined },
        browser: { async open() {} },
        sleep: async () => {},
        fetch: async (url) => {
          if (url.includes('/device/code'))
            return response(400, { error: oauthError });
          account += 1;
          return response(200, {});
        },
      });
      await expect(provider.authenticate()).rejects.toMatchObject({
        code: 'AUTH_ERROR',
        retryable: false,
        message:
          'Требуется повторная авторизация. Выполните music-downloader auth.',
      });
      expect(account).toBe(0);
      expect(credentials.value).toBeNull();
    },
  );

  it('передаёт deadline до открытия браузера и не продлевает его после reload', async () => {
    // STEP-041: задержка launcher не должна начинать новый browser countdown.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(100_000);
    let address = '';
    let tokenStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      tokenStarted = resolve;
    });
    const credentials = store(null);
    const provider = new YandexMusicProviderAuth({
      credentialStore: credentials,
      authInteraction: { notify: () => undefined },
      browser: {
        async open(url) {
          address = url;
          vi.setSystemTime(115_000);
        },
      },
      sleep: async () => {},
      fetch: async (url, init) => {
        if (url.includes('/device/code'))
          return response(200, {
            device_code: 'deadline-private-device',
            user_code: 'deadline-user-code',
            verification_url: 'https://ya.ru/device',
            expires_in: 60,
            interval: 1,
          });
        return new Promise((_, reject) => {
          tokenStarted();
          init.signal.addEventListener(
            'abort',
            () => reject(new DOMException('aborted', 'AbortError')),
            { once: true },
          );
        });
      },
    });
    const failure = provider.authenticate().catch((error: unknown) => error);
    try {
      await started;
      const html = await (await fetch(address)).text();
      expect(html).toContain('data-deadline="160000"');
      expect(html).toContain('data-duration="60000"');
      expect(html).toContain('deadline-user-code');
      expect(html).not.toContain('deadline-private-device');
      vi.setSystemTime(130_000);
      expect(await (await fetch(address)).text()).toBe(html);
    } finally {
      await fetch(`${address}/cancel`, { method: 'POST' });
      await expect(failure).resolves.toBeInstanceOf(AuthenticationError);
      vi.useRealTimers();
    }
    expect(credentials.value).toBeNull();
    await expect(fetch(address)).rejects.toThrow();
  });

  it('отменяет зависший token poll через private HTTP cancel', async () => {
    let privateUrl = '';
    let tokenStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      tokenStarted = resolve;
    });
    let aborted = false;
    let account = 0;
    const credentials = store(null);
    const provider = new YandexMusicProviderAuth({
      credentialStore: credentials,
      authInteraction: { notify: () => undefined },
      browser: {
        async open(url) {
          privateUrl = url;
        },
      },
      sleep: async () => {},
      fetch: async (url, init) => {
        if (url.includes('/device/code'))
          return response(200, {
            device_code: 'd',
            user_code: 'u',
            verification_url: 'https://ya.ru/a',
            expires_in: 60,
            interval: 1,
          });
        if (url.includes('/token'))
          return new Promise((_, reject) => {
            tokenStarted();
            init.signal.addEventListener(
              'abort',
              () => {
                aborted = true;
                reject(new DOMException('aborted', 'AbortError'));
              },
              { once: true },
            );
          });
        account += 1;
        return response(200, {});
      },
    });
    const authentication = provider.authenticate();
    const failure = authentication.catch((error: unknown) => error);
    await started;
    expect(
      (await fetch(`${privateUrl}/cancel`, { method: 'POST' })).status,
    ).toBe(204);
    await expect(failure).resolves.toBeInstanceOf(AuthenticationError);
    expect(aborted).toBe(true);
    expect(account).toBe(0);
    expect(credentials.value).toBeNull();
    await expect(fetch(privateUrl)).rejects.toThrow();
  });

  it('отмена private страницы во время account не пишет credentials и закрывает server (F-004)', async () => {
    let privateUrl = '';
    let accountStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      accountStarted = resolve;
    });
    let releaseAccount!: () => void;
    const release = new Promise<void>((resolve) => {
      releaseAccount = resolve;
    });
    let accountAborted = false;
    const credentials = store('прежняя-запись');
    const provider = new YandexMusicProviderAuth({
      credentialStore: credentials,
      authInteraction: { notify: () => undefined },
      browser: {
        async open(url) {
          privateUrl = url;
        },
      },
      sleep: async () => {},
      fetch: async (url, init) => {
        if (url.includes('/device/code'))
          return response(200, {
            device_code: 'd',
            user_code: 'u',
            verification_url: 'https://ya.ru/a',
            expires_in: 60,
            interval: 1,
          });
        if (url.includes('/token'))
          return response(200, { access_token: 'a', token_type: 'bearer' });
        accountStarted();
        init.signal.addEventListener(
          'abort',
          () => {
            accountAborted = true;
          },
          { once: true },
        );
        await release;
        return response(200, {
          result: { account: { uid: 1, displayName: 'Тест' } },
        });
      },
    });
    const authentication = provider.authenticate();
    await started;
    expect(
      (await fetch(`${privateUrl}/cancel`, { method: 'POST' })).status,
    ).toBe(204);
    releaseAccount();
    await expect(authentication).rejects.toBeInstanceOf(AuthenticationError);
    expect(accountAborted).toBe(true);
    expect(credentials.value).toBe('прежняя-запись');
    await expect(fetch(privateUrl)).rejects.toThrow();
  });

  it('прерывает зависший poll по deadline и закрывает private server', async () => {
    vi.useFakeTimers();
    try {
      let privateUrl = '';
      let tokenStarted!: () => void;
      const started = new Promise<void>((resolve) => {
        tokenStarted = resolve;
      });
      let aborted = false;
      let account = 0;
      const credentials = store(null);
      const provider = new YandexMusicProviderAuth({
        credentialStore: credentials,
        authInteraction: { notify: () => undefined },
        browser: {
          async open(url) {
            privateUrl = url;
          },
        },
        sleep: async () => {},
        fetch: async (url, init) => {
          if (url.includes('/device/code'))
            return response(200, {
              device_code: 'd',
              user_code: 'u',
              verification_url: 'https://ya.ru/a',
              expires_in: 1,
              interval: 1,
            });
          if (url.includes('/token'))
            return new Promise((_, reject) => {
              tokenStarted();
              init.signal.addEventListener(
                'abort',
                () => {
                  aborted = true;
                  reject(new DOMException('aborted', 'AbortError'));
                },
                { once: true },
              );
            });
          account += 1;
          return response(200, {});
        },
      });
      const authentication = provider.authenticate();
      const failure = authentication.catch((error: unknown) => error);
      await started;
      await vi.advanceTimersByTimeAsync(1000);
      await expect(failure).resolves.toBeInstanceOf(AuthenticationError);
      expect(aborted).toBe(true);
      expect(account).toBe(0);
      expect(credentials.value).toBeNull();
      await expect(fetch(privateUrl)).rejects.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });

  it('возвращает null при отсутствии credentials без HTTP', async () => {
    let calls = 0;
    const provider = new YandexMusicProviderAuth({
      credentialStore: store(null),
      authInteraction: { notify: () => undefined },
      fetch: async () => {
        calls += 1;
        return response(200, {});
      },
    });
    await expect(provider.getAccount()).resolves.toBeNull();
    expect(calls).toBe(0);
  });

  it('отклоняет истёкшую запись без refresh и запроса', async () => {
    let calls = 0;
    const saved = JSON.stringify({
      schemaVersion: 1,
      accessToken: 'canary-access',
      issuedAt: 1,
      expiresAt: 2,
      accountId: '1',
    });
    const provider = new YandexMusicProviderAuth({
      credentialStore: store(saved),
      authInteraction: { notify: () => undefined },
      now: () => 3,
      fetch: async () => {
        calls += 1;
        return response(200, {});
      },
    });
    await expect(provider.getAccount()).rejects.toBeInstanceOf(
      AuthenticationError,
    );
    await expect(provider.getAccount()).rejects.toThrow(
      'music-downloader auth',
    );
    expect(calls).toBe(0);
  });

  it('очищает память до clear и не возобновляет HTTP после logout', async () => {
    const saved = JSON.stringify({
      schemaVersion: 1,
      accessToken: 'canary-access',
      issuedAt: 1,
      accountId: '1',
    });
    const credentials = store(saved);
    let calls = 0;
    const provider = new YandexMusicProviderAuth({
      credentialStore: credentials,
      authInteraction: { notify: () => undefined },
      fetch: async () => {
        calls += 1;
        return response(200, {
          result: { account: { uid: 1, displayName: 'Тест' } },
        });
      },
    });
    await expect(provider.getAccount()).resolves.toEqual({
      id: '1',
      displayName: 'Тест',
      subscriptionReason:
        'Сервис не передал достаточно данных, чтобы определить подписку.',
    });
    await provider.logout();
    await expect(provider.getAccount()).resolves.toBeNull();
    expect(credentials.clears).toBe(1);
    expect(calls).toBe(1);
  });

  it('не маскирует повреждённую запись как отсутствие авторизации', async () => {
    let calls = 0;
    let writes = 0;
    const provider = new YandexMusicProviderAuth({
      credentialStore: {
        ...store('{bad'),
        async write() {
          writes += 1;
        },
      },
      authInteraction: { notify: () => undefined },
      fetch: async () => {
        calls += 1;
        return response(200, {});
      },
    });
    await expect(provider.getAccount()).rejects.toMatchObject({
      code: 'PROVIDER_RESPONSE_INVALID',
    });
    expect(calls).toBe(0);
    expect(writes).toBe(0);
  });

  it('возвращает обязательную диагностику ADR для некорректного account API ответа (F-001)', async () => {
    let calls = 0;
    const provider = new YandexMusicProviderAuth({
      credentialStore: store(
        JSON.stringify({
          schemaVersion: 1,
          accessToken: 'canary',
          issuedAt: 1,
          accountId: '1',
        }),
      ),
      authInteraction: { notify: () => undefined },
      fetch: async () => {
        calls += 1;
        return response(200, { result: { account: { uid: 1 } } });
      },
    });
    await expect(provider.getAccount()).rejects.toMatchObject({
      code: 'PROVIDER_RESPONSE_INVALID',
      retryable: false,
      message:
        'API Яндекс Музыки изменился. Текущая версия приложения не поддерживает новый формат ответа.',
    });
    expect(calls).toBe(1);
  });

  it('читает envelope ADR после restart и отклоняет неизвестную schemaVersion без side effects (F-002)', async () => {
    let calls = 0;
    let writes = 0;
    const valid = JSON.stringify({
      schemaVersion: 1,
      accessToken: 'canary',
      issuedAt: 1,
      accountId: '1',
    });
    const provider = new YandexMusicProviderAuth({
      credentialStore: {
        ...store(valid),
        async write() {
          writes += 1;
        },
      },
      authInteraction: { notify: () => undefined },
      fetch: async () => {
        calls += 1;
        return response(200, {
          result: { account: { uid: 1, displayName: 'Тест' } },
        });
      },
    });
    await expect(provider.getAccount()).resolves.toEqual({
      id: '1',
      displayName: 'Тест',
      subscriptionReason:
        'Сервис не передал достаточно данных, чтобы определить подписку.',
    });
    const unknown = new YandexMusicProviderAuth({
      credentialStore: {
        ...store(JSON.stringify({ schemaVersion: 2 })),
        async write() {
          writes += 1;
        },
      },
      authInteraction: { notify: () => undefined },
      fetch: async () => {
        calls += 1;
        return response(200, {});
      },
    });
    await expect(unknown.getAccount()).rejects.toMatchObject({
      code: 'PROVIDER_RESPONSE_INVALID',
    });
    expect(calls).toBe(1);
    expect(writes).toBe(0);
  });

  it('записывает новый envelope с schemaVersion из ADR-010 (F-002)', async () => {
    const credentials = store(null);
    const provider = new YandexMusicProviderAuth({
      credentialStore: credentials,
      authInteraction: { notify: () => undefined },
      browser: { async open() {} },
      sleep: async () => {},
      fetch: async (url) =>
        url.includes('/device/code')
          ? response(200, {
              device_code: 'd',
              user_code: 'u',
              verification_url: 'https://ya.ru/a',
              expires_in: 60,
              interval: 1,
            })
          : url.includes('/token')
            ? response(200, { access_token: 'canary', token_type: 'bearer' })
            : response(200, {
                result: { account: { uid: 1, displayName: 'Тест' } },
              }),
    });
    await provider.authenticate();
    expect(JSON.parse(credentials.value ?? '{}')).toMatchObject({
      schemaVersion: 1,
      accessToken: 'canary',
      accountId: '1',
    });
    expect(JSON.parse(credentials.value ?? '{}')).not.toHaveProperty('version');
  });

  it('сохраняет прежнюю запись при ошибке native store', async () => {
    const credentials = store('старое');
    credentials.write = async () => {
      throw new PermissionError();
    };
    const provider = new YandexMusicProviderAuth({
      credentialStore: credentials,
      authInteraction: { notify: () => undefined },
      browser: { async open() {} },
      fetch: async (url) =>
        url.includes('/device/code')
          ? response(200, {
              device_code: 'd',
              user_code: 'u',
              verification_url: 'https://ya.ru/a',
              expires_in: 60,
              interval: 1,
            })
          : url.includes('/token')
            ? response(200, { access_token: 'canary', token_type: 'bearer' })
            : response(200, {
                result: { account: { uid: 1, displayName: 'Тест' } },
              }),
    });
    await expect(provider.authenticate()).rejects.toBeInstanceOf(
      PermissionError,
    );
    expect(credentials.value).toBe('старое');
  });

  it('блокирует память до неудачного clear', async () => {
    const credentials = store(
      JSON.stringify({
        schemaVersion: 1,
        accessToken: 'canary',
        issuedAt: 1,
        accountId: '1',
      }),
    );
    credentials.clear = async () => {
      throw new DownloadError(false);
    };
    let calls = 0;
    const provider = new YandexMusicProviderAuth({
      credentialStore: credentials,
      authInteraction: { notify: () => undefined },
      fetch: async () => {
        calls += 1;
        return response(200, {
          result: { account: { uid: 1, displayName: 'Тест' } },
        });
      },
    });
    await provider.getAccount();
    await expect(provider.logout()).rejects.toBeInstanceOf(DownloadError);
    expect(calls).toBe(1);
  });

  it('не раскрывает canary credentials в notify и JSON safe error', async () => {
    const canary = 'canary-access-refresh-device-user-private-url';
    const notices: string[] = [];
    const provider = new YandexMusicProviderAuth({
      credentialStore: store(null),
      authInteraction: {
        notify: (message) => {
          notices.push(message);
        },
      },
      browser: { async open() {} },
      sleep: async () => {},
      fetch: async (url) => {
        if (url.includes('/device/code'))
          return response(200, {
            device_code: canary,
            user_code: canary,
            verification_url: 'https://ya.ru/a',
            expires_in: 1,
            interval: 1,
          });
        return response(400, { error: 'access_denied' });
      },
    });
    const error = await provider
      .authenticate()
      .catch((failure: unknown) => failure);
    const observable = JSON.stringify({
      notices,
      error:
        error instanceof Error && 'toJSON' in error
          ? (error as AuthenticationError).toJSON()
          : error,
    });
    expect(observable).not.toContain(canary);
  });

  it('не выводит успешные OAuth canary в реальных provider surfaces (F-005)', async () => {
    const access = 'canary-access-unique';
    const refresh = 'canary-refresh-unique';
    const device = 'canary-device-unique';
    const user = 'canary-user-unique';
    const notices: string[] = [];
    let privateUrl = '';
    const output: string[] = [];
    const log = vi.spyOn(console, 'log').mockImplementation((...values) => {
      output.push(values.join(' '));
    });
    const error = vi.spyOn(console, 'error').mockImplementation((...values) => {
      output.push(values.join(' '));
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation((...values) => {
      output.push(values.join(' '));
    });
    const info = vi.spyOn(console, 'info').mockImplementation((...values) => {
      output.push(values.join(' '));
    });
    const debug = vi.spyOn(console, 'debug').mockImplementation((...values) => {
      output.push(values.join(' '));
    });
    const stdout = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk) => {
        output.push(String(chunk));
        return true;
      });
    const stderr = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk) => {
        output.push(String(chunk));
        return true;
      });
    const credentials = store(null);
    try {
      const provider = new YandexMusicProviderAuth({
        credentialStore: credentials,
        authInteraction: {
          notify: (message) => {
            notices.push(message);
          },
        },
        browser: {
          async open(url) {
            privateUrl = url;
          },
        },
        sleep: async () => {},
        fetch: async (url) => {
          if (url.includes('/device/code'))
            return response(200, {
              device_code: device,
              user_code: user,
              verification_url: 'https://ya.ru/a',
              expires_in: 60,
              interval: 1,
            });
          if (url.includes('/token'))
            return response(200, {
              access_token: access,
              refresh_token: refresh,
              token_type: 'bearer',
            });
          return response(200, {
            result: { account: { uid: 1, displayName: 'Тест' } },
          });
        },
      });
      const account = await provider.authenticate();
      const observable = JSON.stringify({
        notices,
        output,
        account: JSON.stringify(account),
      });
      for (const forbidden of [access, refresh, device, user, privateUrl])
        expect(observable).not.toContain(forbidden);
    } finally {
      log.mockRestore();
      error.mockRestore();
      warn.mockRestore();
      info.mockRestore();
      debug.mockRestore();
      stdout.mockRestore();
      stderr.mockRestore();
    }
  });

  it('маппит revoked 401 одним запросом без refresh', async () => {
    let calls = 0;
    const provider = new YandexMusicProviderAuth({
      credentialStore: store(
        JSON.stringify({
          schemaVersion: 1,
          accessToken: 'canary',
          issuedAt: 1,
          accountId: '1',
        }),
      ),
      authInteraction: { notify: () => undefined },
      fetch: async () => {
        calls += 1;
        return response(401, { error: 'revoked' });
      },
    });
    await expect(provider.getAccount()).rejects.toBeInstanceOf(
      AuthenticationError,
    );
    expect(calls).toBe(1);
  });
});

it('REQ-058: account проецирует только фактические optional поля без форматов из подписки', async () => {
  const credentials = store(
    JSON.stringify({
      schemaVersion: 1,
      accessToken: 'synthetic',
      issuedAt: 0,
      accountId: '1',
    }),
  );
  const provider = new YandexMusicProviderAuth({
    credentialStore: credentials,
    authInteraction: { notify: () => undefined },
    fetch: async () =>
      response(200, {
        result: {
          account: {
            uid: 1,
            displayName: 'Пользователь',
            region: 225,
            regionCode: 'RU',
          },
          defaultEmail: 'user@example.test',
          subscription: {
            autoRenewable: [
              { finished: false, product: { title: 'Подписка' } },
            ],
          },
          token: 'secret',
        },
      }),
  });
  await expect(provider.getAccount()).resolves.toEqual({
    id: '1',
    displayName: 'Пользователь',
    email: 'user@example.test',
    region: 'RU',
    subscription: 'Подписка',
  });
});

it.each([
  [
    {
      plus: { hasPlus: true },
      subscription: { autoRenewable: [{ finished: false }] },
    },
    'Яндекс Плюс активен',
  ],
  [
    {
      subscription: {
        familyAutoRenewable: [
          { finished: false, product: { title: 'Семейная' } },
        ],
      },
    },
    'Семейная',
  ],
  [
    { subscription: { operator: [{ suspended: false, title: 'Оператор' }] } },
    'Оператор',
  ],
  [
    {
      subscription: {
        nonAutoRenewable: { start: '2020-01-01', end: '2040-01-01' },
      },
    },
    'Подписка без автопродления активна',
  ],
])(
  'STEP-059: подтверждённая SDK форма %j проецируется без выдуманных codecs',
  async (fields, title) => {
    const provider = new YandexMusicProviderAuth({
      credentialStore: store(
        JSON.stringify({
          schemaVersion: 1,
          accessToken: 'synthetic',
          issuedAt: 0,
          accountId: '1',
        }),
      ),
      authInteraction: { notify() {} },
      fetch: async () =>
        response(200, {
          result: { account: { uid: 1, displayName: 'Тест' }, ...fields },
        }),
    });
    expect(await provider.getAccount()).toMatchObject({ subscription: title });
    expect(await provider.getAccount()).not.toHaveProperty('formats');
  },
);

it('STEP-059 F-002: поздний account-status A не меняет active credentials после logout и входа B', async () => {
  const credentials = store(
    JSON.stringify({
      schemaVersion: 1,
      accessToken: 'synthetic-A',
      accountId: 'A',
      issuedAt: 0,
    }),
  );
  let finish!: () => void;
  let markStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  const delayed = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let first = true;
  const provider = new YandexMusicProviderAuth({
    credentialStore: credentials,
    authInteraction: { notify() {} },
    browser: { async open() {} },
    sleep: async () => {},
    now: () => 10,
    fetch: async (url, init) => {
      if (url.includes('/device/code'))
        return response(200, {
          device_code: 'synthetic-device',
          user_code: 'synthetic-code',
          verification_url: 'https://ya.ru/device',
          expires_in: 60,
          interval: 1,
        });
      if (url.includes('/token'))
        return response(200, {
          access_token: 'synthetic-B',
          token_type: 'bearer',
          expires_in: 1000,
        });
      const authorization = Object.entries(init.headers).find(
        ([key]) => key.toLowerCase() === 'authorization',
      )?.[1];
      const id = authorization?.includes('synthetic-B') ? 'B' : 'A';
      if (id === 'A' && first) {
        first = false;
        markStarted();
        await delayed;
      }
      return response(200, {
        result: { account: { uid: id, displayName: `Аккаунт ${id}` } },
      });
    },
  });
  const lookup = provider.getAccount();
  await started;
  try {
    await provider.logout();
    expect(await provider.authenticate()).toMatchObject({ id: 'B' });
  } finally {
    finish();
  }
  expect(await lookup).toBeNull();
  expect(await provider.getAccount()).toMatchObject({ id: 'B' });
  expect(JSON.parse(credentials.value ?? 'null')).toMatchObject({
    accessToken: 'synthetic-B',
    accountId: 'B',
  });
  await provider.logout();
});
