import {
  DomainError,
  DownloadError,
  ProviderError,
} from '@music-downloader/shared';
import {
  authenticationRequired,
  invalidProviderResponse,
} from '../auth-errors.js';

/** Сохраняет только безопасный доменный контекст, без SDK cause и raw значений.
 * @link ../../../../../docs/architecture-decisions/ADR-009-yandex-adapter-strategy.md
 */
export function metadataError(error: unknown): Error {
  if (error instanceof DomainError) return safeDomainError(error);
  if (error instanceof Error && error.cause instanceof DomainError)
    return safeDomainError(error.cause);
  return invalidProviderResponse();
}

function safeDomainError(error: DomainError): DomainError {
  if (
    error.code === 'API_CHANGED' ||
    error.code === 'PROVIDER_RESPONSE_INVALID'
  ) {
    const safe = new ProviderError(error.code, false);
    safe.message = invalidProviderResponse().message;
    return safe;
  }
  return error;
}

export function metadataHttpError(status: number, artwork = false): Error {
  if (status === 429 || status >= 500)
    return new ProviderError('SERVICE_UNAVAILABLE', true);
  if (artwork) return new DownloadError(false);
  if (status === 401 || status === 403) return authenticationRequired();
  return invalidProviderResponse();
}
