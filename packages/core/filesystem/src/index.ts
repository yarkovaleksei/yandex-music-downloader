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
export { buildPartPath, type PartPathOptions } from './part-path.js';
export { fileErrorCode, mapFileError } from './file-errors.js';
export {
  defaultFsOps,
  type FsFile,
  type FsOps,
  type FsStat,
} from './fs-ops.js';
export {
  discardPart,
  writeStreamToPart,
  type PartReader,
  type PartSource,
  type WritePartOptions,
  type WritePartResult,
} from './writer.js';
export {
  finalizePart,
  inspectExisting,
  type ExistingState,
  type FinalizeHooks,
  type FinalizeOptions,
  type FinalizeResult,
  type InspectExistingOptions,
  type OnExisting,
  type PartHookInput,
  type ValidateHookInput,
  type ValidateStage,
} from './finalize.js';
