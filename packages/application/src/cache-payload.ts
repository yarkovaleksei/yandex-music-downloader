import type {
  Album,
  ArtworkData,
  ArtworkRef,
  Artist,
  Playlist,
  Track,
} from '@music-downloader/shared';

type CachePayload =
  | { readonly kind: 'track'; readonly value: Track }
  | { readonly kind: 'album'; readonly value: Album }
  | { readonly kind: 'playlist'; readonly value: Playlist }
  | {
      readonly kind: 'artwork';
      readonly value: { readonly mimeType: string; readonly base64: string };
    };

function artwork(value: ArtworkRef | undefined): ArtworkRef | undefined {
  return value === undefined ? undefined : { key: value.key };
}

function artist(value: Artist): Artist {
  return { id: value.id, name: value.name };
}

function track(value: Track): Track {
  return {
    id: value.id,
    availability: value.availability,
    ...(value.title === undefined ? {} : { title: value.title }),
    ...(value.artists === undefined
      ? {}
      : { artists: value.artists.map(artist) }),
    ...(value.album === undefined
      ? {}
      : {
          album: {
            id: value.album.id,
            title: value.album.title,
            ...(value.album.genre === undefined
              ? {}
              : { genre: value.album.genre }),
            ...(artwork(value.album.artwork) === undefined
              ? {}
              : { artwork: artwork(value.album.artwork) }),
          },
        }),
    ...(value.durationMs === undefined ? {} : { durationMs: value.durationMs }),
    ...(value.trackNumber === undefined
      ? {}
      : { trackNumber: value.trackNumber }),
    ...(value.discNumber === undefined ? {} : { discNumber: value.discNumber }),
    ...(value.year === undefined ? {} : { year: value.year }),
    ...(value.genre === undefined ? {} : { genre: value.genre }),
    ...(artwork(value.artwork) === undefined
      ? {}
      : { artwork: artwork(value.artwork) }),
  } as Track;
}

function payload(value: CachePayload): string | undefined {
  const serialized = JSON.stringify(value);
  // URL с параметром доступа нельзя сохранять даже в допустимом текстовом поле metadata.
  if (
    /https?:\/\/[^\s]+[?&](?:token|signature|sig|authorization|cookie|x-amz-[^=]+)=/i.test(
      serialized,
    )
  )
    return undefined;
  return serialized;
}

/** Сохраняет только поля shared metadata, исключая provider-private URL и download info. */
export function encodeTrack(value: Track): string | undefined {
  return payload({ kind: 'track', value: track(value) });
}

export function encodeAlbum(value: Album): string | undefined {
  return payload({
    kind: 'album',
    value: {
      id: value.id,
      title: value.title,
      artists: value.artists.map(artist),
      ...(value.year === undefined ? {} : { year: value.year }),
      ...(value.genre === undefined ? {} : { genre: value.genre }),
      ...(artwork(value.artwork) === undefined
        ? {}
        : { artwork: artwork(value.artwork) }),
      tracks: value.tracks.map(track),
    },
  });
}

export function encodePlaylist(value: Playlist): string | undefined {
  return payload({
    kind: 'playlist',
    value: {
      id: value.id,
      title: value.title,
      ...(value.owner === undefined ? {} : { owner: value.owner }),
      ...(artwork(value.artwork) === undefined
        ? {}
        : { artwork: artwork(value.artwork) }),
      tracks: value.tracks.map((item) => ({
        position: item.position,
        track: track(item.track),
      })),
    },
  });
}

export function encodeArtwork(value: ArtworkData): string | undefined {
  return payload({
    kind: 'artwork',
    value: {
      mimeType: value.mimeType,
      base64: Buffer.from(value.bytes).toString('base64'),
    },
  });
}

function parse(
  value: string,
  kind: CachePayload['kind'],
): CachePayload | undefined {
  try {
    const parsed = JSON.parse(value) as CachePayload;
    return parsed.kind === kind ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isArtwork(value: unknown): boolean {
  return isRecord(value) && typeof value.key === 'string';
}

function isArtist(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string'
  );
}

function isTrack(value: unknown): value is Track {
  if (!isRecord(value) || typeof value.id !== 'string') return false;
  if (
    !['available', 'unavailable', 'unknown'].includes(
      String(value.availability),
    )
  )
    return false;
  if (value.title !== undefined && typeof value.title !== 'string')
    return false;
  if (
    value.artists !== undefined &&
    (!Array.isArray(value.artists) || !value.artists.every(isArtist))
  )
    return false;
  if (
    value.availability === 'available' &&
    (typeof value.title !== 'string' || !Array.isArray(value.artists))
  )
    return false;
  if (value.album !== undefined) {
    if (
      !isRecord(value.album) ||
      typeof value.album.id !== 'string' ||
      typeof value.album.title !== 'string' ||
      (value.album.genre !== undefined &&
        typeof value.album.genre !== 'string') ||
      (value.album.artwork !== undefined && !isArtwork(value.album.artwork))
    )
      return false;
  }
  for (const key of [
    'durationMs',
    'trackNumber',
    'discNumber',
    'year',
  ] as const)
    if (value[key] !== undefined && !Number.isFinite(value[key])) return false;
  return (
    (value.genre === undefined || typeof value.genre === 'string') &&
    (value.artwork === undefined || isArtwork(value.artwork))
  );
}

function isAlbum(value: unknown): value is Album {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    Array.isArray(value.artists) &&
    value.artists.every(isArtist) &&
    Array.isArray(value.tracks) &&
    value.tracks.every(isTrack) &&
    (value.year === undefined || Number.isFinite(value.year)) &&
    (value.genre === undefined || typeof value.genre === 'string') &&
    (value.artwork === undefined || isArtwork(value.artwork))
  );
}

function isPlaylist(value: unknown): value is Playlist {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    Array.isArray(value.tracks) &&
    value.tracks.every(
      (item) =>
        isRecord(item) &&
        Number.isSafeInteger(item.position) &&
        (item.position as number) > 0 &&
        isTrack(item.track),
    ) &&
    (value.owner === undefined || typeof value.owner === 'string') &&
    (value.artwork === undefined || isArtwork(value.artwork))
  );
}

/** JSON round-trip создаёт независимый snapshot и отвергает повреждённый cache payload. */
export function decodeTrack(value: string): Track | undefined {
  const parsed = parse(value, 'track');
  return parsed?.kind === 'track' && isTrack(parsed.value)
    ? track(parsed.value)
    : undefined;
}

export function decodeAlbum(value: string): Album | undefined {
  const parsed = parse(value, 'album');
  return parsed?.kind === 'album' && isAlbum(parsed.value)
    ? {
        ...parsed.value,
        artists: parsed.value.artists.map(artist),
        tracks: parsed.value.tracks.map(track),
      }
    : undefined;
}

export function decodePlaylist(value: string): Playlist | undefined {
  const parsed = parse(value, 'playlist');
  return parsed?.kind === 'playlist' && isPlaylist(parsed.value)
    ? {
        ...parsed.value,
        tracks: parsed.value.tracks.map((item) => ({
          position: item.position,
          track: track(item.track),
        })),
      }
    : undefined;
}

export function decodeArtwork(value: string): ArtworkData | undefined {
  const parsed = parse(value, 'artwork');
  if (
    parsed?.kind !== 'artwork' ||
    !isRecord(parsed.value) ||
    typeof parsed.value.mimeType !== 'string' ||
    typeof parsed.value.base64 !== 'string'
  )
    return undefined;
  return {
    mimeType: parsed.value.mimeType,
    bytes: new Uint8Array(Buffer.from(parsed.value.base64, 'base64')),
  };
}
