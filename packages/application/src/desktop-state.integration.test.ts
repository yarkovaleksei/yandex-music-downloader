import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as Logging from '@music-downloader/logging';
import { afterEach, expect, it, vi } from 'vitest';
import {
  defaultDesktopSettings,
  ProviderError,
  AuthenticationError,
  TrackUnavailableError,
  manifestFixture,
  type MusicProvider,
  type DesktopApplicationApi,
} from '@music-downloader/shared';
import {
  SqliteDesktopStateStore,
  SqliteManifestStore,
} from '@music-downloader/persistence';
import { createApplication } from './index.js';

const roots: string[] = [];
const apps: DesktopApplicationApi[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((api) => api.shutdown()));
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
async function root() {
  const value = await mkdtemp(path.join(tmpdir(), 'desktop-application-'));
  roots.push(value);
  return value;
}
const sample = new Uint8Array(
  await readFile(
    new URL('../../core/validation/src/fixtures/sample.mp3', import.meta.url),
  ),
);
/** Полностью локальный provider: тест не читает пользовательские credentials или account. */
function provider() {
  let active = 0,
    maxActive = 0;
  let credential: string | null = 'fixture-secret';
  const cleared = vi.fn(async () => {
    credential = null;
  });
  const getTrack: MusicProvider['getTrack'] = async (id) => ({
    id,
    title: `Песня ${id}`,
    availability: 'available',
    artists: [{ id: 'artist', name: 'Автор' }],
  });
  const value: MusicProvider = {
    authenticate: async () => ({
      id: 'fixture',
      displayName: 'Тестовый аккаунт',
    }),
    getAccount: async () =>
      credential ? { id: 'fixture', displayName: 'Тестовый аккаунт' } : null,
    logout: cleared,
    resolveUrl: async () => ({
      provider: 'mock',
      kind: 'album',
      id: 'collection',
    }),
    getTrack,
    getAlbum: async () => ({
      id: 'collection',
      title: 'Альбом',
      artists: [{ id: 'artist', name: 'Автор' }],
      tracks: await Promise.all(['1', '2', '3', '4'].map(getTrack)),
    }),
    getPlaylist: async () => ({
      id: 'collection',
      title: 'Плейлист',
      tracks: [{ position: 1, track: await getTrack('1') }],
    }),
    getAudioVariants: async () => [
      {
        key: 'mp3',
        codec: 'mp3',
        container: 'mp3',
        lossless: false,
        bitrate: 320000,
      },
    ],
    openAudioStream: async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      return {
        stream: new ReadableStream<Uint8Array>({
          async start(controller) {
            await new Promise((resolve) => setTimeout(resolve, 25));
            controller.enqueue(sample);
            controller.close();
            active--;
          },
        }),
        contentLength: sample.length,
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
  return { value, cleared, maxActive: () => maxActive };
}
async function completed(api: DesktopApplicationApi, jobId: string) {
  await expect
    .poll(async () => {
      const value = await api.getJob(jobId);
      return value.kind === 'result' ? value.data?.status : null;
    })
    .toBe('completed');
}

it('REQ-051/052: restart применяет настройки; exact replay, legacy refusal и hide сохраняют аудио', async () => {
  const directory = await root();
  const stateDir = path.join(directory, 'state');
  const output = path.join(directory, 'music');
  const fixture = provider();
  const first = createApplication({
    stateDir,
    clientProfile: 'desktop',
    providerOverride: fixture.value,
    processing: {},
    cache: { ttlMs: 0 },
  });
  apps.push(first);
  const settings = {
    ...defaultDesktopSettings,
    outputDirectory: output,
    quality: 'high' as const,
    concurrency: 2,
    naming: 'album' as const,
    overwrite: true,
    logging: 'error' as const,
    ffmpegPath: path.join(directory, 'ffmpeg'),
  };
  expect(await first.saveSettings(settings)).toMatchObject({
    kind: 'result',
    data: settings,
  });
  await first.shutdown();
  apps.splice(apps.indexOf(first), 1);
  const api = createApplication({
    stateDir,
    clientProfile: 'desktop',
    providerOverride: fixture.value,
    processing: {},
    cache: { ttlMs: 0 },
  });
  apps.push(api);
  expect(await api.getSettings()).toMatchObject({ data: settings });
  const created = await api.createDownload({
    source: { provider: 'mock', kind: 'album', id: 'collection' },
    quality: 'high',
    destination: output,
  });
  if (created.kind !== 'result') throw new Error('Задание не создано');
  await completed(api, created.data.jobId);
  expect(fixture.maxActive()).toBe(2);
  const state = new SqliteDesktopStateStore({ stateDir });
  const original = state.snapshot(created.data.jobId)!;
  expect(original).toEqual({
    writeTags: true,
    saveCoverFile: true,
    writeM3u8: true,
    source: { provider: 'mock', kind: 'album', id: 'collection' },
    quality: 'high',
    destination: output,
    overwrite: true,
    naming: 'album',
  });
  const jobs = new SqliteManifestStore({ stateDir });
  const manifest = (await jobs.read(created.data.jobId))!;
  expect(manifest.tracks[0]?.resultPath).toContain(
    path.join('Автор', 'Альбом', '01 - Песня 1.mp3'),
  );
  await api.saveSettings({
    ...settings,
    outputDirectory: path.join(directory, 'other'),
    quality: 'normal',
    overwrite: false,
    naming: 'collection',
  });
  const replay = await api.replay(created.data.jobId);
  if (replay.kind !== 'result') throw new Error('Повтор не создан');
  await completed(api, replay.data.jobId);
  expect(replay.data.jobId).not.toBe(created.data.jobId);
  expect(state.snapshot(replay.data.jobId)).toEqual(original);
  const paths = manifest.tracks.map((track) => track.resultPath!);
  const before = await Promise.all(paths.map((file) => readFile(file)));
  const names = await readdir(output, { recursive: true });
  expect(await api.hideHistory(created.data.jobId)).toMatchObject({
    kind: 'result',
  });
  expect(await readdir(output, { recursive: true })).toEqual(names);
  expect(await Promise.all(paths.map((file) => readFile(file)))).toEqual(
    before,
  );
  expect(await api.getJob(created.data.jobId)).toMatchObject({
    data: { jobId: created.data.jobId },
  });
  const legacy = {
    ...manifestFixture('legacy'),
    control: { state: 'cancelled' as const },
  };
  await jobs.create(legacy);
  const history = await api.history();
  if (history.kind !== 'result') throw new Error('История недоступна');
  expect(history.data.find((item) => item.jobId === 'legacy')).toMatchObject({
    replayAvailable: false,
    replayReason: expect.any(String),
    bytes: null,
  });
  expect(history.data.some((item) => item.jobId === created.data.jobId)).toBe(
    false,
  );
  const count = (await jobs.list()).length;
  expect(await api.replay('legacy')).toMatchObject({ kind: 'error' });
  expect((await jobs.list()).length).toBe(count);
  await api.logout();
  expect(fixture.cleared).toHaveBeenCalledOnce();
  expect(await api.account()).toMatchObject({ data: null });
  state.close();
  await jobs.close();
});

it('REQ-052: desktop doctor применяет output без запуска FFmpeg, отдельная проверка использует settings; статусы переживают restart', async () => {
  const directory = await root();
  const stateDir = path.join(directory, 'state');
  const output = path.join(directory, 'selected-output');
  // Без executable запуска реального пользовательского файла: mock runFfmpeg — разрешённый runtime adapter.
  const filesystemProbe = vi.fn(async () => undefined);
  const runFfmpeg = vi.fn(async () => undefined);
  const fixture = provider();
  const api = createApplication({
    stateDir,
    clientProfile: 'desktop',
    providerOverride: fixture.value,
    diagnosticsRuntime: { filesystemProbe, runFfmpeg },
    cache: { ttlMs: 0 },
  });
  apps.push(api);
  await api.saveSettings({
    ...defaultDesktopSettings,
    outputDirectory: output,
    ffmpegPath: path.join(directory, 'fixture-ffmpeg'),
  });
  const result = await api.refreshDiagnostics();
  expect(result).toMatchObject({
    kind: 'result',
    data: {
      checkedAt: expect.any(String),
      diagnostics: {
        configuration: {
          checks: {
            filesystem: { status: 'ok' },
          },
        },
      },
    },
  });
  expect(filesystemProbe).toHaveBeenCalledWith(output);
  expect(runFfmpeg).not.toHaveBeenCalled();
  expect(JSON.stringify(result)).not.toContain('ffmpeg');
  expect(await api.checkFfmpeg()).toMatchObject({ data: { available: true } });
  expect(runFfmpeg).toHaveBeenCalledWith(
    path.join(directory, 'fixture-ffmpeg'),
  );
  expect(JSON.stringify(result)).not.toContain('fixture-secret');
  await api.shutdown();
  apps.splice(apps.indexOf(api), 1);
  const restarted = createApplication({
    stateDir,
    clientProfile: 'desktop',
    providerOverride: fixture.value,
  });
  apps.push(restarted);
  expect(await restarted.lastDiagnostics()).toMatchObject({
    kind: 'result',
    data: result.kind === 'result' ? result.data : null,
  });
});

it('REQ-051: отказ сохранения полного снимка не запускает загрузку', async () => {
  const directory = await root();
  const stateDir = path.join(directory, 'state');
  const state = new SqliteDesktopStateStore({ stateDir });
  vi.spyOn(state, 'saveSnapshot').mockImplementation(() => {
    throw new Error('fixture write failure');
  });
  const fixture = provider();
  const opened = vi.spyOn(fixture.value, 'openAudioStream');
  const api = createApplication({
    stateDir,
    clientProfile: 'desktop',
    desktopStateStore: state,
    providerOverride: fixture.value,
  });
  apps.push(api);
  expect(
    await api.createDownload({
      source: { provider: 'mock', kind: 'track', id: '1' },
      quality: 'best',
      destination: path.join(directory, 'music'),
    }),
  ).toMatchObject({ kind: 'error' });
  expect(opened).not.toHaveBeenCalled();
});

it('REQ-052: logout удаляет токен через mock secure storage без реального account или keyring', async () => {
  const directory = await root();
  let token: string | null = 'fixture-secure-token';
  const credentials = {
    read: vi.fn(async () => token),
    write: vi.fn(async (value: string) => {
      token = value;
    }),
    clear: vi.fn(async () => {
      token = null;
    }),
  };
  const api = createApplication({
    stateDir: path.join(directory, 'state'),
    clientProfile: 'desktop',
    credentialStore: credentials,
    cache: { ttlMs: 0 },
  });
  apps.push(api);
  expect(await api.logout()).toMatchObject({ kind: 'result', data: null });
  expect(credentials.clear).toHaveBeenCalledOnce();
  expect(token).toBeNull();
});

it('REQ-052: перезапуск создаёт logger с сохранённым уровнем, CLI сохраняет прежний default', async () => {
  const directory = await root();
  const stateDir = path.join(directory, 'state');
  const state = new SqliteDesktopStateStore({ stateDir });
  state.saveSettings({ ...defaultDesktopSettings, logging: 'trace' });
  state.close();
  const spy = vi.spyOn(Logging, 'createLogger');
  try {
    const desktop = createApplication({
      stateDir,
      clientProfile: 'desktop',
      providerOverride: provider().value,
    });
    apps.push(desktop);
    expect(spy).toHaveBeenLastCalledWith({ level: 'trace' });
    const cli = createApplication({
      stateDir,
      providerOverride: provider().value,
    });
    apps.push(cli);
    expect(spy).toHaveBeenLastCalledWith({});
  } finally {
    spy.mockRestore();
  }
});

it('REQ-051: новое CLI задание сохраняет собственные effective settings и доступно replay в desktop', async () => {
  const directory = await root();
  const stateDir = path.join(directory, 'state');
  const state = new SqliteDesktopStateStore({ stateDir });
  state.saveSettings({
    ...defaultDesktopSettings,
    quality: 'normal',
    overwrite: true,
    naming: 'album',
    concurrency: 1,
    outputDirectory: path.join(directory, 'desktop-only'),
  });
  state.close();
  const fixture = provider();
  const cli = createApplication({
    stateDir,
    providerOverride: fixture.value,
    processing: {},
    cache: { ttlMs: 0 },
  });
  apps.push(cli);
  const output = path.join(directory, 'cli-output');
  const result = await cli.createDownload({
    source: { provider: 'mock', kind: 'track', id: '1' },
    quality: 'high',
    destination: output,
  });
  if (result.kind !== 'result') throw new Error('CLI задание не создано');
  await completed(cli, result.data.jobId);
  const stored = new SqliteDesktopStateStore({ stateDir });
  expect(stored.snapshot(result.data.jobId)).toEqual({
    writeTags: true,
    saveCoverFile: true,
    writeM3u8: true,
    source: { provider: 'mock', kind: 'track', id: '1' },
    quality: 'high',
    destination: output,
    overwrite: false,
    naming: 'collection',
  });
  stored.close();
  const desktop = createApplication({
    stateDir,
    clientProfile: 'desktop',
    providerOverride: fixture.value,
    processing: {},
    cache: { ttlMs: 0 },
  });
  apps.push(desktop);
  const history = await desktop.history();
  expect(history).toMatchObject({
    kind: 'result',
    data: [
      expect.objectContaining({
        jobId: result.data.jobId,
        replayAvailable: true,
      }),
    ],
  });
});

it.each([
  { profile: 'cli' as const, id: 'users/Owner/playlists/7' },
  { profile: 'desktop' as const, id: 'users/Owner/playlists/7' },
  {
    profile: 'cli' as const,
    id: 'users/%D0%90%D0%B2%D1%82%D0%BE%D1%80%20%2B/playlists/7',
  },
  {
    profile: 'desktop' as const,
    id: 'users/%D0%90%D0%B2%D1%82%D0%BE%D1%80%20%2B/playlists/7',
  },
  { profile: 'cli' as const, id: 'lk.01234567-89ab-cdef-0123-456789abcdef' },
  {
    profile: 'desktop' as const,
    id: 'lk.01234567-89ab-cdef-0123-456789abcdef',
  },
])(
  'F-001/REQ-051: $profile сохраняет исходный playlist ID $id, запускает аудио и повторяет исходный source',
  async ({ profile, id }) => {
    const directory = await root();
    const stateDir = path.join(directory, 'state');
    const fixture = provider();
    const getPlaylist = vi.spyOn(fixture.value, 'getPlaylist');
    const opened = vi.spyOn(fixture.value, 'openAudioStream');
    const api = createApplication({
      stateDir,
      clientProfile: profile,
      providerOverride: fixture.value,
      processing: {},
      cache: { ttlMs: 0 },
    });
    apps.push(api);
    const source = { provider: 'yandex-music', kind: 'playlist' as const, id };
    const result = await api.createDownload({
      source,
      quality: 'best',
      destination: path.join(directory, 'music'),
    });
    if (result.kind !== 'result')
      throw new Error('Канонический плейлист не создан');
    await completed(api, result.data.jobId);
    expect(opened).toHaveBeenCalledOnce();
    const state = new SqliteDesktopStateStore({ stateDir });
    expect(state.snapshot(result.data.jobId)?.source).toEqual(source);
    state.close();
    const replay = await api.replay(result.data.jobId);
    if (replay.kind !== 'result')
      throw new Error('Канонический плейлист не повторён');
    await completed(api, replay.data.jobId);
    expect(getPlaylist.mock.calls).toEqual([[id], [id]]);
    expect(replay.data.source).toEqual(source);
  },
);

it('REQ-057: очистка скрывает только terminal, сохраняет историю и аудио; revived job снова виден', async () => {
  const directory = await root();
  const stateDir = path.join(directory, 'state');
  const api = createApplication({
    stateDir,
    clientProfile: 'desktop',
    providerOverride: provider().value,
  });
  apps.push(api);
  const created = await api.createDownload({
    source: { provider: 'mock', kind: 'track', id: '1' },
    quality: 'best',
    destination: path.join(directory, 'music'),
  });
  if (created.kind !== 'result') throw new Error('Не создано тестовое задание');
  await completed(api, created.data.jobId);
  const history = await api.history();
  const job = await api.getJob(created.data.jobId);
  const audio =
    job.kind === 'result' ? job.data?.tracks[0]?.resultPath : undefined;
  expect(audio).toBeTruthy();
  const bytes = await readFile(audio!);
  expect(await api.clearDownloads()).toMatchObject({ data: 1 });
  expect(await api.listDownloads()).toMatchObject({ data: [] });
  expect(await api.history()).toEqual(history);
  expect(await api.getJob(created.data.jobId)).toEqual(job);
  expect(await readFile(audio!)).toEqual(bytes);
  const store = new SqliteManifestStore({ stateDir });
  const manifest = await store.read(created.data.jobId);
  if (!manifest) throw new Error('Отсутствует тестовый manifest');
  const session = await store.acquire(created.data.jobId, {
    recover: async (value) => value,
  });
  await session.save({
    ...manifest,
    control: { state: 'paused' },
    tracks: manifest.tracks.map((track) => ({ ...track, status: 'paused' })),
  });
  await session.release();
  expect(await api.listDownloads()).toMatchObject({
    data: [{ jobId: created.data.jobId, status: 'paused' }],
  });
  expect(await api.clearDownloads()).toMatchObject({ data: 0 });
  await store.close();
}, 20000);

it('локальная история и скрытие не ждут удержанную или недоступную сеть обложек', async () => {
  const directory = await root();
  const fixture = provider();
  const api = createApplication({
    stateDir: path.join(directory, 'state'),
    clientProfile: 'desktop',
    providerOverride: fixture.value,
    cache: { ttlMs: 0 },
  });
  apps.push(api);
  const created = await api.createDownload({
    source: { provider: 'mock', kind: 'track', id: '1' },
    quality: 'best',
    destination: path.join(directory, 'music'),
  });
  if (created.kind !== 'result') throw new Error('Не создано тестовое задание');
  await completed(api, created.data.jobId);
  let rejectMetadata!: (error: Error) => void;
  const held = new Promise<Awaited<ReturnType<MusicProvider['getTrack']>>>(
    (_, reject) => {
      rejectMetadata = reject;
    },
  );
  const metadata = vi.spyOn(fixture.value, 'getTrack').mockReturnValue(held);
  const local = await api.history();
  expect(local).toMatchObject({
    kind: 'result',
    data: [{ jobId: created.data.jobId }],
  });
  expect(metadata).not.toHaveBeenCalled();
  const optional = api.historyArtwork(created.data.jobId);
  const downloadImage = api.downloadArtwork(created.data.jobId);
  try {
    await expect.poll(() => metadata.mock.calls.length).toBe(2);
    expect(await api.listDownloads()).toMatchObject({
      data: [{ jobId: created.data.jobId }],
    });
    expect(await api.getDownload(created.data.jobId)).toMatchObject({
      data: { jobId: created.data.jobId },
    });
    expect(await api.history()).toEqual(local);
    expect(await api.hideHistory(created.data.jobId)).toMatchObject({
      kind: 'result',
      data: null,
    });
    expect(await api.history()).toMatchObject({ data: [] });
  } finally {
    rejectMetadata(new Error('Синтетическая сеть недоступна'));
  }
  expect(await optional).toMatchObject({ kind: 'result', data: null });
  expect(await downloadImage).toMatchObject({ kind: 'result', data: null });
});

it.each([true, false])(
  'REQ-058 H-001: реальные файлы, restart и replay сохраняют переключатели %s',
  async (enabled) => {
    const directory = await root();
    const stateDir = path.join(directory, 'state');
    const fixture = provider();
    const cover = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL9LwAAAABJRU5ErkJggg==',
      'base64',
    );
    const value: MusicProvider = {
      ...fixture.value,
      getPlaylist: async (id) => ({
        ...(await fixture.value.getPlaylist(id)),
        owner: 'Владелец',
      }),
      getTrack: async (id) => ({
        ...(await fixture.value.getTrack(id)),
        artwork: { key: 'synthetic-cover' },
      }),
      fetchArtwork: async () => ({ bytes: cover, mimeType: 'image/png' }),
    };
    const create = () =>
      createApplication({
        stateDir,
        clientProfile: 'desktop',
        providerOverride: value,
        cache: { ttlMs: 0 },
      });
    const api = create();
    apps.push(api);
    await api.saveSettings({
      ...defaultDesktopSettings,
      outputDirectory: path.join(directory, 'music'),
      overwrite: true,
      writeTags: enabled,
      saveCoverFile: enabled,
      writeM3u8: enabled,
      ...{ openFolderOnComplete: true },
    });
    const request = {
      source: { provider: 'mock', kind: 'playlist' as const, id: 'collection' },
      quality: 'best' as const,
      destination: path.join(directory, 'music'),
      variantSelection: {
        codec: 'mp3',
        container: 'mp3',
        lossless: false,
        bitrate: 320000,
      },
    };
    const initial = await api.createDownload(request);
    if (initial.kind !== 'result') throw new Error('Нет задания');
    await completed(api, initial.data.jobId);
    const check = async (target: DesktopApplicationApi, jobId: string) => {
      const job = await target.getJob(jobId);
      if (job.kind !== 'result' || !job.data) throw new Error('Нет снимка');
      const file = job.data.tracks[0]!.resultPath!;
      const { parseBuffer } = await import('music-metadata');
      const metadata = await parseBuffer(await readFile(file));
      expect(metadata.common.title).toBe(enabled ? 'Песня 1' : undefined);
      expect(Buffer.from(metadata.common.picture![0]!.data)).toEqual(cover);
      for (const name of ['cover.jpg', 'Плейлист.m3u8']) {
        const read = readFile(path.join(path.dirname(file), name));
        if (enabled) await expect(read).resolves.toBeDefined();
        else await expect(read).rejects.toMatchObject({ code: 'ENOENT' });
      }
      expect(job.data).not.toHaveProperty('openFolderOnComplete');
      expect(job.data.author).toBe('Владелец');
      return file;
    };
    const file = await check(api, initial.data.jobId);
    await api.shutdown();
    const restarted = create();
    apps.push(restarted);
    await restarted.saveSettings({
      ...defaultDesktopSettings,
      writeTags: !enabled,
      saveCoverFile: !enabled,
      writeM3u8: !enabled,
    });
    // Аудио удаляется только в synthetic fixture, чтобы replay доказал обработку, а не skip.
    await rm(file);
    const replay = await restarted.replay(initial.data.jobId);
    if (replay.kind !== 'result') throw new Error('Нет replay');
    await completed(restarted, replay.data.jobId);
    await check(restarted, replay.data.jobId);
    const state = new SqliteDesktopStateStore({ stateDir });
    expect(state.snapshot(replay.data.jobId)).toEqual(
      state.snapshot(initial.data.jobId),
    );
    state.close();
  },
  15000,
);

it.each([
  ['sample.mp3', 'mp3', 'mp3', false],
  ['sample-aac.m4a', 'aac', 'm4a', false],
  ['sample-flac.m4a', 'flac', 'm4a', true],
] as const)(
  'REQ-058 H-002: предлагаемый %s проходит существующий pipeline без перекодирования',
  async (name, codec, container, lossless) => {
    const directory = await root();
    const fixture = provider();
    const bytes = new Uint8Array(
      await readFile(
        new URL(`../../core/validation/src/fixtures/${name}`, import.meta.url),
      ),
    );
    const variant = { key: 'synthetic', codec, container, lossless };
    const value: MusicProvider = {
      ...fixture.value,
      getAudioVariants: async () => [variant],
      openAudioStream: async () => ({
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue(bytes);
            controller.close();
          },
        }),
        contentLength: bytes.length,
        container,
        acceptsRanges: false,
        startOffset: 0,
      }),
    };
    const api = createApplication({
      stateDir: path.join(directory, 'state'),
      providerOverride: value,
      cache: { ttlMs: 0 },
    });
    apps.push(api);
    const source = { provider: 'mock', kind: 'track' as const, id: '1' };
    const preview = await api.preview(source);
    expect(preview).toMatchObject({
      kind: 'result',
      data: {
        variants: [
          { selection: { codec, container, lossless }, available: 1, total: 1 },
        ],
      },
    });
    const created = await api.createDownload({
      source,
      quality: 'best',
      destination: path.join(directory, 'music'),
      variantSelection: { codec, container, lossless },
    });
    if (created.kind !== 'result') throw new Error('Нет задания');
    await completed(api, created.data.jobId);
    const { parseBuffer } = await import('music-metadata');
    const parsed = await parseBuffer(
      await readFile(created.data.tracks[0]!.resultPath!),
    );
    expect(parsed.common.title).toBe('Песня 1');
  },
  15000,
);

it.each(['resume', 'retry'] as const)(
  'REQ-058 H-001: %s после restart передаёт исходный snapshot до обработки',
  async (action) => {
    const directory = await root();
    const stateDir = path.join(directory, 'state');
    const fixture = provider();
    let blocked = true;
    const value: MusicProvider = {
      ...fixture.value,
      getAudioVariants: async (id) => {
        if (blocked)
          throw action === 'resume'
            ? new AuthenticationError()
            : new ProviderError('API_CHANGED', false);
        return fixture.value.getAudioVariants(id);
      },
    };
    const metadata = vi.fn(async () => undefined);
    const create = () =>
      createApplication({
        stateDir,
        clientProfile: 'desktop',
        providerOverride: value,
        processing: { metadata },
        cache: { ttlMs: 0 },
      });
    const api = create();
    apps.push(api);
    await api.saveSettings({
      ...defaultDesktopSettings,
      writeTags: false,
      saveCoverFile: false,
      writeM3u8: false,
    });
    const created = await api.createDownload({
      source: { provider: 'mock', kind: 'track', id: '1' },
      quality: 'best',
      destination: path.join(directory, 'music'),
      variantSelection: {
        codec: 'mp3',
        container: 'mp3',
        lossless: false,
        bitrate: 320000,
      },
    });
    if (created.kind !== 'result') throw new Error('Нет задания');
    expect(created.data.status).toBe(action === 'resume' ? 'paused' : 'failed');
    expect(metadata).not.toHaveBeenCalled();
    await api.shutdown();
    blocked = false;
    const restarted = create();
    apps.push(restarted);
    await restarted.saveSettings(defaultDesktopSettings);
    await restarted[action](created.data.jobId);
    await completed(restarted, created.data.jobId);
    expect(metadata).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ codec: 'mp3' }),
      undefined,
      expect.objectContaining({
        writeTags: false,
        saveCoverFile: false,
        embedArtwork: true,
      }),
    );
  },
);

it('выбор треков: загружаются только отмеченные позиции, повтор сохраняет выбор, неизвестная позиция отклоняется', async () => {
  const directory = await root();
  const stateDir = path.join(directory, 'state');
  const output = path.join(directory, 'music');
  const api = createApplication({
    stateDir,
    clientProfile: 'desktop',
    providerOverride: provider().value,
    processing: {},
    cache: { ttlMs: 0 },
  });
  apps.push(api);
  await api.saveSettings({
    ...defaultDesktopSettings,
    outputDirectory: output,
  });
  const source = { provider: 'mock', kind: 'album', id: 'collection' } as const;
  const created = await api.createDownload({
    source,
    quality: 'high',
    destination: output,
    trackPositions: [2, 4],
  });
  if (created.kind !== 'result') throw new Error('Задание не создано');
  await completed(api, created.data.jobId);
  const jobs = new SqliteManifestStore({ stateDir });
  const state = new SqliteDesktopStateStore({ stateDir });
  try {
    const manifest = (await jobs.read(created.data.jobId))!;
    // План перенумерован подряд, но ссылается на исходные треки 2 и 4.
    expect(
      manifest.plan.tracks.map((item) => [
        item.position,
        item.trackKey,
        item.track.id,
      ]),
    ).toEqual([
      [1, '1', '2'],
      [2, '2', '4'],
    ]);
    expect(manifest.tracks.map((track) => track.status)).toEqual([
      'completed',
      'completed',
    ]);
    expect(state.snapshot(created.data.jobId)).toMatchObject({
      trackPositions: [2, 4],
    });
    const replay = await api.replay(created.data.jobId);
    if (replay.kind !== 'result') throw new Error('Повтор не создан');
    await completed(api, replay.data.jobId);
    expect(
      (await jobs.read(replay.data.jobId))!.plan.tracks.map(
        (item) => item.track.id,
      ),
    ).toEqual(['2', '4']);
    const count = (await jobs.list()).length;
    expect(
      await api.createDownload({
        source,
        quality: 'high',
        destination: output,
        trackPositions: [2, 9],
      }),
    ).toMatchObject({ kind: 'error', error: { code: 'VALIDATION_ERROR' } });
    expect((await jobs.list()).length).toBe(count);
  } finally {
    state.close();
    await jobs.close();
  }
});

it('desktop журнал: файл получает создание, итог задания и упавший трек с кодом, без секретов и лишних этапов', async () => {
  const directory = await root();
  const stateDir = path.join(directory, 'state');
  const output = path.join(directory, 'music');
  const logFile = path.join(directory, 'desktop.log');
  const fixture = provider();
  const failing: MusicProvider = {
    ...fixture.value,
    openAudioStream: async (trackId, variantKey, options) => {
      if (trackId === '3') throw new TrackUnavailableError();
      return fixture.value.openAudioStream(trackId, variantKey, options);
    },
  };
  const state = new SqliteDesktopStateStore({ stateDir });
  state.saveSettings({
    ...defaultDesktopSettings,
    outputDirectory: output,
    logging: 'info',
  });
  state.close();
  const api = createApplication({
    stateDir,
    clientProfile: 'desktop',
    providerOverride: failing,
    processing: {},
    cache: { ttlMs: 0 },
    logFile,
  });
  apps.push(api);
  const created = await api.createDownload({
    source: { provider: 'mock', kind: 'album', id: 'collection' },
    quality: 'high',
    destination: output,
  });
  if (created.kind !== 'result') throw new Error('Задание не создано');
  const jobId = created.data.jobId;
  // Итог пишется после job.completed, поэтому ждём саму запись, а не статус.
  await expect
    .poll(async () => readFile(logFile, 'utf8'))
    .toContain('Задание завершено.');
  const records = (await readFile(logFile, 'utf8'))
    .trim()
    .split('\n')
    .map(
      (line) =>
        JSON.parse(line) as {
          level: string;
          message: string;
          context: { jobId?: string };
          data?: Record<string, unknown>;
        },
    );
  const job = records.filter((record) => record.context.jobId === jobId);
  expect(job.map((record) => [record.level, record.message])).toEqual([
    ['info', 'Задание создано.'],
    ['error', 'Трек не загружен.'],
    ['info', 'Задание завершено.'],
  ]);
  expect(job[1]?.data).toMatchObject({
    trackKey: '3',
    trackId: '3',
    code: 'TRACK_UNAVAILABLE',
  });
  expect(job[2]?.data).toEqual({
    source: 'album',
    tracks: { completed: 3, failed: 1 },
  });
  expect(await readFile(logFile, 'utf8')).not.toContain('fixture-secret');
});
