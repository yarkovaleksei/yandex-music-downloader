import type {
  JobManifestV1,
  ManifestStore,
  LeaseSession,
} from '@music-downloader/shared';

export interface RecoveryFiles {
  readonly exists: (path: string) => Promise<boolean>;
  readonly size: (path: string) => Promise<number | undefined>;
  readonly validateFinal: (path: string, identity?: string) => Promise<boolean>;
}
export interface RecoveredJob {
  readonly session: LeaseSession;
  readonly manifest: JobManifestV1;
}

/** Восстанавливает durable state; scheduling и provider остаются у будущего application слоя. */
export async function recoverJob(
  manifest: JobManifestV1,
  files: RecoveryFiles,
): Promise<JobManifestV1> {
  const tracks = await Promise.all(
    manifest.tracks.map(async (track) => {
      if (
        track.status === 'processing' &&
        track.partPath !== undefined &&
        track.resultPath !== undefined &&
        track.postProcessing !== undefined
      ) {
        const partExists = await files.exists(track.partPath);
        const resultSize = await files.size(track.resultPath);
        if (
          !partExists &&
          resultSize === track.postProcessing.size &&
          (await files.validateFinal(
            track.resultPath,
            track.postProcessing.identity,
          ))
        )
          return {
            ...track,
            status: 'completed' as const,
            partial: undefined,
            retryPhase: undefined,
            updatedAt: new Date().toISOString(),
          };
      }
      // ADR-006: захват после прерывания возвращает только незавершённую работу
      // в очередь. Terminal и failed остаются диагностируемым фактом, paused
      // ожидает явного resume и не запускается recovery автоматически.
      if (
        track.status === 'resolving' ||
        track.status === 'ready' ||
        track.status === 'downloading' ||
        track.status === 'processing' ||
        track.status === 'retry_wait'
      )
        return {
          ...track,
          status: 'queued' as const,
          retryPhase: undefined,
          updatedAt: new Date().toISOString(),
        };
      return track;
    }),
  );
  return { ...manifest, tracks, updatedAt: new Date().toISOString() };
}

/** Acquire запускает recovery до выдачи owner capability, включая released paused job. */
export async function openRecoveredJob(
  store: ManifestStore,
  jobId: string,
  files: RecoveryFiles,
): Promise<RecoveredJob> {
  const session = await store.acquire(jobId, {
    recover: (manifest) => recoverJob(manifest, files),
  });
  return { session, manifest: session.manifest };
}
