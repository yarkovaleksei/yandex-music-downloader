import type { BrowserWindowConstructorOptions } from 'electron';
/** Все BrowserWindow flags ADR-015 хранятся вместе и проверяются одним тестом. */
export function windowOptions(
  preload: string,
): BrowserWindowConstructorOptions {
  return {
    width: 1100,
    height: 760,
    minWidth: 760,
    minHeight: 560,
    backgroundColor: '#F7F8FC',
    title: 'Yandex Music Downloader',
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      experimentalFeatures: false,
      devTools: false,
    },
  };
}
