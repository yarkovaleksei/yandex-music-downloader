import { z } from 'zod';
import { DomainError, ProviderError } from '@music-downloader/shared';
import { invalidProviderResponse } from '../auth-errors.js';
import type { AuthFetch } from '../auth-transport.js';
import { metadataHttpError } from './errors.js';

/** Один operation-local result не смешивается с параллельным metadata запросом.
 * @link ../../../../../docs/adr/ADR-009-yandex-adapter-strategy.md
 */
export function metadataTransport<T>(
  fetchImpl: AuthFetch,
  schema: z.ZodType<T>,
) {
  let value: T | undefined;
  const fetch: AuthFetch = async (url, init) => {
    const response = await fetchImpl(url, init).catch((error: unknown) => {
      throw error instanceof DomainError
        ? error
        : new ProviderError('NETWORK_ERROR', true);
    });
    if (response.status < 200 || response.status >= 300)
      throw metadataHttpError(response.status);
    const bytes = await response.arrayBuffer().catch(() => {
      throw new ProviderError('NETWORK_ERROR', true);
    });
    let envelope: unknown;
    try {
      envelope = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(bytes),
      );
    } catch {
      throw invalidProviderResponse();
    }
    const parsed = z.object({ result: schema }).safeParse(envelope);
    if (!parsed.success) throw invalidProviderResponse();
    value = parsed.data.result;
    return { status: response.status, arrayBuffer: async () => bytes.slice(0) };
  };
  return {
    fetch,
    result(): T {
      if (value === undefined) throw invalidProviderResponse();
      return value;
    },
  };
}
