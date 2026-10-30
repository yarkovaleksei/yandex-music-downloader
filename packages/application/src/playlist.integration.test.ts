import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ProviderError,
  type MusicProvider,
  type PlaylistTrack,
} from '@music-downloader/shared';
import { createApplication } from './index.js';

const validMp3 = new Uint8Array(
  await readFile(
    new URL('../../core/validation/src/fixtures/sample.mp3', import.meta.url),
  ),
);

function provider(
  tracks: readonly PlaylistTrack[],
  failedIds: ReadonlySet<string> = new Set(),
  firstTrackGate?: Promise<void>,
): MusicProvider {
  return {
    authenticate: async () => ({ id: 'account', displayName: 'Тест' }),
    getAccount: async () => null,
    logout: async () => undefined,
    resolveUrl: async () => ({
      provider: 'mock',
      kind: 'playlist',
      id: 'list',
    }),
    getTrack: async (id) => {
      const item = tracks.find((entry) => entry.track.id === id);
      if (item === undefined) throw new Error('Трек отсутствует в fixture.');
      return item.track;
    },
    getAlbum: async () => {
      throw new Error('Альбом не используется в playlist fixture.');
    },
    getPlaylist: async () => ({ id: 'list', title: 'Любимый список', tracks }),
    getAudioVariants: async () => [
      { key: 'mp3', codec: 'mp3', container: 'mp3', lossless: false },
    ],
    openAudioStream: async (id) => {
      if (failedIds.has(id)) throw new ProviderError('API_CHANGED', false);
      return {
        stream: new ReadableStream<Uint8Array>({
          async start(controller) {
            // Явный gate отделяет source order от фактического порядка settlement без таймингов CI.
            if (id === '1') await firstTrackGate;
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

function track(position: number, title: string): PlaylistTrack {
  return {
    position,
    track: {
      id: String(position),
      availability: 'available',
      title,
      artists: [{ id: 'artist', name: 'Автор' }],
    },
  };
}

describe('playlist M3U8 через публичное application API', () => {
  let root: string | undefined;
  let api: ReturnType<typeof createApplication> | undefined;

  afterEach(async () => {
    await api?.shutdown();
    if (root !== undefined) await rm(root, { recursive: true, force: true });
    api = undefined;
    root = undefined;
  });

  it('создаёт N файлов и UTF-8 M3U8 в source order до завершения job', async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'playlist-m3u8-'));
    const destination = path.join(root, 'music');
    let releaseFirstTrack: (() => void) | undefined;
    const firstTrackGate = new Promise<void>((resolve) => {
      releaseFirstTrack = resolve;
    });
    api = createApplication({
      stateDir: path.join(root, 'state'),
      providerOverride: provider(
        [
          track(1, 'Первый трек'),
          track(2, 'Второй трек'),
          track(3, 'Третий трек'),
        ],
        new Set(),
        firstTrackGate,
      ),
    });
    const playlistPath = path.join(
      destination,
      'Любимый список',
      'Любимый список.m3u8',
    );
    let playlistAtCompletion: Promise<string> | undefined;
    const settled: string[] = [];
    let resolveOthers: (() => void) | undefined;
    const othersSettled = new Promise<void>((resolve) => {
      resolveOthers = resolve;
    });
    const unsubscribe = api.subscribe((event) => {
      if (
        event.event === 'validation.completed' &&
        event.trackKey !== undefined
      ) {
        settled.push(event.trackKey);
        if (settled.includes('2') && settled.includes('3')) resolveOthers?.();
      }
      if (event.event === 'job.completed')
        playlistAtCompletion = readFile(playlistPath, 'utf8');
    });

    const running = api.createDownload({
      source: { provider: 'mock', kind: 'playlist', id: 'list' },
      quality: 'best',
      destination,
    });
    await othersSettled;
    releaseFirstTrack?.();
    const result = await running;
    unsubscribe();

    expect(result).toMatchObject({
      kind: 'result',
      data: { status: 'completed' },
    });
    if (result.kind !== 'result')
      throw new Error('Ожидался результат download.');
    const resultPaths = result.data.tracks.map((item) => item.resultPath!);
    expect(resultPaths).toHaveLength(3);
    expect(resultPaths.map((resultPath) => path.basename(resultPath))).toEqual([
      '01 - Автор - Первый трек.mp3',
      '02 - Автор - Второй трек.mp3',
      '03 - Автор - Третий трек.mp3',
    ]);
    await Promise.all(resultPaths.map((resultPath) => readFile(resultPath)));
    const lines = (await readFile(playlistPath, 'utf8')).trim().split('\n');
    expect(lines).toEqual(
      resultPaths.map((resultPath) =>
        path.relative(path.dirname(playlistPath), resultPath),
      ),
    );
    await expect(playlistAtCompletion).resolves.toBe(
      await readFile(playlistPath, 'utf8'),
    );
    expect(settled.slice(0, 2).sort()).toEqual(['2', '3']);
    expect(settled.at(-1)).toBe('1');
  }, 15_000);

  it('использует playlist layout для playlist из одного трека', async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'playlist-single-'));
    const destination = path.join(root, 'music');
    api = createApplication({
      stateDir: path.join(root, 'state'),
      providerOverride: provider([track(1, 'Один трек')]),
    });

    const result = await api.createDownload({
      source: { provider: 'mock', kind: 'playlist', id: 'list' },
      quality: 'best',
      destination,
    });

    if (result.kind !== 'result')
      throw new Error('Ожидался результат download.');
    expect(result.data.tracks[0]?.resultPath).toContain('Любимый список');
    await expect(
      readFile(
        path.join(destination, 'Любимый список', 'Любимый список.m3u8'),
        'utf8',
      ),
    ).resolves.toContain('01 - Автор - Один трек.mp3');
  }, 15_000);

  it('исключает unavailable трек и сохраняет номера исходных позиций', async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'playlist-partial-'));
    const destination = path.join(root, 'music');
    const unavailable: PlaylistTrack = {
      position: 2,
      track: { id: '2', availability: 'unavailable' },
    };
    api = createApplication({
      stateDir: path.join(root, 'state'),
      providerOverride: provider([
        track(1, 'Первый трек'),
        unavailable,
        track(3, 'Третий трек'),
      ]),
    });

    const result = await api.createDownload({
      source: { provider: 'mock', kind: 'playlist', id: 'list' },
      quality: 'best',
      destination,
    });

    if (result.kind !== 'result')
      throw new Error('Ожидался результат download.');
    const playlistPath = path.join(
      destination,
      'Любимый список',
      'Любимый список.m3u8',
    );
    await expect(readFile(playlistPath, 'utf8')).resolves.toBe(
      '01 - Автор - Первый трек.mp3\n03 - Автор - Третий трек.mp3\n',
    );
    expect(result.data.tracks.map((item) => item.status)).toEqual([
      'completed',
      'failed',
      'completed',
    ]);
  }, 15_000);

  it('обновляет M3U8 при skip уже существующих файлов', async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'playlist-existing-'));
    const destination = path.join(root, 'music');
    api = createApplication({
      stateDir: path.join(root, 'state'),
      providerOverride: provider([
        track(1, 'Первый трек'),
        track(2, 'Второй трек'),
      ]),
    });
    const request = {
      source: {
        provider: 'mock' as const,
        kind: 'playlist' as const,
        id: 'list',
      },
      quality: 'best' as const,
      destination,
    };

    await api.createDownload(request);
    const repeated = await api.createDownload(request);

    if (repeated.kind !== 'result')
      throw new Error('Ожидался результат download.');
    expect(repeated.data.tracks.map((item) => item.status)).toEqual([
      'skipped',
      'skipped',
    ]);
    await expect(
      readFile(
        path.join(destination, 'Любимый список', 'Любимый список.m3u8'),
        'utf8',
      ),
    ).resolves.toBe(
      '01 - Автор - Первый трек.mp3\n02 - Автор - Второй трек.mp3\n',
    );
  }, 15_000);

  it('добавляет повторно скачанный трек в M3U8 на его исходную позицию', async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'playlist-retry-'));
    const destination = path.join(root, 'music');
    const failedIds = new Set(['2']);
    api = createApplication({
      stateDir: path.join(root, 'state'),
      providerOverride: provider(
        [
          track(1, 'Первый трек'),
          track(2, 'Второй трек'),
          track(3, 'Третий трек'),
        ],
        failedIds,
      ),
    });
    const request = {
      source: {
        provider: 'mock' as const,
        kind: 'playlist' as const,
        id: 'list',
      },
      quality: 'best' as const,
      destination,
    };

    const initial = await api.createDownload(request);
    if (initial.kind !== 'result')
      throw new Error('Ожидался результат download.');
    expect(initial.data.tracks.map((item) => item.status)).toEqual([
      'completed',
      'failed',
      'completed',
    ]);
    const playlistPath = path.join(
      destination,
      'Любимый список',
      'Любимый список.m3u8',
    );
    await expect(readFile(playlistPath, 'utf8')).resolves.toBe(
      '01 - Автор - Первый трек.mp3\n03 - Автор - Третий трек.mp3\n',
    );

    failedIds.delete('2');
    // SQLite уже видит terminal-состояния треков до окончания записи M3U8.
    // Файл готов к событию job.completed, поэтому ждём событие.
    let retryCompleted = false;
    const unsubscribe = api.subscribe((event) => {
      if (event.jobId === initial.data.jobId && event.event === 'job.completed')
        retryCompleted = true;
    });
    try {
      await expect(api.retry(initial.data.jobId)).resolves.toMatchObject({
        kind: 'result',
        data: { status: 'running' },
      });
      await expect
        .poll(() => retryCompleted, { timeout: 5_000, interval: 20 })
        .toBe(true);
    } finally {
      unsubscribe();
    }
    await expect(api.getJob(initial.data.jobId)).resolves.toMatchObject({
      kind: 'result',
      data: { status: 'completed' },
    });
    await expect(readFile(playlistPath, 'utf8')).resolves.toBe(
      '01 - Автор - Первый трек.mp3\n02 - Автор - Второй трек.mp3\n03 - Автор - Третий трек.mp3\n',
    );
  }, 15_000);
});
