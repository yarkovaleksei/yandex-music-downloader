import type {
  LeaseSession,
  PostProcessingMarker,
} from '@music-downloader/shared';
export interface FinalizationOperations {
  readonly mutateAndValidate: () => Promise<void>;
  readonly size: () => Promise<number>;
  readonly identity?: () => Promise<string | undefined>;
  readonly rename: () => Promise<void>;
}
/** Checkpoint фиксируется после validation и до rename, закрывая rename-gap ADR-004. */
export async function finalizeWithManifestCheckpoint(
  session: LeaseSession,
  trackKey: string,
  operations: FinalizationOperations,
): Promise<void> {
  return session.runOwned(async () => {
    const selected = session.manifest.tracks.find(
      (track) => track.trackKey === trackKey,
    );
    if (selected?.partial === undefined)
      throw new Error('Для финализации требуется частичный файл.');
    // F-004/F-012: guard фиксируется до первого filesystem side effect и вся операция owned.
    const tagged = session.manifest.tracks.map((track) =>
      track.trackKey === trackKey
        ? {
            ...track,
            status: 'processing' as const,
            partial: { ...track.partial!, tagged: true },
          }
        : track,
    );
    await session.save({
      ...session.manifest,
      tracks: tagged,
      updatedAt: new Date().toISOString(),
    });
    await operations.mutateAndValidate();
    const marker: PostProcessingMarker = {
      size: await operations.size(),
      identity: await operations.identity?.(),
    };
    const processing = tagged.map((track) =>
      track.trackKey === trackKey
        ? { ...track, postProcessing: marker }
        : track,
    );
    await session.save({
      ...session.manifest,
      tracks: processing,
      updatedAt: new Date().toISOString(),
    });
    await operations.rename();
    await session.save({
      ...session.manifest,
      tracks: processing.map((track) =>
        track.trackKey === trackKey
          ? { ...track, status: 'completed' as const, partial: undefined }
          : track,
      ),
      updatedAt: new Date().toISOString(),
    });
  });
}
