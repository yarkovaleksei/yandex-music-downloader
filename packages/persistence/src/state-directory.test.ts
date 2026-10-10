import { describe, expect, it } from 'vitest';
import { resolveStateDirectory } from './state-directory.js';
describe('resolveStateDirectory', () => {
  it('выбирает каталог состояния для каждой поддерживаемой ОС', () => {
    expect(
      resolveStateDirectory({ platform: 'linux', home: '/home/a', env: {} }),
    ).toBe('/home/a/.local/state/music-downloader');
    expect(
      resolveStateDirectory({ platform: 'darwin', home: '/Users/a', env: {} }),
    ).toBe('/Users/a/Library/Application Support/music-downloader');
    expect(
      resolveStateDirectory({
        platform: 'win32',
        home: 'C:\\Users\\a',
        env: { LOCALAPPDATA: 'C:\\State' },
      }),
    ).toContain('music-downloader');
  });
});
