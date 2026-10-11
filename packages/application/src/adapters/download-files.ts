import { readFile, rename, stat } from 'node:fs/promises';
import {
  buildPartPath,
  buildPlaylistLayout,
  buildTrackLayout,
  discardPart,
  finalizePart,
  inspectExisting,
  writeStreamToPart,
} from '@music-downloader/core-filesystem';
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
export function createDownloadFiles(): DownloadFiles {
  return {
    paths(manifest, trackKey, variant) {
      const track = manifest.plan.tracks.find(
        (item) => item.trackKey === trackKey,
      );
      if (track === undefined)
        throw new Error('Трек отсутствует в плане задания.');
      const resultPath =
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
            ).tracks.find((item) => item.index === track.position - 1)?.path;
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
    // Полный audio validator принадлежит STEP-023; здесь сохраняется текущая классификация ФС.
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
  };
}
