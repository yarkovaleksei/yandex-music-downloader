import path from 'node:path';
import type { Album, AvailableTrack } from '@music-downloader/shared';
import { describe, expect, it } from 'vitest';
import { buildAlbumLayout, buildTrackLayout } from './layout.js';
import {
  nameLength,
  sanitizePathSegment,
  type TargetPlatform,
} from './sanitize.js';

const alphabet = [
  '/',
  '\\',
  '..',
  '.',
  ':',
  'C:',
  '<',
  '>',
  '|',
  '?',
  '*',
  '"',
  ' ',
  '\u0000',
  '\n',
  '\u007f',
  'a',
  'Z',
  '0',
  'я',
  'Ё',
  'é',
  'e\u0301',
  '🎵',
  '👨‍👩‍👧',
  'CON',
  'nul',
  'lpt1',
  '~',
  '-',
];
const roots: Readonly<Record<TargetPlatform, string>> = {
  win32: 'C:\\Music',
  darwin: '/Users/me/Music',
  linux: '/home/me/Music',
};
const iterations = 2000;

/** mulberry32: детерминированный PRNG, чтобы падение воспроизводилось по seed. */
function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function randomName(next: () => number, maxParts: number): string {
  const length = Math.floor(next() * maxParts);
  let result = '';
  for (let index = 0; index < length; index += 1) {
    result += alphabet[Math.floor(next() * alphabet.length)] ?? '';
  }
  return result;
}

function isInside(
  platform: TargetPlatform,
  root: string,
  target: string,
): boolean {
  const api = platform === 'win32' ? path.win32 : path.posix;
  const relative = api.relative(root, target);
  return (
    relative !== '' &&
    !api.isAbsolute(relative) &&
    relative.split(api.sep)[0] !== '..'
  );
}

describe.each<TargetPlatform>(['win32', 'darwin', 'linux'])(
  'properties on %s',
  (platform) => {
    it('produces a safe segment for any input', () => {
      const next = random(0x5eed);
      for (let run = 0; run < iterations; run += 1) {
        const segment = sanitizePathSegment(randomName(next, 200), {
          platform,
        });
        expect(segment).not.toBe('');
        expect(segment).not.toBe('.');
        expect(segment).not.toBe('..');
        expect(segment).not.toMatch(/[<>:"/\\|?*]/u);
        expect(
          [...segment].some((character) => {
            const code = character.codePointAt(0) ?? 0;
            return code < 0x20 || code === 0x7f;
          }),
        ).toBe(false);
        expect(nameLength(segment, platform)).toBeLessThanOrEqual(255);
        expect(sanitizePathSegment(segment, { platform })).toBe(segment);
        if (platform === 'win32') {
          expect(segment).not.toMatch(/[ .]$/u);
          expect(segment).not.toMatch(
            /^(con|prn|aux|nul|com[1-9]|lpt[1-9]) *(\.|$)/iu,
          );
        }
      }
    });

    it('keeps every generated path inside the output root', () => {
      const next = random(0xc0ffee);
      const root = roots[platform];
      for (let run = 0; run < iterations / 10; run += 1) {
        const tracks: AvailableTrack[] = Array.from(
          { length: 5 },
          (_, index) => ({
            id: `track:${String(index)}`,
            availability: 'available',
            title: randomName(next, 12),
            artists: [{ id: 'a', name: randomName(next, 8) }],
            trackNumber: Math.floor(next() * 3),
          }),
        );
        const album: Album = {
          id: 'album',
          title: randomName(next, 12),
          artists: [{ id: 'a', name: randomName(next, 8) }],
          tracks,
        };
        const layout = buildAlbumLayout(album, {
          root,
          platform,
          extensionOf: () => 'mp3',
        });
        const files = [layout.cover, ...layout.tracks];
        for (const file of files)
          expect(isInside(platform, root, file.path)).toBe(true);
        const keys = files.map((file) =>
          file.path.normalize('NFC').toLowerCase(),
        );
        expect(new Set(keys).size).toBe(keys.length);
        const single = buildTrackLayout(tracks[0] as AvailableTrack, 'mp3', {
          root,
          platform,
        });
        expect(isInside(platform, root, single.path)).toBe(true);
      }
    });
  },
);
