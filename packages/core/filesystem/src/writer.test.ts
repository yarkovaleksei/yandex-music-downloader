import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  DiskFullError,
  DownloadError,
  PermissionError,
} from '@music-downloader/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultFsOps, type FsOps } from './fs-ops.js';
import { discardPart, writeStreamToPart } from './writer.js';

let directory = '';

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'writer-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

function streamOf(
  chunks: readonly Uint8Array[],
  failure?: Error,
): ReadableStream<Uint8Array> {
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[index];
      if (chunk !== undefined) {
        index += 1;
        controller.enqueue(chunk);
      } else if (failure === undefined) {
        controller.close();
      } else {
        controller.error(failure);
      }
    },
  });
}

const bytes = (...values: number[]): Uint8Array => Uint8Array.from(values);

describe('writeStreamToPart', () => {
  it('writes the whole stream and reports bytes written', async () => {
    const part = path.join(directory, 'nested', 'a.flac.job-1.part');
    const result = await writeStreamToPart(
      streamOf([bytes(1, 2, 3), bytes(4, 5)]),
      part,
      { expectedSize: 5 },
    );
    expect(result).toEqual({ bytesWritten: 5 });
    expect([...(await readFile(part))]).toEqual([1, 2, 3, 4, 5]);
  });

  it('truncates a previous part when the same job starts over', async () => {
    const part = path.join(directory, 'a.part');
    await writeFile(part, 'old old old old');
    await writeStreamToPart(streamOf([bytes(9)]), part);
    expect([...(await readFile(part))]).toEqual([9]);
  });

  it('keeps only the part and rethrows the original stream error', async () => {
    const part = path.join(directory, 'a.part');
    const failure = new Error('connection reset');
    await expect(
      writeStreamToPart(streamOf([bytes(1, 2)], failure), part),
    ).rejects.toBe(failure);
    expect(await readdir(directory)).toEqual(['a.part']);
  });

  it('rejects with AbortError before reading and keeps an existing part', async () => {
    const part = path.join(directory, 'a.part');
    await writeFile(part, 'kept');
    const controller = new AbortController();
    controller.abort();
    await expect(
      writeStreamToPart(streamOf([bytes(1)]), part, {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(await readFile(part, 'utf8')).toBe('kept');
  });

  it('aborts while reading, keeps the part and closes the descriptor', async () => {
    const part = path.join(directory, 'a.part');
    const controller = new AbortController();
    let closed = 0;
    const ops: FsOps = {
      ...defaultFsOps,
      async open(file) {
        const handle = await defaultFsOps.open(file);
        return {
          write: (data, offset, length) => handle.write(data, offset, length),
          sync: () => handle.sync(),
          close: () => {
            closed += 1;
            return handle.close();
          },
        };
      },
    };
    let sent = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(streamController) {
        if (!sent) {
          sent = true;
          streamController.enqueue(bytes(1, 2));
          return undefined;
        }
        // Второй чанк не приходит: чтение зависает до abort.
        return new Promise<void>(() => undefined);
      },
    });
    const pending = writeStreamToPart(stream, part, {
      signal: controller.signal,
      ops,
    });
    setTimeout(() => {
      controller.abort();
    }, 20);
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(closed).toBe(1);
    expect(await readdir(directory)).toEqual(['a.part']);
    expect([...(await readFile(part))]).toEqual([1, 2]);
  });

  it('fails with a retryable DownloadError when the size differs', async () => {
    const part = path.join(directory, 'a.part');
    const error = await writeStreamToPart(streamOf([bytes(1, 2)]), part, {
      expectedSize: 10,
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(DownloadError);
    expect((error as DownloadError).retryable).toBe(true);
    expect(await readdir(directory)).toEqual(['a.part']);
  });

  it('maps ENOSPC on write to DiskFullError', async () => {
    const ops: FsOps = {
      ...defaultFsOps,
      open: () =>
        Promise.resolve({
          write: () =>
            Promise.reject(Object.assign(new Error('x'), { code: 'ENOSPC' })),
          sync: () => Promise.resolve(),
          close: () => Promise.resolve(),
        }),
    };
    await expect(
      writeStreamToPart(streamOf([bytes(1)]), path.join(directory, 'a.part'), {
        ops,
      }),
    ).rejects.toBeInstanceOf(DiskFullError);
  });

  it('maps EACCES on open to PermissionError', async () => {
    const ops: FsOps = {
      ...defaultFsOps,
      open: () =>
        Promise.reject(Object.assign(new Error('x'), { code: 'EACCES' })),
    };
    await expect(
      writeStreamToPart(streamOf([bytes(1)]), path.join(directory, 'a.part'), {
        ops,
      }),
    ).rejects.toBeInstanceOf(PermissionError);
  });
});

describe('discardPart', () => {
  it('removes the part and tolerates a missing file', async () => {
    const part = path.join(directory, 'a.part');
    await writeFile(part, 'x');
    await discardPart(part);
    expect(await readdir(directory)).toEqual([]);
    await expect(discardPart(part)).resolves.toBeUndefined();
  });

  it('maps other errors', async () => {
    const ops: FsOps = {
      ...defaultFsOps,
      unlink: () =>
        Promise.reject(Object.assign(new Error('x'), { code: 'EACCES' })),
    };
    await expect(discardPart('/x/a.part', ops)).rejects.toBeInstanceOf(
      PermissionError,
    );
  });
});
