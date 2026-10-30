/** Публичные DTO отделены от Node composition root для будущих transport-клиентов. */
export * from '@music-downloader/shared';

/** Host задаёт diagnostics без импорта реализации logging в клиенте. */
export interface RuntimeLoggingOptions {
  readonly level?: 'error' | 'warn' | 'info' | 'debug' | 'trace';
  readonly filePath?: string;
  readonly debug?: boolean;
}
