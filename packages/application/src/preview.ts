import {
  buildAlbumPlan,
  buildPlaylistPlan,
  buildTrackPlan,
  resolveVariant,
} from '@music-downloader/core-planner';
import type {
  Album,
  JsonObject,
  MediaReference,
  MusicProvider,
  PreviewDto,
  Track,
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
    buildTrackPlan(source, track);
  } else if (source.kind === 'album') {
    const album = await provider.getAlbum(source.id);
    title = album.title;
    author = album.artists.map((artist) => artist.name).join(', ') || undefined;
    positions = album.tracks;
    tracks = albumTracks(album);
    artwork = album.artwork;
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
        (items) => resolveVariant(items, preference).ok,
      ).length,
      total: positions.length,
    }),
  );
  const image =
    artwork === undefined
      ? undefined
      : await provider.fetchArtwork(artwork, 300);
  return {
    source,
    kind: source.kind,
    title,
    tracks,
    qualities,
    ...(author ? { author } : {}),
    ...(image === undefined
      ? {}
      : {
          artwork: {
            mimeType: image.mimeType,
            base64: Buffer.from(image.bytes).toString('base64'),
          },
        }),
  };
}
