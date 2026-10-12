import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { ParsedArguments, LogLevel } from './arguments.js';
import type { QualityPreference } from '@music-downloader/application/contracts';

export interface CliEnvironment {
  readonly env: NodeJS.ProcessEnv;
  readonly homedir: () => string;
  readonly platform?: NodeJS.Platform;
}
export interface Configuration {
  readonly output: string;
  readonly quality: QualityPreference;
  readonly concurrency: number;
  readonly overwrite: boolean;
  readonly json: boolean;
  readonly logLevel: LogLevel;
  readonly logFile?: string;
  readonly debug: boolean;
}

function bool(value: unknown): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'boolean') return value;
  throw new Error('Некорректное булево значение.');
}
function envBool(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error('Некорректное булево значение окружения.');
}
function nonempty(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0)
    throw new Error('Некорректная строковая настройка.');
  return value;
}
function configurationRoot(host: CliEnvironment): string {
  if ((host.platform ?? process.platform) === 'win32')
    return host.env.APPDATA ?? path.join(host.homedir(), 'AppData', 'Roaming');
  return host.env.XDG_CONFIG_HOME ?? path.join(host.homedir(), '.config');
}
function settings(host: CliEnvironment): Record<string, unknown> {
  let text: string;
  try {
    text = readFileSync(
      path.join(configurationRoot(host), 'music-downloader', 'settings.json'),
      'utf8',
    );
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'ENOENT'
    )
      return {};
    throw new Error('Не удалось прочитать настройки.');
  }
  const value: unknown = JSON.parse(text);
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Некорректные настройки.');
  const item = value as Record<string, unknown>;
  for (const key of ['overwrite', 'skipExisting', 'json', 'debug'])
    bool(item[key]);
  return item;
}
function musicDirectory(host: CliEnvironment): string {
  if ((host.platform ?? process.platform) === 'linux') {
    try {
      // XDG — данные, а не shell-код: подставляем только известный HOME.
      const value = readFileSync(
        path.join(configurationRoot(host), 'user-dirs.dirs'),
        'utf8',
      ).match(/^XDG_MUSIC_DIR="([^"\n]*)"$/m)?.[1];
      if (value === '$HOME') return host.homedir();
      if (value?.startsWith('$HOME/'))
        return path.join(host.homedir(), value.slice(6));
      if (value !== undefined && path.isAbsolute(value)) return value;
    } catch {
      /* При отсутствии user-dirs используется Music внутри home. */
    }
  }
  return path.join(host.homedir(), 'Music');
}
function overwriteRule(
  levels: readonly { overwrite?: boolean; skipExisting?: boolean }[],
): boolean {
  for (const level of levels) {
    if (level.overwrite === undefined && level.skipExisting === undefined)
      continue;
    if (level.overwrite === true && level.skipExisting === true)
      throw new Error('Конфликт режимов перезаписи.');
    return level.overwrite === true;
  }
  return false;
}

/** Настройки собираются flags → env → settings → defaults, без credentials.
 * Resume/retry не заменяют сохранённые параметры загрузки. @link planning/tasks/STEP-019.md */
export function resolveConfiguration(
  args: ParsedArguments,
  host: CliEnvironment,
): Configuration {
  const env = host.env;
  const file = settings(host);
  const downloading = ['download', 'track', 'album', 'playlist'].includes(
    args.command ?? '',
  );
  const quality = nonempty(
    downloading
      ? (args.quality ?? env.MUSIC_DOWNLOADER_QUALITY ?? file.quality ?? 'best')
      : 'best',
  ) as QualityPreference;
  if (!['best', 'lossless', 'high', 'normal'].includes(quality))
    throw new Error('Некорректное качество.');
  const concurrencyRaw =
    args.concurrency ??
    env.MUSIC_DOWNLOADER_CONCURRENCY ??
    file.concurrency ??
    4;
  if (
    typeof concurrencyRaw !== 'number' &&
    (typeof concurrencyRaw !== 'string' || !/^\d+$/.test(concurrencyRaw))
  )
    throw new Error('Некорректная concurrency.');
  const concurrency = Number(concurrencyRaw);
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8)
    throw new Error('Некорректная concurrency.');
  const output = nonempty(
    downloading || args.command === 'doctor'
      ? (args.output ??
          env.MUSIC_DOWNLOADER_OUTPUT ??
          file.output ??
          musicDirectory(host))
      : musicDirectory(host),
  );
  const logLevel = nonempty(
    args.logLevel ?? env.MUSIC_DOWNLOADER_LOG_LEVEL ?? file.logLevel ?? 'info',
  ) as LogLevel;
  if (!['error', 'warn', 'info', 'debug', 'trace'].includes(logLevel))
    throw new Error('Некорректный уровень логирования.');
  const overwrite = downloading
    ? overwriteRule([
        { overwrite: args.overwrite, skipExisting: args.skipExisting },
        {
          overwrite: envBool(env.MUSIC_DOWNLOADER_OVERWRITE),
          skipExisting: envBool(env.MUSIC_DOWNLOADER_SKIP_EXISTING),
        },
        {
          overwrite: bool(file.overwrite),
          skipExisting: bool(file.skipExisting),
        },
      ])
    : false;
  const logFile = args.logFile ?? env.MUSIC_DOWNLOADER_LOG_FILE ?? file.logFile;
  return {
    output,
    quality,
    concurrency,
    overwrite,
    json:
      args.json ??
      envBool(env.MUSIC_DOWNLOADER_JSON) ??
      bool(file.json) ??
      false,
    logLevel,
    ...(logFile === undefined ? {} : { logFile: nonempty(logFile) }),
    debug:
      args.debug ??
      envBool(env.MUSIC_DOWNLOADER_DEBUG) ??
      bool(file.debug) ??
      false,
  };
}
