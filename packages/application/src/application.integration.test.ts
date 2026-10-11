import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FileManifestStore } from '@music-downloader/persistence';
import type { JobManifestV1, MusicProvider } from '@music-downloader/shared';
import { createApplication } from './index.js';

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

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
            controller.enqueue(new Uint8Array([1, 2, 3]));
            controller.close();
          },
        }),
        contentLength: 3,
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
    try {
      const api = createApplication({
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
      await rm(root, { recursive: true, force: true });
    }
  }, 15_000);

  it('сохраняет разные позиции playlist с одинаковыми metadata в разные файлы', async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), 'application-collision-'),
    );
    const opened: string[] = [];
    try {
      const api = createApplication({
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
                c.enqueue(new Uint8Array([Number(id)]));
                c.close();
              },
            }),
            contentLength: 1,
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
      await rm(root, { recursive: true, force: true });
    }
  });

  it('сохраняет длинное имя single track в бюджете core layout', async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), 'application-long-name-'),
    );
    try {
      const api = createApplication({
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
      await rm(root, { recursive: true, force: true });
    }
  });

  it('pause сохраняет part, а новый фасад продолжает job через реальный второй store', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'application-resume-'));
    let jobId: string | undefined;
    let started!: () => void;
    let releaseStream!: () => void;
    const startedStream = new Promise<void>((resolve) => {
      started = resolve;
    });
    const blockedStream = new Promise<void>((resolve) => {
      releaseStream = resolve;
    });
    try {
      const first = createApplication({
        stateDir: path.join(root, 'state'),
        providerOverride: {
          ...downloads(),
          openAudioStream: async () => ({
            stream: new ReadableStream<Uint8Array>({
              async start(controller) {
                controller.enqueue(new Uint8Array([1, 2]));
                started();
                await delay(30);
                controller.enqueue(new Uint8Array([3]));
                await blockedStream;
              },
              cancel() {
                releaseStream();
              },
            }),
            contentLength: 4,
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
      let partPath: string | undefined;
      for (let attempts = 0; attempts < 30; attempts += 1) {
        partPath = (await observer.read(jobId!))?.tracks[0]?.partPath;
        if (partPath !== undefined) {
          try {
            if ((await readFile(partPath)).length > 0) break;
          } catch {
            // Writer ещё не создал файл; pause проверяем только после checkpoint.
          }
        }
        await delay(20);
      }
      expect(partPath).toBeDefined();
      expect(await readFile(partPath!)).toEqual(Buffer.from([1, 2]));
      expect(await observer.readLeaseState(jobId!)).toBe('active');
      const secondFacade = createApplication({
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
      // Owner продолжает checkpoint после read-only наблюдения другого facade.
      await delay(50);
      expect(await readFile(partPath!)).toEqual(Buffer.from([1, 2, 3]));
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
        Buffer.from([1, 2, 3]),
      );
      await expect(first.getJob(jobId!)).resolves.toMatchObject({
        kind: 'result',
        data: { status: 'paused' },
      });
      expect(await observer.readLeaseState(jobId!)).toBe('inactive');

      const resumed = createApplication({
        stateDir: path.join(root, 'state'),
        providerOverride: {
          ...downloads(),
          openAudioStream: async (_id, _variant, options) => ({
            stream: new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(
                  new Uint8Array([1, 2, 3, 4]).slice(options.offset ?? 0),
                );
                controller.close();
              },
            }),
            contentLength: 4,
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
      for (let attempts = 0; attempts < 30; attempts += 1) {
        const value = await resumed.getJob(jobId!);
        if (value.kind === 'result' && value.data?.status === 'completed')
          break;
        await delay(20);
      }
      await expect(resumed.getJob(jobId!)).resolves.toMatchObject({
        kind: 'result',
        data: { status: 'completed' },
      });
      await first.shutdown();
      await resumed.shutdown();
      await secondFacade.shutdown();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 15_000);

  it('передаёт skip и overwrite policy manager без потери request options', async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), 'application-overwrite-'),
    );
    try {
      const api = createApplication({
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
      await api.shutdown();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 15_000);

  it('не объявляет completed для EOF раньше contentLength', async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), 'application-truncated-'),
    );
    try {
      const api = createApplication({
        stateDir: path.join(root, 'state'),
        providerOverride: {
          ...downloads(),
          openAudioStream: async () => ({
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
          }),
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
      await api.shutdown();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 20_000);

  it('восстанавливает processing checkpoint только при точном final-файле', async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), 'application-checkpoint-'),
    );
    const stateDir = path.join(root, 'state');
    const store = new FileManifestStore({ stateDir });
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
        await expect(negative.resume(jobId)).resolves.toMatchObject({
          kind: 'result',
          data: { status: 'queued', tracks: [{ status: 'queued' }] },
        });
        await negative.shutdown();
      }
      await api.shutdown();
    } finally {
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
    try {
      let retryMode: 'fail' | 'ready' = 'fail';
      const retryApi = createApplication({
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
      for (let attempts = 0; attempts < 30; attempts += 1) {
        const value = await retryApi.getJob(failedId);
        if (value.kind === 'result' && value.data?.status === 'completed')
          break;
        await delay(20);
      }
      await expect(retryApi.getJob(failedId)).resolves.toMatchObject({
        kind: 'result',
        data: { status: 'completed' },
      });

      let cancelId = '';
      // job.created предшествует захвату аренды: cancel проверяется на уже открытом потоке.
      let streamReady!: () => void;
      const opened = new Promise<void>((resolve) => {
        streamReady = resolve;
      });
      const cancelApi = createApplication({
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
      const authApi = createApplication({
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
      for (let attempts = 0; attempts < 30; attempts += 1) {
        const value = await authApi.getJob(authId);
        if (value.kind === 'result' && value.data?.status === 'completed')
          break;
        await delay(20);
      }
      await expect(authApi.getJob(authId)).resolves.toMatchObject({
        kind: 'result',
        data: { status: 'completed' },
      });
      await Promise.all([
        retryApi.shutdown(),
        cancelApi.shutdown(),
        authApi.shutdown(),
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 20_000);

  it('делит scheduler между job и сохраняет границу подписок экземпляра', async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), 'application-scheduler-'),
    );
    let opened = 0;
    try {
      const api = createApplication({
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
      const other = createApplication({
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
      await api.shutdown();
      await other.shutdown();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 15_000);
});
