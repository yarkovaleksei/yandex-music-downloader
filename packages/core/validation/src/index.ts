import { execFile } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { promisify } from 'node:util';
import { parseBuffer } from 'music-metadata';
import {
  PermissionError,
  ValidationError,
  type AudioVariant,
} from '@music-downloader/shared';

const run = promisify(execFile);

export interface AudioValidationRequest {
  readonly path: string;
  readonly variant: AudioVariant;
  readonly expectedDurationMs?: number;
  /** Эти признаки применимы только до записи metadata в .part. */
  readonly stream?: {
    readonly completed: boolean;
    readonly bytes: number;
    readonly expectedSize?: number;
  };
}
export interface AudioValidationResult {
  readonly durationMs: number;
}
export interface AudioValidator {
  validate(request: AudioValidationRequest): Promise<AudioValidationResult>;
}

/**
 * Базовая проверка не запускает внешний decoder и остаётся доступной без FFmpeg.
 * @link ../../../../docs/requirements/REQ-016-download-validation.md
 */
export function createAudioValidator(): AudioValidator {
  return { validate: validateLocalAudio };
}

export async function validateLocalAudio(
  request: AudioValidationRequest,
): Promise<AudioValidationResult> {
  try {
    const info = await stat(request.path);
    if (!info.isFile() || info.size <= 0) throw new ValidationError();
    if (
      request.stream !== undefined &&
      (!request.stream.completed ||
        request.stream.bytes !== info.size ||
        (request.stream.expectedSize !== undefined &&
          request.stream.bytes !== request.stream.expectedSize))
    )
      throw new ValidationError();
    const bytes = await readFile(request.path);
    const metadata = await parseBuffer(bytes, undefined, {
      duration: true,
      skipCovers: true,
    });
    if (
      !matchesVariant(
        metadata.format.container,
        metadata.format.codec,
        request.variant,
      )
    )
      throw new ValidationError();
    // music-metadata принимает усечённый MP3 и возвращает duration; проверяем целостность frame tail.
    if (request.variant.container === 'mp3' && !hasCompleteMp3Frames(bytes))
      throw new ValidationError();
    if (
      request.variant.container === 'm4a' &&
      request.variant.codec.toLowerCase() === 'flac' &&
      !hasMp4SampleEntry(bytes, 'fLaC')
    )
      throw new ValidationError();
    const durationMs = Math.round(
      (metadata.format.duration ?? Number.NaN) * 1000,
    );
    if (!Number.isFinite(durationMs) || durationMs <= 0)
      throw new ValidationError();
    if (
      request.expectedDurationMs !== undefined &&
      !isDurationWithinTolerance(durationMs, request.expectedDurationMs)
    )
      throw new ValidationError();
    return { durationMs };
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    if (isPermissionError(error)) throw new PermissionError(error);
    // Parser и filesystem details могут содержать локальный путь или байты файла.
    throw new ValidationError(error);
  }
}

export function hasCompleteMp3Frames(bytes: Uint8Array): boolean {
  let offset = id3End(bytes);
  // ID3v1 не является audio frame и не должен участвовать в проверке хвоста MP3.
  const audioEnd = hasId3v1(bytes) ? bytes.length - 128 : bytes.length;
  let frames = 0;
  while (offset + 4 <= audioEnd) {
    const header = mp3Frame(bytes, offset);
    if (header === undefined) return false;
    if (offset + header.length > audioEnd) return false;
    offset += header.length;
    frames += 1;
  }
  return frames > 0 && offset === audioEnd;
}

function hasId3v1(bytes: Uint8Array): boolean {
  const offset = bytes.length - 128;
  return (
    offset >= 0 &&
    bytes[offset] === 0x54 &&
    bytes[offset + 1] === 0x41 &&
    bytes[offset + 2] === 0x47
  );
}

function id3End(bytes: Uint8Array): number {
  if (
    bytes.length < 10 ||
    bytes[0] !== 0x49 ||
    bytes[1] !== 0x44 ||
    bytes[2] !== 0x33
  )
    return 0;
  return (
    10 +
    ((bytes[6]! & 0x7f) << 21) +
    ((bytes[7]! & 0x7f) << 14) +
    ((bytes[8]! & 0x7f) << 7) +
    (bytes[9]! & 0x7f)
  );
}

function mp3Frame(
  bytes: Uint8Array,
  offset: number,
): { length: number } | undefined {
  const value =
    (bytes[offset]! << 24) |
    (bytes[offset + 1]! << 16) |
    (bytes[offset + 2]! << 8) |
    bytes[offset + 3]!;
  if ((value & 0xffe00000) !== -0x200000) return undefined;
  const version = (value >>> 19) & 3;
  const layer = (value >>> 17) & 3;
  const bitrateIndex = (value >>> 12) & 15;
  const sampleIndex = (value >>> 10) & 3;
  if (
    version === 1 ||
    layer !== 1 ||
    bitrateIndex === 0 ||
    bitrateIndex === 15 ||
    sampleIndex === 3
  )
    return undefined;
  const rates =
    version === 3
      ? [44100, 48000, 32000]
      : version === 2
        ? [22050, 24000, 16000]
        : [11025, 12000, 8000];
  const kbps = (
    version === 3
      ? [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
      : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]
  )[bitrateIndex];
  return {
    length:
      Math.floor(
        ((version === 3 ? 144000 : 72000) * kbps!) / rates[sampleIndex]!,
      ) +
      ((value >>> 9) & 1),
  };
}

/** Допуск равен большему из 1000 мс и 1% ожидаемой длительности (REQ-016). */
export function isDurationWithinTolerance(
  actualMs: number,
  expectedMs: number,
): boolean {
  return (
    Number.isFinite(actualMs) &&
    Number.isFinite(expectedMs) &&
    actualMs > 0 &&
    expectedMs > 0 &&
    Math.abs(actualMs - expectedMs) <= Math.max(1000, expectedMs * 0.01)
  );
}

function matchesVariant(
  container: string | undefined,
  codec: string | undefined,
  variant: AudioVariant,
): boolean {
  const actualContainer = container?.toLowerCase() ?? '';
  const actualCodec = codec?.toLowerCase() ?? '';
  if (variant.container === 'mp3')
    return actualContainer.includes('mpeg') && actualCodec.includes('mpeg');
  if (variant.container === 'm4a' && variant.codec.toLowerCase() === 'aac')
    return actualContainer.includes('iso') && actualCodec.includes('aac');
  if (variant.container === 'm4a' && variant.codec.toLowerCase() === 'flac')
    return actualContainer.includes('iso');
  return false;
}

function hasMp4SampleEntry(bytes: Uint8Array, expected: string): boolean {
  // Признак codec берётся из stsd sample entry, а не из произвольного текста контейнера.
  const containers = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl']);
  const visit = (start: number, end: number): boolean => {
    for (let offset = start; offset + 8 <= end;) {
      const size = readUint32(bytes, offset);
      const type = ascii(bytes, offset + 4, 4);
      if (size < 8 || offset + size > end) return false;
      if (type === 'stsd') return ascii(bytes, offset + 20, 4) === expected;
      if (containers.has(type) && visit(offset + 8, offset + size)) return true;
      offset += size;
    }
    return false;
  };
  return visit(0, bytes.length);
}
function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset]! << 24) >>> 0) +
    (bytes[offset + 1]! << 16) +
    (bytes[offset + 2]! << 8) +
    bytes[offset + 3]!
  );
}
function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}
function isPermissionError(error: unknown): boolean {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? (error as { code?: unknown }).code
      : undefined;
  return code === 'EACCES' || code === 'EPERM';
}

export interface FfmpegValidationRequest {
  readonly executable: string;
  readonly path: string;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}
export type FfmpegValidationResult =
  { readonly status: 'passed' } | { readonly status: 'unavailable' };

export interface FfmpegExecutionOptions {
  readonly shell: false;
  readonly timeout: number;
  readonly signal?: AbortSignal;
  readonly windowsHide: true;
}
/** Порт изолирует opt-in subprocess и делает contract проверяемым без FFmpeg в CI. */
export interface FfmpegExecutor {
  execute(
    executable: string,
    arguments_: readonly string[],
    options: FfmpegExecutionOptions,
  ): Promise<void>;
}
const systemFfmpegExecutor: FfmpegExecutor = {
  execute: async (executable, arguments_, options) => {
    await run(executable, [...arguments_], options);
  },
};

/** Опциональный decoder запускается только по явному запросу с путём к executable. */
export async function validateWithFfmpeg(
  request: FfmpegValidationRequest,
  executor: FfmpegExecutor = systemFfmpegExecutor,
): Promise<FfmpegValidationResult> {
  try {
    await executor.execute(
      request.executable,
      [
        '-v',
        'error',
        '-xerror',
        '-err_detect',
        'explode',
        '-i',
        request.path,
        '-f',
        'null',
        '-',
      ],
      {
        shell: false,
        timeout: request.timeoutMs ?? 30_000,
        signal: request.signal,
        windowsHide: true,
      },
    );
    return { status: 'passed' };
  } catch (error) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? (error as { code?: unknown }).code
        : undefined;
    if (code === 'ENOENT') return { status: 'unavailable' };
    throw new ValidationError(error);
  }
}
export const validationCorePackage = '@music-downloader/core-validation';
