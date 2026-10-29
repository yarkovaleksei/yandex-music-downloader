import { createApplication as realCreateApplication } from '@music-downloader/application';
import { offlineProvider } from './provider.mjs';

/** Меняется только provider/stateDir: штатные stores, processing и adapters остаются реальными. */
export function createApplication(options) {
  return realCreateApplication({
    ...options,
    stateDir: process.env.MUSIC_E2E_STATE,
    providerOverride: offlineProvider(),
  });
}
