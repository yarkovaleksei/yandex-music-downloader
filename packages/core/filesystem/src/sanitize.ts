import { ValidationError } from '@music-downloader/shared';

/** Целевая ОС задаётся явно, чтобы результат не зависел от process.platform. */
export type TargetPlatform = 'win32' | 'darwin' | 'linux';

export interface SanitizeOptions {
  readonly platform: TargetPlatform;
  /** Подстановка для имени, ставшего пустым (REQ-023). */
  readonly fallback?: string;
  /** Лимит длины в единицах платформы; не больше {@link maxSegmentLength}. */
  readonly maxLength?: number;
}

export const unknownName = 'Unknown';

/** 255 байт UTF-8 на linux/darwin и 255 UTF-16 code units на win32. */
export const maxSegmentLength = 255;

const forbiddenCharacters = new Set([
  '<',
  '>',
  ':',
  '"',
  '/',
  '\\',
  '|',
  '?',
  '*',
]);
const windowsReservedName =
  /^(con|prn|aux|nul|com[1-9]|lpt[1-9])( *(?:\.|$))/iu;
const extensionPattern = /^[a-z0-9]{1,10}$/u;
const encoder = new TextEncoder();
const graphemes = new Intl.Segmenter('und', { granularity: 'grapheme' });

/** Длина имени в единицах, которыми ограничивает файловая система платформы. */
export function nameLength(value: string, platform: TargetPlatform): number {
  return platform === 'win32' ? value.length : encoder.encode(value).length;
}

/**
 * Очищает подстановку шаблона без платформенных правил целого сегмента:
 * NFC, замена запрещённых и управляющих символов, обрезка пробелов, '.'/'..' → ''.
 */
export function cleanNamePart(value: string): string {
  let result = '';
  for (const character of value.normalize('NFC')) {
    const code = character.codePointAt(0) ?? 0;
    const forbidden =
      code < 0x20 || code === 0x7f || forbiddenCharacters.has(character);
    result += forbidden ? '_' : character;
  }
  result = result.trim();
  return result === '.' || result === '..' ? '' : result;
}

function truncate(
  value: string,
  limit: number,
  platform: TargetPlatform,
): string {
  if (nameLength(value, platform) <= limit) return value;
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

function finalizeOnce(
  value: string,
  platform: TargetPlatform,
  limit: number,
): string {
  let result = value.trim();
  if (platform === 'win32') {
    result = result.replace(/[ .]+$/u, '');
    result = result.replace(
      windowsReservedName,
      (_match, base: string, tail: string) => `${base}_${tail}`,
    );
  }
  result = truncate(result, limit, platform);
  return result === '.' || result === '..' ? '' : result;
}

/** Повторяет правила до неподвижной точки: усечение может обнажить trailing точки. */
function finalize(
  value: string,
  platform: TargetPlatform,
  limit: number,
): string {
  let current = value;
  for (;;) {
    const next = finalizeOnce(current, platform, limit);
    if (next === current) return next;
    current = next;
  }
}

function segmentLimit(options: SanitizeOptions): number {
  return Math.max(
    1,
    Math.min(options.maxLength ?? maxSegmentLength, maxSegmentLength),
  );
}

/**
 * Единый sanitizer сегмента пути для всех платформ (REQ-022): результат не содержит
 * разделителей, не равен '.'/'..', не пустой и укладывается в лимит платформы.
 */
export function sanitizePathSegment(
  name: string,
  options: SanitizeOptions,
): string {
  const limit = segmentLimit(options);
  const cleaned = finalize(cleanNamePart(name), options.platform, limit);
  if (cleaned !== '') return cleaned;
  const fallback = finalize(
    cleanNamePart(options.fallback ?? unknownName),
    options.platform,
    limit,
  );
  return fallback === ''
    ? finalize(unknownName, options.platform, limit)
    : fallback;
}

/** Расширение принимается только из allowlist, иначе ValidationError. */
export function normalizeExtension(extension: string): string {
  const normalized = extension.replace(/^\./u, '').toLowerCase();
  if (!extensionPattern.test(normalized)) {
    throw new ValidationError(new Error('Unsupported file extension'));
  }
  return normalized;
}

/** Усекает только stem: расширение и необязательный суффикс сохраняются целиком. */
export function sanitizeFileName(
  stem: string,
  extension: string,
  options: SanitizeOptions & { readonly suffix?: string },
): string {
  const tail = `${options.suffix ?? ''}.${normalizeExtension(extension)}`;
  const stemLimit = segmentLimit(options) - nameLength(tail, options.platform);
  if (stemLimit < 1) {
    throw new ValidationError(new Error('File name limit is too small'));
  }
  return `${sanitizePathSegment(stem, { ...options, maxLength: stemLimit })}${tail}`;
}
