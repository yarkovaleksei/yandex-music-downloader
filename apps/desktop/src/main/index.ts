import {
  app,
  BrowserWindow,
  dialog,
  net,
  Notification,
  protocol,
  session,
  shell,
} from 'electron';
import { PortableUpdates } from './update/service.js';
import type { UpdateTrust } from './update/service.js';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ApplicationResult, JobSnapshot } from '@music-downloader/shared';
import {
  appScheme,
  appUrl,
  bundlePath,
  contentSecurityPolicy,
  isAppUrl,
} from './content-policy.js';
import { windowOptions } from './window-options.js';
import { DirectoryRegistry } from './directory-registry.js';
import { HostSupervisor } from './host-supervisor.js';
import { registerIpc } from '../transport/main-ipc.js';
import type { Method } from '../contract/desktop-api.js';
import { jobFolders } from './job-folders.js';
import { jobNotifications } from './job-notifications.js';
import { sendEvent } from '../transport/window-events.js';

if (process.env.MUSIC_DOWNLOADER_SMOKE_DIR)
  app.setPath(
    'userData',
    path.join(process.env.MUSIC_DOWNLOADER_SMOKE_DIR, 'window-user-data'),
  );
protocol.registerSchemesAsPrivileged([
  {
    scheme: appScheme,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);
app.commandLine.removeSwitch('remote-debugging-port');
app.commandLine.removeSwitch('remote-debugging-pipe');
let window: BrowserWindow | undefined;
let closing = false;
let removeIpc: (() => void) | undefined;
const notify = jobNotifications(
  async (jobId) =>
    (await invokeHost('getJob', {
      jobId,
    })) as ApplicationResult<JobSnapshot | null>,
  (title, body) => {
    if (Notification.isSupported()) new Notification({ title, body }).show();
  },
);
async function invokeHost(method: Method, input: unknown): Promise<unknown> {
  if (method === 'resume')
    notify.beginResume((input as { jobId: string }).jobId);
  const result = await host.invoke(method, input);
  notify.observeResult(method, result);
  return result;
}
const host = new HostSupervisor((event) => {
  sendEvent(window, event);
  void notify(event);
});

void app.whenReady().then(async () => {
  const root = path.resolve(import.meta.dirname, '../renderer');
  await protocol.handle(appScheme, async (request) => {
    const file = bundlePath(root, request.url);
    if (!file) return new Response('Нет доступа', { status: 403 });
    try {
      if (path.extname(file) === '.html') {
        const nonce = randomBytes(18).toString('base64');
        return new Response(
          (await readFile(file, 'utf8')).replaceAll('__CSP_NONCE__', nonce),
          {
            headers: {
              'Content-Type': 'text/html; charset=utf-8',
              'Content-Security-Policy': contentSecurityPolicy(nonce),
            },
          },
        );
      }
      return await net.fetch(pathToFileURL(file).href);
    } catch {
      return new Response('Ресурс не найден', { status: 404 });
    }
  });
  session.defaultSession.setPermissionRequestHandler(
    (_contents, _permission, callback) => callback(false),
  );
  session.defaultSession.setPermissionCheckHandler(() => false);
  window = new BrowserWindow(
    windowOptions(path.resolve(import.meta.dirname, '../preload.cjs')),
  );
  // служебное меню не занимает клиентскую область Linux/Windows.
  if (process.platform !== 'darwin') window.setMenu(null);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) event.preventDefault();
  });
  window.webContents.on('will-frame-navigate', (event) => {
    if (!isAppUrl(event.url)) event.preventDefault();
  });
  window.webContents.on('will-redirect', (event, url) => {
    if (!isAppUrl(url)) event.preventDefault();
  });
  const directories = new DirectoryRegistry();
  // Конфигурация доверия поставляется внутри ASAR, а не принимается от renderer/env/feed.
  const trust = JSON.parse(
    await readFile(
      path.resolve(import.meta.dirname, '../update-trust.json'),
      'utf8',
    ),
  ) as UpdateTrust;
  const updates = new PortableUpdates({
    trust,
    currentVersion: app.getVersion(),
    target: `${process.platform}-${process.arch}`,
    directory: path.join(app.getPath('userData'), 'portable-updates'),
    reveal: (file) => shell.showItemInFolder(file),
  });
  removeIpc = registerIpc(
    window,
    directories,
    {
      updates,
      appInfo: () => ({ version: app.getVersion(), dev: !app.isPackaged }),
      jobFolderAvailability: folders.availability,
      selectFfmpeg: async () => {
        if (!window) return undefined;
        const result = await dialog.showOpenDialog(window, {
          title: 'Выберите FFmpeg для диагностики',
          properties: ['openFile'],
        });
        return result.canceled ? undefined : result.filePaths[0];
      },
      selectDirectory: async () => {
        if (!window) return undefined;
        const result = await dialog.showOpenDialog(window, {
          properties: ['openDirectory', 'createDirectory'],
        });
        return result.canceled ? undefined : result.filePaths[0];
      },
      showItemInFolder: folders.open,
      openDirectory: async (directory) =>
        (await shell.openPath(directory)) === '',
      openExternal: async (url) => {
        await shell.openExternal(url);
      },
    },
    (method, input) => invokeHost(method, input),
  );
  host.start();
  await window.loadURL(appUrl);
  // Smoke сохраняет только окно/изоляцию; native proof запускается отдельно в host.
  if (process.env.MUSIC_DOWNLOADER_SMOKE_DIR) {
    const { captureSmoke } = await import('./smoke.js');
    await captureSmoke(window, process.env.MUSIC_DOWNLOADER_SMOKE_DIR);
  }
});
app.on('before-quit', (event) => {
  if (closing) return;
  event.preventDefault();
  closing = true;
  removeIpc?.();
  void host.close().finally(() => app.quit());
});
app.on('window-all-closed', () => app.quit());

const folders = jobFolders(
  async (jobId) =>
    (await invokeHost('getJob', {
      jobId,
    })) as ApplicationResult<JobSnapshot | null>,
  (file) => shell.showItemInFolder(file),
);
