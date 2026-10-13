/** Публичный Node composition root; переносимые DTO доступны через `./contracts`. */
export const applicationPackage = '@music-downloader/application';
export { createApplication } from './composition-root.js';
export { clearApplicationCache } from './cache.js';
export type {
  RuntimeAdapters,
  RuntimeCacheOptions,
} from './runtime-adapters.js';
export type { RuntimeLoggingOptions } from './contracts.js';
export type { DiagnosticRuntimeOptions } from './diagnostics.js';
export type { ApplicationApi } from '@music-downloader/shared';
