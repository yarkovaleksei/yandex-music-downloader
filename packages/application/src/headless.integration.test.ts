import fsPromises, { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from '@music-downloader/logging';
import { FileManifestStore } from '@music-downloader/persistence';
import {
  ProviderError,
  type JobManifestV1,
  type ManifestStore,
  type MusicProvider,
  type PlaylistTrack,
} from '@music-downloader/shared';
import { createApplication } from './index.js';

const sample = new Uint8Array(
  await readFile(
    new URL('../../core/validation/src/fixtures/sample.mp3', import.meta.url),
  ),
);
const cover = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL9LwAAAABJRU5ErkJggg==',
  'base64',
);
const token = 'step-026-token-marker';
const signedUrl =
  'https://cdn.example.test/audio?signature=step-026-signature-marker';

/** Теги меняют ID3, но не аудиокадры: сравнение доказывает целостность Range до и после processing. */
function audioPayload(bytes: Uint8Array): Buffer {
  const buffer = Buffer.from(bytes);
  const start =
    buffer.toString('ascii', 0, 3) === 'ID3'
      ? 10 +
        ((buffer[6]! & 0x7f) << 21) +
        ((buffer[7]! & 0x7f) << 14) +
        ((buffer[8]! & 0x7f) << 7) +
        (buffer[9]! & 0x7f)
      : 0;
  const end =
    buffer.toString('ascii', buffer.length - 128, buffer.length - 125) === 'TAG'
      ? buffer.length - 128
      : buffer.length;
  return buffer.subarray(start, end);
}

function containsTag(bytes: Buffer, text: string): boolean {
  return [
    Buffer.from(text),
    Buffer.from(text, 'utf16le'),
    Buffer.from(text, 'utf16le').swap16(),
  ].some((encoded) => bytes.includes(encoded));
}

type Kind = 'track' | 'album' | 'playlist';

/** REQ-042: локальный provider удерживает сценарии headless без HTTP и credential adapters. */
function offlineProvider(options: {
  readonly kind: Kind;
  readonly tracks?: readonly PlaylistTrack[];
  readonly failFirstOpen?: boolean;
  readonly interruptOnce?: boolean;
  readonly unavailable?: ReadonlySet<string>;
  readonly onOpen?: (id: string, offset: number) => void;
  readonly onVariants?: (id: string) => void;
  readonly onArtwork?: () => void;
  readonly prefixWritten?: () => Promise<void>;
  readonly stream?: (id: string) => ReadableStream<Uint8Array>;
}): MusicProvider {
  const tracks = options.tracks ?? [track(1, 'Трек')];
  let firstOpen = options.failFirstOpen === true;
  let interrupted = options.interruptOnce === true;
  const find = (id: string) =>
    tracks.find((item) => item.track.id === id)?.track;
  return {
    authenticate: async () => ({ id: 'offline', displayName: 'Offline' }),
    getAccount: async () => null,
    logout: async () => undefined,
    resolveUrl: async () => ({
      provider: 'offline',
      kind: options.kind,
      id: 'source',
    }),
    getTrack: async (id) => {
      const found = find(id) ?? track(1, 'Трек').track;
      return options.unavailable?.has(id) === true
        ? { ...found, availability: 'unavailable' as const }
        : found;
    },
    getAlbum: async () => ({
      id: 'album',
      title: 'Альбом',
      artists: [],
      tracks: tracks.map((item) => item.track),
    }),
    getPlaylist: async () => ({
      id: 'playlist',
      title: 'Плейлист',
      tracks: tracks.map((item) =>
        options.unavailable?.has(item.track.id) === true
          ? {
              ...item,
              track: { ...item.track, availability: 'unavailable' as const },
            }
          : item,
      ),
    }),
    getAudioVariants: async (id) => {
      options.onVariants?.(id);
      if (options.unavailable?.has(id) === true)
        throw new ProviderError('API_CHANGED', false);
      return [{ key: 'mp3', codec: 'mp3', container: 'mp3', lossless: false }];
    },
    openAudioStream: async (id, _variant, streamOptions) => {
      const offset = streamOptions.offset ?? 0;
      options.onOpen?.(id, offset);
      if (firstOpen) {
        firstOpen = false;
        throw new ProviderError(
          'NETWORK_ERROR',
          true,
          new Error(`${token} ${signedUrl}`),
        );
      }
      if (options.unavailable?.has(id) === true)
        throw new ProviderError('API_CHANGED', false);
      return {
        stream:
          options.stream?.(id) ??
          (interrupted
            ? interruptedStream(
                sample.subarray(offset),
                options.prefixWritten!,
                () => {
                  interrupted = false;
                },
              )
            : bytesStream(sample.subarray(offset))),
        contentLength: sample.byteLength,
        container: 'mp3',
        acceptsRanges: true,
        startOffset: offset,
      };
    },
    fetchArtwork: async () => {
      options.onArtwork?.();
      return { bytes: cover, mimeType: 'image/png' };
    },
  };
}

function bytesStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

/** REQ-020: первая попытка фиксирует prefix и рвётся внутри stream, затем core запрашивает Range. */
function interruptedStream(
  bytes: Uint8Array,
  prefixWritten: () => Promise<void>,
  complete: () => void,
): ReadableStream<Uint8Array> {
  return new ReadableStream({
    async start(controller) {
      controller.enqueue(bytes.subarray(0, 32));
      // Progress предшествует записи на диск; барьер подтверждает реальный prefix, а не длительность sleep.
      await prefixWritten();
      complete();
      controller.error(
        new ProviderError(
          'NETWORK_ERROR',
          true,
          new Error(`${token} ${signedUrl}`),
        ),
      );
    },
  });
}

function track(position: number, title: string): PlaylistTrack {
  return {
    position,
    track: {
      id: String(position),
      availability: 'available',
      title,
      artists: [{ id: 'artist', name: 'Автор' }],
      album: {
        id: 'original',
        title: 'Исходный альбом',
        artwork: { key: 'cover:fixture' },
      },
      artwork: { key: 'cover:fixture' },
    },
  };
}

/** REQ-020: Proxy делегирует настоящей session и подтверждает вызовы save.
 * Фактически записанные snapshots, включая progress flush, наблюдаются отдельно через rename. */
function captureStore(stateDir: string, saved: () => void): ManifestStore {
  const store = new FileManifestStore({ stateDir });
  return new Proxy(store, {
    get(target, property) {
      if (property !== 'acquire') {
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      }
      return async (...args: Parameters<ManifestStore['acquire']>) => {
        const session = await target.acquire(...args);
        return new Proxy(session, {
          get(sessionTarget, sessionProperty) {
            if (sessionProperty === 'save')
              return async (manifest: Parameters<typeof session.save>[0]) => {
                await sessionTarget.save(manifest);
                saved();
              };
            const value = Reflect.get(
              sessionTarget,
              sessionProperty,
              sessionTarget,
            );
            return typeof value === 'function'
              ? value.bind(sessionTarget)
              : value;
          },
        });
      };
    },
  });
}

describe('STEP-026: offline headless scenarios', () => {
  let root: string | undefined;
  let api: ReturnType<typeof createApplication> | undefined;
  let snapshots: JobManifestV1[] = [];
  let rawSnapshots: string[] = [];
  let logs: string[] = [];
  let events: string[] = [];
  let results: string[] = [];
  let saves = 0;
  let restore = () => undefined as void;
  let assertOffline = () => undefined as void;

  beforeEach(() => {
    snapshots = [];
    rawSnapshots = [];
    logs = [];
    events = [];
    results = [];
    saves = 0;
    const originalRename = fsPromises.rename;
    // Наблюдаем фактически записанные snapshots, включая отложенный progress и control receipts.
    // session.save остаётся настоящим и отдельно подтверждает, что proxy участвовал в тесте.
    fsPromises.rename = async (temporary, target) => {
      await originalRename(temporary, target);
      if (
        root !== undefined &&
        String(target).startsWith(path.join(root, 'state') + path.sep) &&
        path.basename(String(target)) === 'manifest.json'
      ) {
        const text = await readFile(target, 'utf8');
        rawSnapshots.push(text);
        snapshots.push(JSON.parse(text) as JobManifestV1);
      }
    };
    const fetchGuard = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('Сеть запрещена в STEP-026.');
    });
    const httpGuard = vi.spyOn(http, 'request').mockImplementation(() => {
      throw new Error('Сеть запрещена в STEP-026.');
    });
    const httpsGuard = vi.spyOn(https, 'request').mockImplementation(() => {
      throw new Error('Сеть запрещена в STEP-026.');
    });
    syncBuiltinESMExports();
    assertOffline = () => {
      expect(fetchGuard).not.toHaveBeenCalled();
      expect(httpGuard).not.toHaveBeenCalled();
      expect(httpsGuard).not.toHaveBeenCalled();
    };
    restore = () => {
      fsPromises.rename = originalRename;
      fetchGuard.mockRestore();
      httpGuard.mockRestore();
      httpsGuard.mockRestore();
      syncBuiltinESMExports();
    };
  });

  function observed(options: Parameters<typeof createApplication>[0]) {
    const actual = createApplication({
      ...options,
      manifestStore: captureStore(path.join(root!, 'state'), () => {
        saves++;
      }),
      logger: createLogger({
        level: 'trace',
        sink: (record) => logs.push(record),
      }),
    });
    actual.subscribe((event) => events.push(JSON.stringify(event)));
    return new Proxy(actual, {
      get(target, property) {
        const value: unknown = Reflect.get(target, property, target);
        if (typeof value !== 'function') return value;
        return (...args: unknown[]) => {
          const returned: unknown = Reflect.apply(value, target, args);
          if (!(returned instanceof Promise)) return returned;
          return returned.then((result: unknown) => {
            results.push(JSON.stringify(result));
            return result;
          });
        };
      },
    });
  }

  async function diskPrefix(trackIndex: number, bytes = 32) {
    let target = '';
    await expect
      .poll(
        async () => {
          target = snapshots.at(-1)?.tracks[trackIndex]?.partPath ?? '';
          try {
            return (
              target.length > 0 && (await readFile(target)).byteLength >= bytes
            );
          } catch {
            return false;
          }
        },
        { timeout: 5000, interval: 20 },
      )
      .toBe(true);
    expect(await readFile(target)).toEqual(
      Buffer.from(sample.subarray(0, bytes)),
    );
    return target;
  }

  async function validResults() {
    const final = snapshots.at(-1)!;
    for (const item of final.tracks.filter(
      (entry) => entry.status === 'completed',
    )) {
      expect(item.resultPath).toBeDefined();
      const output = await readFile(item.resultPath!);
      expect(audioPayload(output)).toEqual(audioPayload(sample));
      const expected = final.plan.tracks.find(
        (entry) => entry.trackKey === item.trackKey,
      )!.track;
      expect(containsTag(output, expected.title!)).toBe(true);
      expect(containsTag(output, 'Исходный альбом')).toBe(true);
      expect(output.includes(cover)).toBe(true);
      if (item.partPath !== undefined)
        await expect(readFile(item.partPath)).rejects.toMatchObject({
          code: 'ENOENT',
        });
    }
  }

  afterEach(async () => {
    try {
      await api?.shutdown();
      assertOffline();
      if (api !== undefined) {
        expect(saves).toBeGreaterThan(0);
        expect(snapshots.length).toBeGreaterThan(1);
        expect(events.length).toBeGreaterThan(0);
        expect(results.length).toBeGreaterThan(0);
        expect(
          snapshots.some((snapshot) =>
            snapshot.tracks.some((entry) =>
              ['queued', 'resolving', 'downloading', 'processing'].includes(
                entry.status,
              ),
            ),
          ),
        ).toBe(true);
        expect(
          snapshots
            .at(-1)!
            .tracks.every((entry) =>
              ['completed', 'failed', 'cancelled', 'skipped'].includes(
                entry.status,
              ),
            ),
        ).toBe(true);
        for (const surface of [
          ...logs,
          ...events,
          ...results,
          ...rawSnapshots,
        ]) {
          expect(surface).not.toContain(token);
          expect(surface).not.toContain(signedUrl);
        }
        expect(
          await new FileManifestStore({
            stateDir: path.join(root!, 'state'),
          }).readLeaseState(snapshots.at(-1)!.jobId),
        ).toBe('inactive');
      }
    } finally {
      restore();
      if (root !== undefined) await rm(root, { recursive: true, force: true });
      root = undefined;
      api = undefined;
    }
  });

  it.each(['track', 'album', 'playlist'] as const)(
    'single track, album и playlist: %s сохраняет валидный результат offline',
    async (kind) => {
      root = await mkdtemp(path.join(os.tmpdir(), 'step-026-happy-'));
      let artworkRequests = 0;
      api = observed({
        stateDir: path.join(root, 'state'),
        providerOverride: offlineProvider({
          kind,
          onArtwork: () => {
            artworkRequests++;
          },
          tracks: [track(1, 'Первый'), track(2, 'Второй')],
        }),
      });
      const result = await api.createDownload({
        source: { provider: 'offline', kind, id: 'source' },
        quality: 'best',
        destination: path.join(root, 'music'),
      });
      expect(result).toMatchObject({
        kind: 'result',
        data: { status: 'completed' },
      });
      if (result.kind === 'result')
        expect(result.data.tracks).toHaveLength(kind === 'track' ? 1 : 2);
      expect(
        await readdir(path.join(root, 'music'), { recursive: true }),
      ).toEqual(expect.arrayContaining([expect.stringMatching(/\.mp3$/u)]));
      await validResults();
      expect(artworkRequests).toBe(1);
      if (kind !== 'track') {
        const directory = path.dirname(
          snapshots.at(-1)!.tracks[0]!.resultPath!,
        );
        expect(await readFile(path.join(directory, 'cover.jpg'))).toEqual(
          cover,
        );
        if (kind === 'playlist') {
          expect(
            await readFile(path.join(directory, 'Плейлист.m3u8'), 'utf8'),
          ).toBe(
            snapshots
              .at(-1)!
              .tracks.map((item) => path.basename(item.resultPath!))
              .join('\n') + '\n',
          );
        }
      }
    },
    15_000,
  );

  it('network interruption сохраняет prefix и продолжает Range без сети', async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'step-026-interruption-'));
    const offsets: number[] = [];
    api = observed({
      stateDir: path.join(root, 'state'),
      providerOverride: offlineProvider({
        kind: 'track',
        interruptOnce: true,
        prefixWritten: () => diskPrefix(0).then(() => undefined),
        onOpen: (_id, offset) => offsets.push(offset),
      }),
    });
    await expect(
      api.createDownload({
        source: { provider: 'offline', kind: 'track', id: '1' },
        quality: 'best',
        destination: path.join(root, 'music'),
      }),
    ).resolves.toMatchObject({ kind: 'result', data: { status: 'completed' } });
    expect(offsets).toEqual([0, 32]);
    expect(snapshots.some((s) => s.tracks[0]?.status === 'retry_wait')).toBe(
      true,
    );
    expect(snapshots.at(-1)!.tracks[0]!.attempts).toBe(1);
    await validResults();
  }, 15_000);

  it('retry повторяет transient open без сети', async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'step-026-retry-'));
    const opens: number[] = [];
    api = observed({
      stateDir: path.join(root, 'state'),
      providerOverride: offlineProvider({
        kind: 'track',
        failFirstOpen: true,
        onOpen: (_id, offset) => opens.push(offset),
      }),
    });
    const result = await api.createDownload({
      source: { provider: 'offline', kind: 'track', id: '1' },
      quality: 'best',
      destination: path.join(root, 'music'),
    });
    expect(result).toMatchObject({
      kind: 'result',
      data: { status: 'completed', tracks: [{ status: 'completed' }] },
    });
    expect(opens).toEqual([0, 0]);
    expect(snapshots.some((s) => s.tracks[0]?.status === 'retry_wait')).toBe(
      true,
    );
    expect(snapshots.at(-1)!.tracks[0]!.attempts).toBe(1);
    await validResults();
  }, 15_000);

  it('partial failure сохраняет доступные позиции playlist', async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'step-026-partial-'));
    const requestedVariants: string[] = [];
    const opened: string[] = [];
    api = observed({
      stateDir: path.join(root, 'state'),
      providerOverride: offlineProvider({
        kind: 'playlist',
        tracks: [
          track(1, 'Первый'),
          track(2, 'Запрещённый'),
          track(3, 'Третий'),
        ],
        unavailable: new Set(['2']),
        onVariants: (id) => requestedVariants.push(id),
        onOpen: (id) => opened.push(id),
      }),
    });
    const result = await api.createDownload({
      source: { provider: 'offline', kind: 'playlist', id: 'source' },
      quality: 'best',
      destination: path.join(root, 'music'),
    });
    expect(result).toMatchObject({
      kind: 'result',
      data: {
        status: 'completed_with_errors',
        tracks: [
          { status: 'completed' },
          { status: 'failed' },
          { status: 'completed' },
        ],
      },
    });
    await expect(
      readFile(path.join(root, 'music', 'Плейлист', 'Плейлист.m3u8'), 'utf8'),
    ).resolves.toBe('01 - Автор - Первый.mp3\n03 - Автор - Третий.mp3\n');
    expect(requestedVariants.sort()).toEqual(['1', '3']);
    expect(opened.sort()).toEqual(['1', '3']);
    await validResults();
  }, 15_000);

  it('cancel удаляет незавершённый part после открытого потока', async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'step-026-cancel-'));
    let opened!: () => void;
    const open = new Promise<void>((resolve) => {
      opened = resolve;
    });
    api = observed({
      stateDir: path.join(root, 'state'),
      providerOverride: offlineProvider({
        kind: 'track',
        stream: () =>
          new ReadableStream({
            start(controller) {
              controller.enqueue(sample.subarray(0, 10));
              opened();
            },
          }),
      }),
    });
    let jobId = '';
    const unsubscribe = api.subscribe((event) => {
      if (event.event === 'job.created') jobId = event.jobId;
    });
    const pending = api.createDownload({
      source: { provider: 'offline', kind: 'track', id: '1' },
      quality: 'best',
      destination: path.join(root, 'music'),
    });
    await open;
    const part = await diskPrefix(0, 10);
    const unpublished = snapshots.at(-1)!.tracks[0]!.resultPath!;
    await expect(api.cancel(jobId)).resolves.toMatchObject({
      kind: 'result',
      data: { status: 'cancelled' },
    });
    await expect(pending).resolves.toMatchObject({
      kind: 'result',
      data: { status: 'cancelled' },
    });
    unsubscribe();
    await expect(readFile(part)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readFile(unpublished)).rejects.toMatchObject({
      code: 'ENOENT',
    });
    // Cancel освобождает владельца до teardown: shutdown не должен маскировать зависшую аренду.
    const store = new FileManifestStore({ stateDir: path.join(root, 'state') });
    await expect
      .poll(() => store.readLeaseState(jobId), { timeout: 5000, interval: 20 })
      .toBe('inactive');
  }, 15_000);

  it('скрывает тестовый секрет-маркер в logger, events и каждом manifest snapshot', async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'step-026-privacy-'));
    let faultReached = false;
    let accountFaultReached = false;
    const base = offlineProvider({ kind: 'track' });
    api = observed({
      stateDir: path.join(root, 'state'),
      providerOverride: {
        ...base,
        getAccount: async () => {
          accountFaultReached = true;
          throw new Error(`Authorization: Bearer ${token} ${signedUrl}`);
        },
        openAudioStream: async () => {
          faultReached = true;
          throw new Error(`Authorization: Bearer ${token} ${signedUrl}`);
        },
      },
    });
    const unsubscribe = api.subscribe((event) =>
      events.push(JSON.stringify(event)),
    );
    await expect(api.account()).resolves.toMatchObject({
      kind: 'error',
      error: { code: 'DOWNLOAD_ERROR' },
    });
    expect(accountFaultReached).toBe(true);
    const result = await api.createDownload({
      source: { provider: 'offline', kind: 'track', id: '1' },
      quality: 'best',
      destination: path.join(root, 'music'),
    });
    unsubscribe();
    const surface = [
      ...logs,
      ...events,
      ...rawSnapshots,
      JSON.stringify(result),
    ].join('\n');
    expect(faultReached).toBe(true);
    expect(logs.length).toBeGreaterThan(0);
    expect(result).toMatchObject({
      kind: 'result',
      data: { status: 'failed' },
    });
    expect(snapshots.length).toBeGreaterThan(1);
    expect(surface).not.toContain(token);
    expect(surface).not.toContain(signedUrl);
  }, 15_000);

  it('resume продолжает paused job новым facade с тем же FileManifestStore', async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'step-026-resume-'));
    let opened!: () => void;
    const open = new Promise<void>((resolve) => {
      opened = resolve;
    });
    const stream = () =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(sample.subarray(0, 10));
          opened();
        },
      });
    api = observed({
      stateDir: path.join(root, 'state'),
      providerOverride: offlineProvider({ kind: 'track', stream }),
    });
    let jobId = '';
    const unsubscribe = api.subscribe((event) => {
      if (event.event === 'job.created') jobId = event.jobId;
    });
    const pending = api.createDownload({
      source: { provider: 'offline', kind: 'track', id: '1' },
      quality: 'best',
      destination: path.join(root, 'music'),
    });
    await open;
    await diskPrefix(0, 10);
    await expect(api.pause(jobId)).resolves.toMatchObject({
      kind: 'result',
      data: { status: 'paused' },
    });
    await expect(pending).resolves.toMatchObject({
      kind: 'result',
      data: { status: 'paused' },
    });
    unsubscribe();
    await api.shutdown();
    api = observed({
      stateDir: path.join(root, 'state'),
      providerOverride: offlineProvider({ kind: 'track' }),
    });
    await expect(api.resume(jobId)).resolves.toMatchObject({
      kind: 'result',
      data: { status: 'running' },
    });
    await expect
      .poll(() => api!.getJob(jobId), { timeout: 5_000, interval: 20 })
      .toMatchObject({ kind: 'result', data: { status: 'completed' } });
    await validResults();
  }, 15_000);
});
