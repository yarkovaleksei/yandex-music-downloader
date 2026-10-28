import type { BrowserWindow } from 'electron';
import type { DesktopEvent } from '../contract/desktop-api.js';
import { eventChannel } from '../contract/desktop-api.js';
/** Единственный адаптер отправки событий, без Electron event в payload. */
export function sendEvent(
  window: BrowserWindow | undefined,
  event: DesktopEvent,
): void {
  if (window && !window.isDestroyed())
    window.webContents.send(eventChannel, event);
}
