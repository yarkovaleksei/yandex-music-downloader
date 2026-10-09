import type { AudioVariant } from '@music-downloader/shared';
import { encodeVariantKey, type AudioDescriptor } from './variant-key.js';
import type {
  RawLegacyDownloadInfo,
  RawModernDownloadInfo,
} from './schemas.js';

export interface ResolvedAudioDescriptor {
  readonly descriptor: AudioDescriptor;
  readonly legacyIndex?: number;
  readonly link:
    | { readonly kind: 'xml'; readonly url: string }
    | { readonly kind: 'cdn'; readonly url: string; readonly key?: string };
}

/** Неизвестный codec/transport не публикуется как известный вариант. */
export function legacyVariants(
  trackId: string,
  values: readonly RawLegacyDownloadInfo[],
): ResolvedAudioDescriptor[] {
  return values.flatMap((value, legacyIndex) => {
    if (value.preview !== false) return [];
    const container = legacyContainer(value.codec);
    if (!container) return [];
    return [
      {
        descriptor: {
          trackId,
          source: 'legacy',
          selector: 'legacy',
          codec: value.codec,
          container,
          transport: 'raw',
          bitrate: value.bitrateInKbps,
          lossless: false,
        },
        legacyIndex,
        link: { kind: 'xml', url: value.downloadInfoUrl },
      },
    ];
  });
}

export function modernVariants(
  trackId: string,
  value: RawModernDownloadInfo | null,
): ResolvedAudioDescriptor[] {
  if (
    !value ||
    value.preview !== false ||
    (value.transport !== 'raw' && value.transport !== 'encraw')
  )
    return [];
  const container = modernContainer(value.codec);
  const url = value.urls?.[0] ?? value.url;
  if (
    !container ||
    !url ||
    (value.transport === 'encraw' && !isHexKey(value.key))
  )
    return [];
  const lossless = value.codec === 'flac' || value.codec === 'flac-mp4';
  return [
    {
      descriptor: {
        trackId,
        source: 'modern',
        selector: 'lossless',
        codec: value.codec,
        container,
        transport: value.transport,
        ...(lossless && value.bitrate === 0
          ? {}
          : value.bitrate === undefined
            ? {}
            : { bitrate: value.bitrate }),
        lossless,
      },
      link: {
        kind: 'cdn',
        url,
        ...(value.transport === 'encraw' ? { key: value.key } : {}),
      },
    },
  ];
}

export function toAudioVariants(
  values: readonly ResolvedAudioDescriptor[],
): AudioVariant[] {
  return values.map(({ descriptor }) => ({
    key: encodeVariantKey(descriptor),
    codec: descriptor.codec,
    container: descriptor.container,
    ...(descriptor.bitrate === undefined
      ? {}
      : { bitrate: descriptor.bitrate }),
    lossless: descriptor.lossless,
  }));
}

function legacyContainer(codec: string): 'mp3' | 'm4a' | undefined {
  return codec === 'mp3' ? 'mp3' : codec === 'aac' ? 'm4a' : undefined;
}
function modernContainer(codec: string): 'mp3' | 'm4a' | 'flac' | undefined {
  return codec === 'mp3'
    ? 'mp3'
    : codec === 'flac'
      ? 'flac'
      : codec === 'aac-mp4' || codec === 'flac-mp4'
        ? 'm4a'
        : undefined;
}
function isHexKey(value: unknown): value is string {
  return (
    typeof value === 'string' && /^(?:[\da-f]{32}|[\da-f]{64})$/i.test(value)
  );
}
