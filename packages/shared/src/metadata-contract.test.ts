import { describe, expect, it } from 'vitest';
import type {
  Album,
  AlbumReference,
  AvailableTrack,
  Track,
  TrackAvailability,
  TrackMetadata,
  UnavailableTrack,
  UnknownTrack,
} from './index.js';

/** ADR-011: публичный union проверяется существующим test typecheck, без runtime схем.
 * @link ../../../docs/adr/ADR-011-shared-metadata-contract.md
 */
describe('shared metadata contract', () => {
  it('экспортирует жанр трека, альбома и выбранного album reference', () => {
    const reference: AlbumReference = {
      id: 'album',
      title: 'Альбом',
      genre: 'rock',
    };
    const track: AvailableTrack = {
      id: 'track',
      availability: 'available',
      title: 'Трек',
      artists: [],
      album: reference,
      genre: 'rock',
      durationMs: 1_000,
      trackNumber: 1,
      discNumber: 2,
      year: 2026,
      artwork: { key: 'artwork:synthetic' },
    };
    const album: Album = {
      id: 'album',
      title: 'Альбом',
      artists: [],
      genre: 'rock',
      tracks: [track],
    };
    expect(track).toMatchObject({
      genre: 'rock',
      durationMs: 1_000,
      trackNumber: 1,
      discNumber: 2,
      year: 2026,
    });
    expect(track.album?.genre).toBe('rock');
    expect(album.genre).toBe('rock');
  });

  it('допускает ID-only записи без выдуманных optional metadata', () => {
    const unavailable: UnavailableTrack = {
      id: 'denied',
      availability: 'unavailable',
    };
    const unknown: UnknownTrack = { id: 'reference', availability: 'unknown' };
    const records: readonly Track[] = [unavailable, unknown];
    expect(records).toEqual([
      { id: 'denied', availability: 'unavailable' },
      { id: 'reference', availability: 'unknown' },
    ]);
    for (const record of records) {
      expect(record).not.toHaveProperty('title');
      expect(record).not.toHaveProperty('artists');
      expect(record).not.toHaveProperty('genre');
    }
  });

  it('сужает consumer до доступной ветки с обязательными title/artists', () => {
    const records: readonly Track[] = [
      { id: 'full', availability: 'available', title: 'Трек', artists: [] },
      { id: 'partial', availability: 'unknown' },
    ];
    const titles = records.map((track) => {
      if (track.availability !== 'available') return null;
      // После discriminator narrowing поля доступны без cast и non-null assertion.
      const artists: readonly { readonly id: string; readonly name: string }[] =
        track.artists;
      const title: string = track.title;
      expect(artists).toEqual([]);
      return title;
    });
    expect(titles).toEqual(['Трек', null]);
  });

  it('запрещает неполную доступную ветку и Track без identity/discriminator', () => {
    // @ts-expect-error: ADR-011 требует title для AvailableTrack.
    const noTitle: AvailableTrack = {
      id: 'a',
      availability: 'available',
      artists: [],
    };
    // @ts-expect-error: ADR-011 требует artists для AvailableTrack.
    const noArtists: AvailableTrack = {
      id: 'a',
      availability: 'available',
      title: 'Трек',
    };
    // @ts-expect-error: любой Track требует ID, включая минимальную недоступную запись.
    const noId: Track = { availability: 'unavailable' };
    // @ts-expect-error: legacy object без discriminator не является Track.
    const noAvailability: Track = { id: 'a', title: 'Трек', artists: [] };
    // @ts-expect-error: ADR-011 разрешает только три явных состояния.
    const invalidAvailability: TrackAvailability = 'legacy';
    // @ts-expect-error: жанр — optional scalar string, без numeric coercion.
    const invalidGenre: TrackMetadata['genre'] = 42;
    void [
      noTitle,
      noArtists,
      noId,
      noAvailability,
      invalidAvailability,
      invalidGenre,
    ];
  });
});
