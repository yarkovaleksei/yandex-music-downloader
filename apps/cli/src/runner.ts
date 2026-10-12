import os from 'node:os';
import { createApplication } from '@music-downloader/application';
import type {
  ApplicationApi,
  CommandResult,
  JobEvent,
  RuntimeLoggingOptions,
} from '@music-downloader/application/contracts';
import { helpText, parseArguments, type ParsedArguments } from './arguments.js';
import { resolveConfiguration, type Configuration } from './configuration.js';
import { executeCommand, isStreamingCommand } from './commands.js';
import { exitCode } from './exit-code.js';
import { localError, writeEvent, writeRecord, type Output } from './output.js';
import {
  eventStartsWork,
  installPauseOnSigint,
  type SignalSource,
} from './signals.js';

export interface RunnerHost {
  readonly argv: readonly string[];
  readonly env: NodeJS.ProcessEnv;
  readonly homedir: () => string;
  readonly platform?: NodeJS.Platform;
  readonly stdout: (line: string) => void;
  readonly stderr: (line: string) => void;
  readonly flush?: () => Promise<void>;
  readonly signals: SignalSource;
  readonly createApplication: (adapters: {
    concurrency?: number;
    logging: RuntimeLoggingOptions;
    diagnosticsRuntime?: { outputDirectory: string };
  }) => ApplicationApi;
}
const defaultHost: RunnerHost = {
  argv: process.argv.slice(2),
  env: process.env,
  homedir: os.homedir,
  stdout: (line) => {
    process.stdout.write(`${line}\n`);
  },
  stderr: (line) => {
    process.stderr.write(`${line}\n`);
  },
  flush: async () => {
    await Promise.all(
      [process.stdout, process.stderr].map(
        (stream) =>
          new Promise<void>((resolve, reject) => {
            stream.write('', (error) => {
              if (error) reject(error);
              else resolve();
            });
          }),
      ),
    );
  },
  signals: process,
  createApplication,
};

/** Ранние ошибки тоже используют DTO; argv и значения settings никогда не попадают в диагностику.
 * Cleanup и flush завершаются до установки process.exitCode. @link planning/tasks/STEP-019.md */
export async function runCli(host: RunnerHost = defaultHost): Promise<number> {
  let code: number;
  try {
    code = await runConfigured(host);
  } catch {
    host.stderr('Не удалось выполнить команду.');
    code = 3;
  }
  try {
    await host.flush?.();
  } catch {
    code = 3;
  }
  return code;
}

async function runConfigured(host: RunnerHost): Promise<number> {
  let args: ParsedArguments;
  let config: Configuration;
  const earlyOutput: Output = {
    json:
      host.argv.includes('--json') || host.env.MUSIC_DOWNLOADER_JSON === 'true',
    stdout: host.stdout,
    stderr: host.stderr,
  };
  let code = 3;
  try {
    try {
      args = parseArguments(host.argv);
    } catch {
      writeRecord(
        earlyOutput,
        localError(
          'cli',
          'VALIDATION_ERROR',
          'Некорректная команда или опции. Используйте music-downloader --help.',
        ),
      );
      return 2;
    }
    if (args.help) {
      // Human help не смешивается с NDJSON stdout. Ранний вывод не создаёт application.
      // @link planning/reviews/STEP-019/REVIEW-20261011T201253Z.md
      (earlyOutput.json ? host.stderr : host.stdout)(helpText);
      return 0;
    }
    try {
      config = resolveConfiguration(args, host);
    } catch {
      writeRecord(
        earlyOutput,
        localError('cli', 'VALIDATION_ERROR', 'Некорректная конфигурация.'),
      );
      return 2;
    }
    code = await runApplication(host, args, config);
  } catch {
    writeRecord(
      earlyOutput,
      localError('cli', 'DOWNLOAD_ERROR', 'Не удалось выполнить команду.'),
    );
    code = 3;
  }
  return code;
}

async function runApplication(
  host: RunnerHost,
  args: ParsedArguments,
  config: Configuration,
): Promise<number> {
  const output: Output = {
    json: config.json,
    debug: config.debug,
    stdout: host.stdout,
    stderr: host.stderr,
  };
  let api: ApplicationApi | undefined;
  let unsubscribe: (() => void) | undefined;
  let controller: ReturnType<typeof installPauseOnSigint> | undefined;
  let jobId =
    args.command === 'resume' || args.command === 'retry'
      ? args.value
      : undefined;
  let invoked = false;
  let started = false;
  let eventCount = 0;
  let result: CommandResult | undefined;
  let code = 3;
  try {
    api = host.createApplication({
      concurrency: config.concurrency,
      logging: {
        level: config.logLevel,
        ...(config.logFile === undefined ? {} : { filePath: config.logFile }),
        debug: config.debug,
      },
      ...(args.command === 'doctor'
        ? { diagnosticsRuntime: { outputDirectory: config.output } }
        : {}),
    });
    if (isStreamingCommand(args.command!)) {
      // Пауза job применяется только к потоковым командам. Так auth сохраняет обычное завершение по SIGINT.
      // @link planning/reviews/STEP-019/REVIEW-20261011T201253Z.md
      const streamingController = installPauseOnSigint(
        host.signals,
        api,
        () => jobId,
        () => started,
        () => invoked,
      );
      controller = streamingController;
      unsubscribe = api.subscribe((event: JobEvent) => {
        if (!invoked) return;
        if (event.event === 'job.created' && jobId === undefined)
          jobId = event.jobId;
        if (event.jobId !== jobId) return;
        if (eventStartsWork(event)) started = true;
        streamingController.notifyStarted();
        eventCount++;
        writeEvent(output, event);
      });
    }
    const primary = await executeCommand(api, args, config, () => {
      if (controller?.wasRequested()) return false;
      invoked = true;
      controller?.notifyStarted();
      return true;
    });
    controller?.finish();
    const pause = await controller?.pauseResult();
    const effective = pause?.kind === 'error' ? pause : primary;
    result = effective as CommandResult;
    code = exitCode(effective);
  } catch {
    result = localError(
      args.command!,
      'DOWNLOAD_ERROR',
      'Не удалось выполнить команду или инициализировать приложение.',
    );
    code = 3;
  } finally {
    controller?.finish();
    controller?.dispose();
    unsubscribe?.();
    if (api !== undefined) {
      try {
        // Успешный job не скрывает отказ освобождения ресурсов или аренды.
        const cleanup = await api.shutdown();
        if (cleanup.kind === 'error') {
          result = cleanup;
          code = exitCode(cleanup);
        }
      } catch {
        result = localError(
          'shutdown',
          'DOWNLOAD_ERROR',
          'Не удалось подтвердить завершение приложения.',
        );
        code = 3;
      }
    }
  }
  if (
    result !== undefined &&
    (result.kind === 'error' ||
      !config.json ||
      !isStreamingCommand(args.command!) ||
      (eventCount === 0 && ['resume', 'retry'].includes(args.command!)))
  )
    writeRecord(output, result);
  return code;
}
