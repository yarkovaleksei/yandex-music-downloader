import type { QualityPreference } from './domain.js';
import { ValidationError } from './errors.js';

/** Закрытые presets используют только существующие безопасные layout helpers. */
export type NamingPreset = 'collection' | 'album';
export interface DesktopSettings {
  readonly outputDirectory: string | null;
  readonly quality: QualityPreference;
  readonly concurrency: number;
  readonly naming: NamingPreset;
  readonly overwrite: boolean;
  readonly ffmpegPath: string | null;
  readonly logging: 'error' | 'warn' | 'info' | 'debug' | 'trace';
}
export const defaultDesktopSettings: DesktopSettings = {
  outputDirectory: null,
  quality: 'best',
  concurrency: 4,
  naming: 'collection',
  overwrite: false,
  ffmpegPath: null,
  logging: 'info',
};

/** Явная проекция не сохраняет случайные поля provider-а или credentials (PRN-002). */
export function desktopSettings(value: DesktopSettings): DesktopSettings {
  if (
    !value ||
    !['best', 'lossless', 'high', 'normal'].includes(value.quality) ||
    !Number.isInteger(value.concurrency) ||
    value.concurrency < 1 ||
    value.concurrency > 8 ||
    !['collection', 'album'].includes(value.naming) ||
    typeof value.overwrite !== 'boolean' ||
    !['error', 'warn', 'info', 'debug', 'trace'].includes(value.logging) ||
    !localPath(value.outputDirectory) ||
    !localPath(value.ffmpegPath)
  )
    throw new ValidationError();
  return {
    outputDirectory: value.outputDirectory,
    quality: value.quality,
    concurrency: value.concurrency,
    naming: value.naming,
    overwrite: value.overwrite,
    ffmpegPath: value.ffmpegPath,
    logging: value.logging,
  };
}
function localPath(value: unknown): boolean {
  return (
    value === null ||
    (typeof value === 'string' &&
      value.length > 0 &&
      value.length <= 4096 &&
      !/[\0\r\n]/.test(value) &&
      !/^\\\\|^\/\/|^[a-z]+:\/\//i.test(value) &&
      (value.startsWith('/') || /^[a-z]:[\\/]/i.test(value)))
  );
}
