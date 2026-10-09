import { ValidationError } from '@music-downloader/shared';
import { describe, expect, it } from 'vitest';
import {
  nameLength,
  sanitizeFileName,
  sanitizePathSegment,
  type TargetPlatform,
} from './sanitize.js';

const platforms: readonly TargetPlatform[] = ['win32', 'darwin', 'linux'];

describe('sanitizePathSegment', () => {
  it.each([
    '<',
    '>',
    ':',
    '"',
    '/',
    '\\',
    '|',
    '?',
    '*',
    '\u0000',
    '\u001f',
    '\u007f',
  ])('replaces forbidden character %j on every platform', (character) => {
    for (const platform of platforms) {
      expect(sanitizePathSegment(`a${character}b`, { platform })).toBe('a_b');
    }
  });

  it.each([
    ['CON', 'CON_'],
    ['con', 'con_'],
    ['Nul', 'Nul_'],
    ['com1', 'com1_'],
    ['LPT9', 'LPT9_'],
    ['con.txt', 'con_.txt'],
    ['AUX .mp3', 'AUX_ .mp3'],
    ['PRN', 'PRN_'],
  ])('renames reserved name %j only on win32', (input, win32) => {
    expect(sanitizePathSegment(input, { platform: 'win32' })).toBe(win32);
    expect(sanitizePathSegment(input, { platform: 'linux' })).toBe(input);
    expect(sanitizePathSegment(input, { platform: 'darwin' })).toBe(input);
  });

  it.each(['CONSOLE', 'COM0', 'LPT10', 'Connect'])(
    'keeps non-reserved name %j on win32',
    (input) => {
      expect(sanitizePathSegment(input, { platform: 'win32' })).toBe(input);
    },
  );

  it.each([
    ['Song. . ', 'Song', 'Song. .'],
    ['Album...', 'Album', 'Album...'],
    ['  padded  ', 'padded', 'padded'],
  ])('handles trailing spaces and dots in %j', (input, win32, posix) => {
    expect(sanitizePathSegment(input, { platform: 'win32' })).toBe(win32);
    expect(sanitizePathSegment(input, { platform: 'linux' })).toBe(posix);
  });

  it.each([
    ['.', 'Unknown'],
    ['..', 'Unknown'],
    ['', 'Unknown'],
    ['   ', 'Unknown'],
    ['../x', '.._x'],
    ['..\\..\\Windows', '.._.._Windows'],
    ['C:\\x', 'C__x'],
    ['/etc/passwd', '_etc_passwd'],
    ['...And You Will Know Us', '...And You Will Know Us'],
  ])('neutralizes traversal input %j', (input, expected) => {
    for (const platform of platforms) {
      expect(sanitizePathSegment(input, { platform })).toBe(expected);
    }
  });

  it('uses a custom fallback for empty names', () => {
    expect(
      sanitizePathSegment(' ', {
        platform: 'linux',
        fallback: 'Unknown Artist',
      }),
    ).toBe('Unknown Artist');
    expect(sanitizePathSegment('...', { platform: 'win32' })).toBe('Unknown');
  });

  it.each(['Кино — Группа крови', '🎵 Песня 👨‍👩‍👧', '東京事変', 'Café'])(
    'preserves Unicode %j',
    (input) => {
      for (const platform of platforms) {
        expect(sanitizePathSegment(input, { platform })).toBe(input);
      }
    },
  );

  it('normalizes NFD input to NFC', () => {
    const nfd = 'Cafe\u0301';
    expect(sanitizePathSegment(nfd, { platform: 'darwin' })).toBe('Caf\u00e9');
  });

  it('limits long names without splitting graphemes', () => {
    const family = '👨‍👩‍👧';
    for (const platform of platforms) {
      const latin = sanitizePathSegment('a'.repeat(400), { platform });
      expect(nameLength(latin, platform)).toBe(255);
      const cyrillic = sanitizePathSegment('я'.repeat(400), { platform });
      expect(nameLength(cyrillic, platform)).toBeLessThanOrEqual(255);
      const emoji = sanitizePathSegment(family.repeat(100), { platform });
      expect(nameLength(emoji, platform)).toBeLessThanOrEqual(255);
      expect(emoji.replaceAll(family, '')).toBe('');
    }
    expect(
      sanitizePathSegment('я'.repeat(400), { platform: 'linux' }),
    ).toHaveLength(127);
    expect(
      sanitizePathSegment('я'.repeat(400), { platform: 'win32' }),
    ).toHaveLength(255);
  });

  it('strips dots exposed by truncation on win32', () => {
    const input = `${'a'.repeat(250)}.....b`;
    expect(sanitizePathSegment(input, { platform: 'win32' })).toBe(
      'a'.repeat(250),
    );
  });
});

describe('sanitizeFileName', () => {
  it('keeps the extension and truncates only the stem', () => {
    for (const platform of platforms) {
      const name = sanitizeFileName('x'.repeat(400), 'FLAC', { platform });
      expect(name.endsWith('.flac')).toBe(true);
      expect(nameLength(name, platform)).toBe(255);
    }
  });

  it('keeps the collision suffix intact', () => {
    const name = sanitizeFileName('x'.repeat(400), 'mp3', {
      platform: 'linux',
      suffix: ' (2)',
    });
    expect(name.endsWith(' (2).mp3')).toBe(true);
    expect(nameLength(name, 'linux')).toBe(255);
  });

  it('renames reserved stems on win32', () => {
    expect(sanitizeFileName('con', 'mp3', { platform: 'win32' })).toBe(
      'con_.mp3',
    );
  });

  it.each(['', 'mp 3', '../x', 'a'.repeat(11), 'тест'])(
    'rejects unsupported extension %j',
    (extension) => {
      expect(() =>
        sanitizeFileName('a', extension, { platform: 'linux' }),
      ).toThrow(ValidationError);
    },
  );
});
