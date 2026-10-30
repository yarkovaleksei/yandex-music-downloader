import { z } from 'zod';

const id = z.union([z.string().min(1), z.number().int().nonnegative()]);
const title = z.string().min(1);
const integer = z.number().int().nonnegative();
const artist = z.object({
  id,
  name: title,
  cover: z.object({ uri: z.string().optional() }).optional(),
});
const albumReference = z.object({
  id,
  title,
  genre: z.string().optional(),
  year: integer.optional(),
  coverUri: z.string().optional(),
  trackPosition: z
    .object({ volume: integer.optional(), index: integer.optional() })
    .optional(),
});

/** Проверка выполняется до deJson; SDK defaults не подтверждают metadata/access.
 * @link ../../../../../docs/adr/ADR-011-shared-metadata-contract.md
 */
export const rawTrackSchema = z
  .object({
    id,
    available: z.boolean().optional(),
    title: title.optional(),
    artists: z.array(artist).optional(),
    albums: z.array(albumReference).optional(),
    genre: z.string().optional(),
    durationMs: z.number().finite().nonnegative().optional(),
    trackNumber: integer.optional(),
    discNumber: integer.optional(),
    year: integer.optional(),
    coverUri: z.string().optional(),
  })
  .refine(
    (track) =>
      track.available !== true ||
      (track.title !== undefined && track.artists !== undefined),
  );
export type RawTrack = z.infer<typeof rawTrackSchema>;

export const rawAlbumSchema = z.object({
  description: z.string().optional(),
  id,
  title,
  artists: z.array(artist),
  genre: z.string().optional(),
  year: integer.optional(),
  coverUri: z.string().optional(),
  volumes: z.array(z.array(rawTrackSchema)),
});
export type RawAlbum = z.infer<typeof rawAlbumSchema>;

const shortTrack = z
  .object({
    id,
    albumId: id.optional(),
    available: z.boolean().optional(),
    track: rawTrackSchema.nullish(),
  })
  .refine(
    (item) => item.track == null || String(item.id) === String(item.track.id),
  );
export const rawPlaylistSchema = z
  .object({
    title,
    description: z.string().optional(),
    owner: z
      .object({
        uid: id.optional(),
        login: title.optional(),
        name: title.optional(),
      })
      .optional(),
    uid: id.optional(),
    kind: id.optional(),
    playlistUuid: title.optional(),
    trackCount: integer.optional(),
    cover: z.object({ uri: z.string().optional() }).optional(),
    tracks: z.array(shortTrack),
  })
  .refine(
    (playlist) =>
      playlist.trackCount === undefined ||
      playlist.trackCount === playlist.tracks.length,
  );
export type RawPlaylist = z.infer<typeof rawPlaylistSchema>;

const domainArtist = z.object({
  id: title,
  name: title,
  artwork: z.object({ key: title }).optional(),
});
const artwork = z.object({ key: title });
const metadata = {
  id: title,
  title: title.optional(),
  artists: z.array(domainArtist).optional(),
  album: z
    .object({
      id: title,
      title,
      genre: z.string().optional(),
      artwork: artwork.optional(),
    })
    .optional(),
  durationMs: z.number().finite().nonnegative().optional(),
  trackNumber: integer.optional(),
  discNumber: integer.optional(),
  year: integer.optional(),
  genre: z.string().optional(),
  artwork: artwork.optional(),
};
export const trackProjectionSchema = z.discriminatedUnion('availability', [
  z.object({
    ...metadata,
    availability: z.literal('available'),
    title,
    artists: z.array(domainArtist),
  }),
  z.object({ ...metadata, availability: z.literal('unavailable') }),
  z.object({ ...metadata, availability: z.literal('unknown') }),
]);
export const albumProjectionSchema = z.object({
  description: z.string().optional(),
  id: title,
  title,
  artists: z.array(domainArtist),
  genre: z.string().optional(),
  year: integer.optional(),
  artwork: artwork.optional(),
  tracks: z.array(trackProjectionSchema),
});
export const playlistProjectionSchema = z.object({
  description: z.string().optional(),
  authorArtwork: artwork.optional(),
  id: title,
  title,
  owner: title.optional(),
  artwork: artwork.optional(),
  tracks: z.array(
    z.object({
      position: z.number().int().positive(),
      track: trackProjectionSchema,
    }),
  ),
});
