import {
  UnsupportedUrlError,
  type MediaReference,
} from '@music-downloader/shared';

const supportedHosts = new Set([
  'music.yandex.ru',
  'music.yandex.by',
  'music.yandex.kz',
  'music.yandex.com',
  'music.yandex.uz',
]);

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Разбирает публичную ссылку офлайн, чтобы граница provider не передавала URL
 * будущим потребителям. @link ../../../../../planning/tasks/STEP-007.md
 */
export async function resolveYandexMusicUrl(
  input: string,
): Promise<MediaReference> {
  try {
    const url = new URL(input.trim());
    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:') ||
      !supportedHosts.has(url.hostname) ||
      url.username !== '' ||
      url.password !== '' ||
      url.port !== ''
    ) {
      throw new UnsupportedUrlError();
    }

    const reference = resolvePathname(url.pathname);
    if (reference === undefined) throw new UnsupportedUrlError();
    return reference;
  } catch {
    // Не переносим пользовательскую ссылку или причину в ошибку по PRN-002. @link ../../../../../docs/requirements/REQ-009-url-resolver.md
    throw new UnsupportedUrlError();
  }
}

function resolvePathname(pathname: string): MediaReference | undefined {
  const track = /^\/track\/(\d+)\/?$/.exec(pathname);
  if (track?.[1] !== undefined)
    return mediaReference('track', canonicalNumericId(track[1]));

  const albumTrack = /^\/album\/(\d+)\/track\/(\d+)\/?$/.exec(pathname);
  if (albumTrack?.[2] !== undefined)
    return mediaReference('track', canonicalNumericId(albumTrack[2]));

  const album = /^\/album\/(\d+)\/?$/.exec(pathname);
  if (album?.[1] !== undefined)
    return mediaReference('album', canonicalNumericId(album[1]));

  const legacyPlaylist = /^\/users\/([^/]*)\/playlists\/(\d+)\/?$/.exec(
    pathname,
  );
  if (legacyPlaylist?.[1] !== undefined && legacyPlaylist[2] !== undefined) {
    const owner = decodeOwner(legacyPlaylist[1]);
    if (owner !== undefined)
      return mediaReference(
        'playlist',
        `users/${encodeURIComponent(owner)}/playlists/${canonicalNumericId(legacyPlaylist[2])}`,
      );
  }

  const uuidPlaylist = /^\/playlists\/([0-9a-f-]+)\/?$/i.exec(pathname);
  if (uuidPlaylist?.[1] !== undefined && uuidPattern.test(uuidPlaylist[1]))
    return mediaReference('playlist', uuidPlaylist[1].toLowerCase());

  return undefined;
}

function decodeOwner(value: string): string | undefined {
  try {
    const decoded = decodeURIComponent(value);
    return decoded !== '' && !decoded.includes('/') ? decoded : undefined;
  } catch {
    return undefined;
  }
}

function mediaReference(
  kind: MediaReference['kind'],
  id: string,
): MediaReference {
  return { provider: 'yandex-music', kind, id };
}

function canonicalNumericId(value: string): string {
  return value.replace(/^0+(?=\d)/, '');
}
