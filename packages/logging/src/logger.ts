import type { JsonObject } from '@music-downloader/shared';
import { createRedactor, type Redactor } from './redactor.js';
import { serializeError } from './serializers.js';

export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace';

export interface LogContext {
  readonly jobId?: string;
  readonly correlationId?: string;
  readonly trackId?: string;
}

export interface LoggerOptions {
  readonly level?: LogLevel;
  readonly context?: LogContext;
  readonly sink?: (record: string) => void;
  readonly clock?: () => Date;
  readonly redactor?: Redactor;
}

export interface Logger {
  error(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  debug(message: string, data?: unknown): void;
  trace(message: string, data?: unknown): void;
  child(context: LogContext): Logger;
}

const priorities: Readonly<Record<LogLevel, number>> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  trace: 4,
};

/**
 * Логгер пишет уже очищенный JSON в stderr, чтобы не смешивать diagnostics с
 * будущим stdout CliRecord из ADR-007. Контекст child не изменяет родителя.
 */
export function createLogger(options: LoggerOptions = {}): Logger {
  const level = options.level ?? 'info';
  const context = options.context ?? {};
  const sink =
    options.sink ?? ((record: string) => process.stderr.write(`${record}\n`));
  const clock = options.clock ?? (() => new Date());
  const redactor = options.redactor ?? createRedactor();

  function write(recordLevel: LogLevel, message: string, data?: unknown): void {
    if (priorities[recordLevel] > priorities[level]) return;
    const record: Record<string, unknown> = {
      level: recordLevel,
      time: clock().toISOString(),
      message,
      context,
    };
    if (data !== undefined)
      record.data =
        data instanceof Error ? serializeError(data, redactor) : data;
    sink(JSON.stringify(redactor.redact(record) as JsonObject));
  }

  return {
    error: (message, data) => write('error', message, data),
    warn: (message, data) => write('warn', message, data),
    info: (message, data) => write('info', message, data),
    debug: (message, data) => write('debug', message, data),
    trace: (message, data) => write('trace', message, data),
    child: (childContext) =>
      createLogger({
        level,
        context: { ...context, ...childContext },
        sink,
        clock,
        redactor,
      }),
  };
}
