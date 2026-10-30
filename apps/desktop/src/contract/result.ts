import type { ApplicationResult } from '@music-downloader/shared';

const messages: Readonly<Record<string, string>> = {
  VALIDATION_ERROR: 'Данные не прошли проверку.',
  PERMISSION_DENIED: 'Нет прав для выполнения операции.',
  HOST_UNAVAILABLE:
    'Связь с приложением потеряна. Дождитесь восстановления соединения.',
  OUTCOME_UNKNOWN:
    'Время ожидания истекло. Исход операции неизвестен; обновите состояние.',
  AUTH_ERROR:
    'Авторизация недоступна. Разблокируйте или настройте системное хранилище и повторите вход.',
};
export function failure(
  command: string,
  code = 'HOST_UNAVAILABLE',
): ApplicationResult<never> {
  return {
    schemaVersion: 1,
    kind: 'error',
    command,
    error: {
      code,
      message:
        ['authenticate', 'account', 'logout'].includes(command) &&
        ['DOWNLOAD_ERROR', 'PERMISSION_DENIED'].includes(code)
          ? 'Системное хранилище недоступно. Разблокируйте или настройте Keychain, Credential Manager или Secret Service и повторите вход.'
          : (messages[code] ?? 'Операция не выполнена.'),
      retryable: false,
    },
  };
}
export function success<T>(command: string, data: T): ApplicationResult<T> {
  return { schemaVersion: 1, kind: 'result', command, data };
}

/** ADR-016: стек, native text и случайные поля credentials не пересекают IPC. */
export function safeResult(value: unknown, command: string): unknown {
  if (typeof value !== 'object' || value === null) return failure(command);
  const result = value as Record<string, unknown>;
  if (result.kind === 'error') {
    const error = result.error as Record<string, unknown> | undefined;
    const code =
      typeof error?.code === 'string' && /^[A-Z_]+$/.test(error.code)
        ? error.code
        : 'HOST_UNAVAILABLE';
    return failure(command, code);
  }
  if (result.kind !== 'result') return failure(command);
  try {
    return success(command, safeData(result.data));
  } catch {
    return failure(command);
  }
}
function safeData(value: unknown): unknown {
  if (value === null || typeof value === 'boolean' || typeof value === 'number')
    return value;
  if (typeof value === 'string') {
    // Signed URL недопустим и внутри случайно добавленного вложенного поля.
    if (
      /https?:\/\/[^\s]*[?&](?:sign|signature|token|key|secret|expires|x-amz-)/i.test(
        value,
      )
    )
      throw new Error('Закрытое поле');
    return value;
  }
  if (Array.isArray(value)) return value.map(safeData);
  if (typeof value !== 'object') throw new Error('Непереносимое значение');
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (
      /^(?:accessToken|token|cookies?|authorization|credentials?|challenge|password|secret|stack|signed.?url)$/i.test(
        key,
      )
    )
      throw new Error('Закрытое поле');
    output[key] = safeData(item);
  }
  return output;
}
