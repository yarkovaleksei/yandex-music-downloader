import { DownloadError } from '@music-downloader/shared';

/** Проверяет только короткий префикс, не буферизуя полный аудиофайл. */
export function validateContainer(container: string, bytes: Uint8Array): void {
  const actual = identifyContainer(bytes);
  if (actual !== container) throw new DownloadError();
}

export function identifyContainer(
  bytes: Uint8Array,
): 'mp3' | 'm4a' | 'flac' | 'unknown' {
  if (ascii(bytes, 0, 4) === 'fLaC') return 'flac';
  if (ascii(bytes, 4, 8) === 'ftyp') return 'm4a';
  if (
    ascii(bytes, 0, 3) === 'ID3' ||
    (bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0)
  )
    return 'mp3';
  return 'unknown';
}
function ascii(value: Uint8Array, start: number, end: number): string {
  return new TextDecoder('ascii').decode(value.subarray(start, end));
}
