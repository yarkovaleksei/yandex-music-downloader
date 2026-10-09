import {
  DownloadError,
  ProviderError,
  type AudioStream,
} from '@music-downloader/shared';
import type { AuthFetchResponse } from '../auth-transport.js';
import { abortError } from './transport.js';
import { validateContainer } from './container.js';
import { decryptEncrawStream } from './encraw.js';

export async function createAudioStream(
  response: AuthFetchResponse,
  container: AudioStream['container'],
  requestedOffset: number | undefined,
  signal: AbortSignal,
  encrawKey?: string,
): Promise<AudioStream> {
  if (response.status === 416) return rejectBody(response, new DownloadError());
  if (response.status === 429 || response.status >= 500)
    return rejectBody(response, new ProviderError('SERVICE_UNAVAILABLE', true));
  if (response.status < 200 || response.status >= 300 || !response.body)
    return rejectBody(response, new DownloadError());
  const range =
    requestedOffset === undefined
      ? undefined
      : parseContentRange(response.headers?.get('content-range'));
  if (
    requestedOffset !== undefined &&
    response.status === 206 &&
    (!range || range.start !== requestedOffset)
  ) {
    await response.body.cancel();
    throw new DownloadError();
  }
  if (
    requestedOffset !== undefined &&
    response.status !== 206 &&
    response.status !== 200
  ) {
    await response.body.cancel();
    throw new DownloadError();
  }
  const startOffset = response.status === 206 && range ? range.start : 0;
  const acceptsRanges = response.status === 206 && range !== undefined;
  if (
    range &&
    !contentLengthMatches(response.headers?.get('content-length'), range)
  ) {
    await response.body.cancel();
    throw new DownloadError();
  }
  const source = encrawKey
    ? decryptEncrawStream(response.body, encrawKey, signal)
    : response.body;
  const stream = checkedStream(source, container, signal, startOffset === 0);
  const contentLength = range
    ? range.total
    : parseContentLength(response.headers?.get('content-length'));
  return {
    stream,
    ...(contentLength === undefined ? {} : { contentLength }),
    container,
    acceptsRanges,
    startOffset,
  };
}

function checkedStream(
  source: ReadableStream<Uint8Array>,
  container: AudioStream['container'],
  signal: AbortSignal,
  validatePrefix: boolean,
): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  let checked = !validatePrefix;
  let released = false;
  const prefix: Uint8Array[] = [];
  let prefixLength = 0;
  const requiredPrefix = container === 'm4a' ? 8 : 4;
  let onAbort: (() => void) | undefined;
  const release = () => {
    if (released) return;
    released = true;
    if (onAbort) signal.removeEventListener('abort', onAbort);
    reader.releaseLock();
  };
  const cleanup = async () => {
    try {
      await reader.cancel();
    } catch {
      // Errored native body может отклонить cancel; нормализация ошибки всё равно обязательна.
    } finally {
      release();
    }
  };
  return new ReadableStream({
    start(controller) {
      onAbort = () => {
        void cleanup();
        controller.error(abortError());
      };
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) onAbort();
    },
    async pull(controller) {
      if (signal.aborted) {
        await cleanup();
        controller.error(abortError());
        return;
      }
      try {
        while (!checked) {
          const item = await reader.read();
          if (item.done) {
            validateContainer(container, join(prefix, prefixLength));
            release();
            controller.close();
            return;
          }
          prefix.push(item.value);
          prefixLength += item.value.byteLength;
          if (prefixLength >= requiredPrefix) {
            const value = join(prefix, prefixLength);
            validateContainer(container, value);
            checked = true;
            controller.enqueue(value);
            return;
          }
        }
        const item = await reader.read();
        if (item.done) {
          release();
          controller.close();
          return;
        }
        controller.enqueue(item.value);
      } catch (error) {
        await cleanup();
        if (signal.aborted) controller.error(abortError());
        else if (
          error instanceof DownloadError ||
          error instanceof ProviderError
        )
          controller.error(error);
        else controller.error(new ProviderError('NETWORK_ERROR', true));
      }
    },
    async cancel() {
      await cleanup();
    },
  });
}

function parseContentRange(
  value: string | null | undefined,
): { start: number; end: number; total?: number } | undefined {
  if (!value) return undefined;
  const match = /^bytes (\d+)-(\d+)\/(\d+|\*)$/.exec(value);
  if (!match) return undefined;
  const start = Number(match[1]);
  const end = Number(match[2]);
  const total = match[3] === '*' ? undefined : Number(match[3]);
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    end < start ||
    (total !== undefined && (!Number.isSafeInteger(total) || total <= end))
  )
    return undefined;
  return { start, end, ...(total === undefined ? {} : { total }) };
}

function contentLengthMatches(
  value: string | null | undefined,
  range: { start: number; end: number },
): boolean {
  const length = parseContentLength(value);
  return length === undefined || length === range.end - range.start + 1;
}

function join(parts: readonly Uint8Array[], length: number): Uint8Array {
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

function parseContentLength(
  value: string | null | undefined,
): number | undefined {
  if (!value || !/^\d+$/.test(value)) return undefined;
  const length = Number(value);
  return Number.isSafeInteger(length) ? length : undefined;
}

async function rejectBody(
  response: AuthFetchResponse,
  error: DownloadError | ProviderError,
): Promise<never> {
  await response.body?.cancel();
  throw error;
}
