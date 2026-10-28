import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as Logging from '@music-downloader/logging';
import { afterEach, expect, it, vi } from 'vitest';
import {
  defaultDesktopSettings,
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

it('REQ-052: doctor применяет текущие output/FFmpeg, сохраняет безопасные статусы и время после restart', async () => {
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
            ffmpeg: { status: 'ok', optional: true },
          },
        },
      },
    },
  });
  expect(filesystemProbe).toHaveBeenCalledWith(output);
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
