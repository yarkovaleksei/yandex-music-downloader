import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TrackUnavailableError } from '@music-downloader/shared';
import {
  MockMusicProvider,
  mockAlbum,
  mockGenreTrack,
  mockMetadataAlbum,
  mockMetadataPlaylist,
  mockPlaylist,
  mockTrack,
  mockUnavailableMetadataTrack,
  mockUnavailableTrack,
  mockUnknownMetadataTrack,
  mockUnknownTrack,
  mockVariants,
} from './index.js';

/** Матрица ADR-011 доказывает публичные offline ответы, а не внутренний clone helper.
 * @link ../../../docs/architecture-decisions/ADR-011-shared-metadata-contract.md
 */
describe('offline metadata contract', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('Metadata contract не должен обращаться к сети');
    });
  });
  afterEach(() => {
    try {
      expect(globalThis.fetch).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('сохраняет optional жанр и прежние defaults без fallback', async () => {
    const provider = new MockMusicProvider();
    const track = await provider.getTrack(mockGenreTrack.id);
    expect(track.genre).toBe('rock');
    expect(track.album?.genre).toBe('rock');
    expect((await provider.getAlbum(mockMetadataAlbum.id)).genre).toBe('rock');
    const defaultTrack = await provider.getTrack(mockTrack.id);
    expect(defaultTrack.availability).toBe('available');
    expect(defaultTrack).not.toHaveProperty('genre');
    expect(defaultTrack.album).not.toHaveProperty('genre');
    const defaultAlbum = await provider.getAlbum(mockAlbum.id);
    expect(defaultAlbum).not.toHaveProperty('genre');
    expect(defaultAlbum.tracks).toHaveLength(1);
    expect((await provider.getPlaylist(mockPlaylist.id)).tracks).toHaveLength(
      1,
    );
  });

  it('возвращает все записи album/playlist, включая порядок и повтор ID', async () => {
    const provider = new MockMusicProvider();
    const album = await provider.getAlbum(mockMetadataAlbum.id);
    const playlist = await provider.getPlaylist(mockMetadataPlaylist.id);
    const expected = [
      ['track:fixture', 'available'],
      ['track:unavailable', 'unavailable'],
      ['track:unknown', 'unknown'],
      ['track:unavailable:metadata', 'unavailable'],
      ['track:unknown:metadata', 'unknown'],
      ['track:genre', 'available'],
      ['track:fixture', 'available'],
    ];
    expect(album.tracks.map((track) => [track.id, track.availability])).toEqual(
      expected,
    );
    expect(
      playlist.tracks.map(({ track }) => [track.id, track.availability]),
    ).toEqual(expected);
    expect(playlist.tracks.map(({ position }) => position)).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);
    for (const tracks of [
      album.tracks,
      playlist.tracks.map(({ track }) => track),
    ]) {
      expect(tracks[1]).toEqual({
        id: 'track:unavailable',
        availability: 'unavailable',
      });
      expect(tracks[2]).toEqual({
        id: 'track:unknown',
        availability: 'unknown',
      });
      expect(tracks[3]).toMatchObject({
        id: 'track:unavailable:metadata',
        availability: 'unavailable',
        title: 'Недоступный трек с метаданными',
        artists: [{ id: 'artist:fixture', name: 'Тестовый артист' }],
        genre: 'rock',
        album: {
          id: 'album:metadata',
          title: 'Альбом с жанром',
          genre: 'rock',
        },
        durationMs: 2_000,
        trackNumber: 2,
        discNumber: 1,
        year: 2026,
        artwork: { key: 'artwork:album:fixture' },
      });
      expect(tracks[4]).toEqual({
        id: 'track:unknown:metadata',
        availability: 'unknown',
        title: 'Трек без подтверждения доступа',
        artists: [],
        genre: 'jazz',
      });
    }
  });

  it('помечает отказ текущему аккаунту во всех повторных позициях', async () => {
    const provider = new MockMusicProvider({
      unavailableTrackIds: [mockTrack.id],
    });
    const album = await provider.getAlbum(mockMetadataAlbum.id);
    const playlist = await provider.getPlaylist(mockMetadataPlaylist.id);
    const expected = [
      ['track:fixture', 'unavailable'],
      ['track:unavailable', 'unavailable'],
      ['track:unknown', 'unknown'],
      ['track:unavailable:metadata', 'unavailable'],
      ['track:unknown:metadata', 'unknown'],
      ['track:genre', 'available'],
      ['track:fixture', 'unavailable'],
    ];
    expect(album.tracks.map((track) => [track.id, track.availability])).toEqual(
      expected,
    );
    expect(
      playlist.tracks.map(({ track }) => [track.id, track.availability]),
    ).toEqual(expected);
    expect(playlist.tracks.map(({ position }) => position)).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);
    expect(album.tracks[0]).toMatchObject({
      title: 'Тестовый трек',
      artists: mockTrack.artists,
    });
    expect(album.tracks[6]).toMatchObject({
      title: 'Тестовый трек',
      artists: mockTrack.artists,
    });
    expect(
      (await provider.getAlbum(mockAlbum.id)).tracks[0]?.availability,
    ).toBe('unavailable');
    expect(
      (await provider.getPlaylist(mockPlaylist.id)).tracks[0]?.track
        .availability,
    ).toBe('unavailable');
    await expect(provider.getTrack(mockTrack.id)).rejects.toBeInstanceOf(
      TrackUnavailableError,
    );
  });

  it.each([mockUnavailableTrack, mockUnavailableMetadataTrack])(
    'отличает standalone отказ $id от записи внутри коллекции',
    async (track) => {
      const provider = new MockMusicProvider();
      await expect(provider.getTrack(track.id)).rejects.toBeInstanceOf(
        TrackUnavailableError,
      );
      await expect(provider.getTrack(track.id)).rejects.toMatchObject({
        code: 'TRACK_UNAVAILABLE',
      });
    },
  );

  it.each([mockUnknownTrack, mockUnknownMetadataTrack])(
    'сохраняет metadata $id без повышения unknown до available',
    async (track) => {
      const provider = new MockMusicProvider();
      const actual = await provider.getTrack(track.id);
      expect(actual).toEqual(track);
      expect(actual.availability).toBe('unknown');
    },
  );

  it.each([mockUnavailableTrack, mockUnknownTrack])(
    'не расширяет audio stubs для metadata-only ID $id',
    async (track) => {
      const provider = new MockMusicProvider();
      await expect(provider.getAudioVariants(track.id)).rejects.toBeInstanceOf(
        TrackUnavailableError,
      );
      await expect(
        provider.openAudioStream(track.id, mockVariants[0]?.key ?? '', {}),
      ).rejects.toBeInstanceOf(TrackUnavailableError);
    },
  );

  it('сохраняет прежнюю ошибку для неизвестного metadata ID', async () => {
    await expect(
      new MockMusicProvider().getTrack('track:not-in-fixtures'),
    ).rejects.toBeInstanceOf(TrackUnavailableError);
  });
});
