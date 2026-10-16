import {
  CommandRefusalError,
  DiskFullError,
  DomainError,
  DownloadError,
  PermissionError,
  ValidationError,
  normalizeDomainError,
} from '@music-downloader/shared';

/**
 * Безопасный отказ несовместимой схемы: база создана более новой версией приложения.
 * @link docs/adr/ADR-014-sqlite-persistence.md
 */
export function schemaUnsupportedError(): CommandRefusalError {
  return new CommandRefusalError('STATE_SCHEMA_UNSUPPORTED');
}

/** Повреждённая или не-SQLite база: отказ без пересоздания и изменения файла. */
export class StateCorruptError extends ValidationError {
  public constructor() {
    super();
    this.name = 'StateCorruptError';
  }
}

/** Отказы, которые кэшируются до перезапуска процесса: повтор их не исправит. */
export function isPermanentOpenRefusal(error: unknown): boolean {
  return (
    error instanceof StateCorruptError ||
    (error instanceof CommandRefusalError &&
      error.reason === 'STATE_SCHEMA_UNSUPPORTED')
  );
}

function sqliteCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && code.startsWith('SQLITE_')
    ? code
    : undefined;
}

/**
 * Приводит ошибки SQLite/native/OS к публичным DomainError без raw сообщений и cause.
 * Сообщения SQLite могут содержать пути и SQL, поэтому они не сериализуются (ADR-014).
 */
export function safeStoreError(error: unknown): DomainError {
  if (error instanceof DomainError) return error;
  const code = sqliteCode(error);
  if (code !== undefined) {
    const primary = code.replace(/^SQLITE_/, '').split('_')[0];
    switch (primary) {
      case 'FULL':
        return new DiskFullError();
      case 'PERM':
      case 'READONLY':
      case 'CANTOPEN':
      case 'AUTH':
        return new PermissionError();
      case 'BUSY':
      case 'LOCKED':
        // Временная блокировка: повтор допустим, детали блокировки не раскрываются.
        return new DownloadError(true);
      case 'CORRUPT':
      case 'NOTADB':
        return new StateCorruptError();
      default:
        return new DownloadError(false);
    }
  }
  const safe = normalizeDomainError(error);
  // Cause исходной OS-ошибки может содержать путь: публичный отказ его не переносит.
  if (safe instanceof DiskFullError) return new DiskFullError();
  if (safe instanceof PermissionError) return new PermissionError();
  return new DomainError(safe.code, safe.retryable);
}
