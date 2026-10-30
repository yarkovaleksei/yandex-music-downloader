import { DownloadError, type AudioContainer } from '@music-downloader/shared';
import { fileErrorCode, mapFileError } from './file-errors.js';
import { defaultFsOps, type FsOps } from './fs-ops.js';
import { discardPart } from './writer.js';
import type { TargetPlatform } from './sanitize.js';

export type ValidateStage = 'initial' | 'final';

/** Вход hook-ов: контейнер передаётся явно, а не определяется по `.part`. */
export interface PartHookInput {
  readonly partPath: string;
  readonly container: AudioContainer;
}

export interface ValidateHookInput extends PartHookInput {
  readonly stage: ValidateStage;
}

export interface FinalizeHooks {
  /** Проверка файла; бросает, если файл не годится. */
  readonly validate?: (input: ValidateHookInput) => void | Promise<void>;
  /** Запись метаданных и обложки. */
  readonly writeMetadata?: (input: PartHookInput) => void | Promise<void>;
}

export type OnExisting = 'skip' | 'replace';

export interface FinalizeOptions {
  readonly partPath: string;
  readonly finalPath: string;
  readonly container: AudioContainer;
  readonly onExisting: OnExisting;
  readonly hooks?: FinalizeHooks;
  readonly platform: TargetPlatform;
  readonly ops?: FsOps;
  /** Пауза между повторами rename; подменяется в тестах. */
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

export interface FinalizeResult {
  readonly status: 'completed' | 'skipped';
  readonly path: string;
}

export type ExistingState = 'absent' | 'valid' | 'invalid';

export interface InspectExistingOptions {
  /** Проверка существующего файла; без неё обычный файл валиден. */
  readonly validate?: (path: string) => boolean | Promise<boolean>;
  readonly ops?: FsOps;
}

/** Паузы между 5 попытками rename на Windows. */
const renameRetryDelays: readonly number[] = [50, 100, 200, 400];

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

/** Состояние записи по пути: undefined — её нет. */
async function statEntry(
  target: string,
  ops: FsOps,
): Promise<{ readonly isFile: boolean } | undefined> {
  try {
    const stat = await ops.lstat(target);
    return { isFile: stat.isFile() };
  } catch (error) {
    if (fileErrorCode(error) === 'ENOENT') return undefined;
    throw mapFileError(error);
  }
}

/** Предварительная проверка skip-existing (REQ-024); ничего не удаляет. */
export async function inspectExisting(
  finalPath: string,
  options: InspectExistingOptions = {},
): Promise<ExistingState> {
  const entry = await statEntry(finalPath, options.ops ?? defaultFsOps);
  if (entry === undefined) return 'absent';
  if (!entry.isFile) return 'invalid';
  if (options.validate === undefined) return 'valid';
  return (await options.validate(finalPath)) ? 'valid' : 'invalid';
}

/**
 * Rename — точка фиксации. На win32 EPERM/EBUSY повторяются ограниченное число раз
 * (антивирус, индексатор); после повторов EPERM → PermissionError, EBUSY → DownloadError.
 */
async function renameWithRetry(
  options: FinalizeOptions,
  ops: FsOps,
): Promise<void> {
  const sleep = options.sleep ?? defaultSleep;
  for (let attempt = 0; ; attempt += 1) {
    try {
      await ops.rename(options.partPath, options.finalPath);
      return;
    } catch (error) {
      const code = fileErrorCode(error);
      const transient = code === 'EPERM' || code === 'EBUSY';
      const delay = renameRetryDelays[attempt];
      if (options.platform !== 'win32' || !transient || delay === undefined) {
        throw mapFileError(error);
      }
      await sleep(delay);
    }
  }
}

/**
 * Финализация `.part` по ADR-004: validate(initial) → writeMetadata →
 * validate(final) → проверка существующего файла → атомарный rename.
 * Ошибка hook-а пробрасывается как есть: rename не выполняется, `.part` остаётся,
 * прежний файл нетронут. В режиме skip файл, появившийся до rename, не заменяется.
 */
export async function finalizePart(
  options: FinalizeOptions,
): Promise<FinalizeResult> {
  const { partPath, finalPath, container, hooks } = options;
  const ops = options.ops ?? defaultFsOps;
  await hooks?.validate?.({ partPath, container, stage: 'initial' });
  await hooks?.writeMetadata?.({ partPath, container });
  await hooks?.validate?.({ partPath, container, stage: 'final' });
  const existing = await statEntry(finalPath, ops);
  if (existing !== undefined && options.onExisting === 'skip') {
    // Каталог или иная запись не файл: трек нельзя считать пропущенным.
    if (!existing.isFile) throw new DownloadError(false);
    await discardPart(partPath, ops);
    return { status: 'skipped', path: finalPath };
  }
  await renameWithRetry(options, ops);
  return { status: 'completed', path: finalPath };
}
