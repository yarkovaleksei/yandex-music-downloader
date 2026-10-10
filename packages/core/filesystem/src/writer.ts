import path from 'node:path';
import { DownloadError } from '@music-downloader/shared';
import { fileErrorCode, mapFileError } from './file-errors.js';
import { defaultFsOps, type FsOps } from './fs-ops.js';

/** Узкий срез ReadableStreamDefaultReader, достаточный для записи. */
export interface PartReader {
  read(): Promise<{ readonly done: boolean; readonly value?: Uint8Array }>;
  cancel(reason?: unknown): Promise<void>;
  releaseLock(): void;
}

/** Источник байт; совместим с `ReadableStream<Uint8Array>` из `AudioStream`. */
export interface PartSource {
  getReader(): PartReader;
}

export interface WritePartOptions {
  readonly signal?: AbortSignal;
  /** Полный ожидаемый размер; расхождение — транзитный DownloadError. */
  readonly expectedSize?: number;
  readonly ops?: FsOps;
}

export interface WritePartResult {
  readonly bytesWritten: number;
}

function abortError(): Error {
  return new DOMException('The operation was aborted', 'AbortError');
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) throw abortError();
}

/** Файловая операция: системные ошибки превращаются в доменные. */
async function fileOp<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw mapFileError(error);
  }
}

async function writeChunk(
  file: Awaited<ReturnType<FsOps['open']>>,
  chunk: Uint8Array,
): Promise<void> {
  let offset = 0;
  while (offset < chunk.length) {
    const { bytesWritten } = await file.write(
      chunk,
      offset,
      chunk.length - offset,
    );
    offset += bytesWritten;
  }
}

/**
 * Потоково пишет источник в `.part` (ADR-004): усечение при открытии, flush
 * (fsync) и close. Abort закрывает дескриптор и сохраняет `.part` (pause);
 * ошибка источника пробрасывается без изменений; ошибки ФС маппятся.
 * Итоговый файл здесь не создаётся.
 */
export async function writeStreamToPart(
  source: PartSource,
  partPath: string,
  options: WritePartOptions = {},
): Promise<WritePartResult> {
  const { signal, expectedSize } = options;
  const ops = options.ops ?? defaultFsOps;
  throwIfAborted(signal);
  await fileOp(() => ops.mkdir(path.dirname(partPath)));
  const file = await fileOp(() => ops.open(partPath));
  const reader = source.getReader();
  let closed = false;
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => {
      reject(abortError());
    };
    if (signal !== undefined) {
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
  aborted.catch(() => undefined);
  try {
    let bytesWritten = 0;
    for (;;) {
      throwIfAborted(signal);
      const result = await Promise.race([reader.read(), aborted]);
      if (result.done) {
        // EOF не исключает отмену: сигнал мог сработать во время завершения read.
        throwIfAborted(signal);
        break;
      }
      const chunk = result.value;
      if (chunk === undefined || chunk.length === 0) continue;
      await fileOp(() => writeChunk(file, chunk));
      bytesWritten += chunk.length;
    }
    await fileOp(() => file.sync());
    // Abort во время fsync не должен возвращать успешную запись `.part`.
    throwIfAborted(signal);
    closed = true;
    await fileOp(() => file.close());
    throwIfAborted(signal);
    if (expectedSize !== undefined && bytesWritten !== expectedSize) {
      throw new DownloadError(true);
    }
    return { bytesWritten };
  } catch (error) {
    await reader.cancel(error).catch(() => undefined);
    throw error;
  } finally {
    if (signal !== undefined && onAbort !== undefined) {
      signal.removeEventListener('abort', onAbort);
    }
    if (!closed) await file.close().catch(() => undefined);
    try {
      reader.releaseLock();
    } catch {
      // Чтение могло остаться ожидающим после abort; блокировка не критична.
    }
  }
}

/** Идемпотентно удаляет `.part` (cancel); отсутствие файла не ошибка. */
export async function discardPart(
  partPath: string,
  ops: FsOps = defaultFsOps,
): Promise<void> {
  try {
    await ops.unlink(partPath);
  } catch (error) {
    if (fileErrorCode(error) === 'ENOENT') return;
    throw mapFileError(error);
  }
}
