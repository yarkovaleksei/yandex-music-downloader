import { ipcMain } from 'electron';
import type { BrowserWindow } from 'electron';
import { channel, methods } from '../contract/desktop-api.js';
import type { Method } from '../contract/desktop-api.js';
import { invokeBroker } from '../main/broker.js';
import type { BrokerActions } from '../main/broker.js';
import type { DirectoryRegistry } from '../main/directory-registry.js';
import { isAppUrl } from '../main/content-policy.js';
/** Единственный ipcMain adapter; каждый канал взят из contract module. */
export function registerIpc(
  window: BrowserWindow,
  directories: DirectoryRegistry,
  actions: BrokerActions,
  host: (method: Method, input: unknown) => Promise<unknown>,
): () => void {
  for (const method of Object.keys(methods) as Method[])
    ipcMain.handle(channel(method), (event, payload: unknown) =>
      invokeBroker(
        method,
        payload,
        event.sender === window.webContents &&
          event.senderFrame === window.webContents.mainFrame &&
          isAppUrl(event.senderFrame?.url ?? ''),
        directories,
        actions,
        host,
      ),
    );
  return () => {
    for (const method of Object.keys(methods) as Method[])
      ipcMain.removeHandler(channel(method));
  };
}
