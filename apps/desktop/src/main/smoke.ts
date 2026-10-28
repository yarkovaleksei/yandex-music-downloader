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
    code?: string;
  } = {
    status: 'FAIL',
    platform: process.platform,
    arch: process.arch,
    versions: {
      electron: process.versions.electron,
      node: process.versions.node,
      napi: process.versions.napi,
    },
    isolation: {},
  };
  try {
    report.isolation = await window.webContents.executeJavaScript(
      `({ requireAbsent: typeof require === 'undefined', processAbsent: typeof process === 'undefined', ipcRendererAbsent: typeof ipcRenderer === 'undefined', apiPresent: typeof window.desktopApi?.account === 'function' })`,
    );
    await window.webContents.executeJavaScript(
      'document.fonts.ready.then(() => true)',
    );
    await writeFile(
      path.join(directory, 'window.png'),
      (await window.webContents.capturePage()).toPNG(),
    );
    report.status = 'PASS';
  } catch {
    report.code = 'WINDOW_CAPTURE_FAILED';
  } finally {
    await writeFile(
      path.join(directory, 'window-report.json'),
      JSON.stringify(report, null, 2) + '\n',
    );
    app.quit();
  }
}
