import { mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseArguments } from './arguments.js';
import { resolveConfiguration } from './configuration.js';

describe('конфигурация CLI', () => {
  let root: string | undefined;
  afterEach(async () => {
    if (root !== undefined) await rm(root, { recursive: true, force: true });
    root = undefined;
  });
  it('даёт приоритет флагам над env и settings', async () => {
    // Отдельный временный home не несёт пользовательские настройки в тест.
    root = await (
      await import('node:fs/promises')
    ).mkdtemp(path.join(os.tmpdir(), 'cli-config-'));
    const config = path.join(root, '.config', 'music-downloader');
    await mkdir(config, { recursive: true });
    await writeFile(
      path.join(config, 'settings.json'),
      JSON.stringify({
        quality: 'normal',
        concurrency: 2,
        overwrite: false,
        debug: false,
      }),
    );
    expect(
      resolveConfiguration(
        parseArguments([
          'download',
          'u',
          '--quality',
          'lossless',
          '--concurrency',
          '8',
          '--overwrite',
          '--debug',
        ]),
        {
          env: {
            MUSIC_DOWNLOADER_QUALITY: 'high',
            MUSIC_DOWNLOADER_CONCURRENCY: '3',
          },
          homedir: () => root!,
        },
      ),
    ).toMatchObject({
      quality: 'lossless',
      concurrency: 8,
      overwrite: true,
      debug: true,
    });
  });
  it.each([
    [{ MUSIC_DOWNLOADER_OVERWRITE: 'yes' }],
    [
      {
        MUSIC_DOWNLOADER_OVERWRITE: 'true',
        MUSIC_DOWNLOADER_SKIP_EXISTING: 'true',
      },
    ],
    [{ MUSIC_DOWNLOADER_LOG_FILE: '' }],
  ])('отклоняет некорректное окружение', (env) =>
    expect(() =>
      resolveConfiguration(parseArguments(['download', 'u']), {
        env,
        homedir: () => '/tmp',
      }),
    ).toThrow(),
  );
  it('использует APPDATA на Windows и абсолютный XDG music путь', async () => {
    root = await (
      await import('node:fs/promises')
    ).mkdtemp(path.join(os.tmpdir(), 'cli-config-'));
    const appData = path.join(root, 'appdata');
    const xdg = path.join(root, 'xdg');
    await mkdir(path.join(appData, 'music-downloader'), { recursive: true });
    await writeFile(
      path.join(appData, 'music-downloader', 'settings.json'),
      JSON.stringify({ quality: 'high' }),
    );
    expect(
      resolveConfiguration(parseArguments(['download', 'u']), {
        env: { APPDATA: appData },
        homedir: () => root!,
        platform: 'win32',
      }),
    ).toMatchObject({ quality: 'high' });
    await mkdir(xdg, { recursive: true });
    await writeFile(
      path.join(xdg, 'user-dirs.dirs'),
      'XDG_MUSIC_DIR="/mnt/music"\n',
    );
    expect(
      resolveConfiguration(parseArguments(['download', 'u']), {
        env: { XDG_CONFIG_HOME: xdg },
        homedir: () => root!,
        platform: 'linux',
      }).output,
    ).toBe('/mnt/music');
  });
  it.each(['{', JSON.stringify({ debug: 'да' })])(
    'отклоняет повреждённый settings.json',
    async (contents) => {
      root = await (
        await import('node:fs/promises')
      ).mkdtemp(path.join(os.tmpdir(), 'cli-config-'));
      const directory = path.join(root, '.config', 'music-downloader');
      await mkdir(directory, { recursive: true });
      await writeFile(path.join(directory, 'settings.json'), contents);
      expect(() =>
        resolveConfiguration(parseArguments(['download', 'u']), {
          env: {},
          homedir: () => root!,
        }),
      ).toThrow();
    },
  );
});
