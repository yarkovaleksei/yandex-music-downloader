import {
  ValidationError,
  type Album,
  type DownloadPlan,
  type MediaKind,
  type MediaReference,
  type Playlist,
  type PlannedTrack,
  type Track,
} from '@music-downloader/shared';

/** Глубокая копия простых JSON-данных, чтобы изменения входа не попадали в план. */
function cloneData<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item: unknown) => cloneData(item)) as T;
  }
  if (typeof value === 'object' && value !== null) {
    const copy: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value))
      copy[key] = cloneData(item);
    return copy as T;
  }
  return value;
}

function freezeDeep<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) freezeDeep(item);
    Object.freeze(value);
  }
  return value;
}

function assertKind(source: MediaReference, expected: MediaKind): void {
  if (source.kind !== expected) {
    throw new ValidationError(
      new Error(`Source kind ${source.kind} does not match ${expected}`),
    );
  }
}

function plan(
  source: MediaReference,
  title: string,
  tracks: readonly Track[],
  author?: string,
): DownloadPlan {
  const planned: PlannedTrack[] = tracks.map((track, index) => ({
    position: index + 1,
    trackKey: String(index + 1),
    track,
  }));
  return freezeDeep(
    cloneData({
      source,
      title,
      tracks: planned,
      ...(author === undefined ? {} : { author }),
    }),
  );
}

/** План одиночного трека: единственная позиция 1. */
export function buildTrackPlan(
  source: MediaReference,
  track: Track,
): DownloadPlan {
  assertKind(source, 'track');
  return plan(source, track.title ?? '', [track]);
}

/** План альбома: позиции по порядку списка; недоступные треки сохраняют место. */
export function buildAlbumPlan(
  source: MediaReference,
  album: Album,
): DownloadPlan {
  assertKind(source, 'album');
  return plan(source, album.title, album.tracks);
}

/** План playlist: повторы одного трека получают разные позиции. */
export function buildPlaylistPlan(
  source: MediaReference,
  playlist: Playlist,
): DownloadPlan {
  assertKind(source, 'playlist');
  return plan(
    source,
    playlist.title,
    playlist.tracks.map((entry) => entry.track),
    playlist.owner,
  );
}
