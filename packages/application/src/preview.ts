import {
  buildAlbumPlan,
  buildPlaylistPlan,
  buildTrackPlan,
  resolveVariant,
  matchesVariant,
} from '@music-downloader/core-planner';
import type {
  Album,
  JsonObject,
  MediaReference,
  MusicProvider,
  PreviewDto,
  Track,
  ArtworkDto,
  ArtworkRef,
  VariantSelection,
  AudioVariant,
} from '@music-downloader/shared';

/**
 * Preview — публичная граница: provider metadata может содержать внутренние
 * ссылки, поэтому в DTO попадает только стабильный набор полей.
 */
function trackDto(track: Track): JsonObject {
  return {
    id: track.id,
    availability: track.availability,
    ...(track.title === undefined ? {} : { title: track.title }),
    ...(track.artists === undefined
      ? {}
      : {
          artists: track.artists.map((artist) => ({
            id: artist.id,
            name: artist.name,
          })),
        }),
    ...(track.durationMs === undefined ? {} : { durationMs: track.durationMs }),
    ...(track.trackNumber === undefined
      ? {}
      : { trackNumber: track.trackNumber }),
    ...(track.discNumber === undefined ? {} : { discNumber: track.discNumber }),
    ...(track.year === undefined ? {} : { year: track.year }),
    ...(track.genre === undefined ? {} : { genre: track.genre }),
    ...(track.album === undefined
      ? {}
      : {
          album: {
            id: track.album.id,
            title: track.album.title,
            ...(track.album.genre === undefined
              ? {}
              : { genre: track.album.genre }),
          },
        }),
  };
}

function albumTracks(album: Album): readonly JsonObject[] {
  return album.tracks.map(trackDto);
}

/** Preview получает metadata/artwork только через provider и не открывает audio stream. */
export async function preview(
  provider: MusicProvider,
  source: MediaReference,
): Promise<PreviewDto> {
  let title: string;
  let description: string | undefined;
  let authorArtwork: ArtworkRef | undefined;
  let author: string | undefined;
  let positions: readonly Track[];
  let tracks: readonly JsonObject[];
  let artwork: { readonly key: string } | undefined;
  if (source.kind === 'track') {
    const track = await provider.getTrack(source.id);
    title = track.title ?? '';
    author =
      track.artists?.map((artist) => artist.name).join(', ') || undefined;
    positions = [track];
    tracks = [trackDto(track)];
    artwork = track.artwork;
    authorArtwork = track.artists?.[0]?.artwork;
    buildTrackPlan(source, track);
  } else if (source.kind === 'album') {
    const album = await provider.getAlbum(source.id);
    title = album.title;
    author = album.artists.map((artist) => artist.name).join(', ') || undefined;
    positions = album.tracks;
    tracks = albumTracks(album);
    artwork = album.artwork;
    description = album.description;
    authorArtwork = album.artists[0]?.artwork;
    buildAlbumPlan(source, album);
  } else {
    const playlist = await provider.getPlaylist(source.id);
    title = playlist.title;
    author = playlist.owner;
    positions = playlist.tracks.map((item) => item.track);
    tracks = playlist.tracks.map((item) => ({
      position: item.position,
      track: trackDto(item.track),
    }));
    artwork = playlist.artwork;
    description = playlist.description;
    authorArtwork = playlist.authorArtwork;
    buildPlaylistPlan(source, playlist);
  }
  // REQ-049: покрытие считается по позициям, включая повторы; ключи вариантов не покидают application.
  const variants = await Promise.all(
    positions.map((track) =>
      track.availability === 'available'
        ? provider.getAudioVariants(track.id)
        : Promise.resolve([]),
    ),
  );
  const qualities = (['best', 'lossless', 'high', 'normal'] as const).map(
    (preference) => ({
      preference,
      available: variants.filter(
        (items) =>
          resolveVariant(items, preference, {
            supports: supportsDownloadVariant,
          }).ok,
      ).length,
      total: positions.length,
    }),
  );
  const selectors: VariantSelection[] = [];
  for (const item of variants.flat().filter(supportsDownloadVariant)) {
    if (!selectors.some((selection) => matchesVariant(item, selection)))
      selectors.push({
        codec: item.codec,
        container: item.container,
        lossless: item.lossless,
        ...(item.bitrate === undefined ? {} : { bitrate: item.bitrate }),
      });
  }
  const explicit = selectors.map((selection) => ({
    selection,
    available: variants.filter(
      (items) =>
        resolveVariant(items, 'best', {
          supports: supportsDownloadVariant,
          variantSelection: selection,
        }).ok,
    ).length,
    total: positions.length,
  }));
  // Один ресурс переиспользуется для главной обложки и миниатюр, включая повторы playlist.
  const images = new Map<string, Promise<ArtworkDto | undefined>>();
  const imageFor = (reference: ArtworkRef | undefined, size: number) => {
    if (reference === undefined) return Promise.resolve(undefined);
    let pending = images.get(reference.key);
    if (pending === undefined) {
      pending = imageDto(provider, reference, size);
      images.set(reference.key, pending);
    }
    return pending;
  };
  const image = await imageFor(artwork, 300);
  const authorImage = await imageFor(authorArtwork, 100);
  // Миниатюры безопасны и необязательны; сбой CDN не ломает metadata preview (REQ-058).
  tracks = await Promise.all(
    tracks.map(async (item, index) => {
      const thumbnail = await imageFor(positions[index]?.artwork, 100);
      return thumbnail ? { ...item, artwork: { ...thumbnail } } : item;
    }),
  );
  return {
    source,
    kind: source.kind,
    title,
    tracks,
    qualities,
    variants: explicit,
    ...(description === undefined ? {} : { description }),
    ...(positions.length > 0 &&
    positions.every((track) => track.durationMs !== undefined)
      ? {
          durationMs: positions.reduce(
            (sum, track) => sum + track.durationMs!,
            0,
          ),
        }
      : {}),
    ...(authorImage === undefined ? {} : { authorArtwork: authorImage }),
    ...(author ? { author } : {}),
    ...(image === undefined
      ? {}
      : {
          artwork: image,
        }),
  };
}

async function imageDto(
  provider: MusicProvider,
  reference: ArtworkRef | undefined,
  size: number,
): Promise<ArtworkDto | undefined> {
  if (reference === undefined) return undefined;
  try {
    const image = await provider.fetchArtwork(reference, size);
    if (
      !['image/jpeg', 'image/png', 'image/webp'].includes(image.mimeType) ||
      image.bytes.length > 2 * 1024 * 1024
    )
      return undefined;
    return {
      mimeType: image.mimeType,
      base64: Buffer.from(image.bytes).toString('base64'),
    };
  } catch {
    return undefined;
  }
}

/** REQ-058 H-002: существующие writer/validator подтверждают эти контейнеры, raw FLAC пока unavailable. */
export function supportsDownloadVariant(variant: AudioVariant): boolean {
  return (
    (variant.codec === 'mp3' &&
      variant.container === 'mp3' &&
      !variant.lossless) ||
    (variant.codec === 'aac' &&
      variant.container === 'm4a' &&
      !variant.lossless) ||
    (variant.codec === 'flac' &&
      variant.container === 'm4a' &&
      variant.lossless)
  );
}
