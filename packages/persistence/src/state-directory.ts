import path from 'node:path';
import os from 'node:os';

export type StatePlatform = 'linux' | 'darwin' | 'win32';

export interface StateDirectoryOptions {
  readonly platform?: StatePlatform;
  readonly env?: NodeJS.ProcessEnv;
  readonly home?: string;
  readonly stateDir?: string;
}

/** Возвращает пользовательский каталог состояния без создания каталогов. */
export function resolveStateDirectory(
  options: StateDirectoryOptions = {},
): string {
  if (options.stateDir !== undefined) return path.resolve(options.stateDir);
  const env = options.env ?? process.env;
  const home = options.home ?? os.homedir();
  switch (options.platform ?? process.platform) {
    case 'win32':
      return path.join(
        env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local'),
        'music-downloader',
      );
    case 'darwin':
      return path.join(
        home,
        'Library',
        'Application Support',
        'music-downloader',
      );
    default:
      return path.join(
        env.XDG_STATE_HOME ?? path.join(home, '.local', 'state'),
        'music-downloader',
      );
  }
}
