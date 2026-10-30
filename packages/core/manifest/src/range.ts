import type { ManifestPartial } from '@music-downloader/shared';
export interface RangeResponse {
  readonly acceptsRanges: boolean;
  readonly startOffset: number;
  readonly contentLength: number;
  readonly stream: ReadableStream<Uint8Array>;
}
export interface RangeFiles {
  readonly stat: (path: string) => Promise<number | undefined>;
  readonly read: (path: string) => Promise<Uint8Array>;
  readonly candidatePath: (canonical: string) => string;
  readonly writeStreamToPart: (
    stream: ReadableStream<Uint8Array>,
    path: string,
    expected: number,
  ) => Promise<void>;
  readonly promote: (candidate: string, canonical: string) => Promise<void>;
  /** Открывает новый полный stream, когда уже открытый suffix несовместим с restart. */
  readonly reopenAtZero?: () => Promise<RangeResponse>;
}
export interface RangeCandidate {
  readonly offset: number;
  readonly expectedSize: number;
}

/** Range использует реальный prefix, а prefix+suffix пишет в отдельный candidate (REQ-021). */
export async function prepareRangeCandidate(
  files: RangeFiles,
  partPath: string,
  partial: ManifestPartial | undefined,
  variantKey: string,
  response: RangeResponse,
): Promise<RangeCandidate> {
  const actual = (await files.stat(partPath)) ?? 0;
  const compatible =
    partial !== undefined &&
    !partial.tagged &&
    partial.variantKey === variantKey &&
    partial.expectedSize !== undefined;
  const offset =
    compatible &&
    response.acceptsRanges &&
    response.startOffset === actual &&
    response.contentLength === partial.expectedSize
      ? actual
      : 0;
  const expectedSize = compatible
    ? partial.expectedSize!
    : response.contentLength;
  const candidate = files.candidatePath(partPath);
  if (offset === 0) {
    const full =
      response.startOffset === 0 ? response : await files.reopenAtZero?.();
    if (full === undefined || full.startOffset !== 0)
      throw new Error('Для restart требуется новый полный stream с offset 0.');
    await files.writeStreamToPart(full.stream, candidate, full.contentLength);
    await files.promote(candidate, partPath);
    return { offset, expectedSize: full.contentLength };
  }
  const prefix = await files.read(partPath);
  const combined = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(prefix);
      const reader = response.stream.getReader();
      void (async () => {
        try {
          for (;;) {
            const item = await reader.read();
            if (item.done) break;
            if (item.value !== undefined) controller.enqueue(item.value);
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        } finally {
          reader.releaseLock();
        }
      })();
    },
  });
  await files.writeStreamToPart(combined, candidate, expectedSize);
  await files.promote(candidate, partPath);
  return { offset, expectedSize };
}
