import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type {
  JobManifestV1,
  ManifestStore,
  MusicProvider,
} from '@music-downloader/shared';
import { createArtworkCache } from './adapters/artwork-cache.js';
import { createApplication } from './index.js';

const validMp3 = new Uint8Array(
  await readFile(
    new URL('../../core/validation/src/fixtures/sample.mp3', import.meta.url),
  ),
);

function provider(): MusicProvider {
  return {
    authenticate: async () => ({ id: 'account', displayName: 'Пользователь' }),
    getAccount: async () => null,
    logout: async () => undefined,
    resolveUrl: async () => ({ provider: 'mock', kind: 'track', id: '1' }),
    getTrack: async () => ({
      id: '1',
      availability: 'available',
      title: 'Трек',
      artists: [],
      artwork: { key: 'обложка' },
    }),
    getAlbum: async () => ({
      id: '2',
      title: 'Альбом',
      artists: [],
      tracks: [],
    }),
    getPlaylist: async () => ({ id: '3', title: 'Список', tracks: [] }),
    getAudioVariants: async () => [],
    openAudioStream: async () => ({
      stream: new ReadableStream<Uint8Array>(),
      container: 'mp3',
      acceptsRanges: false,
      startOffset: 0,
    }),
    fetchArtwork: async () => ({
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: 'image/jpeg',
    }),
  };
}

describe('публичный ApplicationApi', () => {
  it('использует providerOverride без native credentials и возвращает безопасные DTO', async () => {
    const stateDir = await mkdtemp(
      path.join(os.tmpdir(), 'application-contract-'),
    );
    try {
      const api = createApplication({
        stateDir,
        providerOverride: provider(),
        credentialStore: {
          read: async () => {
            throw new Error('Не должен вызываться.');
          },
          write: async () => {
            throw new Error('Не должен вызываться.');
          },
          clear: async () => {
            throw new Error('Не должен вызываться.');
          },
        },
      });
      expect(await api.authenticate()).toMatchObject({
        kind: 'result',
        data: { id: 'account' },
      });
      expect(await api.account()).toMatchObject({ kind: 'result', data: null });
      expect(await api.resolve('https://example.invalid/')).toMatchObject({
        kind: 'result',
        data: { kind: 'track' },
      });
      expect(
        await api.preview({ provider: 'mock', kind: 'track', id: '1' }),
      ).toMatchObject({
        kind: 'result',
        data: { artwork: { mimeType: 'image/jpeg', base64: 'AQID' } },
      });
      await expect(
        api.preview({ provider: 'mock', kind: 'album', id: '2' }),
      ).resolves.toMatchObject({ kind: 'result', data: { kind: 'album' } });
      await expect(
        api.preview({ provider: 'mock', kind: 'playlist', id: '3' }),
      ).resolves.toMatchObject({ kind: 'result', data: { kind: 'playlist' } });
      expect(await api.logout()).toMatchObject({ kind: 'result', data: null });
    } finally {
      await rm(stateDir, { recursive: true, force: true });
    }
  });

  it('ожидает provider logout и безопасно нормализует его отказ', async () => {
    let authenticated = true;
    let release!: () => void;
    const cleared = new Promise<void>((resolve) => {
      release = resolve;
    });
    const api = createApplication({
      providerOverride: {
        ...provider(),
        getAccount: async () =>
          authenticated ? { id: 'account', displayName: 'Пользователь' } : null,
        logout: async () => {
          await cleared;
          authenticated = false;
        },
      },
    });
    const pending = api.logout();
    expect(await api.account()).toMatchObject({
      kind: 'result',
      data: { id: 'account' },
    });
    release();
    await expect(pending).resolves.toMatchObject({
      kind: 'result',
      data: null,
    });
    expect(await api.account()).toMatchObject({ kind: 'result', data: null });
    const failed = createApplication({
      providerOverride: {
        ...provider(),
        logout: async () => {
          throw new Error('Authorization: Bearer secret-token');
        },
      },
    });
    const result = await failed.logout();
    expect(result).toMatchObject({
      kind: 'error',
      error: { code: 'DOWNLOAD_ERROR' },
    });
    expect(JSON.stringify(result)).not.toContain('secret-token');
  });

  it('наблюдает manifest только через read/list/readLeaseState', async () => {
    const manifest: JobManifestV1 = {
      version: 1,
      jobId: 'наблюдение',
      provider: 'mock',
      source: { provider: 'mock', kind: 'track', id: '1' },
      plan: {
        source: { provider: 'mock', kind: 'track', id: '1' },
        title: 'Трек',
        tracks: [
          {
            position: 1,
            trackKey: '1',
            track: {
              id: '1',
              availability: 'available',
              title: 'Трек',
              artists: [],
            },
          },
        ],
      },
      quality: 'best',
      destination: '/tmp',
      control: { state: 'running' },
      tracks: [
        {
          position: 1,
          trackKey: '1',
          status: 'downloading',
          attempts: 0,
          history: [],
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    let reads = 0;
    let leaseFails = false;
    const store: ManifestStore = {
      read: async (jobId) => {
        reads += 1;
        return jobId === manifest.jobId ? manifest : undefined;
      },
      list: async () => [manifest],
      readLeaseState: async () => {
        if (leaseFails) throw new Error('private lease details');
        return 'inactive';
      },
      create: async () => {
        throw new Error('Наблюдение не создаёт manifest.');
      },
      acquire: async () => {
        throw new Error('Наблюдение не захватывает аренду.');
      },
      sendControl: async () => {
        throw new Error('Наблюдение не отправляет control.');
      },
      waitControlAck: async () => undefined,
    };
    const api = createApplication({
      providerOverride: provider(),
      manifestStore: store,
    });
    await expect(api.getJob('нет')).resolves.toMatchObject({
      kind: 'result',
      data: null,
    });
    await expect(api.listJobs()).resolves.toMatchObject({
      kind: 'result',
      data: [{ jobId: 'наблюдение', status: 'interrupted' }],
    });
    expect(reads).toBe(1);
    leaseFails = true;
    await expect(api.getJob(manifest.jobId)).resolves.toMatchObject({
      kind: 'error',
      error: { code: 'DOWNLOAD_ERROR', retryable: false },
    });
  });

  it('безопасно отклоняет unknown аренду, если она меняет status', async () => {
    const manifest: JobManifestV1 = {
      version: 1,
      jobId: 'unknown-lease',
      provider: 'mock',
      source: { provider: 'mock', kind: 'track', id: '1' },
      plan: {
        source: { provider: 'mock', kind: 'track', id: '1' },
        title: 'Трек',
        tracks: [],
      },
      quality: 'best',
      destination: '/tmp',
      control: { state: 'running' },
      tracks: [
        {
          position: 1,
          trackKey: '1',
          status: 'downloading',
          attempts: 0,
          history: [],
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const store: ManifestStore = {
      read: async () => manifest,
      list: async () => [manifest],
      readLeaseState: async () => 'unknown',
      create: async () => undefined,
      acquire: async () => {
        throw new Error('Не должен вызываться.');
      },
      sendControl: async () => {
        throw new Error('Не должен вызываться.');
      },
      waitControlAck: async () => undefined,
    };
    const api = createApplication({
      providerOverride: provider(),
      manifestStore: store,
    });
    await expect(api.getJob(manifest.jobId)).resolves.toMatchObject({
      kind: 'error',
      error: { code: 'DOWNLOAD_ERROR', retryable: false },
    });
    await expect(api.listJobs()).resolves.toMatchObject({
      kind: 'error',
      error: { code: 'DOWNLOAD_ERROR', retryable: false },
    });
  });

  it('нормализует отказы read, list и readLeaseState без пустого успеха', async () => {
    const failingStore: ManifestStore = {
      read: async () => {
        throw new Error('private store path');
      },
      list: async () => {
        throw new Error('private store path');
      },
      readLeaseState: async () => {
        throw new Error('private lease details');
      },
      create: async () => undefined,
      acquire: async () => {
        throw new Error('Не должен вызываться.');
      },
      sendControl: async () => {
        throw new Error('Не должен вызываться.');
      },
      waitControlAck: async () => undefined,
    };
    const api = createApplication({
      providerOverride: provider(),
      manifestStore: failingStore,
    });
    await expect(api.getJob('job')).resolves.toMatchObject({
      kind: 'error',
      error: { code: 'DOWNLOAD_ERROR', retryable: false },
    });
    await expect(api.listJobs()).resolves.toMatchObject({
      kind: 'error',
      error: { code: 'DOWNLOAD_ERROR', retryable: false },
    });
  });

  it('сохраняет готовую обложку через новый экземпляр cache', async () => {
    const stateDir = await mkdtemp(
      path.join(os.tmpdir(), 'application-artwork-'),
    );
    try {
      await createArtworkCache(stateDir).write('job', '1', {
        artwork: { mimeType: 'image/png', bytes: new Uint8Array([7, 8, 9]) },
      });
      await expect(
        createArtworkCache(stateDir).read('job', '1'),
      ).resolves.toEqual({
        artwork: { mimeType: 'image/png', bytes: new Uint8Array([7, 8, 9]) },
      });
    } finally {
      await rm(stateDir, { recursive: true, force: true });
    }
  });

  it('не переносит secret из provider ошибки в результат или diagnostics logger', async () => {
    const records: string[] = [];
    const api = createApplication({
      providerOverride: {
        ...provider(),
        resolveUrl: async () => {
          throw new Error('Authorization: Bearer secret-token');
        },
      },
      logger: {
        error: () => undefined,
        info: () => undefined,
        debug: () => undefined,
        trace: () => undefined,
        child: () => {
          throw new Error('Не должен вызываться.');
        },
        warn: (_message, data) => records.push(JSON.stringify(data)),
      },
    });
    const result = await api.resolve('https://example.invalid/secret-token');
    expect(JSON.stringify(result)).not.toContain('secret-token');
    expect(records.join('\n')).not.toContain('secret-token');
    expect(result).toMatchObject({
      kind: 'error',
      error: { code: 'DOWNLOAD_ERROR' },
    });
  });

  it('не раскрывает provider-private metadata в preview DTO', async () => {
    const openAudioStream = vi.fn(provider().openAudioStream);
    const api = createApplication({
      providerOverride: {
        ...provider(),
        getTrack: async () => ({
          id: '1',
          availability: 'available' as const,
          title: 'Трек',
          artists: [],
          artwork: { key: 'private-artwork-key' },
          signedUrl: 'https://example.invalid/audio?token=secret-token',
        }),
        getAudioVariants: async () => [
          {
            key: 'private-variant-key',
            codec: 'mp3',
            container: 'mp3',
            lossless: false,
          },
        ],
        openAudioStream,
      },
    });
    const preview = await api.preview({
      provider: 'mock',
      kind: 'track',
      id: '1',
    });
    expect(JSON.stringify(preview)).not.toContain('private-artwork-key');
    expect(JSON.stringify(preview)).not.toContain('secret-token');
    expect(JSON.stringify(preview)).not.toContain('private-variant-key');
    expect(openAudioStream).not.toHaveBeenCalled();
    expect(preview).toMatchObject({
      kind: 'result',
      data: {
        source: { provider: 'mock', kind: 'track', id: '1' },
        tracks: [{ id: '1', title: 'Трек' }],
        qualities: expect.arrayContaining([
          { preference: 'best', available: 1, total: 1 },
        ]),
      },
    });
  });

  it('создаёт manifest, публикует начальные события и пишет итоговый файл через public facade', async () => {
    const stateDir = await mkdtemp(
      path.join(os.tmpdir(), 'application-download-'),
    );
    const destination = path.join(stateDir, 'music');
    const downloads: MusicProvider = {
      ...provider(),
      getAudioVariants: async () => [
        { key: 'mock-mp3', codec: 'mp3', container: 'mp3', lossless: false },
      ],
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
    };
    try {
      const api = createApplication({ stateDir, providerOverride: downloads });
      const events: Array<{ event: string; seq: number }> = [];
      const unsubscribe = api.subscribe((event) =>
        events.push({ event: event.event, seq: event.seq }),
      );
      const result = await api.createDownload({
        source: { provider: 'mock', kind: 'track', id: '1' },
        quality: 'best',
        destination,
      });
      unsubscribe();
      expect(result).toMatchObject({
        kind: 'result',
        data: { status: 'completed', tracks: [{ status: 'completed' }] },
      });
      expect(events.slice(0, 3).map((event) => event.event)).toEqual([
        'job.created',
        'entity.resolved',
        'plan.created',
      ]);
      expect(events.map((event) => event.seq)).toEqual(
        [...events]
          .map((event) => event.seq)
          .sort((left, right) => left - right),
      );
    } finally {
      await rm(stateDir, { recursive: true, force: true });
    }
  });
});

it('STEP-059 / H-002: accountAvatar возвращает только bytes DTO и не задерживает account', async () => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), 'avatar-dto-'));
  let complete!: () => void;
  let started!: () => void;
  const begun = new Promise<void>((resolve) => {
    started = resolve;
  });
  const wait = new Promise<void>((resolve) => {
    complete = resolve;
  });
  let signedIn = true;
  const api = createApplication({
    stateDir,
    providerOverride: {
      ...provider(),
      getAccount: async () =>
        signedIn ? { id: 'synthetic', displayName: 'Тест' } : null,
      logout: async () => {
        signedIn = false;
      },
      fetchAccountAvatar: async () => {
        started();
        await wait;
        return {
          mimeType: 'image/png',
          bytes: new Uint8Array([1, 2, 3]),
          ...{
            token: 'synthetic-secret',
            profile: 'synthetic-profile',
            url: 'https://example.test/image',
          },
        };
      },
    },
  });
  try {
    const pending = api.accountAvatar();
    await begun;
    expect(await api.account()).toMatchObject({
      kind: 'result',
      data: { id: 'synthetic' },
    });
    complete();
    const result = await pending;
    expect(result).toMatchObject({
      kind: 'result',
      data: { mimeType: 'image/png', base64: 'AQID' },
    });
    expect(JSON.stringify(result)).not.toMatch(
      /synthetic-secret|synthetic-profile|https:/,
    );
    await api.logout();
    expect(await api.accountAvatar()).toMatchObject({
      kind: 'result',
      data: null,
    });
  } finally {
    complete();
    await api.shutdown();
    await rm(stateDir, { recursive: true, force: true });
  }
});
