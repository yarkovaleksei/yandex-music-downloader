import type {
  Account,
  Album,
  ArtworkData,
  ArtworkRef,
  AudioVariant,
  AvailableTrack,
  Playlist,
  UnavailableTrack,
  UnknownTrack,
} from '@music-downloader/shared';

export const mockProviderId = 'mock-music';
export const mockArtwork: ArtworkRef = { key: 'artwork:album:fixture' };
export const mockAudioBytes = new Uint8Array([1, 2, 3, 4, 5, 6]);
export const mockArtworkBytes = new Uint8Array([137, 80, 78, 71]);

export const mockAccount: Account = {
  id: 'account:fixture',
  displayName: 'Тестовый аккаунт',
};
export const mockTrack: AvailableTrack = {
  id: 'track:fixture',
  availability: 'available',
  title: 'Тестовый трек',
  artists: [{ id: 'artist:fixture', name: 'Тестовый артист' }],
  album: {
    id: 'album:fixture',
    title: 'Тестовый альбом',
    artwork: mockArtwork,
  },
  durationMs: 1_000,
  artwork: mockArtwork,
};
export const mockVariants: readonly AudioVariant[] = [
  {
    key: 'variant:fixture:mp3',
    codec: 'mp3',
    container: 'mp3',
    bitrate: 320,
    lossless: false,
  },
];
export const mockAlbum: Album = {
  id: 'album:fixture',
  title: 'Тестовый альбом',
  artists: mockTrack.artists,
  artwork: mockArtwork,
  tracks: [mockTrack],
};
export const mockPlaylist: Playlist = {
  id: 'playlist:fixture',
  title: 'Тестовый плейлист',
  artwork: mockArtwork,
  tracks: [{ position: 1, track: mockTrack }],
};
export const mockArtworkData: ArtworkData = {
  bytes: mockArtworkBytes,
  mimeType: 'image/png',
};

/** ADR-011: отдельные metadata-only ID не расширяют существующие audio stubs.
 * @link ../../../docs/architecture-decisions/ADR-011-shared-metadata-contract.md
 */
export const mockUnavailableTrack: UnavailableTrack = {
  id: 'track:unavailable',
  availability: 'unavailable',
};
export const mockUnknownTrack: UnknownTrack = {
  id: 'track:unknown',
  availability: 'unknown',
};
export const mockUnavailableMetadataTrack: UnavailableTrack = {
  id: 'track:unavailable:metadata',
  availability: 'unavailable',
  title: 'Недоступный трек с метаданными',
  artists: mockTrack.artists,
  genre: 'rock',
  album: { id: 'album:metadata', title: 'Альбом с жанром', genre: 'rock' },
  durationMs: 2_000,
  trackNumber: 2,
  discNumber: 1,
  year: 2026,
  artwork: mockArtwork,
};
export const mockUnknownMetadataTrack: UnknownTrack = {
  id: 'track:unknown:metadata',
  availability: 'unknown',
  title: 'Трек без подтверждения доступа',
  artists: [],
  genre: 'jazz',
};
export const mockGenreTrack: AvailableTrack = {
  ...mockTrack,
  id: 'track:genre',
  genre: 'rock',
  album: { id: 'album:metadata', title: 'Альбом с жанром', genre: 'rock' },
};

/** Смешанная коллекция сохраняет неполные записи и повтор доступного ID по позициям. */
export const mockMetadataAlbum: Album = {
  id: 'album:metadata',
  title: 'Альбом с жанром',
  artists: mockTrack.artists,
  genre: 'rock',
  tracks: [
    mockTrack,
    mockUnavailableTrack,
    mockUnknownTrack,
    mockUnavailableMetadataTrack,
    mockUnknownMetadataTrack,
    mockGenreTrack,
    mockTrack,
  ],
};
export const mockMetadataPlaylist: Playlist = {
  id: 'playlist:metadata',
  title: 'Плейлист с недоступными записями',
  tracks: mockMetadataAlbum.tracks.map((track, index) => ({
    position: index + 1,
    track,
  })),
};
