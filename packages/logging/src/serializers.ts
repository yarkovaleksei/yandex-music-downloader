import {
  normalizeDomainError,
  type CliRecord,
  type CommandErrorDto,
  type JsonValue,
} from '@music-downloader/shared';
import { createRedactor, type Redactor } from './redactor.js';

/** Преобразует исключение в безопасный DTO по allowlist DomainError из STEP-003. */
export function serializeError(
  error: unknown,
  redactor: Redactor = createRedactor(),
  options: { readonly debug?: boolean } = {},
): CommandErrorDto {
  const normalizedError = normalizeDomainError(error);
  const normalized = normalizedError.toJSON();
  const dto = {
    ...normalized,
    ...(options.debug
      ? {
          details: {
            debug: { stack: safeStack(normalizedError, normalized) },
          },
        }
      : {}),
  };
  return redactor.redact(dto) as unknown as CommandErrorDto;
}

/** Формирует stack только из нормализованной ошибки: cause и library stack не копируются. */
function safeStack(error: Error, normalized: CommandErrorDto): string {
  const frames = (error.stack ?? '')
    .split('\n')
    .filter((line) => /^\s*at\s/u.test(line))
    .map((line) => line.trim());
  return [`${normalized.code}: ${normalized.message}`, ...frames].join('\n');
}

/** @link docs/adr/ADR-007-application-api-events-and-command-results.md Общий сериализатор DTO без вывода CLI. */
export function serializeCliRecord(
  record: CliRecord,
  redactor: Redactor = createRedactor(),
): string {
  return JSON.stringify(redactor.redact(record) as JsonValue);
}
