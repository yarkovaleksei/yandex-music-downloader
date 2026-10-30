import {
  QualityUnavailableError,
  type AudioVariant,
  type MediaReference,
} from '@music-downloader/shared';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildAlbumPlan,
  resolvePlanVariants,
  resolveVariant,
  type VariantResult,
} from './index.js';

function variant(
  key: string,
  codec: string,
  bitrate: number | undefined,
  lossless = false,
): AudioVariant {
  return {
    key,
    codec,
    container: codec,
    lossless,
    ...(bitrate === undefined ? {} : { bitrate }),
  };
}

function chosen(result: VariantResult): string | 'unavailable' {
  return result.ok ? result.variant.key : 'unavailable';
}

const lossyOnly = [variant('hi', 'c1', 320), variant('lo', 'c1', 192)];
const mixed = [
  variant('a-lossy', 'c2', 256),
  variant('c1-hi', 'c1', 320),
  variant('c1-lo', 'c1', 192),
  variant('lossless', 'c3', undefined, true),
];

describe('resolveVariant', () => {
  it.each([
    ['best', lossyOnly, 'hi'],
    ['high', lossyOnly, 'hi'],
    ['normal', lossyOnly, 'lo'],
    ['lossless', lossyOnly, 'unavailable'],
    ['best', mixed, 'lossless'],
    ['lossless', mixed, 'lossless'],
    ['high', mixed, 'a-lossy'],
    ['normal', mixed, 'a-lossy'],
  ] as const)('%s on %j picks %s', (quality, variants, expected) => {
    expect(chosen(resolveVariant(variants, quality))).toBe(expected);
  });

  it('returns QualityUnavailableError instead of lowering the quality', () => {
    const result = resolveVariant(lossyOnly, 'lossless');
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error).toBeInstanceOf(QualityUnavailableError);
    const onlyLossless = [variant('l', 'c3', undefined, true)];
    expect(chosen(resolveVariant(onlyLossless, 'high'))).toBe('unavailable');
    expect(chosen(resolveVariant(onlyLossless, 'normal'))).toBe('unavailable');
    expect(chosen(resolveVariant(onlyLossless, 'best'))).toBe('l');
  });

  it('fails on an empty list and when nothing is supported', () => {
    expect(chosen(resolveVariant([], 'best'))).toBe('unavailable');
    expect(
      chosen(resolveVariant(lossyOnly, 'best', { supports: () => false })),
    ).toBe('unavailable');
  });

  it('gives both high and normal the only variant', () => {
    const single = [variant('only', 'c1', 192)];
    expect(chosen(resolveVariant(single, 'high'))).toBe('only');
    expect(chosen(resolveVariant(single, 'normal'))).toBe('only');
  });

  it('takes the first variant in provider order when bitrates are equal', () => {
    const tie = [variant('first', 'c1', 256), variant('second', 'c1', 256)];
    expect(chosen(resolveVariant(tie, 'best'))).toBe('first');
    expect(chosen(resolveVariant(tie, 'high'))).toBe('first');
    expect(chosen(resolveVariant(tie, 'normal'))).toBe('first');
  });

  it('does not compare bitrate across codecs: the first codec group wins', () => {
    const variants = [variant('x', 'c2', 128), variant('y', 'c1', 320)];
    expect(chosen(resolveVariant(variants, 'best'))).toBe('x');
    expect(chosen(resolveVariant(variants, 'high'))).toBe('x');
    expect(chosen(resolveVariant(variants, 'normal'))).toBe('x');
  });

  it('lets codecRank choose the group but still never mixes codecs', () => {
    const variants = [
      variant('x', 'c2', 128),
      variant('y', 'c1', 320),
      variant('z', 'c1', 192),
    ];
    const codecRank = (codec: string): number => (codec === 'c1' ? 2 : 1);
    expect(chosen(resolveVariant(variants, 'best', { codecRank }))).toBe('y');
    expect(chosen(resolveVariant(variants, 'normal', { codecRank }))).toBe('z');
  });

  it('applies supports() before ranking', () => {
    const supports = (v: AudioVariant): boolean => v.key !== 'hi';
    expect(chosen(resolveVariant(lossyOnly, 'best', { supports }))).toBe('lo');
    expect(chosen(resolveVariant(lossyOnly, 'high', { supports }))).toBe('lo');
  });

  it('ignores variants without bitrate while known ones exist', () => {
    const variants = [
      variant('unknown', 'c1', undefined),
      variant('known', 'c1', 192),
    ];
    expect(chosen(resolveVariant(variants, 'high'))).toBe('known');
    expect(chosen(resolveVariant(variants, 'normal'))).toBe('known');
    const noBitrate = [
      variant('p', 'c1', undefined),
      variant('q', 'c1', undefined),
    ];
    expect(chosen(resolveVariant(noBitrate, 'best'))).toBe('p');
  });

  it('does not change the input list', () => {
    const input = [...mixed];
    resolveVariant(input, 'normal');
    expect(input).toEqual(mixed);
  });
});

describe('resolvePlanVariants', () => {
  const source: MediaReference = {
    provider: 'mock',
    kind: 'album',
    id: 'album:1',
  };
  const plan = buildAlbumPlan(source, {
    id: 'album:1',
    title: 'Album',
    artists: [],
    tracks: ['t1', 't2', 't3'].map((id) => ({
      id,
      availability: 'available' as const,
      title: id,
      artists: [],
    })),
  });

  it('continues with the other tracks when one has no suitable variant', () => {
    const results = resolvePlanVariants(
      plan,
      new Map([
        [1, lossyOnly],
        [2, [variant('l', 'c3', undefined, true)]],
        [3, lossyOnly],
      ]),
      'high',
    );
    expect(results.map((r) => [r.position, chosen(r.result)])).toEqual([
      [1, 'hi'],
      [2, 'unavailable'],
      [3, 'hi'],
    ]);
  });

  it('marks a position without variants as unavailable', () => {
    const results = resolvePlanVariants(
      plan,
      new Map([[1, lossyOnly]]),
      'best',
    );
    expect(results.map((r) => chosen(r.result))).toEqual([
      'hi',
      'unavailable',
      'unavailable',
    ]);
  });
});

describe('no hard-coded subscription or bitrate rules (REQ-010)', () => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const sources = readdirSync(dir).filter(
    (name) => name.endsWith('.ts') && !name.endsWith('.test.ts'),
  );

  it('keeps production sources free of codec names, thresholds and tiers', () => {
    expect(sources.length).toBeGreaterThan(0);
    for (const name of sources) {
      const text = readFileSync(path.join(dir, name), 'utf8');
      expect(text, name).not.toMatch(
        /\b(?:mp3|aac|flac|alac|ogg|opus|m4a|premium|plus|kbps)\b/i,
      );
      expect(text, name).not.toMatch(/\b(?:96|128|192|256|320)\b/);
    }
  });
});

it('REQ-058: exact selector имеет приоритет и не использует отсутствующий bitrate как wildcard', () => {
  const variants = [
    variant('high', 'mp3', 320000),
    variant('low', 'mp3', 128000),
    variant('unknown', 'mp3', undefined),
  ];
  const selection = {
    codec: 'mp3',
    container: 'mp3',
    lossless: false,
    bitrate: 128000,
  };
  expect(
    chosen(
      resolveVariant(variants, 'lossless', { variantSelection: selection }),
    ),
  ).toBe('low');
  expect(
    chosen(
      resolveVariant(variants.slice(0, 1), 'best', {
        variantSelection: selection,
      }),
    ),
  ).toBe('unavailable');
  expect(
    chosen(
      resolveVariant(variants, 'best', {
        variantSelection: { ...selection, bitrate: undefined },
      }),
    ),
  ).toBe('unknown');
  expect(
    chosen(
      resolveVariant(variants.slice(0, 2), 'best', {
        variantSelection: { ...selection, bitrate: undefined },
      }),
    ),
  ).toBe('unavailable');
  expect(
    chosen(
      resolveVariant(variants, 'best', {
        variantSelection: selection,
        supports: () => false,
      }),
    ),
  ).toBe('unavailable');
});
