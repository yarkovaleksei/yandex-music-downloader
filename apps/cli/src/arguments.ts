import type { QualityPreference } from '@music-downloader/application/contracts';

export type CommandName =
  | 'auth'
  | 'account'
  | 'logout'
  | 'jobs'
  | 'download'
  | 'track'
  | 'album'
  | 'playlist'
  | 'resume'
  | 'retry'
  | 'cancel';
export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace';

export interface ParsedArguments {
  readonly command?: CommandName;
  readonly value?: string;
  readonly help: boolean;
  readonly json?: boolean;
  readonly output?: string;
  readonly quality?: QualityPreference;
  readonly concurrency?: number;
  readonly overwrite?: boolean;
  readonly skipExisting?: boolean;
  readonly logLevel?: LogLevel;
  readonly logFile?: string;
  readonly debug?: boolean;
}

export class UsageError extends Error {}

const commands = new Set<CommandName>([
  'auth',
  'account',
  'logout',
  'jobs',
  'download',
  'track',
  'album',
  'playlist',
  'resume',
  'retry',
  'cancel',
]);
const downloadCommands = new Set<CommandName>([
  'download',
  'track',
  'album',
  'playlist',
]);

/** Парсер не передаёт argv в ошибки, чтобы URL с query не попал в stderr. @link docs/requirements/REQ-030-cli-options.md */
export function parseArguments(argv: readonly string[]): ParsedArguments {
  const values: Record<string, string | boolean | undefined> = {};
  const positional: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index]!;
    if (item === '--help' || item === '-h') values.help = true;
    else if (
      item === '--json' ||
      item === '--debug' ||
      item === '--overwrite' ||
      item === '--skip-existing'
    )
      values[item.slice(2)] = true;
    else if (item.startsWith('--')) {
      const separator = item.indexOf('=');
      const name = item.slice(2, separator === -1 ? undefined : separator);
      const inline = separator === -1 ? undefined : item.slice(separator + 1);
      if (
        !['output', 'quality', 'concurrency', 'log-level', 'log-file'].includes(
          name!,
        )
      )
        throw new UsageError('Неизвестная опция.');
      const value = inline ?? argv[++index];
      if (
        value === undefined ||
        value.trim().length === 0 ||
        value.startsWith('--')
      )
        throw new UsageError('Для опции требуется значение.');
      values[name!] = value;
    } else {
      if (item.startsWith('-')) throw new UsageError('Неизвестная опция.');
      positional.push(item);
    }
  }
  if (values.help === true) return { help: true };
  const command = positional[0] as CommandName | undefined;
  if (command === undefined || !commands.has(command))
    throw new UsageError('Неизвестная команда.');
  const value = positional[1];
  if (
    positional.length > 2 ||
    ((downloadCommands.has(command) ||
      ['resume', 'retry', 'cancel'].includes(command)) &&
      (value === undefined || value.trim().length === 0)) ||
    (!downloadCommands.has(command) &&
      !['resume', 'retry', 'cancel'].includes(command) &&
      value !== undefined)
  )
    throw new UsageError('Некорректное число аргументов.');
  const needsDownload = downloadCommands.has(command);
  for (const option of [
    'output',
    'quality',
    'overwrite',
    'skip-existing',
  ] as const)
    if (values[option] !== undefined && !needsDownload)
      throw new UsageError('Опция неприменима к команде.');
  if (
    values.concurrency !== undefined &&
    !needsDownload &&
    command !== 'resume' &&
    command !== 'retry'
  )
    throw new UsageError('Опция неприменима к команде.');
  if (values.overwrite === true && values['skip-existing'] === true)
    throw new UsageError('Режимы перезаписи взаимоисключающие.');
  const quality = values.quality;
  if (
    quality !== undefined &&
    !['best', 'lossless', 'high', 'normal'].includes(String(quality))
  )
    throw new UsageError('Некорректное качество.');
  const concurrencyRaw = values.concurrency;
  const concurrency =
    concurrencyRaw === undefined ? undefined : Number(concurrencyRaw);
  if (
    concurrency !== undefined &&
    (!/^\d+$/.test(String(concurrencyRaw)) ||
      !Number.isInteger(concurrency) ||
      concurrency < 1 ||
      concurrency > 8)
  )
    throw new UsageError('Некорректная concurrency.');
  const logLevel = values['log-level'];
  if (
    logLevel !== undefined &&
    !['error', 'warn', 'info', 'debug', 'trace'].includes(String(logLevel))
  )
    throw new UsageError('Некорректный уровень логирования.');
  return {
    command,
    value,
    help: false,
    ...(values.json === true ? { json: true } : {}),
    ...(values.output === undefined ? {} : { output: values.output as string }),
    ...(quality === undefined ? {} : { quality: quality as QualityPreference }),
    ...(concurrency === undefined ? {} : { concurrency }),
    ...(values.overwrite === true ? { overwrite: true } : {}),
    ...(values['skip-existing'] === true ? { skipExisting: true } : {}),
    ...(logLevel === undefined ? {} : { logLevel: logLevel as LogLevel }),
    ...(values['log-file'] === undefined
      ? {}
      : { logFile: values['log-file'] as string }),
    ...(values.debug === true ? { debug: true } : {}),
  };
}

export const helpText = `music-downloader <команда> [опции]\n\nКоманды: auth, account, logout, jobs, download <URL>, track <URL>, album <URL>, playlist <URL>, resume <JOB_ID>, retry <JOB_ID>, cancel <JOB_ID>\n\nОбщие опции: --json --log-level <level> --log-file <path> --debug\nЗагрузка: --output <path> --quality <best|lossless|high|normal> --concurrency <1..8> --overwrite --skip-existing\n\nКоды завершения: 0 completed; 1 completed_with_errors; 2 usage; 3 ошибка, interrupted или не авторизован; 4 paused; 5 cancelled; 6 lease/owner acknowledgement.`;
