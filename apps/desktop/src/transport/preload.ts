import { contextBridge, ipcRenderer } from 'electron';
import { channel, eventChannel, methods } from '../contract/desktop-api.js';
import type {
  DesktopApi,
  DesktopEvent,
  Method,
} from '../contract/desktop-api.js';

/** В sandbox передаются только DTO; Electron event/invoke не раскрываются renderer. */
const api = Object.fromEntries(
  (Object.keys(methods) as Method[]).map((method) => [
    method,
    (payload: unknown) => ipcRenderer.invoke(channel(method), payload),
  ]),
) as unknown as DesktopApi;
const desktopApi: DesktopApi = {
  ...api,
  subscribe(listener) {
    const receive = (
      _event: Electron.IpcRendererEvent,
      payload: DesktopEvent,
    ) => listener(payload);
    ipcRenderer.on(eventChannel, receive);
    return () => {
      ipcRenderer.removeListener(eventChannel, receive);
    };
  },
};
contextBridge.exposeInMainWorld('desktopApi', desktopApi);
