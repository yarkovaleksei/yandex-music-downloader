import type { VariantSelection, QualityPreference } from './domain.js';
import { ValidationError } from './errors.js';

/** Закрытые presets используют только существующие безопасные layout helpers. */
export type NamingPreset = 'collection' | 'album';
export interface DesktopSettings {
  readonly writeTags?: boolean;
  readonly saveCoverFile?: boolean;
  readonly writeM3u8?: boolean;
  readonly theme?: 'light' | 'dark';
  readonly outputDirectory: string | null;
  readonly quality: QualityPreference;
  readonly concurrency: number;
  readonly naming: NamingPreset;
  readonly overwrite: boolean;
  readonly ffmpegPath: string | null;
  readonly logging: 'error' | 'warn' | 'info' | 'debug' | 'trace';
}
export const defaultDesktopSettings: DesktopSettings = {
  writeTags: true,
  saveCoverFile: true,
  writeM3u8: true,
  theme: 'light',
  outputDirectory: null,
  quality: 'best',
  concurrency: 4,
  naming: 'collection',
  overwrite: false,
  ffmpegPath: null,
  logging: 'info',
};

/** Явная проекция не сохраняет случайные поля provider-а или credentials (REQ-039). */
export function desktopSettings(value: DesktopSettings): DesktopSettings {
  if (
    !value ||
    ['writeTags', 'saveCoverFile', 'writeM3u8'].some((key) => {
      const field = value[key as keyof DesktopSettings];
      return field !== undefined && typeof field !== 'boolean';
    }) ||
    (value.theme !== undefined && !['light', 'dark'].includes(value.theme)) ||
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
  // REQ-058: старый JSON нормализуется без записи и без текущих пользовательских defaults.
  return {
    writeTags: value.writeTags ?? true,
    saveCoverFile: value.saveCoverFile ?? true,
    writeM3u8: value.writeM3u8 ?? true,
    theme: value.theme ?? 'light',
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

/** Закрытая проекция selector: отсутствие bitrate означает только вариант без bitrate (REQ-010). */
export function variantSelection(value: VariantSelection): VariantSelection {
  if (
    !value ||
    !/^[a-zA-Z0-9_-]{1,64}$/.test(value.codec) ||
    !/^[a-zA-Z0-9_-]{1,64}$/.test(value.container) ||
    typeof value.lossless !== 'boolean' ||
    (value.bitrate !== undefined &&
      (!Number.isFinite(value.bitrate) || value.bitrate <= 0))
  )
    throw new ValidationError();
  return {
    codec: value.codec,
    container: value.container,
    lossless: value.lossless,
    ...(value.bitrate === undefined ? {} : { bitrate: value.bitrate }),
  };
}
