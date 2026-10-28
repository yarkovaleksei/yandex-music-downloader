import type { DesktopApi } from '../contract/desktop-api.js';
declare global {
  interface Window {
    readonly desktopApi: DesktopApi;
  }
}
