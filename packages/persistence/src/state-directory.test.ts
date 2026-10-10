import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { resolveStateDirectory } from './state-directory.js';
describe('resolveStateDirectory', () => {
  it('выбирает каталог состояния для каждой поддерживаемой ОС', () => {
    expect(
      resolveStateDirectory({ platform: 'linux', home: '/home/a', env: {} }),
    ).toBe(path.join('/home/a', '.local', 'state', 'music-downloader'));
    expect(
      resolveStateDirectory({ platform: 'darwin', home: '/Users/a', env: {} }),
    ).toBe(
      path.join(
        '/Users/a',
        'Library',
        'Application Support',
        'music-downloader',
      ),
    );
    expect(
      resolveStateDirectory({
        platform: 'win32',
        home: 'C:\\Users\\a',
        env: { LOCALAPPDATA: 'C:\\State' },
      }),
    ).toBe(path.join('C:\\State', 'music-downloader'));
  });
});
