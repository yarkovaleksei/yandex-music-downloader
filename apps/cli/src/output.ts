import type {
  CliRecord,
  CommandResult,
  JobEvent,
} from '@music-downloader/application/contracts';
import {
  isCommandResult,
  isJobEvent,
} from '@music-downloader/application/contracts';

export interface Output {
  readonly json: boolean;
  readonly debug?: boolean;
  readonly stdout: (line: string) => void;
  readonly stderr: (line: string) => void;
}
/** stdout в JSON-режиме содержит только исходные DTO ADR-007. @link docs/adr/ADR-007-application-api-events-and-command-results.md */
export function writeRecord(output: Output, record: CommandResult): void {
  if (output.json) output.stdout(JSON.stringify(record));
  else if (record.kind === 'error') {
    output.stderr(`${record.error.code}: ${record.error.message}`);
    if (record.error.code === 'AUTH_ERROR')
      output.stderr('Выполните music-downloader auth.');
    // @link docs/adr/ADR-014-sqlite-persistence.md: downgrade базы не поддерживается.
    if (record.error.details?.reason === 'STATE_SCHEMA_UNSUPPORTED')
      output.stderr(
        'База состояния создана более новой версией приложения; обновите music-downloader.',
      );
    const stack = record.error.details?.debug?.stack;
    if (output.debug === true && stack !== undefined) output.stderr(stack);
  } else if (record.command === 'account' && record.data === null)
    output.stderr('Не авторизован.');
  else if (record.command === 'account') {
    const account = fields(record.data);
    output.stderr(
      `Аккаунт: ${String(account?.displayName ?? account?.id ?? 'авторизован')}`,
    );
  } else if (record.command === 'diagnostics' && fields(record.data)) {
    const diagnostics = fields(record.data)!;
    const configuration = fields(diagnostics.configuration);
    const checks = fields(configuration?.checks);
    output.stderr(
      `Диагностика: ${diagnostics.available === true ? 'OK' : 'FAIL'}`,
    );
    output.stderr(
      `PROVIDER_SCHEMA_VERSION: ${String(configuration?.schemaVersion ?? 'неизвестна')}`,
    );
    const labels: Record<string, string> = {
      runtime: 'Node.js',
      credentialStore: 'Хранилище credentials',
      provider: 'Provider',
      auth: 'Авторизация',
      account: 'Аккаунт',
      metadata: 'Метаданные',
      audioVariants: 'Варианты аудио',
      manifestStore: 'Хранилище заданий',
      filesystem: 'Каталог вывода',
      ffmpeg: 'FFmpeg',
      tokenPermissions: 'Права token-файла',
    };
    for (const [name, check] of Object.entries(checks ?? {})) {
      const item = fields(check);
      output.stderr(
        `${labels[name] ?? name}: ${item?.status === 'api-changed' ? 'API changed' : String(item?.status ?? 'неизвестно')}${item?.code === undefined ? '' : ` (${String(item.code)})`}`,
      );
    }
  } else if (
    (record.command === 'jobs' || record.command === 'listJobs') &&
    Array.isArray(record.data)
  )
    output.stderr(
      record.data
        .map(
          (job) =>
            `${String(fields(job)?.jobId ?? '')} ${String(fields(fields(job)?.source)?.kind ?? '')}:${String(fields(fields(job)?.source)?.id ?? '')} ${String(fields(job)?.status ?? '')}`,
        )
        .join('\n') || 'Заданий нет.',
    );
  else if (fields(record.data)?.jobId !== undefined)
    output.stderr(
      `${String(fields(record.data)?.jobId)}: ${String(fields(record.data)?.status)}`,
    );
  else output.stderr(`${record.command}: выполнено.`);
}
export function writeEvent(output: Output, event: JobEvent): void {
  if (output.json) output.stdout(JSON.stringify(event));
  else
    output.stderr(
      `${event.jobId}: ${event.event}${event.trackKey === undefined ? '' : ` ${event.trackKey}`}${event.payload === undefined ? '' : ` ${JSON.stringify(event.payload)}`}`,
    );
}
function fields(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
export function localError(
  command: string,
  code: string,
  message: string,
): Extract<CommandResult, { kind: 'error' }> {
  return {
    schemaVersion: 1,
    kind: 'error',
    command,
    error: { code, message, retryable: false },
  };
}
export function isCliRecord(value: unknown): value is CliRecord {
  return isJobEvent(value) || isCommandResult(value);
}
