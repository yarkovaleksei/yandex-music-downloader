import { readFile, rename, stat } from 'node:fs/promises';
import {
  buildPartPath,
  buildAlbumLayout,
  buildPlaylistLayout,
  buildTrackLayout,
  discardPart,
  finalizePart,
  inspectExisting,
  writeM3u8,
  writeStreamToPart,
} from '@music-downloader/core-filesystem';
import type { NamingPreset } from '@music-downloader/shared';
import type { DownloadFiles } from '@music-downloader/core-downloader';
import type { TargetPlatform } from '@music-downloader/core-filesystem';

const platform: TargetPlatform =
  process.platform === 'win32' || process.platform === 'darwin'
    ? process.platform
    : 'linux';

async function size(target: string): Promise<number | undefined> {
  try {
    return (await stat(target)).size;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

/** Реальный filesystem adapter использует algorithms core, не дублируя sanitizer и writer. */
export function createDownloadFiles(
  naming: (jobId: string) => NamingPreset | undefined = () => undefined,
): DownloadFiles {
  return {
    paths(manifest, trackKey, variant) {
      const track = manifest.plan.tracks.find(
        (item) => item.trackKey === trackKey,
      );
      if (track === undefined)
        throw new Error('Трек отсутствует в плане задания.');
      // Preset album использует готовый sanitizer/layout; произвольных шаблонов нет.
      const albumPath =
        naming(manifest.jobId) === 'album' && manifest.source.kind === 'album'
          ? buildAlbumLayout(
              {
                id: manifest.source.id,
                title: manifest.plan.title,
                artists: manifest.plan.tracks[0]?.track.artists ?? [],
                tracks: manifest.plan.tracks.map((item) => item.track),
              },
              {
                root: manifest.destination,
                platform,
                extensionOf: () => variant.container,
              },
            ).tracks.find((item) => item.index === track.position - 1)?.path
          : undefined;
      const resultPath =
        albumPath ??
        (manifest.plan.source.kind !== 'playlist' &&
        manifest.plan.tracks.length === 1
          ? buildTrackLayout(track.track, variant.container, {
              root: manifest.destination,
              platform,
            }).path
          : buildPlaylistLayout(
              {
                id: manifest.plan.source.id,
                title: manifest.plan.title,
                tracks: manifest.plan.tracks.map((item) => ({
                  position: item.position,
                  track: item.track,
                })),
              },
              {
                root: manifest.destination,
                platform,
                extensionOf: () => variant.container,
              },
            ).tracks.find((item) => item.index === track.position - 1)?.path);
      if (resultPath === undefined)
        throw new Error('Путь трека отсутствует в layout плана.');
      return {
        resultPath,
        partPath: buildPartPath(resultPath, {
          jobId: manifest.jobId,
          position: track.position,
          platform,
        }),
      };
    },
    stat: size,
    read: async (target) => new Uint8Array(await readFile(target)),
    promote: rename,
    discard: discardPart,
    // Здесь сохраняется классификация ошибок ФС; полная проверка аудио выполняется отдельным validator.
    inspect: inspectExisting,
    write: writeStreamToPart,
    finalize: (partPath, resultPath, variant, onExisting) =>
      finalizePart({
        partPath,
        finalPath: resultPath,
        container: variant.container,
        onExisting,
        platform,
      }),
    async writePlaylist(manifest, orderedResultPaths) {
      const layout = buildPlaylistLayout(
        {
          id: manifest.plan.source.id,
          title: manifest.plan.title,
          tracks: manifest.plan.tracks.map((item) => ({
            position: item.position,
            track: item.track,
          })),
        },
        {
          root: manifest.destination,
          platform,
          extensionOf: () => 'mp3',
        },
      );
      await writeM3u8(layout.playlistFile.path, orderedResultPaths, {
        platform,
      });
    },
  };
}
