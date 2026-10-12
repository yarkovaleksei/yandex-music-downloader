import {
  normalizeDomainError,
  CommandRefusalError,
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
  debug = false,
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
    // В публичный результат переносим только закрытую причину, без runtime-данных владельца.
    const details =
      normalized instanceof CommandRefusalError
        ? { reason: normalized.reason }
        : undefined;
    const errorDto = serializeError(normalized, undefined, { debug });
    const mergedDetails = {
      ...(details ?? {}),
      ...(errorDto.details ?? {}),
    };
    const publicError = {
      ...errorDto,
      ...(Object.keys(mergedDetails).length === 0
        ? {}
        : { details: mergedDetails }),
    };
    try {
      logger.warn('Команда application завершилась ошибкой.', {
        command: name,
        code: normalized.code,
        ...(debug ? { error: publicError } : mergedDetails),
      });
    } catch {
      // Ошибка sink не должна заменить безопасный результат команды или вызвать рекурсию.
    }
    return {
      schemaVersion: 1,
      kind: 'error',
      command: name,
      error: publicError,
    };
  }
}
