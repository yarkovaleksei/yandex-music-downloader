import type { ArtworkData } from '@music-downloader/shared';
import type { AuthFetch, AuthFetchResponse } from './auth-transport.js';

const imageLimit = 2 * 1024 * 1024;
/** STEP-059 / PRN-002: OAuth уходит только fixed origin; профиль и URL не покидают provider.
 * @link https://yandex.ru/dev/id/doc/ru/user-information
 */
export async function fetchAccountPortrait(
  fetch: AuthFetch,
  token: string,
): Promise<ArtworkData | null> {
  try {
    const profile = await fetch('https://login.yandex.ru/info', {
      method: 'GET',
      headers: { Authorization: `OAuth ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
      redirect: 'error',
    });
    if (profile.status !== 200) return null;
    const raw: unknown = JSON.parse(
      new TextDecoder().decode(await boundedBytes(profile, 64 * 1024)),
    );
    if (!raw || typeof raw !== 'object') return null;
    const { is_avatar_empty: empty, default_avatar_id: id } = raw as Record<
      string,
      unknown
    >;
    if (
      empty !== false ||
      typeof id !== 'string' ||
      id.length > 512 ||
      !/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(id)
    )
      return null;
    // Составной ID — часть официального пути, а не произвольный внешний URL.
    const image = await fetch(
      `https://avatars.yandex.net/get-yapic/${id}/islands-200`,
      {
        method: 'GET',
        headers: { Accept: 'image/*' },
        signal: AbortSignal.timeout(20_000),
        redirect: 'error',
      },
    );
    if (image.status !== 200) return null;
    const mimeType = image.headers
      ?.get('content-type')
      ?.split(';')[0]
      ?.trim()
      .toLowerCase();
    if (
      !mimeType ||
      !['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)
    )
      return null;
    const bytes = await boundedBytes(image, imageLimit);
    return bytes.length ? { mimeType, bytes } : null;
  } catch {
    return null;
  }
}
/** Новый optional путь ограничивает чтение потока до materialization изображения. */
async function boundedBytes(
  response: AuthFetchResponse,
  limit: number,
): Promise<Uint8Array> {
  const declared = Number(response.headers?.get('content-length'));
  if (declared > limit) throw new Error('Превышен размер');
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > limit) throw new Error('Превышен размер');
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > limit) {
        await reader.cancel();
        throw new Error('Превышен размер');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
