import { createHash } from 'node:crypto';
import path from 'node:path';
import { ValidationError } from '@music-downloader/shared';
import {
  maxSegmentLength,
  nameLength,
  type TargetPlatform,
} from './sanitize.js';

export interface PartPathOptions {
  readonly jobId: string;
  /** Позиция трека в плане job, начиная с 1. */
  readonly position: number;
  readonly platform: TargetPlatform;
}

/** Лимиты полного пути совпадают с layout.ts: win32 MAX_PATH без NUL, posix PATH_MAX. */
const maxPathLength: Readonly<Record<TargetPlatform, number>> = {
  win32: 259,
  darwin: 4095,
  linux: 4095,
};
const idLength = 8;
const graphemes = new Intl.Segmenter('und', { granularity: 'grapheme' });

function invalid(reason: string): ValidationError {
  return new ValidationError(new Error(reason));
}

/** Короткий детерминированный id job: не зависит от формата jobId. */
function shortJobId(jobId: string): string {
  return createHash('sha256').update(jobId).digest('hex').slice(0, idLength);
}

function truncateGraphemes(
  value: string,
  limit: number,
  platform: TargetPlatform,
): string {
  let result = '';
  let length = 0;
  for (const { segment } of graphemes.segment(value)) {
    const next = nameLength(segment, platform);
    if (length + next > limit) break;
    result += segment;
    length += next;
  }
  return result;
}

/**
 * Имя `.part` рядом с итоговым файлом (ADR-004):
 * `<имя итогового файла>.<id job>-<позиция>.part`. Уникально для пары
 * (job, позиция) и детерминировано. Если путь или имя не помещается в лимит
 * платформы, усекается только часть из итогового имени; суффикс сохраняется целиком.
 */
export function buildPartPath(
  finalPath: string,
  options: PartPathOptions,
): string {
  const { jobId, position, platform } = options;
  if (jobId === '') throw invalid('Job id must not be empty');
  if (!Number.isSafeInteger(position) || position < 1) {
    throw invalid('Track position must be a positive integer');
  }
  const api = platform === 'win32' ? path.win32 : path.posix;
  const base = api.basename(finalPath);
  if (base === '' || !finalPath.endsWith(base)) {
    throw invalid('Final path must end with a file name');
  }
  const directory = finalPath.slice(0, finalPath.length - base.length);
  const suffix = `.${shortJobId(jobId)}-${String(position)}.part`;
  const suffixLength = nameLength(suffix, platform);
  const budget = Math.min(
    maxSegmentLength - suffixLength,
    maxPathLength[platform] - nameLength(directory, platform) - suffixLength,
  );
  if (budget < 0) throw invalid('Part path is too long');
  return `${directory}${truncateGraphemes(base, budget, platform)}${suffix}`;
}
