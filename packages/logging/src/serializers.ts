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
): CommandErrorDto {
  const normalized = normalizeDomainError(error).toJSON();
  const message = redactor.redact(normalized.message);
  return {
    ...normalized,
    message: typeof message === 'string' ? message : normalized.message,
  };
}

/** @link docs/adr/ADR-007-application-api-events-and-command-results.md Общий сериализатор DTO без вывода CLI. */
export function serializeCliRecord(
  record: CliRecord,
  redactor: Redactor = createRedactor(),
): string {
  return JSON.stringify(redactor.redact(record) as JsonValue);
}
