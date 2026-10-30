import type { BrowserWindow } from 'electron';
import { app } from 'electron';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
/** Ручной smoke сохраняет реальное окно/изоляцию; отказ графики не выдаётся за PASS. */
export async function captureSmoke(
  window: BrowserWindow,
  directory: string,
): Promise<void> {
  await mkdir(directory, { recursive: true });
  const report: {
    status: 'PASS' | 'FAIL';
    platform: string;
    arch: string;
    versions: object;
    isolation: unknown;
    uiReady: boolean;
    appVersion: string;
    settings?: { quality: string; logging: string; concurrency: number };
    code?: string;
    message?: string;
  } = {
    status: 'FAIL',
    platform: process.platform,
    arch: process.arch,
    appVersion: app.getVersion(),
    versions: {
      electron: process.versions.electron,
      node: process.versions.node,
      napi: process.versions.napi,
    },
    isolation: {},
    uiReady: false,
  };
  try {
    report.isolation = await window.webContents.executeJavaScript(
      `({ requireAbsent: typeof require === 'undefined', processAbsent: typeof process === 'undefined', ipcRendererAbsent: typeof ipcRenderer === 'undefined', apiPresent: typeof window.desktopApi?.account === 'function' })`,
    );
    //  loadURL/наличие preload не доказывают React render:
    // прежний helper успевал сохранить пустой фон с PASS. Ждём реальный видимый контрол и кадр.
    await window.webContents
      .executeJavaScript(`new Promise((resolve, reject) => {
      function check() {
        const input = document.getElementById('root')?.querySelector('input');
        const label = [...document.querySelectorAll('label')].some(node => node.textContent.includes('Ссылка на музыку'));
        if (input && label && input.getBoundingClientRect().width > 0) {
          clearTimeout(timer); observer.disconnect(); resolve(true);
        }
      }
      const observer = new MutationObserver(check);
      const timer = setTimeout(() => { observer.disconnect(); reject(new Error('DESKTOP_UI_NOT_READY')); }, 15000);
      observer.observe(document.documentElement, { childList: true, subtree: true });
      check();
    })`);
    await window.webContents.executeJavaScript(
      'document.fonts.ready.then(() => true)',
    );
    await window.webContents.executeJavaScript(
      'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))',
    );
    // только явный smoke в изолированном stateDir проверяет сохранение настроек через публичный IPC.
    if (process.env.MUSIC_DOWNLOADER_SMOKE_SEED_SETTINGS === '1') {
      const saved = (await window.webContents.executeJavaScript(
        `window.desktopApi.saveSettings({ quality: 'normal', concurrency: 3, naming: 'collection', overwrite: false, logging: 'debug' }).then(result => result.kind === 'result')`,
      )) as boolean;
      if (!saved) throw new Error('SMOKE_SETTINGS_NOT_SAVED');
    }
    const settings = (await window.webContents.executeJavaScript(
      `window.desktopApi.getSettings().then(result => result.kind === 'result' ? { quality: result.data.quality, logging: result.data.logging, concurrency: result.data.concurrency } : null)`,
    )) as { quality: string; logging: string; concurrency: number } | null;
    if (!settings) throw new Error('SMOKE_SETTINGS_NOT_READ');
    report.settings = settings;
    report.uiReady = true;
    await writeFile(
      path.join(directory, 'window.png'),
      (await window.webContents.capturePage()).toPNG(),
    );
    report.status = 'PASS';
  } catch (error) {
    report.code = 'WINDOW_CAPTURE_FAILED';
    report.message = error instanceof Error ? error.message : String(error);
  } finally {
    await writeFile(
      path.join(directory, 'window-report.json'),
      JSON.stringify(report, null, 2) + '\n',
    );
    app.quit();
  }
}
