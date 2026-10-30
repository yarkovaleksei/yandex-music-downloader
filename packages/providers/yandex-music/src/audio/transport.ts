import { DownloadError, ProviderError } from '@music-downloader/shared';
import {
  authenticationRequired,
  invalidProviderResponse,
} from '../auth-errors.js';
import type { AuthFetch, AuthFetchResponse } from '../auth-transport.js';
import {
  parseAudioResult,
  parseModernResult,
  rawAudioTrackSchema,
  rawLegacyDownloadInfoSchema,
} from './schemas.js';
import { z } from 'zod';

/** Перехватывает только audio API/XML: SDK получает те же bytes без второго запроса.
 * @link ../../../../../docs/architecture-decisions/ADR-009-yandex-adapter-strategy.md
 */
export function audioTransport(fetchImpl: AuthFetch) {
  const raw = new Map<string, unknown>();
  const fetch: AuthFetch = async (url, init) => {
    const parsed = new URL(url);
    const path = parsed.pathname;
    const jsonOperation =
      parsed.protocol === 'https:' &&
      parsed.hostname === 'api.music.yandex.net' &&
      isJsonOperation(path);
    const request = jsonOperation
      ? init
      : { ...init, headers: cleanExternalHeaders(init.headers) };
    let response: AuthFetchResponse;
    try {
      response = await fetchImpl(url, request);
    } catch {
      if (init.signal.aborted) throw abortError();
      throw new ProviderError('NETWORK_ERROR', true);
    }
    if (jsonOperation) await classifyApiStatus(response);
    else if (response.status < 200 || response.status >= 300) {
      await response.body?.cancel();
      throw new DownloadError();
    }
    const bytes = await response.arrayBuffer().catch(() => {
      throw new ProviderError('NETWORK_ERROR', true);
    });
    if (!jsonOperation) validateLinkXml(bytes);
    else if (response.status >= 200 && response.status < 300) {
      let payload: unknown;
      try {
        payload = JSON.parse(
          new TextDecoder('utf-8', { fatal: true }).decode(bytes),
        );
      } catch {
        throw invalidProviderResponse();
      }
      validateAudioPayload(requestKey(url), payload);
      raw.set(requestKey(url), payload);
    }
    return {
      status: response.status,
      headers: response.headers,
      arrayBuffer: async () => bytes.slice(0),
    };
  };
  return {
    fetch,
    result(url: string): unknown {
      const value = raw.get(requestKey(url));
      if (value === undefined) throw invalidProviderResponse();
      return value;
    },
  };
}

/** Проверка выполняется до SDK deJson, который может отбросить preview и типы. */
function validateAudioPayload(path: string, payload: unknown): void {
  if (path === '/tracks') {
    parseAudioResult(z.array(rawAudioTrackSchema), payload);
    return;
  }
  if (/^\/tracks\/\d+\/download-info$/.test(path)) {
    parseAudioResult(rawLegacyDownloadInfoSchema, payload);
    return;
  }
  if (path === '/get-file-info') parseModernResult(payload);
}

function isJsonOperation(path: string): boolean {
  return (
    path === '/tracks' ||
    /^\/tracks\/\d+\/download-info$/.test(path) ||
    path === '/get-file-info'
  );
}

async function classifyApiStatus(response: AuthFetchResponse): Promise<void> {
  const { status } = response;
  if (status >= 200 && status < 300) return;
  await response.body?.cancel();
  if (status === 401 || status === 403) throw authenticationRequired();
  if (status === 429 || status >= 500)
    throw new ProviderError('SERVICE_UNAVAILABLE', true);
  if (status < 200 || status >= 300) throw invalidProviderResponse();
}

export async function fetchAudioCdn(
  fetchImpl: AuthFetch,
  url: string,
  signal: AbortSignal,
  offset?: number,
): Promise<AuthFetchResponse> {
  let current: URL;
  try {
    current = validateCdnUrl(url);
  } catch {
    throw new DownloadError();
  }
  try {
    const first = await requestCdn(fetchImpl, current, signal, offset);
    if (!isRedirect(first.status)) return first;
    const location = first.headers?.get('location');
    await first.body?.cancel();
    if (!location) throw new DownloadError();
    let target: URL;
    try {
      target = validateCdnUrl(new URL(location, current).href);
    } catch {
      throw new DownloadError();
    }
    const second = await requestCdn(fetchImpl, target, signal, offset);
    if (isRedirect(second.status)) {
      await second.body?.cancel();
      throw new DownloadError();
    }
    return second;
  } catch (error) {
    if (signal.aborted) throw abortError();
    if (error instanceof DownloadError) throw error;
    throw new ProviderError('NETWORK_ERROR', true);
  }
}

async function requestCdn(
  fetchImpl: AuthFetch,
  url: URL,
  signal: AbortSignal,
  offset: number | undefined,
): Promise<AuthFetchResponse> {
  return fetchImpl(url.href, {
    method: 'GET',
    headers: offset === undefined ? {} : { Range: `bytes=${offset}-` },
    signal,
    redirect: 'manual',
  });
}

function validateCdnUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password)
    throw new Error('invalid-cdn-url');
  return url;
}

function isRedirect(status: number): boolean {
  return status >= 300 && status < 400;
}

function requestKey(url: string): string {
  if (url.startsWith('/')) return url;
  const parsed = new URL(url);
  return parsed.pathname;
}

function cleanExternalHeaders(
  headers: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).filter(
      ([name]) =>
        !/^(authorization|cookie|x-yandex-music-client|user-agent)$/i.test(
          name,
        ),
    ),
  );
}

function validateLinkXml(bytes: ArrayBuffer): void {
  let xml: string;
  try {
    xml = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw invalidProviderResponse();
  }
  const field = (name: string) =>
    new RegExp(`<${name}>([^<]+)</${name}>`).exec(xml)?.[1];
  const host = field('host');
  const path = field('path');
  const ts = field('ts');
  const signature = field('s');
  if (
    !host ||
    !/^[a-z0-9.-]+$/i.test(host) ||
    !path ||
    !path.startsWith('/') ||
    !ts ||
    !signature
  )
    throw invalidProviderResponse();
}

export function abortError(): DOMException {
  return new DOMException('Операция отменена.', 'AbortError');
}
