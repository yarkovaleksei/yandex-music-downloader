import { QualityUnavailableError } from '@music-downloader/shared';

export interface AudioDescriptor {
  readonly trackId: string;
  readonly source: 'legacy' | 'modern';
  readonly selector: 'legacy' | 'lossless';
  readonly codec: string;
  readonly container: 'mp3' | 'm4a' | 'flac';
  readonly transport: 'raw' | 'encraw';
  readonly bitrate?: number;
  readonly lossless: boolean;
}

interface VariantPayload extends AudioDescriptor {
  readonly version: 1;
}

/** Ключ хранит лишь проверяемый descriptor, никогда URL, OAuth token или encraw key.
 * @link ../../../../../docs/architecture-decisions/ADR-009-yandex-adapter-strategy.md
 */
export function encodeVariantKey(descriptor: AudioDescriptor): string {
  const payload: VariantPayload = { version: 1, ...descriptor };
  return `ymv1.${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
}

export function decodeVariantKey(
  key: string,
  trackId: string,
): AudioDescriptor {
  if (!key.startsWith('ymv1.')) throw new QualityUnavailableError();
  try {
    const value: unknown = JSON.parse(
      Buffer.from(key.slice(5), 'base64url').toString('utf8'),
    );
    if (!isDescriptor(value) || value.trackId !== trackId)
      throw new Error('invalid');
    return value;
  } catch {
    throw new QualityUnavailableError();
  }
}

export function sameDescriptor(
  left: AudioDescriptor,
  right: AudioDescriptor,
): boolean {
  return (
    left.trackId === right.trackId &&
    left.source === right.source &&
    left.selector === right.selector &&
    left.codec === right.codec &&
    left.container === right.container &&
    left.transport === right.transport &&
    left.bitrate === right.bitrate &&
    left.lossless === right.lossless
  );
}

function isDescriptor(value: unknown): value is AudioDescriptor {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    record.version === 1 &&
    typeof record.trackId === 'string' &&
    (record.source === 'legacy' || record.source === 'modern') &&
    (record.selector === 'legacy' || record.selector === 'lossless') &&
    typeof record.codec === 'string' &&
    (record.container === 'mp3' ||
      record.container === 'm4a' ||
      record.container === 'flac') &&
    (record.transport === 'raw' || record.transport === 'encraw') &&
    typeof record.lossless === 'boolean' &&
    (record.bitrate === undefined ||
      (typeof record.bitrate === 'number' && Number.isFinite(record.bitrate)))
  );
}
