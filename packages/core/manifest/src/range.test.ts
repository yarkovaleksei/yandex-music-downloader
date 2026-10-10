import { describe, expect, it } from 'vitest';
import { prepareRangeCandidate } from './range.js';
const stream = (chunks: number[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (const value of chunks) controller.enqueue(new Uint8Array([value]));
      controller.close();
    },
  });
describe('prepareRangeCandidate', () => {
  it('сохраняет prefix и suffix только при подтверждённом Range', async () => {
    const written: number[] = [];
    let promoted = false;
    const result = await prepareRangeCandidate(
      {
        stat: async () => 2,
        read: async () => new Uint8Array([1, 2]),
        candidatePath: () => 'candidate',
        writeStreamToPart: async (source) => {
          const reader = source.getReader();
          for (;;) {
            const value = await reader.read();
            if (value.done) break;
            written.push(...value.value);
          }
        },
        promote: async () => {
          promoted = true;
        },
      },
      'part',
      { bytes: 1, expectedSize: 4, variantKey: 'v', tagged: false },
      'v',
      {
        acceptsRanges: true,
        startOffset: 2,
        contentLength: 4,
        stream: stream([3, 4]),
      },
    );
    expect(result.offset).toBe(2);
    expect(written).toEqual([1, 2, 3, 4]);
    expect(promoted).toBe(true);
  });
  it('не использует offset при отказе provider', async () => {
    const written: number[] = [];
    const result = await prepareRangeCandidate(
      {
        stat: async () => 2,
        read: async () => new Uint8Array(),
        candidatePath: () => 'candidate',
        writeStreamToPart: async (source) => {
          const reader = source.getReader();
          for (;;) {
            const value = await reader.read();
            if (value.done) break;
            written.push(...value.value);
          }
        },
        promote: async () => undefined,
      },
      'part',
      { bytes: 2, expectedSize: 4, variantKey: 'v', tagged: false },
      'v',
      {
        acceptsRanges: false,
        startOffset: 0,
        contentLength: 4,
        stream: stream([1, 2, 3, 4]),
      },
    );
    expect(result.offset).toBe(0);
    expect(written).toEqual([1, 2, 3, 4]);
  });
  it('F-007 повторно открывает полный stream вместо несовместимого suffix', async () => {
    const written: number[] = [];
    const result = await prepareRangeCandidate(
      {
        stat: async () => 2,
        read: async () => new Uint8Array([1, 2]),
        candidatePath: () => 'candidate',
        writeStreamToPart: async (source) => {
          const reader = source.getReader();
          for (;;) {
            const value = await reader.read();
            if (value.done) break;
            written.push(...value.value);
          }
        },
        promote: async () => undefined,
        reopenAtZero: async () => ({
          acceptsRanges: false,
          startOffset: 0,
          contentLength: 4,
          stream: stream([9, 8, 7, 6]),
        }),
      },
      'part',
      { bytes: 2, expectedSize: 4, variantKey: 'v', tagged: true },
      'v',
      {
        acceptsRanges: true,
        startOffset: 2,
        contentLength: 4,
        stream: stream([3, 4]),
      },
    );
    expect(result).toEqual({ offset: 0, expectedSize: 4 });
    expect(written).toEqual([9, 8, 7, 6]);
  });
});
