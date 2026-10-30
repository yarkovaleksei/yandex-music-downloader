import { readFileSync } from 'node:fs';
import { z } from 'zod';
import {
  Playlist as SdkPlaylist,
  Track as SdkTrack,
} from '@dvxch/yandex-music';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ProviderError,
  TrackUnavailableError,
  type CredentialStore,
} from '@music-downloader/shared';
import { PROVIDER_SCHEMA_VERSION, YandexMusicProvider } from '../index.js';
import type { AuthFetch } from '../auth-transport.js';
import {
  rawAlbumSchema,
  rawPlaylistSchema,
  rawTrackSchema,
} from './schemas.js';

function fixture(kind: string): unknown {
  return JSON.parse(
    readFileSync(new URL(`./fixtures/${kind}.json`, import.meta.url), 'utf8'),
  ) as unknown;
}
function response(body: unknown, status = 200) {
  return {
    status,
    arrayBuffer: async () =>
      new TextEncoder().encode(JSON.stringify(body)).buffer,
  };
}
function credentials(expiresAt?: number) {
  return JSON.stringify({
    schemaVersion: 1,
    accessToken: 'synthetic-access',
    issuedAt: 0,
    accountId: '501',
    ...(expiresAt === undefined ? {} : { expiresAt }),
  });
}
function setup(fetch: AuthFetch, value = credentials(), clearFails = false) {
  let saved: string | null = value;
  const store: CredentialStore = {
    read: vi.fn(async () => saved),
    write: async (next) => {
      saved = next;
    },
    clear: async () => {
      if (clearFails) throw new Error('synthetic-clear-failure');
      saved = null;
    },
  };
  return {
    provider: new YandexMusicProvider({
      credentialStore: store,
      authInteraction: { notify: () => {} },
      fetch,
      now: () => 10,
    }),
    store,
  };
}

/** Real fixtures проходят public facade и настоящий SDK; mutations явно synthetic.
 * @link ../../../../../planning/tasks/STEP-009.md
 */
describe('provider metadata', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('Offline test не использует сеть');
    });
  });
  afterEach(() => {
    try {
      expect(globalThis.fetch).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('маппит redacted real track и экспортирует compatibility version', async () => {
    const envelope = fixture('track');
    const raw = z.object({ result: z.array(rawTrackSchema) }).parse(envelope)
      .result[0];
    if (!raw) throw new Error('Пустая real fixture');
    const fetch = vi.fn<AuthFetch>().mockResolvedValue(response(envelope));
    const { provider } = setup(fetch);
    const track = await provider.getTrack(String(raw.id));
    expect(track.id).toBe(String(raw.id));
    expect(track.title).toBe(raw.title);
    expect(track.artists).toEqual(
      raw.artists?.map((artist) => ({
        id: String(artist.id),
        name: artist.name,
      })),
    );
    expect(track.durationMs).toBe(raw.durationMs);
    expect(track.genre).toBe(raw.genre ?? raw.albums?.[0]?.genre);
    expect(track.trackNumber).toBe(
      raw.trackNumber ?? raw.albums?.[0]?.trackPosition?.index,
    );
    expect(track.discNumber).toBe(
      raw.discNumber ?? raw.albums?.[0]?.trackPosition?.volume,
    );
    expect(track.year).toBe(raw.year ?? raw.albums?.[0]?.year);
    expect(track.artwork?.key).toMatch(/^yandex-artwork:/);
    expect(track.artwork?.key).not.toContain('https://');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(PROVIDER_SCHEMA_VERSION).toBe('1.1.0');
  });

  it('использует full album endpoint и сохраняет все real volumes', async () => {
    const envelope = fixture('album');
    const raw = z.object({ result: rawAlbumSchema }).parse(envelope).result;
    const fetch = vi.fn<AuthFetch>().mockResolvedValue(response(envelope));
    const album = await setup(fetch).provider.getAlbum(String(raw.id));
    expect(album.tracks.map((track) => track.id)).toEqual(
      raw.volumes.flatMap((volume) => volume.map((track) => String(track.id))),
    );
    expect(album.genre).toBe(raw.genre);
    expect(fetch.mock.calls[0]?.[0]).toContain(`/albums/${raw.id}/with-tracks`);
  });

  it('не возвращает старую сессию после завершения metadata запроса', async () => {
    // F-001: завершение запроса A после logout и входа B не владеет auth state.
    // @link ../../../../../planning/reviews/STEP-009/REVIEW-20261009T141329Z.md
    let saved: string | null = credentials();
    const store: CredentialStore = {
      read: async () => saved,
      write: async (next) => {
        saved = next;
      },
      clear: async () => {
        saved = null;
      },
    };
    let finishFirst!: (value: ReturnType<typeof response>) => void;
    const firstResponse = new Promise<ReturnType<typeof response>>(
      (resolve) => {
        finishFirst = resolve;
      },
    );
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const metadataSessions: (string | undefined)[] = [];
    const envelope = {
      result: [{ id: '101', available: true, title: 'Трек', artists: [] }],
    };
    const fetch: AuthFetch = async (url, init) => {
      if (url.includes('/device/code'))
        return response({
          device_code: 'synthetic-device',
          user_code: 'synthetic-code',
          verification_url: 'https://ya.ru/device',
          expires_in: 60,
          interval: 1,
        });
      if (url.includes('/token'))
        return response({
          access_token: 'synthetic-access-B',
          token_type: 'bearer',
        });
      if (url.includes('/account/status'))
        return response({
          result: { account: { uid: 502, displayName: 'Аккаунт B' } },
        });
      metadataSessions.push(init.headers.Authorization);
      if (metadataSessions.length === 1) {
        markStarted();
        return firstResponse;
      }
      return response(envelope);
    };
    const provider = new YandexMusicProvider({
      credentialStore: store,
      authInteraction: { notify: () => {} },
      fetch,
      browser: { open: async () => {} },
      sleep: async () => {},
      now: () => 10,
    });
    const oldRequest = provider.getTrack('101');
    await started;
    try {
      await provider.logout();
      await expect(provider.authenticate()).resolves.toEqual({
        id: '502',
        displayName: 'Аккаунт B',
        subscriptionReason:
          'Сервис не передал достаточно данных, чтобы определить подписку.',
      });
      await provider.getTrack('101');
    } finally {
      finishFirst(response(envelope));
      await oldRequest;
    }
    await provider.getTrack('101');
    expect(metadataSessions).toEqual([
      'OAuth synthetic-access',
      'OAuth synthetic-access-B',
      'OAuth synthetic-access-B',
    ]);
    expect(JSON.parse(saved ?? 'null')).toMatchObject({
      accountId: '502',
      accessToken: 'synthetic-access-B',
    });
    await provider.logout();
  });

  it('маппит real playlist и оба canonical пути без потери позиций', async () => {
    const envelope = fixture('playlist');
    const raw = z.object({ result: rawPlaylistSchema }).parse(envelope).result;
    const fetch = vi.fn<AuthFetch>().mockResolvedValue(response(envelope));
    const { provider } = setup(fetch);
    const legacy = await provider.getPlaylist(
      'users/fixture-owner/playlists/1000',
    );
    expect(legacy.owner).toBe('fixture-owner');
    expect(legacy.tracks.map(({ track }) => track.id)).toEqual(
      raw.tracks.map((track) => String(track.id)),
    );
    expect(legacy.tracks.map(({ position }) => position)).toEqual(
      raw.tracks.map((_, index) => index + 1),
    );
    await provider.getPlaylist('00000000-0000-4000-8000-000000000001');
    expect(fetch.mock.calls[0]?.[0]).toContain(
      '/users/fixture-owner/playlists/1000',
    );
    expect(fetch.mock.calls[1]?.[0]).toContain(
      '/playlist/00000000-0000-4000-8000-000000000001',
    );
  });

  it('передаёт lk collection через public facade без потери порядка и доступности', async () => {
    const identifier = 'lk.01234567-89ab-cdef-0123-456789abcdef';
    const tracks = [
      { id: '101', available: true, title: 'Доступный', artists: [] },
      { id: '102', available: false },
      { id: '103' },
    ];
    const fetch = vi.fn<AuthFetch>().mockResolvedValue(
      response({
        result: {
          title: 'Мне нравится',
          tracks: tracks.map((track) => ({ id: track.id, track })),
        },
      }),
    );
    const { provider } = setup(fetch);

    const reference = await provider.resolveUrl(
      'https://music.yandex.ru/playlists/lk.01234567-89AB-CDEF-0123-456789ABCDEF?utm_source=share#liked',
    );
    const playlist = await provider.getPlaylist(reference.id);

    expect(reference).toEqual({
      provider: 'yandex-music',
      kind: 'playlist',
      id: identifier,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[0]).toContain(`/playlist/${identifier}`);
    expect(fetch.mock.calls[0]?.[0]).not.toContain(
      '/playlist/01234567-89ab-cdef-0123-456789abcdef',
    );
    expect(
      playlist.tracks.map(({ position, track }) => [
        position,
        track.id,
        track.availability,
      ]),
    ).toEqual([
      [1, '101', 'available'],
      [2, '102', 'unavailable'],
      [3, '103', 'unknown'],
    ]);
  });

  it('отклоняет malformed lk response до SDK defaults', async () => {
    const deJson = vi.spyOn(SdkPlaylist, 'deJson');
    const fetch = vi.fn<AuthFetch>().mockResolvedValue(
      response({
        result: {
          title: 42,
          tracks: [],
        },
      }),
    );

    await expect(
      setup(fetch).provider.getPlaylist(
        'lk.01234567-89ab-cdef-0123-456789abcdef',
      ),
    ).rejects.toMatchObject({ code: 'PROVIDER_RESPONSE_INVALID' });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(deJson).not.toHaveBeenCalled();
  });

  it('сохраняет synthetic minimal records, повторы и все позиции коллекций', async () => {
    const full = { id: '101', available: true, title: 'Трек', artists: [] };
    const denied = { id: '102', available: false };
    const unknown = { id: '103' };
    const tracks = [full, denied, unknown, full];
    const fetch: AuthFetch = async (url) =>
      response({
        result: url.includes('/albums/')
          ? {
              id: 201,
              title: 'Альбом',
              artists: [],
              volumes: [
                [full, denied],
                [unknown, full],
              ],
            }
          : {
              title: 'Плейлист',
              trackCount: 4,
              tracks: tracks.map((track) => ({ id: track.id, track })),
            },
      });
    const { provider } = setup(fetch);
    const album = await provider.getAlbum('201');
    const playlist = await provider.getPlaylist(
      'users/fixture-owner/playlists/1000',
    );
    const expected = [
      ['101', 'available'],
      ['102', 'unavailable'],
      ['103', 'unknown'],
      ['101', 'available'],
    ];
    expect(album.tracks.map((track) => [track.id, track.availability])).toEqual(
      expected,
    );
    expect(
      playlist.tracks.map(({ track }) => [track.id, track.availability]),
    ).toEqual(expected);
    expect(playlist.tracks.map(({ position }) => position)).toEqual([
      1, 2, 3, 4,
    ]);
    expect(album.tracks[1]).toEqual({ id: '102', availability: 'unavailable' });
    expect(album.tracks[2]).toEqual({ id: '103', availability: 'unknown' });
    expect(album).not.toHaveProperty('genre');
  });

  it('сохраняет partial reference и explicit denial без embedded Track', async () => {
    const fetch: AuthFetch = async () =>
      response({
        result: {
          title: 'Плейлист',
          tracks: [{ id: 101 }, { id: 102, available: false }, { id: 101 }],
        },
      });
    const playlist = await setup(fetch).provider.getPlaylist(
      'users/fixture-owner/playlists/1000',
    );
    expect(playlist.tracks).toEqual([
      { position: 1, track: { id: '101', availability: 'unknown' } },
      { position: 2, track: { id: '102', availability: 'unavailable' } },
      { position: 3, track: { id: '101', availability: 'unknown' } },
    ]);
  });

  it('берёт genre выбранного album reference и сохраняет partial metadata', async () => {
    const track = {
      id: 101,
      available: false,
      title: 'Недоступный',
      artists: [],
      albums: [
        { id: 1, title: 'Первый', genre: 'rock' },
        {
          id: 2,
          title: 'Выбранный',
          genre: 'jazz',
          trackPosition: { index: 2, volume: 1 },
          year: 2026,
        },
      ],
    };
    const fetch: AuthFetch = async () =>
      response({
        result: { title: 'Плейлист', tracks: [{ id: 101, albumId: 2, track }] },
      });
    const mapped = (
      await setup(fetch).provider.getPlaylist(
        'users/fixture-owner/playlists/1000',
      )
    ).tracks[0]?.track;
    expect(mapped).toMatchObject({
      availability: 'unavailable',
      title: 'Недоступный',
      artists: [],
      genre: 'jazz',
      album: { id: '2', genre: 'jazz' },
      trackNumber: 2,
      discNumber: 1,
      year: 2026,
    });
  });

  it('различает standalone explicit denial и unknown metadata', async () => {
    const fetch = vi
      .fn<AuthFetch>()
      .mockResolvedValueOnce(
        response({ result: [{ id: 101, available: false }] }),
      )
      .mockResolvedValueOnce(
        response({ result: [{ id: 101, availableForPremiumUsers: true }] }),
      );
    const { provider } = setup(fetch);
    await expect(provider.getTrack('101')).rejects.toBeInstanceOf(
      TrackUnavailableError,
    );
    await expect(provider.getTrack('101')).resolves.toEqual({
      id: '101',
      availability: 'unknown',
    });
  });

  it('отклоняет critical raw defect до SDK deJson (H-001)', async () => {
    const deJson = vi.spyOn(SdkTrack, 'deJson');
    const fetch: AuthFetch = async () =>
      response({
        result: [{ id: 101, available: true, title: 42, artists: [] }],
        extra: 'canary-private-payload',
      });
    const error = await setup(fetch)
      .provider.getTrack('101')
      .catch((cause: unknown) => cause);
    expect(error).toMatchObject({
      code: 'PROVIDER_RESPONSE_INVALID',
      message:
        'API Яндекс Музыки изменился. Текущая версия приложения не поддерживает новый формат ответа.',
    });
    expect(error).not.toBeInstanceOf(TypeError);
    expect(JSON.stringify(error)).not.toContain('canary-private-payload');
    expect(deJson).not.toHaveBeenCalled();
  });

  it('additive unused поля не являются drift', async () => {
    const fetch: AuthFetch = async () =>
      response({
        result: [
          {
            id: 101,
            available: true,
            title: 'Трек',
            artists: [],
            future: { any: 42 },
          },
        ],
        future: true,
      });
    await expect(setup(fetch).provider.getTrack('101')).resolves.toEqual({
      id: '101',
      availability: 'available',
      title: 'Трек',
      artists: [],
    });
  });

  it.each([
    [401, 'AUTH_ERROR'],
    [403, 'AUTH_ERROR'],
    [429, 'SERVICE_UNAVAILABLE'],
    [503, 'SERVICE_UNAVAILABLE'],
    [200, 'PROVIDER_RESPONSE_INVALID'],
  ])(
    'классифицирует HTTP %s без библиотечных деталей',
    async (status, code) => {
      const fetch: AuthFetch = async () =>
        response({ error: 'canary-private-payload' }, status);
      const error = await setup(fetch)
        .provider.getTrack('101')
        .catch((cause: unknown) => cause);
      expect(error).toMatchObject({ code });
      expect(JSON.stringify(error)).not.toContain('canary-private-payload');
    },
  );

  it.each(['NETWORK_ERROR', 'API_CHANGED'] as const)(
    'сохраняет классифицированный %s без replay',
    async (code) => {
      const fetch = vi
        .fn<AuthFetch>()
        .mockRejectedValue(
          code === 'API_CHANGED'
            ? new ProviderError(code, false)
            : new Error('canary-private-payload'),
        );
      const error = await setup(fetch)
        .provider.getTrack('101')
        .catch((cause: unknown) => cause);
      expect(error).toMatchObject({ code });
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(error)).not.toContain('canary-private-payload');
    },
  );

  it('expiry и logout не обходятся metadata path (H-002)', async () => {
    const fetch = vi.fn<AuthFetch>();
    await expect(
      setup(fetch, credentials(1)).provider.getTrack('101'),
    ).rejects.toMatchObject({ code: 'AUTH_ERROR' });
    const { provider, store } = setup(fetch);
    await provider.logout();
    await expect(provider.getAlbum('201')).rejects.toMatchObject({
      code: 'AUTH_ERROR',
    });
    expect(store.read).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('не восстанавливает token после failed clear', async () => {
    const fetch = vi.fn<AuthFetch>();
    const { provider, store } = setup(fetch, credentials(), true);
    await expect(provider.logout()).rejects.toThrow('synthetic-clear-failure');
    await expect(provider.getTrack('101')).rejects.toMatchObject({
      code: 'AUTH_ERROR',
    });
    expect(store.read).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});

it('REQ-058: описание и изображение автора проецируются из optional metadata без raw payload', async () => {
  const { mapAlbum, mapPlaylist } = await import('./mappers.js');
  const uri = 'avatars.yandex.net/get-music-content/1/fixture/%%';
  const album = mapAlbum(
    rawAlbumSchema.parse({
      id: 1,
      title: 'Альбом',
      description: 'Описание',
      artists: [{ id: 2, name: 'Автор', cover: { uri } }],
      volumes: [],
      token: 'secret',
    }),
  );
  expect(album.description).toBe('Описание');
  expect(album.artists[0]?.artwork).toMatchObject({
    key: expect.stringMatching(/^yandex-artwork:/),
  });
  expect(JSON.stringify(album)).not.toContain('secret');
  const playlist = mapPlaylist(
    rawPlaylistSchema.parse({
      title: 'Список',
      description: 'Описание списка',
      tracks: [],
      owner: { name: 'Автор' },
    }),
    '1',
  );
  expect(playlist.description).toBe('Описание списка');
  expect(playlist.authorArtwork).toBeUndefined();
});
