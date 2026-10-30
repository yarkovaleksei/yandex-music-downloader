import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { MusicProvider } from '@music-downloader/shared';
import { FileCacheStore } from '@music-downloader/persistence';
import { CachedProvider } from './cached-provider.js';
import { clearApplicationCache, createApplication } from './index.js';

function provider(account: () => string | null): MusicProvider {
  return {
    authenticate: vi.fn(async () => ({ id: 'account', displayName: 'Тест' })),
    getAccount: vi.fn(async () => {
      const id = account();
      return id === null ? null : { id, displayName: 'Тест' };
    }),
    logout: vi.fn(async () => undefined),
    resolveUrl: vi.fn(async () => ({
      provider: 'test',
      kind: 'track',
      id: '1',
    })),
    getTrack: vi.fn(async () => ({
      id: '1',
      availability: 'available' as const,
      title: 'Трек',
      artists: [{ id: 'artist', name: 'Исполнитель' }],
      artwork: { key: 'artwork' },
      token: 'secret-marker',
      cookie: 'secret-marker',
      signedUrl: 'https://cdn.example.test/a?signature=secret-marker',
      downloadInfo: { url: 'https://cdn.example.test/a?token=secret-marker' },
    })),
    getAlbum: vi.fn(async () => ({
      id: 'album',
      title: 'Альбом',
      artists: [{ id: 'artist', name: 'Исполнитель' }],
      artwork: { key: 'album-artwork' },
      tracks: [
        {
          id: 'album-track',
          availability: 'available' as const,
          title: 'Трек альбома',
          artists: [{ id: 'artist', name: 'Исполнитель' }],
        },
      ],
    })),
    getPlaylist: vi.fn(async () => ({
      id: 'playlist',
      title: 'Плейлист',
      artwork: { key: 'playlist-artwork' },
      tracks: [
        {
          position: 1,
          track: {
            id: 'playlist-track',
            availability: 'available' as const,
            title: 'Трек плейлиста',
            artists: [{ id: 'artist', name: 'Исполнитель' }],
          },
        },
      ],
    })),
    getAudioVariants: vi.fn(async () => [
      {
        key: 'stream-marker',
        codec: 'aac',
        container: 'm4a',
        lossless: false,
      },
    ]),
    openAudioStream: vi.fn(async () => ({
      stream: new ReadableStream<Uint8Array>(),
      container: 'm4a',
      acceptsRanges: false,
      startOffset: 0,
    })),
    fetchArtwork: vi.fn(async (artwork) => ({
      mimeType: 'image/png',
      bytes: new Uint8Array([artwork.key.length, 2, 3]),
    })),
  } as MusicProvider;
}

function deferred(): {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
} {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe('cache application integration', () => {
  it('кэширует preview по account/schema, пропускает null account и очищается отдельным API', async () => {
    const stateDir = await mkdtemp(
      path.join(os.tmpdir(), 'application-cache-'),
    );
    let now = 0;
    let account: string | null = 'one';
    const source = provider(() => account);
    const adapters = {
      stateDir,
      providerOverride: source,
      cache: {
        providerId: 'test',
        schemaVersion: '1.0.0',
        ttlMs: 100,
        now: () => now,
      },
    };
    try {
      const api = createApplication(adapters);
      await api.preview({ provider: 'test', kind: 'track', id: '1' });
      await api.preview({ provider: 'test', kind: 'track', id: '1' });
      expect(source.getTrack).toHaveBeenCalledTimes(1);
      expect(source.fetchArtwork).toHaveBeenCalledTimes(1);
      const cached = await readdir(path.join(stateDir, 'cache'));
      await Promise.all(
        cached.map((entry) =>
          writeFile(
            path.join(stateDir, 'cache', entry),
            JSON.stringify({
              version: 1,
              expiresAt: 1_000,
              payload: { kind: 'track', value: { id: 'broken' } },
            }),
          ),
        ),
      );
      await api.preview({ provider: 'test', kind: 'track', id: '1' });
      expect(source.getTrack).toHaveBeenCalledTimes(2);
      const newerSchema = createApplication({
        ...adapters,
        cache: { ...adapters.cache, schemaVersion: '2.0.0' },
      });
      await newerSchema.preview({ provider: 'test', kind: 'track', id: '1' });
      expect(source.getTrack).toHaveBeenCalledTimes(3);
      now = 100;
      await api.preview({ provider: 'test', kind: 'track', id: '1' });
      expect(source.getTrack).toHaveBeenCalledTimes(4);
      account = 'two';
      await api.preview({ provider: 'test', kind: 'track', id: '1' });
      expect(source.getTrack).toHaveBeenCalledTimes(5);
      account = null;
      await api.preview({ provider: 'test', kind: 'track', id: '1' });
      expect(source.getTrack).toHaveBeenCalledTimes(6);
      account = 'two';
      const cachedFiles = await readdir(path.join(stateDir, 'cache'));
      const content = await Promise.all(
        cachedFiles.map((entry) =>
          readFile(path.join(stateDir, 'cache', entry), 'utf8'),
        ),
      );
      expect(content.join('\n')).not.toContain('secret-marker');
      expect(content.join('\n')).not.toContain('signedUrl');
      await clearApplicationCache({ stateDir });
      await api.preview({ provider: 'test', kind: 'track', id: '1' });
      expect(source.getTrack).toHaveBeenCalledTimes(7);
    } finally {
      await rm(stateDir, { recursive: true, force: true });
    }
  });

  it('не включает cache для provider override без явного namespace', async () => {
    const stateDir = await mkdtemp(
      path.join(os.tmpdir(), 'application-cache-'),
    );
    const source = provider(() => 'account');
    try {
      const api = createApplication({ stateDir, providerOverride: source });
      await api.preview({ provider: 'test', kind: 'track', id: '1' });
      await api.preview({ provider: 'test', kind: 'track', id: '1' });
      expect(source.getTrack).toHaveBeenCalledTimes(2);
    } finally {
      await rm(stateDir, { recursive: true, force: true });
    }
  });

  it('оставляет diagnostics на исходном provider', async () => {
    const stateDir = await mkdtemp(
      path.join(os.tmpdir(), 'application-cache-'),
    );
    const source = provider(() => 'account');
    try {
      const api = createApplication({
        stateDir,
        providerOverride: source,
        cache: { providerId: 'test', schemaVersion: '1.0.0' },
      });
      await api.preview({ provider: 'test', kind: 'track', id: '1' });
      await api.diagnostics();
      expect(source.getTrack).toHaveBeenCalledTimes(2);
    } finally {
      await rm(stateDir, { recursive: true, force: true });
    }
  });

  it.each([
    { payload: { kind: 'artwork', value: null }, label: 'null' },
    { payload: { kind: 'artwork' }, label: 'без value' },
  ])(
    'считает artwork payload $label промахом и повторно получает обложку',
    async ({ payload }) => {
      const stateDir = await mkdtemp(
        path.join(os.tmpdir(), 'application-cache-'),
      );
      const source = provider(() => 'account');
      try {
        const api = createApplication({
          stateDir,
          providerOverride: source,
          cache: { providerId: 'test', schemaVersion: '1.0.0' },
        });
        await api.preview({ provider: 'test', kind: 'track', id: '1' });
        const entries = await readdir(path.join(stateDir, 'cache'));
        const artworkEntry = await Promise.all(
          entries.map(async (entry) => ({
            entry,
            content: JSON.parse(
              await readFile(path.join(stateDir, 'cache', entry), 'utf8'),
            ) as { payload?: { kind?: string } },
          })),
        ).then((items) =>
          items.find((item) => item.content.payload?.kind === 'artwork'),
        );
        await writeFile(
          path.join(stateDir, 'cache', artworkEntry!.entry),
          JSON.stringify({
            version: 1,
            expiresAt: Date.now() + 60_000,
            payload,
          }),
        );
        const result = await api.preview({
          provider: 'test',
          kind: 'track',
          id: '1',
        });
        expect(result.kind).toBe('result');
        expect(source.fetchArtwork).toHaveBeenCalledTimes(2);
      } finally {
        await rm(stateDir, { recursive: true, force: true });
      }
    },
  );

  it('не позволяет public authenticate сменить account во время cache lookup', async () => {
    const stateDir = await mkdtemp(
      path.join(os.tmpdir(), 'application-cache-'),
    );
    let current = 'A';
    let next = 'A';
    const source = provider(() => current);
    source.authenticate = vi.fn(async () => {
      current = next;
      return { id: current, displayName: current };
    });
    source.getTrack = vi.fn(async () => ({
      id: '1',
      availability: 'available' as const,
      title: current,
      artists: [{ id: 'artist', name: 'Исполнитель' }],
    }));
    const readStarted = deferred();
    const releaseRead = deferred();
    const originalRead = FileCacheStore.prototype.read;
    let delay = true;
    const read = vi
      .spyOn(FileCacheStore.prototype, 'read')
      .mockImplementation(async function (this: FileCacheStore, key) {
        if (delay) {
          delay = false;
          readStarted.resolve();
          await releaseRead.promise;
        }
        return originalRead.call(this, key);
      });
    try {
      const api = createApplication({
        stateDir,
        providerOverride: source,
        cache: { providerId: 'test', schemaVersion: '1.0.0' },
      });
      const preview = api.preview({ provider: 'test', kind: 'track', id: '1' });
      await readStarted.promise;
      next = 'B';
      const authenticateB = api.authenticate();
      await Promise.resolve();
      expect(current).toBe('A');
      releaseRead.resolve();
      expect((await preview).kind).toBe('result');
      await authenticateB;
      next = 'A';
      await api.authenticate();
      const repeated = await api.preview({
        provider: 'test',
        kind: 'track',
        id: '1',
      });
      expect(repeated).toMatchObject({ kind: 'result', data: { title: 'A' } });
      expect(source.getTrack).toHaveBeenCalledTimes(1);
    } finally {
      read.mockRestore();
      await rm(stateDir, { recursive: true, force: true });
    }
  });

  it('кэширует Album/Playlist/artwork до TTL и читает запись после restart', async () => {
    const stateDir = await mkdtemp(
      path.join(os.tmpdir(), 'application-cache-'),
    );
    let now = 0;
    const source = provider(() => 'account');
    const adapters = {
      stateDir,
      providerOverride: source,
      cache: {
        providerId: 'test',
        schemaVersion: '1.0.0',
        ttlMs: 100,
        now: () => now,
      },
    };
    try {
      const api = createApplication(adapters);
      for (const sourceKind of ['album', 'playlist'] as const) {
        await api.preview({
          provider: 'test',
          kind: sourceKind,
          id: sourceKind,
        });
        await api.preview({
          provider: 'test',
          kind: sourceKind,
          id: sourceKind,
        });
      }
      expect(source.getAlbum).toHaveBeenCalledTimes(1);
      expect(source.getPlaylist).toHaveBeenCalledTimes(1);
      expect(source.fetchArtwork).toHaveBeenCalledTimes(2);
      const restarted = createApplication(adapters);
      await restarted.preview({ provider: 'test', kind: 'album', id: 'album' });
      expect(source.getAlbum).toHaveBeenCalledTimes(1);
      now = 100;
      await api.preview({ provider: 'test', kind: 'album', id: 'album' });
      await api.preview({ provider: 'test', kind: 'playlist', id: 'playlist' });
      expect(source.getAlbum).toHaveBeenCalledTimes(2);
      expect(source.getPlaylist).toHaveBeenCalledTimes(2);
      expect(source.fetchArtwork).toHaveBeenCalledTimes(4);
    } finally {
      await rm(stateDir, { recursive: true, force: true });
    }
  });

  it('всегда делегирует variants и stream без записи marker в cache', async () => {
    const stateDir = await mkdtemp(
      path.join(os.tmpdir(), 'application-cache-'),
    );
    const source = provider(() => 'account');
    const decorated = new CachedProvider(
      source,
      new FileCacheStore({ stateDir, ttlMs: 60_000 }),
      { providerId: 'test', schemaVersion: '1.0.0' },
    );
    try {
      await decorated.getAudioVariants('1');
      await decorated.getAudioVariants('1');
      await decorated.openAudioStream('1', 'stream-marker', {});
      await decorated.openAudioStream('1', 'stream-marker', {});
      expect(source.getAudioVariants).toHaveBeenCalledTimes(2);
      expect(source.openAudioStream).toHaveBeenCalledTimes(2);
      const entries = await readdir(path.join(stateDir, 'cache')).catch(
        () => [],
      );
      const contents = await Promise.all(
        entries.map((entry) =>
          readFile(path.join(stateDir, 'cache', entry), 'utf8'),
        ),
      );
      expect(contents.join('\n')).not.toContain('stream-marker');
    } finally {
      await rm(stateDir, { recursive: true, force: true });
    }
  });
});

it('STEP-059 / H-002: avatar persistent account cache переживает reopen, TTL и clear обновляют только bytes/MIME', async () => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), 'avatar-cache-'));
  let clock = 100;
  let account = 'first';
  const source = provider(() => account);
  const fetchAvatar = vi.fn(async () => ({
    mimeType: 'image/png',
    bytes: new Uint8Array([1, 2, 3]),
    profile: 'secret-marker',
    url: 'https://profile.example.test',
    token: 'secret-marker',
  }));
  source.fetchAccountAvatar = fetchAvatar;
  const store = new FileCacheStore({
    stateDir,
    ttlMs: 300_000,
    now: () => clock,
  });
  const create = () =>
    new CachedProvider(source, store, {
      providerId: 'synthetic',
      schemaVersion: '1',
    });
  try {
    await create().fetchAccountAvatar();
    expect(await create().fetchAccountAvatar()).toEqual({
      mimeType: 'image/png',
      bytes: new Uint8Array([1, 2, 3]),
    });
    expect(fetchAvatar).toHaveBeenCalledTimes(1);
    const files = await readdir(path.join(stateDir, 'cache'));
    expect(files).toHaveLength(1);
    const payload = await readFile(
      path.join(stateDir, 'cache', files[0]!),
      'utf8',
    );
    expect(payload).not.toMatch(/secret-marker|https:|profile|token|first/);
    clock += 300_000;
    await create().fetchAccountAvatar();
    expect(fetchAvatar).toHaveBeenCalledTimes(2);
    await store.clear();
    await create().fetchAccountAvatar();
    expect(fetchAvatar).toHaveBeenCalledTimes(3);
    account = 'second';
    await create().fetchAccountAvatar();
    expect(fetchAvatar).toHaveBeenCalledTimes(4);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

it('STEP-059 / H-002: deferred avatar не задерживает account/metadata/auth/logout и не загрязняет cache другого account', async () => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), 'avatar-pending-'));
  let account: string | null = 'first';
  const source = provider(() => account);
  const pending = deferred();
  const started = deferred();
  source.fetchAccountAvatar = vi.fn(async () => {
    started.resolve();
    await pending.promise;
    return { mimeType: 'image/png', bytes: new Uint8Array([1]) };
  });
  source.logout = async () => {
    account = null;
  };
  source.authenticate = async () => {
    account = 'second';
    return { id: 'second', displayName: 'Второй' };
  };
  const store = new FileCacheStore({ stateDir, ttlMs: 300_000 });
  const cached = new CachedProvider(source, store, {
    providerId: 'synthetic',
    schemaVersion: '1',
  });
  try {
    const photo = cached.fetchAccountAvatar();
    await started.promise;
    expect(await cached.getAccount()).toMatchObject({ id: 'first' });
    expect(await cached.getTrack('1')).toMatchObject({ id: '1' });
    await cached.logout();
    expect(await cached.authenticate()).toMatchObject({ id: 'second' });
    pending.resolve();
    expect(await photo).toBeNull();
    expect(
      await store.read({
        providerId: 'synthetic',
        schemaVersion: '1',
        accountId: 'first',
        method: 'fetchAccountAvatar',
        arguments: [],
      }),
    ).toBeUndefined();
    expect(
      await store.read({
        providerId: 'synthetic',
        schemaVersion: '1',
        accountId: 'second',
        method: 'fetchAccountAvatar',
        arguments: [],
      }),
    ).toBeUndefined();
  } finally {
    pending.resolve();
    await rm(stateDir, { recursive: true, force: true });
  }
});
