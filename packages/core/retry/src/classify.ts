import { DomainError } from '@music-downloader/shared';

/** Что core делает с ошибкой попытки; повторы описываются, но не выполняются здесь. */
export type RetryAction = 'retry' | 'reopen_stream' | 'fail' | 'pause_job';

/** `job` — глобальная ошибка: job ставится на паузу, а не порождает N failed-треков. */
export type ErrorScope = 'track' | 'job';

export type PauseReason = 'AUTH_REQUIRED' | 'DISK_FULL' | 'PERMISSION_DENIED';

export interface ErrorClassification {
  /** Стабильный код без исходного текста ошибки (PRN-002). */
  readonly code: string;
  readonly retryable: boolean;
  readonly action: RetryAction;
  readonly scope: ErrorScope;
  readonly pauseReason?: PauseReason;
}

/** REQ-014: автоматически повторяются только эти HTTP-статусы и сетевые коды. */
const retryableStatuses: ReadonlySet<number> = new Set([
  429, 500, 502, 503, 504,
]);
const retryableSystemCodes: ReadonlySet<string> = new Set([
  'ETIMEDOUT',
  'ECONNRESET',
]);

function pause(code: string, reason: PauseReason): ErrorClassification {
  return {
    code,
    retryable: false,
    action: 'pause_job',
    scope: 'job',
    pauseReason: reason,
  };
}

function track(
  code: string,
  retryable: boolean,
  action: RetryAction,
): ErrorClassification {
  return { code, retryable, action, scope: 'track' };
}

function classifyDomainError(error: DomainError): ErrorClassification {
  switch (error.code) {
    case 'STREAM_EXPIRED':
      return track(error.code, true, 'reopen_stream');
    case 'AUTH_ERROR':
      return pause(error.code, 'AUTH_REQUIRED');
    case 'DISK_FULL':
      return pause(error.code, 'DISK_FULL');
    case 'PERMISSION_DENIED':
      return pause(error.code, 'PERMISSION_DENIED');
    default:
      // Список HTTP-статусов уже применён provider-ом; core доверяет retryable.
      return track(
        error.code,
        error.retryable,
        error.retryable ? 'retry' : 'fail',
      );
  }
}

function classifyRaw(error: unknown): ErrorClassification {
  const record =
    typeof error === 'object' && error !== null
      ? (error as Readonly<Record<string, unknown>>)
      : {};
  const status = typeof record.status === 'number' ? record.status : undefined;
  const code = typeof record.code === 'string' ? record.code : undefined;
  if (code === 'ENOSPC') return pause('DISK_FULL', 'DISK_FULL');
  if (code === 'EACCES' || code === 'EPERM') {
    return pause('PERMISSION_DENIED', 'PERMISSION_DENIED');
  }
  if (status === 401 || status === 403)
    return pause('AUTH_ERROR', 'AUTH_REQUIRED');
  if (status !== undefined && retryableStatuses.has(status)) {
    return track('SERVICE_UNAVAILABLE', true, 'retry');
  }
  if (code !== undefined && retryableSystemCodes.has(code)) {
    return track('NETWORK_ERROR', true, 'retry');
  }
  if (status === 404) return track('TRACK_UNAVAILABLE', false, 'fail');
  return track('DOWNLOAD_ERROR', false, 'fail');
}

/** Классификация по REQ-014; не читает и не публикует message/cause/stack. */
export function classifyError(error: unknown): ErrorClassification {
  return error instanceof DomainError
    ? classifyDomainError(error)
    : classifyRaw(error);
}
