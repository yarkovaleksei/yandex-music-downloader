import type { Album, Playlist, Track } from '@music-downloader/shared';
import { invalidProviderResponse } from '../auth-errors.js';
import { artworkReference } from './artwork.js';
import {
  albumProjectionSchema,
  playlistProjectionSchema,
  trackProjectionSchema,
  type RawAlbum,
  type RawPlaylist,
  type RawTrack,
} from './schemas.js';

/** Raw metadata сохраняет absence/genre/availability, которые SDK может изменить.
 * @link ../../../../../docs/adr/ADR-011-shared-metadata-contract.md
 */
export function mapTrack(
  raw: RawTrack,
  model?: { title?: string },
  albumId?: string,
): Track {
  const album =
    raw.albums?.find((item) => String(item.id) === albumId) ?? raw.albums?.[0];
  const genre = raw.genre ?? album?.genre;
  const projected = {
    id: String(raw.id),
    availability:
      raw.available === true
        ? 'available'
        : raw.available === false
          ? 'unavailable'
          : 'unknown',
    ...(raw.title === undefined ? {} : { title: model?.title ?? raw.title }),
    ...(raw.artists === undefined
      ? {}
      : {
          artists: raw.artists.map((artist) => ({
            id: String(artist.id),
            name: artist.name,
            ...(artist.cover?.uri === undefined
              ? {}
              : { artwork: artworkReference(artist.cover.uri) }),
          })),
        }),
    ...(album === undefined
      ? {}
      : {
          album: {
            id: String(album.id),
            title: album.title,
            ...(album.genre === undefined ? {} : { genre: album.genre }),
            ...(album.coverUri === undefined
              ? {}
              : { artwork: artworkReference(album.coverUri) }),
          },
        }),
    ...(raw.durationMs === undefined ? {} : { durationMs: raw.durationMs }),
    ...(raw.trackNumber === undefined &&
    album?.trackPosition?.index === undefined
      ? {}
      : { trackNumber: raw.trackNumber ?? album?.trackPosition?.index }),
    ...(raw.discNumber === undefined &&
    album?.trackPosition?.volume === undefined
      ? {}
      : { discNumber: raw.discNumber ?? album?.trackPosition?.volume }),
    ...(raw.year === undefined && album?.year === undefined
      ? {}
      : { year: raw.year ?? album?.year }),
    ...(genre === undefined ? {} : { genre }),
    ...(raw.coverUri === undefined
      ? {}
      : { artwork: artworkReference(raw.coverUri) }),
  };
  const parsed = trackProjectionSchema.safeParse(projected);
  if (!parsed.success) throw invalidProviderResponse();
  return parsed.data;
}

export function mapAlbum(raw: RawAlbum, model?: { title?: string }): Album {
  const projected = {
    id: String(raw.id),
    title: model?.title ?? raw.title,
    ...(raw.description === undefined ? {} : { description: raw.description }),
    artists: raw.artists.map((artist) => ({
      id: String(artist.id),
      name: artist.name,
      ...(artist.cover?.uri === undefined
        ? {}
        : { artwork: artworkReference(artist.cover.uri) }),
    })),
    ...(raw.genre === undefined ? {} : { genre: raw.genre }),
    ...(raw.year === undefined ? {} : { year: raw.year }),
    ...(raw.coverUri === undefined
      ? {}
      : { artwork: artworkReference(raw.coverUri) }),
    tracks: raw.volumes.flatMap((volume) =>
      volume.map((track) => mapTrack(track, undefined, String(raw.id))),
    ),
  };
  const parsed = albumProjectionSchema.safeParse(projected);
  if (!parsed.success) throw invalidProviderResponse();
  return parsed.data;
}

export function mapPlaylist(
  raw: RawPlaylist,
  id: string,
  model?: { title?: string },
): Playlist {
  const owner =
    raw.owner?.login ??
    raw.owner?.name ??
    (raw.owner?.uid === undefined
      ? raw.uid === undefined
        ? undefined
        : String(raw.uid)
      : String(raw.owner.uid));
  const projected = {
    id,
    title: model?.title ?? raw.title,
    ...(raw.description === undefined ? {} : { description: raw.description }),
    ...(owner === undefined ? {} : { owner }),
    ...(raw.cover?.uri === undefined
      ? {}
      : { artwork: artworkReference(raw.cover.uri) }),
    tracks: raw.tracks.map((item, index) => ({
      position: index + 1,
      track: mapTrack(
        item.track == null
          ? { id: item.id, available: item.available }
          : {
              ...item.track,
              ...(item.available === false ? { available: false } : {}),
            },
        undefined,
        item.albumId === undefined ? undefined : String(item.albumId),
      ),
    })),
  };
  const parsed = playlistProjectionSchema.safeParse(projected);
  if (!parsed.success) throw invalidProviderResponse();
  return parsed.data;
}
