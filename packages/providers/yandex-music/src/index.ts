export const yandexMusicProviderPackage =
  '@music-downloader/provider-yandex-music';

export * from './yandex-music-auth.js';
export { YandexMusicProviderAuth as YandexMusicProvider } from './yandex-music-auth.js';
/** Версия raw/domain compatibility contract для диагностики doctor. */
export const PROVIDER_SCHEMA_VERSION = '1.1.0';
export { DOCTOR_CANARY_TRACK_ID, probeCredentials } from './health.js';
export { resolveYandexMusicUrl } from './url/resolve-yandex-music-url.js';
