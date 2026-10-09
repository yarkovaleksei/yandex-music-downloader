import { describe, expect, it, vi } from 'vitest';
import type { AuthFetch } from '../auth-transport.js';
import { YandexMusicProvider } from '../index.js';
import { artworkReference } from './artwork.js';

/** H-002: binary request не наследует OAuth state и не экспортирует CDN URL.
 * @link ../../../../../planning/tasks/STEP-009.md
 */
describe('provider artwork', () => {
  it('возвращает точные bytes/MIME и размер без Authorization', async () => {
    const fetch = vi.fn<AuthFetch>().mockResolvedValue({
      status: 200,
      headers: { get: () => 'image/jpeg; charset=binary' },
      arrayBuffer: async () => Uint8Array.from([255, 216, 255]).buffer,
    });
    const provider = new YandexMusicProvider({
      credentialStore: {
        read: async () => null,
        write: async () => {},
        clear: async () => {},
      },
      authInteraction: { notify: () => {} },
      fetch,
    });
    const ref = artworkReference(
      'avatars.yandex.net/get-music-content/1/hash.a.201-1/%%',
    );
    expect(await provider.fetchArtwork(ref, 300)).toEqual({
      bytes: Uint8Array.from([255, 216, 255]),
      mimeType: 'image/jpeg',
    });
    expect(fetch.mock.calls[0]?.[0]).toBe(
      'https://avatars.yandex.net/get-music-content/1/hash.a.201-1/300x300',
    );
    expect(fetch.mock.calls[0]?.[1].headers).toEqual({ Accept: 'image/*' });
    expect(fetch.mock.calls[0]?.[1].redirect).toBe('error');
  });
  it.each([
    'https://untrusted.invalid/get-cover/1/id/%%',
    'avatars.yandex.net/get-cover/1/id/%%?token=synthetic',
    'avatars.yandex.net/get-cover/1/id/%%#synthetic',
  ])('отклоняет unsupported resource %s', (uri) => {
    expect(() => artworkReference(uri)).toThrow();
  });
  it('отклоняет произвольный key и некорректный size до network', async () => {
    const fetch = vi.fn<AuthFetch>();
    const provider = new YandexMusicProvider({
      credentialStore: {
        read: async () => null,
        write: async () => {},
        clear: async () => {},
      },
      authInteraction: { notify: () => {} },
      fetch,
    });
    await expect(
      provider.fetchArtwork({ key: 'https://untrusted.invalid' }, 100),
    ).rejects.toMatchObject({ code: 'DOWNLOAD_ERROR' });
    await expect(
      provider.fetchArtwork(
        artworkReference('avatars.yandex.net/get-cover/1/id/%%'),
        0,
      ),
    ).rejects.toMatchObject({ code: 'DOWNLOAD_ERROR' });
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([401, 403, 503])(
    'не классифицирует CDN %s как OAuth expiry',
    async (status) => {
      const fetch = vi.fn<AuthFetch>().mockResolvedValue({
        status,
        arrayBuffer: async () => new ArrayBuffer(0),
      });
      const provider = new YandexMusicProvider({
        credentialStore: {
          read: async () => null,
          write: async () => {},
          clear: async () => {},
        },
        authInteraction: { notify: () => {} },
        fetch,
      });
      await expect(
        provider.fetchArtwork(
          artworkReference('avatars.yandex.net/get-cover/1/id/%%'),
          100,
        ),
      ).rejects.toMatchObject({
        code: status === 503 ? 'SERVICE_UNAVAILABLE' : 'DOWNLOAD_ERROR',
      });
    },
  );
});
