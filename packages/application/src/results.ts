import {
  normalizeDomainError,
  type ApplicationResult,
  type CliRecord,
  type JsonValue,
} from '@music-downloader/shared';
import {
  serializeCliRecord,
  serializeError,
  type Logger,
} from '@music-downloader/logging';

/**
 * Все результаты проходят тот же сериализатор, что и будущий transport.
 * Это убирает ссылки на runtime-объекты и создаёт новый снимок для клиента.
 */
function publicData<T>(command: string, data: T): T {
  const record: CliRecord = {
    schemaVersion: 1,
    kind: 'result',
    command,
    data: data as JsonValue,
  };
  return (JSON.parse(serializeCliRecord(record)) as { data: T }).data;
}

/** Единая граница исключений: наружу попадает только safe DTO из allowlist ошибок. */
export async function command<T>(
  name: string,
  logger: Logger,
  operation: () => Promise<T>,
): Promise<ApplicationResult<T>> {
  try {
    return {
      schemaVersion: 1,
      kind: 'result',
      command: name,
      data: publicData(name, await operation()),
    };
  } catch (error) {
    const normalized = normalizeDomainError(error);
    logger.warn('Команда application завершилась ошибкой.', {
      command: name,
      code: normalized.code,
    });
    return {
      schemaVersion: 1,
      kind: 'error',
      command: name,
      error: serializeError(normalized),
    };
  }
}
