export const yandexMusicProviderPackage =
  '@music-downloader/provider-yandex-music';

export * from './yandex-music-auth.js';
export { YandexMusicProviderAuth as YandexMusicProvider } from './yandex-music-auth.js';
/** Версия raw/domain compatibility contract; doctor использует её в STEP-025. */
export const PROVIDER_SCHEMA_VERSION = '1.1.0';
export { resolveYandexMusicUrl } from './url/resolve-yandex-music-url.js';
