import { ValidationError, type Album } from '@music-downloader/shared';
import { describe, expect, it } from 'vitest';
import { buildAlbumLayout } from './layout.js';
import { buildPartPath } from './part-path.js';
import { nameLength } from './sanitize.js';

const suffixPattern = /\.[0-9a-f]{8}-(\d+)\.part$/u;

describe('buildPartPath', () => {
  it('puts the part next to the final file with job id and position', () => {
    const result = buildPartPath('/music/Кино/01 - Группа крови.flac', {
      jobId: 'job-1',
      position: 3,
      platform: 'linux',
    });
    expect(result.startsWith('/music/Кино/01 - Группа крови.flac.')).toBe(true);
    expect(suffixPattern.exec(result)?.[1]).toBe('3');
  });

  it('uses the platform separator rather than process.platform', () => {
    const result = buildPartPath('C:\\music\\Кино\\01.flac', {
      jobId: 'job-1',
      position: 1,
      platform: 'win32',
    });
    expect(result.startsWith('C:\\music\\Кино\\01.flac.')).toBe(true);
    expect(result.endsWith('.part')).toBe(true);
  });

  it('is deterministic for the same job and position', () => {
    const options = { jobId: 'job-1', position: 2, platform: 'linux' } as const;
    expect(buildPartPath('/m/a.flac', options)).toBe(
      buildPartPath('/m/a.flac', options),
    );
  });

  it.each([
    [
      { jobId: 'job-1', position: 1 },
      { jobId: 'job-2', position: 1 },
    ],
    [
      { jobId: 'job-1', position: 1 },
      { jobId: 'job-1', position: 2 },
    ],
  ])('does not share a part for %j and %j', (first, second) => {
    const a = buildPartPath('/m/a.flac', { ...first, platform: 'linux' });
    const b = buildPartPath('/m/a.flac', { ...second, platform: 'linux' });
    expect(a).not.toBe(b);
  });

  it.each([
    ['empty job id', '', 1],
    ['zero position', 'job', 0],
    ['negative position', 'job', -1],
    ['fractional position', 'job', 1.5],
    ['NaN position', 'job', Number.NaN],
  ])('rejects %s', (_name, jobId, position) => {
    expect(() =>
      buildPartPath('/m/a.flac', { jobId, position, platform: 'linux' }),
    ).toThrow(ValidationError);
  });

  it('rejects a path without a file name', () => {
    expect(() =>
      buildPartPath('/m/', { jobId: 'job', position: 1, platform: 'linux' }),
    ).toThrow(ValidationError);
  });

  it('truncates a long posix name to 255 bytes keeping the suffix', () => {
    const name = `${'я'.repeat(120)}.flac`;
    const result = buildPartPath(`/music/${name}`, {
      jobId: 'job',
      position: 12,
      platform: 'linux',
    });
    const part = result.slice('/music/'.length);
    expect(nameLength(part, 'linux')).toBeLessThanOrEqual(255);
    expect(suffixPattern.test(result)).toBe(true);
    expect(part.startsWith('я')).toBe(true);
  });

  it('truncates a long win32 name and the whole path to 259', () => {
    const directory = `C:\\${'d'.repeat(200)}`;
    const result = buildPartPath(`${directory}\\${'x'.repeat(100)}.flac`, {
      jobId: 'job',
      position: 1,
      platform: 'win32',
    });
    expect(result.length).toBeLessThanOrEqual(259);
    expect(suffixPattern.test(result)).toBe(true);
  });

  it('does not split emoji and graphemes when truncating', () => {
    const family = '👨‍👩‍👧';
    const result = buildPartPath(`/m/${family.repeat(40)}.flac`, {
      jobId: 'job',
      position: 1,
      platform: 'linux',
    });
    const body = result
      .slice('/m/'.length)
      .replace(suffixPattern, '')
      .replace(/\.flac$/u, '');
    expect(body.length).toBeGreaterThan(0);
    expect(body.replaceAll(family, '')).toBe('');
  });

  it('may shrink the final name part to nothing but keeps the suffix', () => {
    const directory = `C:\\${'d'.repeat(235)}`;
    const result = buildPartPath(`${directory}\\track.flac`, {
      jobId: 'job',
      position: 1,
      platform: 'win32',
    });
    expect(result.length).toBeLessThanOrEqual(259);
    expect(suffixPattern.test(result)).toBe(true);
  });

  it('rejects a directory that leaves no room for the suffix', () => {
    const directory = `C:\\${'d'.repeat(250)}`;
    expect(() =>
      buildPartPath(`${directory}\\a.flac`, {
        jobId: 'job',
        position: 1,
        platform: 'win32',
      }),
    ).toThrow(ValidationError);
  });

  it('accepts every win32 path buildAlbumLayout accepts near the 259 limit', () => {
    const album: Album = {
      id: 'album:1',
      title: 'B',
      artists: [{ id: 'artist:1', name: 'A' }],
      tracks: [
        {
          id: 'track:1',
          availability: 'available',
          title: 'Т'.repeat(300),
          artists: [{ id: 'artist:1', name: 'A' }],
        },
      ],
    };
    let checked = 0;
    for (let rootLength = 190; rootLength <= 245; rootLength += 1) {
      const root = `C:\\${'r'.repeat(rootLength - 3)}`;
      let finalPath: string;
      try {
        finalPath =
          buildAlbumLayout(album, {
            root,
            platform: 'win32',
            extensionOf: () => 'flac',
          }).tracks[0]?.path ?? '';
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        continue;
      }
      const result = buildPartPath(finalPath, {
        jobId: 'job',
        position: 1,
        platform: 'win32',
      });
      const name = result.slice(result.lastIndexOf('\\') + 1);
      expect(result.length).toBeLessThanOrEqual(259);
      expect(name.length).toBeLessThanOrEqual(255);
      expect(suffixPattern.test(result)).toBe(true);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(10);
  });
});
