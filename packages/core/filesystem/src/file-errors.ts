import {
  DiskFullError,
  DomainError,
  DownloadError,
  PermissionError,
} from '@music-downloader/shared';

/** Код системной ошибки Node.js (`ENOSPC`, `EPERM` и т. п.), если он есть. */
export function fileErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const code = (error as { readonly code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

/**
 * Приводит ошибку файловой операции к доменной (REQ-012). Исходное исключение
 * остаётся только в `cause`; публичный JSON и сообщение его текст не содержат (PRN-002).
 * Доменные ошибки возвращаются как есть.
 */
export function mapFileError(error: unknown): DomainError {
  if (error instanceof DomainError) return error;
  const code = fileErrorCode(error);
  if (code === 'ENOSPC') return new DiskFullError(error);
  if (code === 'EACCES' || code === 'EPERM') return new PermissionError(error);
  return new DownloadError(false, error);
}
