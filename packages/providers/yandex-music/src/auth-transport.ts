import {
  ProviderError,
  type ProviderErrorCode,
} from '@music-downloader/shared';
import {
  deviceCodeSchema,
  oauthErrorSchema,
  oauthTokenSchema,
  rawAccountStatusSchema,
} from './auth-schemas.js';
import {
  authenticationRequired,
  invalidProviderResponse,
} from './auth-errors.js';

export interface AuthFetchResponse {
  readonly status: number;
  readonly headers?: { get(name: string): string | null };
  /** Поток нужен audio transport; JSON-операции по-прежнему читают только bytes. */
  readonly body?: ReadableStream<Uint8Array> | null;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export type AuthFetch = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
    signal: AbortSignal;
    redirect?: 'error' | 'manual';
  },
) => Promise<AuthFetchResponse>;

/**
 * Проверяет JSON до deJson библиотеки и не сохраняет ответ в диагностике.
 * @link ../../../../docs/architecture-decisions/ADR-009-yandex-adapter-strategy.md
 */
export function createAuthFetch(fetchImpl: AuthFetch): AuthFetch {
  return async (url, init) => {
    let response: AuthFetchResponse;
    try {
      response = await fetchImpl(url, init);
    } catch {
      throw new ProviderError('NETWORK_ERROR', true);
    }
    const bytes = await response.arrayBuffer().catch(() => {
      throw new ProviderError('NETWORK_ERROR', true);
    });
    const status = response.status;
    let parsed: unknown;
    try {
      parsed = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(bytes),
      );
    } catch {
      if (status >= 200 && status < 300) throw invalidProviderResponse();
    }
    if (status >= 200 && status < 300) {
      try {
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
          throw new Error('invalid');
      } catch {
        throw invalidProviderResponse();
      }
      if (!validOperationPayload(url, parsed)) throw invalidProviderResponse();
    }
    if (status >= 400) {
      const result = oauthErrorSchema.safeParse(parsed);
      const error = result.success ? result.data.error : undefined;
      if (
        new URL(url).pathname === '/device/code' &&
        status === 400 &&
        (error === 'access_denied' || error === 'invalid_client')
      ) {
        throw authenticationRequired();
      }
      if (
        status !== 400 &&
        error !== 'authorization_pending' &&
        error !== 'slow_down'
      ) {
        throw authTransportError(status);
      }
    }
    return { status, arrayBuffer: async () => bytes.slice(0) };
  };
}

export function authTransportError(status: number): ProviderError {
  const code: ProviderErrorCode =
    status === 401 || status === 403
      ? 'AUTH_ERROR'
      : status === 429 || status >= 500
        ? 'SERVICE_UNAVAILABLE'
        : 'PROVIDER_RESPONSE_INVALID';
  if (code === 'AUTH_ERROR') {
    return authenticationRequired() as unknown as ProviderError;
  }
  return code === 'PROVIDER_RESPONSE_INVALID'
    ? invalidProviderResponse()
    : new ProviderError(code, true);
}

function validOperationPayload(url: string, payload: unknown): boolean {
  const path = new URL(url).pathname;
  if (path === '/device/code')
    return deviceCodeSchema.safeParse(payload).success;
  if (path === '/token') return oauthTokenSchema.safeParse(payload).success;
  if (path === '/account/status')
    return rawAccountStatusSchema.safeParse(payload).success;
  return true;
}
