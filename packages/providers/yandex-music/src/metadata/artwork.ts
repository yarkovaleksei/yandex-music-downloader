import { Buffer } from 'node:buffer';
import {
  DownloadError,
  ProviderError,
  type ArtworkData,
  type ArtworkRef,
} from '@music-downloader/shared';
import type { AuthFetch } from '../auth-transport.js';
import { invalidProviderResponse } from '../auth-errors.js';
import { metadataHttpError } from './errors.js';

const hosts = new Set(['avatars.yandex.net', 'avatars.mds.yandex.net']);
const prefix = 'yandex-artwork:';

/** Ключ содержит только public resource identity, без signed query/credentials.
 * @link ../../../../../docs/architecture-decisions/ADR-002-music-provider-abstraction.md
 */
export function artworkReference(uri: string): ArtworkRef {
  const resource = publicResource(uri);
  if (!resource) throw invalidProviderResponse();
  return { key: prefix + Buffer.from(resource).toString('base64url') };
}

function publicResource(uri: string): string | undefined {
  try {
    const url = new URL(uri.startsWith('https://') ? uri : `https://${uri}`);
    if (
      !hosts.has(url.hostname) ||
      url.protocol !== 'https:' ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return undefined;
    if (
      !/^\/get-[a-z0-9-]+\/[a-zA-Z0-9_./-]+\/(%%|\d+x\d+)$/.test(url.pathname)
    )
      return undefined;
    return url.hostname + url.pathname.replace(/\d+x\d+$/, '%%');
  } catch {
    return undefined;
  }
}

export async function fetchPublicArtwork(
  fetch: AuthFetch,
  ref: ArtworkRef,
  size: number,
): Promise<ArtworkData> {
  if (!Number.isSafeInteger(size) || size <= 0 || !ref.key.startsWith(prefix))
    throw new DownloadError(false);
  const decoded = Buffer.from(
    ref.key.slice(prefix.length),
    'base64url',
  ).toString('utf8');
  if (publicResource(decoded) !== decoded) throw new DownloadError(false);
  const url = `https://${decoded.replace('%%', `${size}x${size}`)}`;
  // Binary request не наследует SDK OAuth headers; redirect не меняет источник.
  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'image/*' },
    signal: AbortSignal.timeout(20_000),
    redirect: 'error',
  }).catch(() => {
    throw new ProviderError('NETWORK_ERROR', true);
  });
  if (response.status < 200 || response.status >= 300)
    throw metadataHttpError(response.status, true);
  const mimeType = response.headers
    ?.get('content-type')
    ?.split(';')[0]
    ?.trim()
    .toLowerCase();
  if (!mimeType || !/^image\/[a-z0-9.+-]+$/.test(mimeType))
    throw new DownloadError(false);
  const bytes = await response.arrayBuffer().catch(() => {
    throw new ProviderError('NETWORK_ERROR', true);
  });
  return { bytes: new Uint8Array(bytes), mimeType };
}
