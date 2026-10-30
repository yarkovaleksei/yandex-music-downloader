import { expect, it } from 'vitest';
import { desktopPackage } from './index.js';
it('экспортирует desktop workspace', () => {
  expect(desktopPackage).toBe('@music-downloader/desktop');
});
