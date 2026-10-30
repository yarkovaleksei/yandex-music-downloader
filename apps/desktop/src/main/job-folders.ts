import { access, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import type { ApplicationResult, JobSnapshot } from '@music-downloader/shared';
import type { JobFolderAvailability } from '../contract/desktop-api.js';

/** REQ-051: путь разрешается только из задания и повторно проверяется перед shell.
 */
export function jobFolders(
  read: (jobId: string) => Promise<ApplicationResult<JobSnapshot | null>>,
  reveal: (file: string) => void,
) {
  async function resolve(
    jobId: string,
    trackKey?: string,
  ): Promise<string | undefined> {
    const response = await read(jobId);
    if (response.kind !== 'result' || !response.data) return;
    const track = trackKey
      ? response.data.tracks.find((item) => item.trackKey === trackKey)
      : response.data.tracks.find((item) => item.resultPath);
    if (!track?.resultPath) return;
    try {
      if (!(await stat(track.resultPath)).isFile()) return;
      const directory = path.dirname(track.resultPath);
      if (!(await stat(directory)).isDirectory()) return;
      await access(track.resultPath, constants.R_OK);
      await access(directory, constants.R_OK | constants.X_OK);
      return track.resultPath;
    } catch {
      return;
    }
  }
  return {
    async availability(
      jobId: string,
      trackKey?: string,
    ): Promise<JobFolderAvailability> {
      return (await resolve(jobId, trackKey))
        ? { available: true }
        : {
            available: false,
            reason:
              'Файл или папка недоступны. Возможно, они перемещены или удалены.',
          };
    },
    async open(jobId: string, trackKey?: string): Promise<boolean> {
      const file = await resolve(jobId, trackKey);
      if (!file) return false;
      try {
        reveal(file);
        return true;
      } catch {
        return false;
      }
    },
  };
}
