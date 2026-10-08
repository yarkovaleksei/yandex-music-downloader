import type {
  Account,
  Album,
  ArtworkData,
  ArtworkRef,
  AudioVariant,
  Playlist,
  Track,
} from '@music-downloader/shared';

export const mockProviderId = 'mock-music';
export const mockArtwork: ArtworkRef = { key: 'artwork:album:fixture' };
export const mockAudioBytes = new Uint8Array([1, 2, 3, 4, 5, 6]);
export const mockArtworkBytes = new Uint8Array([137, 80, 78, 71]);

export const mockAccount: Account = {
  id: 'account:fixture',
  displayName: 'Тестовый аккаунт',
};
export const mockTrack: Track = {
  id: 'track:fixture',
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
