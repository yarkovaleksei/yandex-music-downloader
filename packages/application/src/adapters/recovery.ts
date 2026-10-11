import { recoverJob } from '@music-downloader/core-manifest';
import type { DownloadFiles } from '@music-downloader/core-downloader';
import type { JobManifestV1 } from '@music-downloader/shared';

/** Recovery использует тот же inspectExisting, что normal download, без validator substitute. */
export function createRecovery(
  files: DownloadFiles,
): (manifest: JobManifestV1) => Promise<JobManifestV1> {
  return (manifest) =>
    recoverJob(manifest, {
      exists: async (target) => (await files.stat(target)) !== undefined,
      size: files.stat,
      validateFinal: async (target) =>
        (await files.inspect(target)) === 'valid',
    });
}
