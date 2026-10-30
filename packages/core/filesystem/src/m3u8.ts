import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { mapFileError } from './file-errors.js';
import { defaultFsOps, type FsOps } from './fs-ops.js';
import { discardPart, writeStreamToPart } from './writer.js';
import type { TargetPlatform } from './sanitize.js';

export interface WriteM3u8Options {
  readonly ops?: FsOps;
  readonly platform?: TargetPlatform;
}

/** Паузы между пятью попытками публикации playlist на Windows. */
const renameRetryDelays: readonly number[] = [50, 100, 200, 400];

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function pathApi(platform: TargetPlatform | undefined): typeof path.posix {
  // Без override native API учитывает Windows-пути; явная платформа сохраняет приоритет.
  if (platform === undefined) return path;
  return platform === 'win32' ? path.win32 : path.posix;
}

function utf8Source(content: string): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(content);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

/**
 * После закрытия temporary-файла Windows может кратко удерживать его при rename.
 *  Повторяем только подтверждённые EPERM/EBUSY и
 * не меняем уже записанный файл или destination между попытками.
 */
async function publishM3u8(
  temporaryPath: string,
  playlistPath: string,
  platform: TargetPlatform | undefined,
  ops: FsOps,
): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await ops.rename(temporaryPath, playlistPath);
      return;
    } catch (error) {
      const code =
        typeof error === 'object' && error !== null
          ? (error as { readonly code?: unknown }).code
          : undefined;
      const delay = renameRetryDelays[attempt];
      if (
        platform !== 'win32' ||
        (code !== 'EPERM' && code !== 'EBUSY') ||
        delay === undefined
      )
        throw error;
      await sleep(delay);
    }
  }
}

/**
 * Публикует playlist только после flush и close временного файла. @link docs/requirements/REQ-028-playlist-m3u8.md
 * Строки остаются относительными и сохраняют входной порядок, поэтому номера файлов не пересчитываются.
 */
export async function writeM3u8(
  playlistPath: string,
  resultPaths: readonly string[],
  options: WriteM3u8Options = {},
): Promise<void> {
  const ops = options.ops ?? defaultFsOps;
  const effectivePlatform: TargetPlatform =
    options.platform ??
    (process.platform === 'win32'
      ? 'win32'
      : process.platform === 'darwin'
        ? 'darwin'
        : 'linux');
  const paths = pathApi(effectivePlatform);
  // короткое уникальное имя исключает конфликт writers и не удлиняет допустимый basename playlist.
  const temporaryPath = paths.join(
    paths.dirname(playlistPath),
    `.m3u8-${randomUUID()}.tmp`,
  );
  const content = resultPaths
    .map((resultPath) =>
      paths
        .relative(paths.dirname(playlistPath), resultPath)
        .replaceAll('\\', '/'),
    )
    .join('\n');
  try {
    await writeStreamToPart(
      utf8Source(`${content}${content === '' ? '' : '\n'}`),
      temporaryPath,
      {
        ops,
      },
    );
    await publishM3u8(temporaryPath, playlistPath, effectivePlatform, ops);
  } catch (error) {
    await discardPart(temporaryPath, ops).catch(() => undefined);
    throw mapFileError(error);
  }
}
