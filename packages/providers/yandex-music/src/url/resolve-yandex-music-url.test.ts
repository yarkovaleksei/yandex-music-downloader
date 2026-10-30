import {
  UnsupportedUrlError,
  type MusicProvider,
} from '@music-downloader/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveYandexMusicUrl } from './resolve-yandex-music-url.js';

const resolveUrl: MusicProvider['resolveUrl'] = resolveYandexMusicUrl;
const syntheticQueryCanary = 'private-query-canary';

describe('resolveYandexMusicUrl', () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');

  beforeEach(() => {
    fetchSpy.mockImplementation(() => {
      throw new Error('Resolver не должен выполнять сетевые запросы.');
    });
  });

  afterEach(() => {
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockReset();
  });

  it.each([
    [
      'https://music.yandex.ru/track/0009007199254740993',
      { provider: 'yandex-music', kind: 'track', id: '9007199254740993' },
    ],
    [
      'https://music.yandex.ru/album/0007/track/0009007199254740993/',
      { provider: 'yandex-music', kind: 'track', id: '9007199254740993' },
    ],
    [
      'http://music.yandex.by:80/album/0007?utm_source=test#track',
      { provider: 'yandex-music', kind: 'album', id: '7' },
    ],
    [
      'https://MUSIC.YANDEX.KZ/track/42?from=share',
      { provider: 'yandex-music', kind: 'track', id: '42' },
    ],
    [
      'https://music.yandex.ru:443/track/42?url=https://evil.test/track/1',
      { provider: 'yandex-music', kind: 'track', id: '42' },
    ],
    [
      'https://music.yandex.com/users/Owner%20Name/playlists/0008',
      {
        provider: 'yandex-music',
        kind: 'playlist',
        id: 'users/Owner%20Name/playlists/8',
      },
    ],
    [
      ' https://music.yandex.uz/playlists/1C2F4E22-B0F3-B81A-B471-36E6C248C859#fragment ',
      {
        provider: 'yandex-music',
        kind: 'playlist',
        id: '1c2f4e22-b0f3-b81a-b471-36e6c248c859',
      },
    ],
    // F-001: ведущий ноль UUID является частью непрозрачной идентичности playlist.
    [
      'https://music.yandex.ru/playlists/01234567-89AB-CDEF-0123-456789ABCDEF',
      {
        provider: 'yandex-music',
        kind: 'playlist',
        id: '01234567-89ab-cdef-0123-456789abcdef',
      },
    ],
    [
      'https://music.yandex.by/playlists/lk.01234567-89AB-CDEF-0123-456789ABCDEF?utm_source=share#liked',
      {
        provider: 'yandex-music',
        kind: 'playlist',
        id: 'lk.01234567-89ab-cdef-0123-456789abcdef',
      },
    ],
    [
      'https://music.yandex.com/playlists/lk.1c2f4e22-b0f3-b81a-b471-36e6c248c859',
      {
        provider: 'yandex-music',
        kind: 'playlist',
        id: 'lk.1c2f4e22-b0f3-b81a-b471-36e6c248c859',
      },
    ],
  ] as const)('нормализует %s', async (url, expected) => {
    await expect(resolveYandexMusicUrl(url)).resolves.toEqual(expected);
  });

  it('даёт один MediaReference для эквивалентных ссылок track', async () => {
    const direct = await resolveUrl('https://music.yandex.ru/track/42');
    const nested = await resolveYandexMusicUrl(
      'https://music.yandex.ru/album/7/track/00042/?utm_campaign=test#share',
    );

    expect(direct).toEqual(nested);
    await expect(
      resolveYandexMusicUrl('https://music.yandex.ru/track/42'),
    ).resolves.toEqual(direct);
  });

  it('сохраняет owner и kind в идентичности legacy playlist', async () => {
    await expect(
      resolveYandexMusicUrl(
        'https://music.yandex.ru/users/Owner/playlists/0007',
      ),
    ).resolves.toEqual({
      provider: 'yandex-music',
      kind: 'playlist',
      id: 'users/Owner/playlists/7',
    });
    await expect(
      resolveYandexMusicUrl(
        'https://music.yandex.ru/users/Owner%20Name/playlists/7',
      ),
    ).resolves.toEqual(
      await resolveYandexMusicUrl(
        'https://music.yandex.ru/users/Owner Name/playlists/7',
      ),
    );
    await expect(
      resolveYandexMusicUrl('https://music.yandex.ru/users/other/playlists/7'),
    ).resolves.not.toEqual({
      provider: 'yandex-music',
      kind: 'playlist',
      id: 'users/Owner/playlists/7',
    });
  });

  it.each([
    'not a URL',
    '/track/42',
    `https://example.test/track/42?${syntheticQueryCanary}`,
    'https://example.test/music.yandex.ru/track/42',
    'https://music.yandex.ru@evil.test/track/42',
    'ftp://music.yandex.ru/track/42',
    'https://music.yandex.ru:444/track/42',
    'https://music.yandex.ru/artist/42',
    'https://music.yandex.ru/track/',
    'https://music.yandex.ru/track/abc',
    'https://music.yandex.ru/track/42/extra',
    'https://music.yandex.ru/users//playlists/7',
    'https://music.yandex.ru/users/%2F/playlists/7',
    'https://music.yandex.ru/users/%ZZ/playlists/7',
    'https://music.yandex.ru/playlists/1c2f4e22-b0f3-b81a-b471-36e6c248c85',
    'https://music.yandex.ru/playlists/lk.1c2f4e22-b0f3-b81a-b471-36e6c248c85',
    'https://music.yandex.ru/playlists/fk.1c2f4e22-b0f3-b81a-b471-36e6c248c859',
    'https://music.yandex.ru/playlists/1c2f4e22-b0f3-b81a-b471-36e6c248c859/extra',
    'https://music.yandex.ru/playlists/lk.1c2f4e22-b0f3-b81a-b471-36e6c248c859/extra',
    'https://music.yandex.ru/iframe?url=/track/42',
  ])('безопасно отклоняет %s', async (url) => {
    await expect(resolveYandexMusicUrl(url)).rejects.toBeInstanceOf(
      UnsupportedUrlError,
    );
    await expect(resolveYandexMusicUrl(url)).rejects.toMatchObject({
      code: 'UNSUPPORTED_URL',
      retryable: false,
    });

    try {
      await resolveYandexMusicUrl(url);
    } catch (error) {
      expect(error).toBeInstanceOf(UnsupportedUrlError);
      expect(
        error instanceof UnsupportedUrlError && error.message,
      ).not.toContain(syntheticQueryCanary);
      expect(
        error instanceof UnsupportedUrlError && JSON.stringify(error.toJSON()),
      ).not.toContain(syntheticQueryCanary);
    }
  });
});
