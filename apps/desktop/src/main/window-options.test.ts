import { expect, it } from 'vitest';
import { windowOptions } from './window-options.js';
it('ADR-015 закрепляет все security flags и единственный preload', () => {
  expect(windowOptions('/bundle/preload.cjs').webPreferences).toEqual({
    preload: '/bundle/preload.cjs',
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
  });
});
