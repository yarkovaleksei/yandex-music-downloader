/** Sanitizer имён и генератор путей без записи на диск (REQ-022, REQ-023). */
export const filesystemCorePackage = '@music-downloader/core-filesystem';

export {
  maxSegmentLength,
  sanitizeFileName,
  sanitizePathSegment,
  unknownName,
  type SanitizeOptions,
  type TargetPlatform,
} from './sanitize.js';
export {
  buildAlbumLayout,
  buildPlaylistLayout,
  buildTrackLayout,
  coverFileName,
  unknownArtistName,
  type AlbumLayout,
  type CollectionLayoutOptions,
  type LayoutFile,
  type LayoutOptions,
  type LayoutTrackFile,
  type PlaylistLayout,
} from './layout.js';
