export type ProviderErrorCode =
  | 'NETWORK_ERROR'
  | 'AUTH_ERROR'
  | 'API_CHANGED'
  | 'SERVICE_UNAVAILABLE'
  | 'PROVIDER_RESPONSE_INVALID'
  | 'STREAM_EXPIRED';

export interface DomainErrorJson {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
}

const messages: Readonly<Record<string, string>> = {
  NETWORK_ERROR: 'Не удалось связаться с источником музыки.',
  AUTH_ERROR: 'Требуется повторная авторизация.',
  API_CHANGED: 'Источник музыки изменил формат ответа.',
  SERVICE_UNAVAILABLE: 'Источник музыки временно недоступен.',
  PROVIDER_RESPONSE_INVALID: 'Источник музыки вернул некорректные данные.',
  STREAM_EXPIRED: 'Ссылка на поток устарела.',
  UNSUPPORTED_URL: 'Ссылка не поддерживается.',
  TRACK_UNAVAILABLE: 'Трек недоступен.',
  QUALITY_UNAVAILABLE: 'Выбранное качество недоступно.',
  DOWNLOAD_ERROR: 'Загрузка не выполнена.',
  DISK_FULL: 'Недостаточно места на диске.',
  PERMISSION_DENIED: 'Нет прав для выполнения операции.',
  VALIDATION_ERROR: 'Данные не прошли проверку.',
  METADATA_ERROR: 'Не удалось обработать метаданные.',
};

/** Публичная диагностика намеренно не переносит исходное исключение в JSON. */
export class DomainError extends Error {
  public name = 'DomainError';

  public constructor(
    public readonly code: string,
    public readonly retryable: boolean,
    options?: { readonly cause?: unknown },
  ) {
    super(messages[code] ?? 'Операция не выполнена.', options);
  }

  public toJSON(): DomainErrorJson {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
    };
  }
}

export class ProviderError extends DomainError {
  public constructor(
    code: ProviderErrorCode,
    retryable: boolean,
    cause?: unknown,
  ) {
    super(code, retryable, { cause });
    this.name = 'ProviderError';
  }
}

export type CommandRefusalReason =
  'JOB_NOT_FOUND' | 'LEASE_HELD_BY_OTHER_OWNER' | 'OWNER_ACK_TIMEOUT';

/**
 * @link planning/tasks/STEP-045.md Причина дополняет существующий код только в DTO команды.
 * Обычный DomainError JSON остаётся прежним; данные владельца и cause не принимаются.
 */
export class CommandRefusalError extends DomainError {
  public constructor(
    public readonly reason: CommandRefusalReason,
    code: 'VALIDATION_ERROR' | 'DOWNLOAD_ERROR' = reason === 'OWNER_ACK_TIMEOUT'
      ? 'DOWNLOAD_ERROR'
      : 'VALIDATION_ERROR',
  ) {
    super(code, false);
    this.name = 'CommandRefusalError';
  }
}

export class AuthenticationError extends DomainError {
  public constructor(cause?: unknown) {
    super('AUTH_ERROR', false, { cause });
    this.name = 'AuthenticationError';
  }
}
export class UnsupportedUrlError extends DomainError {
  public constructor(cause?: unknown) {
    super('UNSUPPORTED_URL', false, { cause });
    this.name = 'UnsupportedUrlError';
  }
}
export class TrackUnavailableError extends DomainError {
  public constructor(cause?: unknown) {
    super('TRACK_UNAVAILABLE', false, { cause });
    this.name = 'TrackUnavailableError';
  }
}
export class QualityUnavailableError extends DomainError {
  public constructor(cause?: unknown) {
    super('QUALITY_UNAVAILABLE', false, { cause });
    this.name = 'QualityUnavailableError';
  }
}
export class DownloadError extends DomainError {
  public constructor(retryable = false, cause?: unknown) {
    super('DOWNLOAD_ERROR', retryable, { cause });
    this.name = 'DownloadError';
  }
}
export class DiskFullError extends DomainError {
  public constructor(cause?: unknown) {
    super('DISK_FULL', false, { cause });
    this.name = 'DiskFullError';
  }
}
export class PermissionError extends DomainError {
  public constructor(cause?: unknown) {
    super('PERMISSION_DENIED', false, { cause });
    this.name = 'PermissionError';
  }
}
export class ValidationError extends DomainError {
  public constructor(cause?: unknown) {
    super('VALIDATION_ERROR', false, { cause });
    this.name = 'ValidationError';
  }
}
export class MetadataError extends DomainError {
  public constructor(cause?: unknown) {
    super('METADATA_ERROR', false, { cause });
    this.name = 'MetadataError';
  }
}

/** Приводит только подтверждённые transport/system признаки к безопасной ошибке. */
export function normalizeDomainError(error: unknown): DomainError {
  if (error instanceof DomainError) return error;
  const record = isRecord(error) ? error : {};
  const code = typeof record.code === 'string' ? record.code : undefined;
  const status = typeof record.status === 'number' ? record.status : undefined;
  if (code === 'ENOSPC') return new DiskFullError(error);
  if (code === 'EACCES' || code === 'EPERM') return new PermissionError(error);
  if (status === 401 || status === 403) return new AuthenticationError(error);
  if (status === 404) return new TrackUnavailableError(error);
  if (
    status === 429 ||
    (status !== undefined && status >= 500 && status <= 599)
  ) {
    return new ProviderError('SERVICE_UNAVAILABLE', true, error);
  }
  if (code === 'AUTH_ERROR') return new AuthenticationError(error);
  if (
    code === 'ECONNRESET' ||
    code === 'ENETUNREACH' ||
    code === 'ENOTFOUND' ||
    code === 'ETIMEDOUT' ||
    code === 'NETWORK_ERROR'
  ) {
    return new ProviderError('NETWORK_ERROR', true, error);
  }
  return new DownloadError(false, error);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}
