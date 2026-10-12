import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import type * as FsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as retryCore from '@music-downloader/core-retry';
import type { DecideRetryInput } from '@music-downloader/core-retry';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  currentLeaseIdentity,
  FileManifestStore,
} from '@music-downloader/persistence';
import type {
  AcquireOptions,
  JobManifestV1,
  LeaseSession,
  ManifestStore,
  MusicProvider,
} from '@music-downloader/shared';
import { createApplication } from './index.js';

const renameFixture = vi.hoisted(() => ({
  armed: false,
  injected: 0,
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromises>();
  return {
    ...actual,
    async rename(temporary: string, target: string) {
      if (
        renameFixture.armed &&
        renameFixture.injected === 0 &&
        target.endsWith('manifest.json')
      ) {
        renameFixture.injected += 1;
        throw Object.assign(new Error('Временная блокировка rename в тесте'), {
          code: 'EPERM',
        });
      }
      return actual.rename(temporary, target);
    },
  };
});

describe('STEP-045: команды двух application с общим stateDir', () => {
  let root: string;
  let appA: ReturnType<typeof createApplication> | undefined;
  let appB: ReturnType<typeof createApplication> | undefined;
  let running:
    | ReturnType<ReturnType<typeof createApplication>['createDownload']>
    | undefined;

  afterEach(async () => {
    await appA?.shutdown();
    await appB?.shutdown();
    await running;
    if (root !== undefined) await rm(root, { recursive: true, force: true });
    appA = undefined;
    appB = undefined;
    running = undefined;
  }, 30_000);

  /** Готовность доказывают открытый поток и настоящая active lease, без фиксированного sleep. */
  async function startOwner(timeoutAck = false) {
    root = await mkdtemp(path.join(os.tmpdir(), 'application-refusal-'));
    const stateDir = path.join(root, 'state');
    const store = new FileManifestStore({ stateDir });
    const provider: MusicProvider = {
      ...downloads(),
      openAudioStream: async () => ({
        stream: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array([1]));
          },
        }),
        contentLength: 2,
        container: 'mp3',
        acceptsRanges: true,
        startOffset: 0,
      }),
    };
    appA = createApplication({ stateDir, providerOverride: provider });
    appB = createApplication({
      stateDir,
      providerOverride: provider,
      ...(timeoutAck
        ? {
            manifestStore: {
              read: store.read.bind(store),
              readLeaseState: store.readLeaseState.bind(store),
              list: store.list.bind(store),
              create: store.create.bind(store),
              acquire: store.acquire.bind(store),
              sendControl: store.sendControl.bind(store),
              // STEP-045: только ожидание receipt заменено; inbox и живой owner остаются настоящими.
              waitControlAck: async () => undefined,
            },
          }
        : {}),
    });
    let jobId = '';
    appA.subscribe((event) => {
      if (event.event === 'job.created') jobId = event.jobId;
    });
    running = appA.createDownload({
      source: { provider: 'mock', kind: 'track', id: 'blocked' },
      quality: 'best',
      destination: path.join(root, 'music'),
    });
    await expect
      .poll(
        async () => {
          const result = await appB!.getJob(jobId);
          return (
            result.kind === 'result' &&
            result.data?.tracks[0]?.status === 'downloading' &&
            (await store.readLeaseState(jobId)) === 'active'
          );
        },
        { timeout: 30_000, interval: 10 },
      )
      .toBe(true);
    return { jobId, store };
  }

  function safeRefusal(result: unknown) {
    expect(JSON.stringify(result)).not.toMatch(
      /ownerToken|pid|hostname|cause|stack/,
    );
    expect(JSON.stringify(result)).not.toContain(root);
  }

  it('различает чужую живую аренду и отсутствующий job без утечки данных владельца', async () => {
    const { jobId } = await startOwner();
    const refusal = await appB!.resume(jobId);
    expect(refusal).toMatchObject({
      schemaVersion: 1,
      kind: 'error',
      error: {
        code: 'VALIDATION_ERROR',
        details: { reason: 'LEASE_HELD_BY_OTHER_OWNER' },
        retryable: false,
      },
    });
    safeRefusal(refusal);
    for (const command of ['resume', 'retry', 'cancel', 'pause'] as const) {
      const result = await appB![command]('missing-job');
      expect(result).toMatchObject({
        kind: 'error',
        error: {
          code: 'VALIDATION_ERROR',
          details: { reason: 'JOB_NOT_FOUND' },
          retryable: false,
        },
      });
      safeRefusal(result);
    }
    await expect(appB!.getJob('missing-job')).resolves.toMatchObject({
      kind: 'result',
      data: null,
    });
    expect(
      (await readdir(path.join(root, 'state'), { recursive: true })).join('\n'),
    ).not.toContain('missing-job');
  }, 60_000); // Нативная Windows-проверка identity входит в общий budget readiness и control.

  it('различает отсутствие подтверждения cancel, сохраняя запрос в inbox', async () => {
    const { jobId } = await startOwner(true);
    const refusal = await appB!.cancel(jobId);
    expect(refusal).toMatchObject({
      schemaVersion: 1,
      kind: 'error',
      error: {
        code: 'DOWNLOAD_ERROR',
        details: { reason: 'OWNER_ACK_TIMEOUT' },
        retryable: false,
      },
    });
    safeRefusal(refusal);
    // Таймаут отправителя не доказывает неприменение: живой owner продолжает обрабатывать inbox.
    await expect
      .poll(() => appA!.getJob(jobId), { timeout: 5000, interval: 10 })
      .toMatchObject({ kind: 'result', data: { status: 'cancelled' } });
  }, 60_000); // Нативная Windows-проверка identity входит в общий budget readiness и control.

  it('пересылает pause и resume paused job живому владельцу без lease-отказа', async () => {
    const { jobId, store } = await startOwner();
    const paused = await appB!.pause(jobId);
    expect(paused).toMatchObject({
      kind: 'result',
      data: { status: 'paused' },
    });
    expect(paused).not.toHaveProperty('error');
    expect(await store.readLeaseState(jobId)).toBe('active');
    const resumed = await appB!.resume(jobId);
    expect(resumed).toMatchObject({
      kind: 'result',
      data: { status: 'running' },
    });
    expect(resumed).not.toHaveProperty('error');
    // Успешные snapshots содержат публичный resultPath; запрет путей относится к отказам.
    expect(JSON.stringify([paused, resumed])).not.toMatch(
      /ownerToken|pid|hostname|cause|stack/,
    );
  }, 60_000);
});

describe('STEP-049: shutdown закрывающегося manager', () => {
  it('ждёт удерживаемый release после terminal resume и освобождает lease один раз', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'application-close-'));
    const stateDir = path.join(root, 'state');
    const store = new FileManifestStore({ stateDir });
    let seed: ReturnType<typeof createApplication> | undefined;
    let resumed: ReturnType<typeof createApplication> | undefined;
    let jobId = '';
    let unblockStream!: () => void;
    let streamPullStarted!: () => void;
    let releaseSession!: () => void;
    let releaseStarted!: () => void;
    let releaseCalls = 0;
    const blockedStream = new Promise<void>((resolve) => {
      unblockStream = resolve;
    });
    // Пауза начинается только после реального pull: это исключает гонку с job.created
    // в STEP-049 и сохраняет проверку прерывания уже запущенной загрузки.
    const streamPullObserved = new Promise<void>((resolve) => {
      streamPullStarted = resolve;
    });
    const releaseGate = new Promise<void>((resolve) => {
      releaseSession = resolve;
    });
    const releaseObserved = new Promise<void>((resolve) => {
      releaseStarted = resolve;
    });
    try {
      seed = createApplication({
        stateDir,
        providerOverride: {
          ...downloads(),
          openAudioStream: async () => ({
            stream: new ReadableStream<Uint8Array>({
              pull(controller) {
                controller.enqueue(validMp3.slice(0, 1));
                streamPullStarted();
                return blockedStream;
              },
              cancel() {
                unblockStream();
              },
            }),
            contentLength: validMp3.byteLength,
            container: 'mp3',
            acceptsRanges: true,
            startOffset: 0,
          }),
        },
      });
      seed.subscribe((event) => {
        if (event.event === 'job.created') jobId = event.jobId;
      });
      const initial = seed.createDownload({
        source: { provider: 'mock', kind: 'track', id: 'closing' },
        quality: 'best',
        destination: path.join(root, 'music'),
      });
      await expect
        .poll(() => jobId, { timeout: 5_000, interval: 10 })
        .not.toBe('');
      await streamPullObserved;
      await expect(seed.pause(jobId)).resolves.toMatchObject({
        kind: 'result',
        data: { status: 'paused' },
      });
      await expect(initial).resolves.toMatchObject({
        kind: 'result',
        data: { status: 'paused' },
      });
      await seed.shutdown();
      seed = undefined;

      const manifestStore: ManifestStore = {
        read: store.read.bind(store),
        readLeaseState: store.readLeaseState.bind(store),
        list: store.list.bind(store),
        create: store.create.bind(store),
        acquire: async (...args) => {
          const session = await store.acquire(...args);
          return Object.create(session, {
            release: {
              value: async () => {
                releaseCalls += 1;
                await session.release();
                releaseStarted();
                await releaseGate;
              },
            },
          }) as LeaseSession;
        },
        sendControl: store.sendControl.bind(store),
        waitControlAck: store.waitControlAck.bind(store),
      };
      resumed = createApplication({
        stateDir,
        manifestStore,
        providerOverride: downloads(),
      });
      await expect(resumed.resume(jobId)).resolves.toMatchObject({
        kind: 'result',
      });
      await expect
        .poll(() => store.read(jobId), { timeout: 5_000, interval: 10 })
        .toMatchObject({
          control: { state: 'running' },
          tracks: [{ status: 'completed' }],
        });
      await releaseObserved;

      let shutdownSettled = false;
      const shutdown = resumed.shutdown().then((result) => {
        shutdownSettled = true;
        return result;
      });
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(shutdownSettled).toBe(false);
      await expect(store.read(jobId)).resolves.toMatchObject({
        control: { state: 'running' },
      });
      releaseSession();
      await expect(shutdown).resolves.toMatchObject({ kind: 'result' });
      expect(releaseCalls).toBe(1);
    } finally {
      unblockStream?.();
      releaseSession?.();
      await seed?.shutdown();
      await resumed?.shutdown();
      await rm(root, { recursive: true, force: true });
    }
  }, 15_000);
});

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
const validMp3 = new Uint8Array(
  await readFile(
    new URL('../../core/validation/src/fixtures/sample.mp3', import.meta.url),
  ),
);

/**
 * Публичный providerOverride сохраняет проверку на границе createApplication:
 * filesystem, planner и manager остаются production-реализациями.
 */
function downloads(onOpen?: () => void): MusicProvider {
  return {
    authenticate: async () => ({ id: 'account', displayName: 'Тест' }),
    getAccount: async () => null,
    logout: async () => undefined,
    resolveUrl: async () => ({ provider: 'mock', kind: 'track', id: 'track' }),
    getTrack: async (id) => ({
      id,
      availability: 'available',
      title: `Трек ${id}`,
      artists: [],
    }),
    getAlbum: async () => ({
      id: 'album',
      title: 'Альбом',
      artists: [],
      tracks: [
        {
          id: 'album-track',
          availability: 'available',
          title: 'Трек',
          artists: [],
        },
      ],
    }),
    getPlaylist: async () => ({
      id: 'playlist',
      title: 'Список',
      tracks: [
        {
          position: 1,
          track: {
            id: 'playlist-track',
            availability: 'available',
            title: 'Трек',
            artists: [],
          },
        },
      ],
    }),
    getAudioVariants: async () => [
      { key: 'mp3', codec: 'mp3', container: 'mp3', lossless: false },
    ],
    openAudioStream: async () => {
      onOpen?.();
      return {
        stream: new ReadableStream<Uint8Array>({
          async start(controller) {
            await delay(15);
            controller.enqueue(validMp3);
            controller.close();
          },
        }),
        contentLength: validMp3.byteLength,
        container: 'mp3',
        acceptsRanges: true,
        startOffset: 0,
      };
    },
    fetchArtwork: async () => ({
      bytes: new Uint8Array(),
      mimeType: 'image/png',
    }),
  };
}

describe('ApplicationApi: интеграция публичного фасада', () => {
  it('загружает track, album и playlist в реальную файловую систему', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'application-facade-'));
    let api: ReturnType<typeof createApplication> | undefined;
    try {
      api = createApplication({
        stateDir: path.join(root, 'state'),
        providerOverride: downloads(),
      });
      for (const kind of ['track', 'album', 'playlist'] as const) {
        const result = await api.createDownload({
          source: { provider: 'mock', kind, id: kind },
          quality: 'best',
          destination: path.join(root, kind),
        });
        expect(result).toMatchObject({
          kind: 'result',
          data: { status: 'completed' },
        });
        expect(
          await readdir(path.join(root, kind), { recursive: true }),
        ).toEqual(expect.arrayContaining([expect.stringMatching(/\.mp3$/)]));
      }
    } finally {
      await api?.shutdown();
      await rm(root, { recursive: true, force: true });
    }
  }, 15_000);

  it('сохраняет разные позиции playlist с одинаковыми metadata в разные файлы', async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), 'application-collision-'),
    );
    const opened: string[] = [];
    let api: ReturnType<typeof createApplication> | undefined;
    try {
      api = createApplication({
        stateDir: path.join(root, 'state'),
        providerOverride: {
          ...downloads(),
          getPlaylist: async () => ({
            id: 'p',
            title: 'P',
            tracks: [1, 2].map((position) => ({
              position,
              track: {
                id: String(position),
                availability: 'available' as const,
                title: 'Одинаково',
                artists: [{ id: 'a', name: 'Автор' }],
              },
            })),
          }),
          openAudioStream: async (id) => ({
            stream: new ReadableStream<Uint8Array>({
              start(c) {
                opened.push(id);
                c.enqueue(validMp3);
                c.close();
              },
            }),
            contentLength: validMp3.byteLength,
            container: 'mp3',
            acceptsRanges: true,
            startOffset: 0,
          }),
        },
      });
      const result = await api.createDownload({
        source: { provider: 'mock', kind: 'playlist', id: 'p' },
        quality: 'best',
        destination: path.join(root, 'music'),
      });
      expect(result).toMatchObject({
        kind: 'result',
        data: { tracks: [{ status: 'completed' }, { status: 'completed' }] },
      });
      if (result.kind === 'result')
        expect(result.data.tracks[0]?.resultPath).not.toBe(
          result.data.tracks[1]?.resultPath,
        );
      // Параллельные потоки могут открываться в любом порядке; каждый трек должен открыться ровно один раз.
      expect([...opened].sort()).toEqual(['1', '2']);
    } finally {
      await api?.shutdown();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('сохраняет длинное имя single track в бюджете core layout', async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), 'application-long-name-'),
    );
    let api: ReturnType<typeof createApplication> | undefined;
    try {
      api = createApplication({
        stateDir: path.join(root, 'state'),
        providerOverride: {
          ...downloads(),
          getTrack: async () => ({
            id: 'long',
            availability: 'available' as const,
            title: 'A'.repeat(300),
            artists: [],
          }),
        },
      });
      await expect(
        api.createDownload({
          source: { provider: 'mock', kind: 'track', id: 'long' },
          quality: 'best',
          destination: path.join(root, 'music'),
        }),
      ).resolves.toMatchObject({
        kind: 'result',
        data: { status: 'completed' },
      });
    } finally {
      await api?.shutdown();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('pause сохраняет part, а новый фасад продолжает job через реальный второй store', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'application-resume-'));
    let jobId: string | undefined;
    let first: ReturnType<typeof createApplication> | undefined;
    let secondFacade: ReturnType<typeof createApplication> | undefined;
    let resumed: ReturnType<typeof createApplication> | undefined;
    let started!: () => void;
    let releaseThirdChunk!: () => void;
    let releaseStream!: () => void;
    const startedStream = new Promise<void>((resolve) => {
      started = resolve;
    });
    const thirdChunkGate = new Promise<void>((resolve) => {
      releaseThirdChunk = resolve;
    });
    const blockedStream = new Promise<void>((resolve) => {
      releaseStream = resolve;
    });
    try {
      first = createApplication({
        stateDir: path.join(root, 'state'),
        providerOverride: {
          ...downloads(),
          openAudioStream: async () => ({
            stream: new ReadableStream<Uint8Array>({
              async start(controller) {
                controller.enqueue(validMp3.slice(0, 2));
                started();
                await thirdChunkGate;
                controller.enqueue(validMp3.slice(2, 3));
                await blockedStream;
              },
              cancel() {
                releaseStream();
              },
            }),
            contentLength: validMp3.byteLength,
            container: 'mp3',
            acceptsRanges: true,
            startOffset: 0,
          }),
        },
      });
      first.subscribe((event) => {
        if (event.event === 'job.created') jobId = event.jobId;
      });
      const pending = first.createDownload({
        source: { provider: 'mock', kind: 'track', id: 'resume' },
        quality: 'best',
        destination: path.join(root, 'music'),
      });
      await startedStream;
      expect(jobId).toBeDefined();
      const observer = new FileManifestStore({
        stateDir: path.join(root, 'state'),
      });
      await expect
        .poll(async () => (await observer.read(jobId!))?.tracks[0]?.partPath, {
          timeout: 5_000,
          interval: 20,
        })
        .toBeTypeOf('string');
      const partPath = (await observer.read(jobId!))!.tracks[0]!.partPath!;
      // ENOENT допустим только до первого checkpoint; остальные ошибки чтения остаются видимыми.
      await expect
        .poll(
          async () => {
            try {
              return await readFile(partPath);
            } catch (error: unknown) {
              if ((error as NodeJS.ErrnoException).code === 'ENOENT')
                return undefined;
              throw error;
            }
          },
          { timeout: 5_000, interval: 20 },
        )
        .toEqual(Buffer.from(validMp3.slice(0, 2)));
      expect(await observer.readLeaseState(jobId!)).toBe('active');
      secondFacade = createApplication({
        stateDir: path.join(root, 'state'),
        providerOverride: downloads(),
      });
      await expect(secondFacade.getJob(jobId!)).resolves.toMatchObject({
        kind: 'result',
        data: { status: 'running' },
      });
      await expect(secondFacade.listJobs()).resolves.toMatchObject({
        kind: 'result',
        data: [{ jobId, status: 'running' }],
      });
      // Третий chunk разрешён только после read-only наблюдения другого facade.
      releaseThirdChunk();
      await expect
        .poll(() => readFile(partPath), { timeout: 5_000, interval: 20 })
        .toEqual(Buffer.from(validMp3.slice(0, 3)));
      await expect(secondFacade.pause(jobId!)).resolves.toMatchObject({
        kind: 'result',
        data: { status: 'paused' },
      });
      // Remote receipt не обещает release; его подтверждает shutdown владельца.
      expect(await observer.readLeaseState(jobId!)).toBe('active');
      await expect(first.shutdown()).resolves.toMatchObject({ kind: 'result' });
      await expect(pending).resolves.toMatchObject({
        kind: 'result',
        data: { status: 'paused' },
      });
      const paused = await observer.read(jobId!);
      expect(paused?.tracks[0]?.partPath).toBeDefined();
      expect(await readFile(paused!.tracks[0]!.partPath!)).toEqual(
        Buffer.from(validMp3.slice(0, 3)),
      );
      await expect(first.getJob(jobId!)).resolves.toMatchObject({
        kind: 'result',
        data: { status: 'paused' },
      });
      expect(await observer.readLeaseState(jobId!)).toBe('inactive');
      // F-003: внешний повреждённый result появился до resumed finalization.
      await writeFile(paused!.tracks[0]!.resultPath!, 'not audio');
      await expect(readFile(paused!.tracks[0]!.resultPath!)).resolves.toEqual(
        Buffer.from('not audio'),
      );

      resumed = createApplication({
        stateDir: path.join(root, 'state'),
        providerOverride: {
          ...downloads(),
          openAudioStream: async (_id, _variant, options) => ({
            stream: new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(validMp3.slice(options.offset ?? 0));
                controller.close();
              },
            }),
            contentLength: validMp3.byteLength,
            container: 'mp3',
            acceptsRanges: true,
            startOffset: options.offset ?? 0,
          }),
        },
      });
      await expect(resumed.resume(jobId!)).resolves.toMatchObject({
        kind: 'result',
        data: { status: 'running' },
      });
      await expect
        .poll(() => resumed!.getJob(jobId!), { timeout: 5_000, interval: 20 })
        .toMatchObject({ kind: 'result', data: { status: 'completed' } });
      await expect(
        readFile(paused!.tracks[0]!.resultPath!),
      ).resolves.not.toEqual(Buffer.from('not audio'));
    } finally {
      releaseThirdChunk?.();
      releaseStream?.();
      await first?.shutdown();
      await resumed?.shutdown();
      await secondFacade?.shutdown();
      await rm(root, { recursive: true, force: true });
    }
  }, 15_000);

  it('передаёт skip и overwrite policy manager без потери request options', async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), 'application-overwrite-'),
    );
    let api: ReturnType<typeof createApplication> | undefined;
    try {
      api = createApplication({
        stateDir: path.join(root, 'state'),
        providerOverride: downloads(),
      });
      const request = {
        source: { provider: 'mock', kind: 'track' as const, id: 'policy' },
        quality: 'best' as const,
        destination: path.join(root, 'music'),
      };
      await expect(api.createDownload(request)).resolves.toMatchObject({
        kind: 'result',
        data: { status: 'completed', tracks: [{ status: 'completed' }] },
      });
      await expect(api.createDownload(request)).resolves.toMatchObject({
        kind: 'result',
        data: { status: 'completed', tracks: [{ status: 'skipped' }] },
      });
      await expect(
        api.createDownload({ ...request, overwrite: true }),
      ).resolves.toMatchObject({
        kind: 'result',
        data: { status: 'completed', tracks: [{ status: 'completed' }] },
      });
    } finally {
      await api?.shutdown();
      await rm(root, { recursive: true, force: true });
    }
  }, 15_000);

  it('не объявляет completed для EOF раньше contentLength', async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), 'application-truncated-'),
    );
    let api: ReturnType<typeof createApplication> | undefined;
    let streamOpens = 0;
    // Проверяем EOF и все пять отказов, не длительность случайного backoff.
    // Ускоряем только ожидания: классификация ошибок и файловая запись остаются настоящими.
    const decideRetry = retryCore.decideRetry;
    const retry = vi
      .spyOn(retryCore, 'decideRetry')
      .mockImplementation((input: DecideRetryInput) =>
        decideRetry({
          ...input,
          config: {
            ...input.config,
            baseDelayMs: 1,
            factor: 2,
            maxDelayMs: 16,
            maxAttempts: 5,
          },
          random: () => 0,
        }),
      );
    try {
      api = createApplication({
        stateDir: path.join(root, 'state'),
        providerOverride: {
          ...downloads(),
          openAudioStream: async () => {
            streamOpens += 1;
            return {
              stream: new ReadableStream<Uint8Array>({
                start(controller) {
                  controller.enqueue(new Uint8Array([1, 2]));
                  controller.close();
                },
              }),
              contentLength: 4,
              container: 'mp3',
              acceptsRanges: true,
              startOffset: 0,
            };
          },
        },
      });
      await expect(
        api.createDownload({
          source: { provider: 'mock', kind: 'track', id: 'truncated' },
          quality: 'best',
          destination: path.join(root, 'music'),
        }),
      ).resolves.toMatchObject({
        kind: 'result',
        data: { status: 'failed', tracks: [{ status: 'failed' }] },
      });
      expect(streamOpens).toBe(5);
      expect(
        (await readdir(root, { recursive: true })).filter((name) =>
          name.endsWith('.mp3'),
        ),
      ).toEqual([]);
    } finally {
      retry.mockRestore();
      await api?.shutdown();
      await rm(root, { recursive: true, force: true });
    }
  }, 20_000);

  it('не запускает metadata и не создаёт result, когда initial baseline отвергает реальные bytes', async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), 'application-validation-initial-'),
    );
    let api: ReturnType<typeof createApplication> | undefined;
    const metadata = vi.fn();
    try {
      api = createApplication({
        stateDir: path.join(root, 'state'),
        providerOverride: {
          ...downloads(),
          openAudioStream: async () => ({
            stream: new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(new Uint8Array([0, 1, 2]));
                controller.close();
              },
            }),
            contentLength: 3,
            container: 'mp3',
            acceptsRanges: true,
            startOffset: 0,
          }),
        },
        processing: { metadata },
      });
      await expect(
        api.createDownload({
          source: { provider: 'mock', kind: 'track', id: 'initial-invalid' },
          quality: 'best',
          destination: path.join(root, 'music'),
        }),
      ).resolves.toMatchObject({
        kind: 'result',
        data: { status: 'failed', tracks: [{ status: 'failed' }] },
      });
      expect(metadata).not.toHaveBeenCalled();
      expect(
        (await readdir(root, { recursive: true })).filter((name) =>
          name.endsWith('.mp3'),
        ),
      ).toEqual([]);
    } finally {
      await api?.shutdown();
      await rm(root, { recursive: true, force: true });
    }
  }, 15_000);

  it('сохраняет старый result, когда metadata портит part после initial baseline', async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), 'application-validation-final-'),
    );
    const stateDir = path.join(root, 'state');
    const request = {
      source: { provider: 'mock', kind: 'track' as const, id: 'final-invalid' },
      quality: 'best' as const,
      destination: path.join(root, 'music'),
    };
    let seed: ReturnType<typeof createApplication> | undefined;
    let api: ReturnType<typeof createApplication> | undefined;
    try {
      seed = createApplication({ stateDir, providerOverride: downloads() });
      const completed = await seed.createDownload(request);
      expect(completed).toMatchObject({
        kind: 'result',
        data: { status: 'completed' },
      });
      if (completed.kind !== 'result') throw new Error('Ожидался result.');
      const resultPath = completed.data.tracks[0]?.resultPath;
      if (resultPath === undefined) throw new Error('Отсутствует resultPath.');
      const oldResult = await readFile(resultPath);
      await seed.shutdown();
      seed = undefined;

      api = createApplication({
        stateDir,
        providerOverride: downloads(),
        processing: {
          // @link ../../../../planning/reviews/STEP-023/REVIEW-20261011T141250Z.md F-005
          // Повреждение после initial baseline обязано остановить final validate до rename.
          metadata: async (partPath) => writeFile(partPath, 'not audio'),
        },
      });
      await expect(
        api.createDownload({ ...request, overwrite: true }),
      ).resolves.toMatchObject({
        kind: 'result',
        data: { status: 'failed', tracks: [{ status: 'failed' }] },
      });
      await expect(readFile(resultPath)).resolves.toEqual(oldResult);
    } finally {
      await seed?.shutdown();
      await api?.shutdown();
      await rm(root, { recursive: true, force: true });
    }
  }, 15_000);

  it('восстанавливает processing checkpoint только при точном final-файле', async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), 'application-checkpoint-'),
    );
    const stateDir = path.join(root, 'state');
    const store = new FileManifestStore({ stateDir });
    const facades: ReturnType<typeof createApplication>[] = [];
    const source = {
      provider: 'mock',
      kind: 'track' as const,
      id: 'checkpoint',
    };
    const seed = async (jobId: string, resultPath: string, size: number) => {
      const now = '2026-01-01T00:00:00.000Z';
      const manifest: JobManifestV1 = {
        version: 1,
        jobId,
        provider: 'mock',
        source,
        quality: 'best',
        destination: root,
        control: { state: 'paused' },
        createdAt: now,
        updatedAt: now,
        plan: {
          source,
          title: 'Трек',
          tracks: [
            {
              position: 1,
              trackKey: '1',
              track: {
                id: 'checkpoint',
                availability: 'available',
                title: 'Трек',
                artists: [],
              },
            },
          ],
        },
        tracks: [
          {
            position: 1,
            trackKey: '1',
            status: 'processing',
            attempts: 1,
            history: [],
            updatedAt: now,
            partPath: `${resultPath}.part`,
            resultPath,
            partial: {
              bytes: size,
              expectedSize: size,
              variantKey: 'mp3',
              tagged: true,
            },
            postProcessing: { size },
          },
        ],
      };
      await store.create(manifest);
    };
    try {
      const valid = path.join(root, 'valid.mp3');
      await writeFile(valid, new Uint8Array([1, 2, 3]));
      await seed('valid', valid, 3);
      const api = createApplication({
        stateDir,
        providerOverride: downloads(),
      });
      facades.push(api);
      await expect(api.resume('valid')).resolves.toMatchObject({
        kind: 'result',
        data: { status: 'completed' },
      });
      for (const [jobId, suffix] of [
        ['absent', 'missing.mp3'],
        ['directory', 'directory'],
        ['mismatch', 'mismatch.mp3'],
      ] as const) {
        const result = path.join(root, suffix);
        if (jobId === 'directory')
          await (await import('node:fs/promises')).mkdir(result);
        if (jobId === 'mismatch') await writeFile(result, new Uint8Array([1]));
        await seed(jobId, result, 3);
        const negative = createApplication({
          stateDir,
          providerOverride: {
            ...downloads(),
            getAudioVariants: async () => [],
          },
        });
        facades.push(negative);
        await expect(negative.resume(jobId)).resolves.toMatchObject({
          kind: 'result',
          data: { status: 'queued', tracks: [{ status: 'queued' }] },
        });
      }
    } finally {
      await Promise.all(facades.map((facade) => facade.shutdown()));
      await rm(root, { recursive: true, force: true });
    }
  }, 15_000);

  it('проводит retry, cancel и AUTH_REQUIRED resume через public facade', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'application-controls-'));
    const request = (id: string) => ({
      source: { provider: 'mock', kind: 'track' as const, id },
      quality: 'best' as const,
      destination: path.join(root, id),
    });
    let retryApi: ReturnType<typeof createApplication> | undefined;
    let cancelApi: ReturnType<typeof createApplication> | undefined;
    let authApi: ReturnType<typeof createApplication> | undefined;
    try {
      let retryMode: 'fail' | 'ready' = 'fail';
      retryApi = createApplication({
        stateDir: path.join(root, 'retry-state'),
        providerOverride: {
          ...downloads(),
          openAudioStream: async () => {
            if (retryMode === 'fail') throw { status: 404 };
            return await downloads().openAudioStream('retry', 'mp3', {});
          },
        },
      });
      const failed = await retryApi.createDownload(request('retry'));
      expect(failed).toMatchObject({
        kind: 'result',
        data: { status: 'failed' },
      });
      const failedId = failed.kind === 'result' ? failed.data.jobId : '';
      retryMode = 'ready';
      await expect(retryApi.retry(failedId)).resolves.toMatchObject({
        kind: 'result',
        data: { status: 'queued' },
      });
      await expect
        .poll(() => retryApi!.getJob(failedId), {
          timeout: 5_000,
          interval: 20,
        })
        .toMatchObject({ kind: 'result', data: { status: 'completed' } });

      let cancelId = '';
      // job.created предшествует захвату аренды: cancel проверяется на уже открытом потоке.
      let streamReady!: () => void;
      const opened = new Promise<void>((resolve) => {
        streamReady = resolve;
      });
      cancelApi = createApplication({
        stateDir: path.join(root, 'cancel-state'),
        providerOverride: {
          ...downloads(),
          openAudioStream: async () => ({
            stream: new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(new Uint8Array([1]));
                streamReady();
              },
            }),
            contentLength: 2,
            container: 'mp3',
            acceptsRanges: true,
            startOffset: 0,
          }),
        },
      });
      cancelApi.subscribe((event) => {
        if (event.event === 'job.created') cancelId = event.jobId;
      });
      const cancelling = cancelApi.createDownload(request('cancel'));
      await opened;
      await expect(cancelApi.cancel(cancelId)).resolves.toMatchObject({
        kind: 'result',
        data: { status: 'cancelled' },
      });
      await expect(cancelling).resolves.toMatchObject({
        kind: 'result',
        data: { status: 'cancelled' },
      });

      let authenticated = false;
      authApi = createApplication({
        stateDir: path.join(root, 'auth-state'),
        providerOverride: {
          ...downloads(),
          getAccount: async () =>
            authenticated ? { id: 'account', displayName: 'Тест' } : null,
          openAudioStream: async () => {
            if (!authenticated) throw { status: 401 };
            return downloads().openAudioStream('auth', 'mp3', {});
          },
        },
      });
      const paused = await authApi.createDownload(request('auth'));
      expect(paused).toMatchObject({
        kind: 'result',
        data: { status: 'paused', pauseReason: 'AUTH_REQUIRED' },
      });
      const authId = paused.kind === 'result' ? paused.data.jobId : '';
      authenticated = true;
      await expect(authApi.resume(authId)).resolves.toMatchObject({
        kind: 'result',
        data: { status: 'queued' },
      });
      await expect
        .poll(() => authApi!.getJob(authId), { timeout: 5_000, interval: 20 })
        .toMatchObject({ kind: 'result', data: { status: 'completed' } });
    } finally {
      await Promise.all([
        retryApi?.shutdown(),
        cancelApi?.shutdown(),
        authApi?.shutdown(),
      ]);
      await rm(root, { recursive: true, force: true });
    }
  }, 20_000);

  it('делит scheduler между job и сохраняет границу подписок экземпляра', async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), 'application-scheduler-'),
    );
    let opened = 0;
    let api: ReturnType<typeof createApplication> | undefined;
    let other: ReturnType<typeof createApplication> | undefined;
    try {
      api = createApplication({
        stateDir: path.join(root, 'state'),
        providerOverride: downloads(() => {
          opened += 1;
        }),
        concurrency: 1,
      });
      const received = new Map<string, number[]>();
      // Мутация одного transport-клиента не должна менять DTO следующего клиента.
      api.subscribe((event) => {
        (event as { seq: number }).seq = 0;
      });
      const unsubscribe = api.subscribe((event) => {
        const values = received.get(event.jobId) ?? [];
        values.push(event.seq);
        received.set(event.jobId, values);
      });
      const first = api.createDownload({
        source: { provider: 'mock', kind: 'track', id: 'first' },
        quality: 'best',
        destination: path.join(root, 'first'),
      });
      const second = api.createDownload({
        source: { provider: 'mock', kind: 'track', id: 'second' },
        quality: 'best',
        destination: path.join(root, 'second'),
      });
      await expect(Promise.all([first, second])).resolves.toEqual(
        expect.arrayContaining([expect.objectContaining({ kind: 'result' })]),
      );
      unsubscribe();
      expect(opened).toBe(2);
      for (const values of received.values())
        expect(values).toEqual([...values].sort((left, right) => left - right));
      expect([...received.values()].flat()).not.toContain(0);
      const isolated: number[] = [];
      other = createApplication({
        stateDir: path.join(root, 'other'),
        providerOverride: downloads(),
      });
      other.subscribe((event) => isolated.push(event.seq));
      await other.createDownload({
        source: { provider: 'mock', kind: 'track', id: 'other' },
        quality: 'best',
        destination: path.join(root, 'other-music'),
      });
      expect(isolated[0]).toBe(1);
    } finally {
      await api?.shutdown();
      await other?.shutdown();
      await rm(root, { recursive: true, force: true });
    }
  }, 15_000);

  it('STEP-044: завершает загрузку после одного Windows EPERM публикации manifest', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'application-rename-'));
    const stateDir = path.join(root, 'state');
    let api: ReturnType<typeof createApplication> | undefined;
    let restorePlatform: PropertyDescriptor | undefined;
    renameFixture.armed = false;
    renameFixture.injected = 0;
    try {
      // Native binding и host identity получены до win32 fixture; acquire остаётся настоящим.
      const identity = await currentLeaseIdentity();
      const store = new FileManifestStore({ stateDir });
      const manifestStore: ManifestStore = {
        read: store.read.bind(store),
        readLeaseState: store.readLeaseState.bind(store),
        list: store.list.bind(store),
        create: store.create.bind(store),
        acquire: (jobId: string, options: AcquireOptions) =>
          store.acquire(jobId, { ...options, identity }),
        sendControl: store.sendControl.bind(store),
        waitControlAck: store.waitControlAck.bind(store),
      };
      restorePlatform = Object.getOwnPropertyDescriptor(process, 'platform');
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        configurable: true,
      });
      api = createApplication({
        stateDir,
        manifestStore,
        providerOverride: {
          ...downloads(),
          getAudioVariants: async () => {
            renameFixture.armed = true;
            return [
              {
                key: 'mp3',
                codec: 'mp3',
                container: 'mp3',
                lossless: false,
              },
            ];
          },
          openAudioStream: async () => ({
            stream: new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(validMp3);
                controller.close();
              },
            }),
            contentLength: validMp3.byteLength,
            container: 'mp3',
            acceptsRanges: true,
            startOffset: 0,
          }),
        },
      });
      const result = await api.createDownload({
        source: { provider: 'mock', kind: 'track', id: 'rename' },
        quality: 'best',
        destination: path.join(root, 'music'),
      });
      expect(renameFixture.injected).toBe(1);
      expect(result).toMatchObject({
        kind: 'result',
        data: { status: 'completed', tracks: [{ status: 'completed' }] },
      });
      if (result.kind !== 'result')
        throw new Error('Ожидался результат загрузки.');
      const resultPath = result.data.tracks[0]?.resultPath;
      expect(resultPath).toBeTypeOf('string');
      expect(await readFile(resultPath!)).toEqual(Buffer.from(validMp3));
      const jobId = result.data.jobId;
      await expect(api.shutdown()).resolves.toMatchObject({ kind: 'result' });
      api = undefined;
      expect(
        await new FileManifestStore({ stateDir }).readLeaseState(jobId),
      ).toBe('inactive');
    } finally {
      renameFixture.armed = false;
      if (restorePlatform !== undefined)
        Object.defineProperty(process, 'platform', restorePlatform);
      await api?.shutdown();
      await rm(root, { recursive: true, force: true });
    }
  }, 15_000);
});
