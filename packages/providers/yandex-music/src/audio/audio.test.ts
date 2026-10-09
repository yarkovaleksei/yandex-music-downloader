import { describe, expect, it, vi } from 'vitest';
import { createCipheriv } from 'node:crypto';
import type { CredentialStore } from '@music-downloader/shared';
import type { AuthFetch } from '../auth-transport.js';
import { YandexMusicProviderAuth } from '../yandex-music-auth.js';
import { createAudioStream } from './stream.js';
import { audioTransport, fetchAudioCdn } from './transport.js';

const credentials = JSON.stringify({
  schemaVersion: 1,
  accessToken: 'private-access-token',
  issuedAt: 1,
  accountId: '42',
});

function response(
  status: number,
  payload: unknown,
  body?: ReadableStream<Uint8Array>,
) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  return {
    status,
    headers: { get: () => null },
    body,
    arrayBuffer: async () => bytes.buffer,
  };
}

function audioFetch(): AuthFetch {
  return async (url, init) => {
    const path = new URL(url).pathname;
    if (path === '/tracks')
      return response(200, { result: [{ id: 7, available: true }] });
    if (path === '/tracks/7/download-info')
      return response(200, {
        result: [
          {
            codec: 'mp3',
            bitrateInKbps: 192,
            preview: false,
            downloadInfoUrl: 'https://link.test/xml',
            direct: false,
          },
        ],
      });
    if (path === '/get-file-info')
      return response(200, {
        result: {
          downloadInfo: {
            codec: 'aac-mp4',
            transport: 'raw',
            urls: ['https://cdn.test/audio'],
            bitrate: 256,
            preview: false,
          },
        },
      });
    if (path === '/xml') {
      expect(init.headers.authorization).toBeUndefined();
      const xml =
        '<host>cdn.test</host><path>/audio</path><ts>1</ts><s>safe</s>';
      return {
        status: 200,
        headers: { get: () => null },
        arrayBuffer: async () => new TextEncoder().encode(xml).buffer,
      };
    }
    expect(init.headers.authorization).toBeUndefined();
    const bytes = new Uint8Array([0x49, 0x44, 0x33, 1]);
    return {
      status: 200,
      headers: { get: () => null },
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      }),
      arrayBuffer: async () => bytes.buffer,
    };
  };
}

function provider(fetch = audioFetch()) {
  const store: CredentialStore = {
    async read() {
      return credentials;
    },
    async write() {},
    async clear() {},
  };
  return new YandexMusicProviderAuth({
    credentialStore: store,
    authInteraction: { notify() {} },
    fetch,
  });
}

describe('audio provider', () => {
  it('строит стабильный key из доступных non-preview raw вариантов', async () => {
    const first = await provider().getAudioVariants('7');
    const second = await provider().getAudioVariants('7');
    expect(first).toEqual(second);
    expect(first).toMatchObject([
      { codec: 'mp3', bitrate: 192, lossless: false, container: 'mp3' },
      { codec: 'aac-mp4', bitrate: 256, lossless: false, container: 'm4a' },
    ]);
    expect(JSON.stringify(first)).not.toContain('private-access-token');
    expect(JSON.stringify(first)).not.toContain('https://');
  });

  it('открывает вариант заново и сообщает fallback без Range', async () => {
    const subject = provider();
    const [variant] = await subject.getAudioVariants('7');
    const stream = await subject.openAudioStream('7', variant!.key, {
      offset: 2,
    });
    expect(stream.acceptsRanges).toBe(false);
    expect(stream.startOffset).toBe(0);
    expect(await new Response(stream.stream).arrayBuffer()).toEqual(
      new Uint8Array([0x49, 0x44, 0x33, 1]).buffer,
    );
  });

  it('не делает запрос при уже отменённом сигнале', async () => {
    const fetch = vi.fn<AuthFetch>(audioFetch());
    const subject = provider(fetch);
    const controller = new AbortController();
    controller.abort();
    await expect(
      subject.openAudioStream('7', 'ymv1.invalid', {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('передаёт отмену в API до получения заголовков', async () => {
    const base = audioFetch();
    let delay = false;
    let started!: () => void;
    const pending = new Promise<void>((resolve) => {
      started = resolve;
    });
    let aborted = false;
    const fetch: AuthFetch = async (url, init) => {
      if (delay && new URL(url).pathname === '/tracks')
        return new Promise((_, reject) => {
          started();
          init.signal.addEventListener(
            'abort',
            () => {
              aborted = true;
              reject(new DOMException('aborted', 'AbortError'));
            },
            { once: true },
          );
        });
      return base(url, init);
    };
    const subject = provider(fetch);
    const [variant] = await subject.getAudioVariants('7');
    delay = true;
    const controller = new AbortController();
    const opening = subject.openAudioStream('7', variant!.key, {
      signal: controller.signal,
    });
    await pending;
    controller.abort();
    await expect(opening).rejects.toMatchObject({ name: 'AbortError' });
    expect(aborted).toBe(true);
  });

  it('открывает сохранённый key новым provider после перестановки вариантов', async () => {
    let current: 'initial' | 'reordered' | 'changed' = 'initial';
    let cdnCalls = 0;
    const fetch: AuthFetch = async (url) => {
      const path = new URL(url).pathname;
      if (path === '/tracks')
        return response(200, { result: [{ id: 7, available: true }] });
      if (path === '/tracks/7/download-info') {
        const mp3 = {
          codec: 'mp3',
          bitrateInKbps: current === 'changed' ? 128 : 192,
          preview: false,
          downloadInfoUrl: 'https://link.test/xml-mp3',
        };
        const aac = {
          codec: 'aac',
          bitrateInKbps: 128,
          preview: false,
          downloadInfoUrl: 'https://link.test/xml-aac',
        };
        return response(200, {
          result: current === 'initial' ? [mp3, aac] : [aac, mp3],
        });
      }
      if (path === '/get-file-info') return response(200, { result: {} });
      if (path.startsWith('/xml-')) {
        const xml =
          '<host>cdn.test</host><path>/new-audio</path><ts>2</ts><s>safe</s>';
        return {
          status: 200,
          headers: { get: () => null },
          arrayBuffer: async () => new TextEncoder().encode(xml).buffer,
        };
      }
      cdnCalls += 1;
      const bytes = new Uint8Array([0x49, 0x44, 0x33, 2]);
      return {
        status: 200,
        headers: { get: () => null },
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(bytes);
            controller.close();
          },
        }),
        arrayBuffer: async () => bytes.buffer,
      };
    };
    const saved = (await provider(fetch).getAudioVariants('7')).find(
      (variant) => variant.codec === 'mp3',
    )!.key;
    current = 'reordered';
    const reopened = await provider(fetch).openAudioStream('7', saved, {});
    expect(
      new Uint8Array(await new Response(reopened.stream).arrayBuffer()),
    ).toEqual(new Uint8Array([0x49, 0x44, 0x33, 2]));
    current = 'changed';
    await expect(
      provider(fetch).openAudioStream('7', saved, {}),
    ).rejects.toMatchObject({
      code: 'QUALITY_UNAVAILABLE',
    });
    expect(cdnCalls).toBe(1);
  });

  it('не раскрывает secrets в public failure и отклоняет raw critical response', async () => {
    const signedUrl = 'https://cdn.test/private/path-signature';
    const key = '0123456789abcdef0123456789abcdef';
    const token = 'private-access-token';
    const calls: string[] = [];
    const logs = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fetch: AuthFetch = async (url) => {
      calls.push(url);
      const path = new URL(url).pathname;
      if (path === '/tracks')
        return response(200, { result: [{ id: 7, available: true }] });
      if (path === '/tracks/7/download-info')
        return response(200, {
          result: [
            {
              codec: 'mp3',
              bitrateInKbps: 192,
              preview: 'false',
              downloadInfoUrl: signedUrl,
            },
          ],
        });
      return response(200, { result: {} });
    };
    try {
      const error = await provider(fetch)
        .getAudioVariants('7')
        .catch((value) => value);
      const publicError = JSON.stringify(error);
      const capturedLogs = JSON.stringify(logs.mock.calls);
      expect(error).toMatchObject({ code: 'PROVIDER_RESPONSE_INVALID' });
      expect(publicError).not.toContain(signedUrl);
      expect(publicError).not.toContain(key);
      expect(publicError).not.toContain(token);
      expect(capturedLogs).not.toContain(signedUrl);
      expect(capturedLogs).not.toContain(key);
      expect(capturedLogs).not.toContain(token);
      expect(error.cause).toBeUndefined();
      expect(calls).toHaveLength(2);
    } finally {
      logs.mockRestore();
    }
  });

  it('исключает вариант без явного preview=false без CDN запроса', async () => {
    let cdnCalls = 0;
    const fetch: AuthFetch = async (url) => {
      const path = new URL(url).pathname;
      if (path === '/tracks')
        return response(200, { result: [{ id: 7, available: true }] });
      if (path === '/tracks/7/download-info')
        return response(200, {
          result: [
            {
              codec: 'mp3',
              bitrateInKbps: 192,
              downloadInfoUrl: 'https://link.test/missing-preview',
            },
          ],
        });
      if (path === '/get-file-info') return response(200, { result: {} });
      cdnCalls += 1;
      throw new Error('unexpected-cdn');
    };
    await expect(provider(fetch).getAudioVariants('7')).resolves.toEqual([]);
    expect(cdnCalls).toBe(0);
  });

  it('обрабатывает same-host XML как link и не передаёт OAuth', async () => {
    let linkHeaders: Record<string, string> | undefined;
    const fetch: AuthFetch = async (url, init) => {
      const path = new URL(url).pathname;
      if (path === '/tracks')
        return response(200, { result: [{ id: 7, available: true }] });
      if (path === '/tracks/7/download-info')
        return response(200, {
          result: [
            {
              codec: 'mp3',
              bitrateInKbps: 192,
              preview: false,
              downloadInfoUrl: 'https://api.music.yandex.net/audio-link',
            },
          ],
        });
      if (path === '/get-file-info') return response(200, { result: {} });
      if (path === '/audio-link') {
        linkHeaders = init.headers;
        const xml =
          '<host>cdn.test</host><path>/audio</path><ts>1</ts><s>safe</s>';
        return {
          status: 200,
          headers: { get: () => null },
          arrayBuffer: async () => new TextEncoder().encode(xml).buffer,
        };
      }
      const bytes = new Uint8Array([0x49, 0x44, 0x33, 3]);
      return {
        status: 200,
        headers: { get: () => null },
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(bytes);
            controller.close();
          },
        }),
        arrayBuffer: async () => bytes.buffer,
      };
    };
    const subject = provider(fetch);
    const [variant] = await subject.getAudioVariants('7');
    const stream = await subject.openAudioStream('7', variant!.key, {});
    expect(
      new Uint8Array(await new Response(stream.stream).arrayBuffer()),
    ).toEqual(new Uint8Array([0x49, 0x44, 0x33, 3]));
    expect(linkHeaders?.authorization).toBeUndefined();
    expect(linkHeaders?.['Authorization']).toBeUndefined();
  });

  it('не считает внешний API-lookalike JSON operation и удаляет OAuth', async () => {
    let receivedHeaders: Record<string, string> | undefined;
    const transport = audioTransport(async (_url, init) => {
      receivedHeaders = init.headers;
      const xml =
        '<host>cdn.test</host><path>/audio</path><ts>1</ts><s>safe</s>';
      return {
        status: 200,
        headers: { get: () => null },
        arrayBuffer: async () => new TextEncoder().encode(xml).buffer,
      };
    });
    await expect(
      transport.fetch('https://external.invalid/tracks', {
        method: 'GET',
        headers: { Authorization: 'OAuth private-token' },
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({ status: 200 });
    expect(receivedHeaders?.Authorization).toBeUndefined();
  });

  it.each([
    [401, 'AUTH_ERROR'],
    [429, 'SERVICE_UNAVAILABLE'],
    [503, 'SERVICE_UNAVAILABLE'],
  ])('нормализует raw API HTTP %s до SDK', async (status, code) => {
    const fetch: AuthFetch = async () => response(status, { private: true });
    await expect(provider(fetch).getAudioVariants('7')).rejects.toMatchObject({
      code,
    });
  });

  it('следует одному HTTPS CDN redirect с тем же Range и signal', async () => {
    let firstCancelled = false;
    const calls: {
      url: string;
      range?: string;
      signal: AbortSignal;
      redirect?: string;
    }[] = [];
    const signal = new AbortController().signal;
    const fetch: AuthFetch = async (url, init) => {
      calls.push({
        url,
        range: init.headers.Range,
        signal: init.signal,
        redirect: init.redirect,
      });
      if (calls.length === 1)
        return {
          status: 302,
          headers: {
            get: (name) => (name === 'location' ? '/relocated-audio' : null),
          },
          body: new ReadableStream({
            cancel() {
              firstCancelled = true;
            },
          }),
          arrayBuffer: async () => new ArrayBuffer(0),
        };
      return response(200, {});
    };
    const result = await fetchAudioCdn(
      fetch,
      'https://cdn.test/original-audio',
      signal,
      8,
    );
    expect(result.status).toBe(200);
    expect(firstCancelled).toBe(true);
    expect(calls).toEqual([
      {
        url: 'https://cdn.test/original-audio',
        range: 'bytes=8-',
        signal,
        redirect: 'manual',
      },
      {
        url: 'https://cdn.test/relocated-audio',
        range: 'bytes=8-',
        signal,
        redirect: 'manual',
      },
    ]);
  });

  it.each([
    ['http://cdn.test/not-https', 1],
    ['https://user@cdn.test/private', 1],
  ])(
    'отклоняет unsafe redirect location без дополнительного запроса',
    async (location) => {
      let calls = 0;
      const fetch: AuthFetch = async () => {
        calls += 1;
        return {
          status: 302,
          headers: { get: (name) => (name === 'location' ? location : null) },
          body: new ReadableStream(),
          arrayBuffer: async () => new ArrayBuffer(0),
        };
      };
      await expect(
        fetchAudioCdn(
          fetch,
          'https://cdn.test/original-audio',
          new AbortController().signal,
        ),
      ).rejects.toMatchObject({ code: 'DOWNLOAD_ERROR' });
      expect(calls).toBe(1);
    },
  );

  it('отклоняет второй redirect без mirror fallback', async () => {
    let calls = 0;
    const fetch: AuthFetch = async () => {
      calls += 1;
      return {
        status: 302,
        headers: { get: () => 'https://cdn.test/next' },
        body: new ReadableStream(),
        arrayBuffer: async () => new ArrayBuffer(0),
      };
    };
    await expect(
      fetchAudioCdn(
        fetch,
        'https://cdn.test/original-audio',
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'DOWNLOAD_ERROR' });
    expect(calls).toBe(2);
  });

  it('расшифровывает разрешённый encraw поток без ключа в варианте', async () => {
    const key = '0123456789abcdef0123456789abcdef';
    const plain = new Uint8Array([0x66, 0x4c, 0x61, 0x43, 9]);
    const cipher = createCipheriv(
      'aes-128-ctr',
      Buffer.from(key, 'hex'),
      Buffer.alloc(16),
    );
    const encrypted = new Uint8Array(
      Buffer.concat([cipher.update(plain), cipher.final()]),
    );
    const fetch: AuthFetch = async (url) => {
      const path = new URL(url).pathname;
      if (path === '/tracks')
        return response(200, { result: [{ id: 7, available: true }] });
      if (path === '/tracks/7/download-info')
        return response(200, { result: [] });
      if (path === '/get-file-info')
        return response(200, {
          result: {
            downloadInfo: {
              codec: 'flac',
              transport: 'encraw',
              urls: ['https://cdn.test/encraw'],
              key,
              preview: false,
              bitrate: 0,
            },
          },
        });
      return {
        status: 200,
        headers: { get: () => null },
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(encrypted);
            controller.close();
          },
        }),
        arrayBuffer: async () => encrypted.buffer,
      };
    };
    const subject = provider(fetch);
    const [variant] = await subject.getAudioVariants('7');
    expect(variant).not.toHaveProperty('bitrate');
    expect(variant!.key).not.toContain(key);
    const stream = await subject.openAudioStream('7', variant!.key, {
      offset: 2,
    });
    expect(stream).toMatchObject({
      acceptsRanges: false,
      startOffset: 0,
      container: 'flac',
    });
    expect(
      new Uint8Array(await new Response(stream.stream).arrayBuffer()),
    ).toEqual(plain);
  });

  it('сохраняет точный Range offset и полный contentLength', async () => {
    const bytes = new Uint8Array([7, 8]);
    const stream = await createAudioStream(
      {
        status: 206,
        headers: {
          get: (name) =>
            name === 'content-range'
              ? 'bytes 2-3/6'
              : name === 'content-length'
                ? '2'
                : null,
        },
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(bytes);
            controller.close();
          },
        }),
        arrayBuffer: async () => bytes.buffer,
      },
      'mp3',
      2,
      new AbortController().signal,
    );
    expect(stream).toMatchObject({
      acceptsRanges: true,
      startOffset: 2,
      contentLength: 6,
    });
    expect(
      new Uint8Array(await new Response(stream.stream).arrayBuffer()),
    ).toEqual(bytes);
  });

  it('собирает разделённую сигнатуру контейнера без полного буфера', async () => {
    const chunks = [[0x49], [0x44], [0x33], [9]].map(
      (value) => new Uint8Array(value),
    );
    const stream = await createAudioStream(
      {
        status: 200,
        headers: { get: () => null },
        body: new ReadableStream({
          start(controller) {
            for (const chunk of chunks) controller.enqueue(chunk);
            controller.close();
          },
        }),
        arrayBuffer: async () => new ArrayBuffer(0),
      },
      'mp3',
      undefined,
      new AbortController().signal,
    );
    expect(
      new Uint8Array(await new Response(stream.stream).arrayBuffer()),
    ).toEqual(new Uint8Array([0x49, 0x44, 0x33, 9]));
  });

  it('не выдаёт partial length как полный размер и отменяет некогерентный ответ', async () => {
    const unknown = await createAudioStream(
      {
        status: 206,
        headers: {
          get: (name) =>
            name === 'content-range'
              ? 'bytes 2-3/*'
              : name === 'content-length'
                ? '2'
                : null,
        },
        body: new ReadableStream({
          start(controller) {
            controller.close();
          },
        }),
        arrayBuffer: async () => new ArrayBuffer(0),
      },
      'mp3',
      2,
      new AbortController().signal,
    );
    expect(unknown.contentLength).toBeUndefined();
    let cancelled = false;
    await expect(
      createAudioStream(
        {
          status: 206,
          headers: {
            get: (name) =>
              name === 'content-range'
                ? 'bytes 2-3/6'
                : name === 'content-length'
                  ? '3'
                  : null,
          },
          body: new ReadableStream({
            cancel() {
              cancelled = true;
            },
          }),
          arrayBuffer: async () => new ArrayBuffer(0),
        },
        'mp3',
        2,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'DOWNLOAD_ERROR' });
    expect(cancelled).toBe(true);
  });

  it('отменяет upstream при отмене во время чтения', async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([0x49, 0x44, 0x33]));
      },
      cancel() {
        cancelled = true;
      },
    });
    const controller = new AbortController();
    const stream = await createAudioStream(
      {
        status: 200,
        body,
        headers: { get: () => null },
        arrayBuffer: async () => new ArrayBuffer(0),
      },
      'mp3',
      undefined,
      controller.signal,
    );
    controller.abort();
    await expect(stream.stream.getReader().read()).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(cancelled).toBe(true);
  });

  it('после EOF снимает abort listener и не создаёт unhandled rejection', async () => {
    const controller = new AbortController();
    const bytes = new Uint8Array([0x49, 0x44, 0x33, 4]);
    const stream = await createAudioStream(
      {
        status: 200,
        headers: { get: () => null },
        body: new ReadableStream({
          start(body) {
            body.enqueue(bytes);
            body.close();
          },
        }),
        arrayBuffer: async () => bytes.buffer,
      },
      'mp3',
      undefined,
      controller.signal,
    );
    await new Response(stream.stream).arrayBuffer();
    const rejections: unknown[] = [];
    const capture = (reason: unknown) => rejections.push(reason);
    process.on('unhandledRejection', capture);
    try {
      controller.abort();
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(rejections).toEqual([]);
    } finally {
      process.off('unhandledRejection', capture);
    }
  });

  /** F-001: ошибка native body после prefix остаётся безопасной и освобождает reader.
   * @link ../../../../../planning/reviews/STEP-010/REVIEW-20261009T154741Z.md
   */
  it('нормализует ошибку native body после MP3 prefix и освобождает reader', async () => {
    let body!: ReadableStream<Uint8Array>;
    let prefixSent = false;
    const rawError = new TypeError('private signed-url-and-key');
    const fetch: AuthFetch = async (url) => {
      const path = new URL(url).pathname;
      if (path === '/tracks')
        return response(200, { result: [{ id: 7, available: true }] });
      if (path === '/tracks/7/download-info')
        return response(200, {
          result: [
            {
              codec: 'mp3',
              bitrateInKbps: 192,
              preview: false,
              downloadInfoUrl: 'https://link.test/error-link',
            },
          ],
        });
      if (path === '/get-file-info') return response(200, { result: {} });
      if (path === '/error-link') {
        const xml =
          '<host>cdn.test</host><path>/error-audio</path><ts>1</ts><s>safe</s>';
        return {
          status: 200,
          headers: { get: () => null },
          arrayBuffer: async () => new TextEncoder().encode(xml).buffer,
        };
      }
      body = new ReadableStream({
        pull(controller) {
          if (!prefixSent) {
            prefixSent = true;
            controller.enqueue(new Uint8Array([0x49, 0x44, 0x33, 5]));
            return;
          }
          controller.error(rawError);
        },
      });
      return {
        status: 200,
        headers: { get: () => null },
        body,
        arrayBuffer: async () => new ArrayBuffer(0),
      };
    };
    const subject = provider(fetch);
    const [variant] = await subject.getAudioVariants('7');
    const opened = await subject.openAudioStream('7', variant!.key, {});
    const reader = opened.stream.getReader();
    expect(await reader.read()).toMatchObject({
      done: false,
      value: new Uint8Array([0x49, 0x44, 0x33, 5]),
    });
    const error = await reader.read().catch((value) => value);
    expect(error).toMatchObject({ code: 'NETWORK_ERROR', retryable: true });
    expect(JSON.stringify(error)).not.toContain(rawError.message);
    expect(error.cause).toBeUndefined();
    expect(body.locked).toBe(false);
  });
});
