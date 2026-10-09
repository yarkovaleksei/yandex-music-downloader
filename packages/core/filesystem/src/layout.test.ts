import {
  ValidationError,
  type Album,
  type AvailableTrack,
  type Playlist,
  type Track,
} from '@music-downloader/shared';
import { describe, expect, it } from 'vitest';
import {
  buildAlbumLayout,
  buildPlaylistLayout,
  buildTrackLayout,
} from './layout.js';

function track(
  title: string,
  extra: Partial<Omit<AvailableTrack, 'availability'>> = {},
): AvailableTrack {
  return {
    id: `track:${title}`,
    availability: 'available',
    title,
    artists: [{ id: 'artist:1', name: 'Кино' }],
    ...extra,
  };
}

function album(tracks: readonly Track[], extra: Partial<Album> = {}): Album {
  return {
    id: 'album:1',
    title: 'Группа крови',
    artists: [{ id: 'artist:1', name: 'Кино' }],
    year: 1988,
    tracks,
    ...extra,
  };
}

const flac = (): string => 'flac';
const linux = { root: '/music', platform: 'linux', extensionOf: flac } as const;
const win32 = {
  root: 'C:\\Music',
  platform: 'win32',
  extensionOf: flac,
} as const;

function names(layout: {
  tracks: readonly { segments: readonly string[] }[];
}): string[] {
  return layout.tracks.map((file) => file.segments.join('/'));
}

describe('buildTrackLayout', () => {
  it('builds Artist - Track.ext in the output root', () => {
    const file = buildTrackLayout(track('Звезда'), 'MP3', linux);
    expect(file.segments).toEqual(['Кино - Звезда.mp3']);
    expect(file.path).toBe('/music/Кино - Звезда.mp3');
    const windows = buildTrackLayout(track('Звезда'), 'mp3', win32);
    expect(windows.path).toBe('C:\\Music\\Кино - Звезда.mp3');
  });

  it('joins several artists and substitutes empty values', () => {
    const many = track('Song', {
      artists: [
        { id: 'a', name: 'A' },
        { id: 'b', name: ' ' },
        { id: 'c', name: 'C' },
      ],
    });
    expect(buildTrackLayout(many, 'mp3', linux).segments).toEqual([
      'A, C - Song.mp3',
    ]);
    const empty = track('  ', { artists: [] });
    expect(buildTrackLayout(empty, 'mp3', linux).segments).toEqual([
      'Unknown Artist - Unknown.mp3',
    ]);
  });

  it('changes only the root when --output changes', () => {
    const first = buildTrackLayout(track('Звезда'), 'mp3', linux);
    const second = buildTrackLayout(track('Звезда'), 'mp3', {
      ...linux,
      root: '/srv/out',
    });
    expect(second.segments).toEqual(first.segments);
    expect(second.path).toBe('/srv/out/Кино - Звезда.mp3');
  });

  it('rejects a relative output root', () => {
    expect(() =>
      buildTrackLayout(track('A'), 'mp3', { ...linux, root: 'music' }),
    ).toThrow(ValidationError);
    expect(() =>
      buildTrackLayout(track('A'), 'mp3', { ...win32, root: 'Music' }),
    ).toThrow(ValidationError);
  });
});

describe('buildAlbumLayout', () => {
  it('builds Artist/Album (Year)/NN - Track.ext with cover.jpg', () => {
    const layout = buildAlbumLayout(
      album([
        track('Группа крови', { trackNumber: 1 }),
        track('Закрой за мной дверь', { trackNumber: 2 }),
      ]),
      linux,
    );
    expect(layout.directory.path).toBe('/music/Кино/Группа крови (1988)');
    expect(layout.cover.path).toBe('/music/Кино/Группа крови (1988)/cover.jpg');
    expect(names(layout)).toEqual([
      'Кино/Группа крови (1988)/01 - Группа крови.flac',
      'Кино/Группа крови (1988)/02 - Закрой за мной дверь.flac',
    ]);
  });

  it('omits a missing year and falls back to list order', () => {
    const layout = buildAlbumLayout(
      album([track('A'), track('B')], { year: undefined }),
      linux,
    );
    expect(names(layout)).toEqual([
      'Кино/Группа крови/01 - A.flac',
      'Кино/Группа крови/02 - B.flac',
    ]);
  });

  it('prefixes the disc number for multi-disc albums', () => {
    const layout = buildAlbumLayout(
      album([
        track('Intro', { discNumber: 1, trackNumber: 1 }),
        track('Song', { discNumber: 1, trackNumber: 2 }),
        track('Outro', { discNumber: 2, trackNumber: 1 }),
      ]),
      linux,
    );
    expect(layout.tracks.map((file) => file.segments[2])).toEqual([
      '1-01 - Intro.flac',
      '1-02 - Song.flac',
      '2-01 - Outro.flac',
    ]);
  });

  it('keeps single-disc numbering and pads to the largest number', () => {
    const tracks = Array.from({ length: 120 }, (_, index) =>
      track(`T${String(index)}`, { discNumber: 1, trackNumber: index + 1 }),
    );
    const layout = buildAlbumLayout(album(tracks), linux);
    expect(layout.tracks[0]?.segments[2]).toBe('001 - T0.flac');
    expect(layout.tracks[119]?.segments[2]).toBe('120 - T119.flac');
  });

  it('uses per-track extensions and skips tracks without numbering shift', () => {
    const extensions = ['flac', undefined, 'm4a'];
    const layout = buildAlbumLayout(
      album([track('A'), track('B'), track('C')]),
      {
        ...linux,
        extensionOf: (index) => extensions[index],
      },
    );
    expect(layout.tracks.map((file) => [file.index, file.segments[2]])).toEqual(
      [
        [0, '01 - A.flac'],
        [2, '03 - C.m4a'],
      ],
    );
  });

  it('substitutes Unknown for empty titles and artists', () => {
    const layout = buildAlbumLayout(
      album([track(' ')], { title: '', artists: [] }),
      linux,
    );
    expect(names(layout)).toEqual([
      'Unknown Artist/Unknown (1988)/01 - Unknown.flac',
    ]);
  });

  it('accepts tracks without availability metadata', () => {
    const unavailable: Track = { id: 'track:x', availability: 'unavailable' };
    const layout = buildAlbumLayout(album([unavailable]), linux);
    expect(layout.tracks[0]?.segments[2]).toBe('01 - Unknown.flac');
  });

  it('keeps hostile names inside the root', () => {
    const layout = buildAlbumLayout(
      album([track('../../etc/passwd')], {
        title: '..',
        artists: [{ id: 'x', name: '..\\..\\Windows' }],
      }),
      win32,
    );
    expect(layout.tracks[0]?.segments).toEqual([
      '.._.._Windows',
      'Unknown (1988)',
      '01 - .._.._etc_passwd.flac',
    ]);
    expect(layout.tracks[0]?.path.startsWith('C:\\Music\\')).toBe(true);
  });

  it('renames reserved Windows names', () => {
    const layout = buildAlbumLayout(
      album([track('NUL')], {
        title: 'CON',
        year: undefined,
        artists: [{ id: 'a', name: 'aux' }],
      }),
      win32,
    );
    expect(layout.tracks[0]?.segments).toEqual([
      'aux_',
      'CON_',
      '01 - NUL.flac',
    ]);
  });

  it('accepts names starting with dots', () => {
    const artist = '...And You Will Know Us by the Trail of Dead';
    const layout = buildAlbumLayout(
      album([track('Invocation')], {
        title: 'Source Tags & Codes',
        year: 2002,
        artists: [{ id: 'a', name: artist }],
      }),
      linux,
    );
    expect(layout.tracks[0]?.path).toBe(
      `/music/${artist}/Source Tags & Codes (2002)/01 - Invocation.flac`,
    );
  });

  it('resolves collisions deterministically by case and NFC/NFD', () => {
    const tracks = [
      track('Intro', { trackNumber: 1 }),
      track('intro', { trackNumber: 1 }),
      track('INTRO', { trackNumber: 1 }),
      track('Caf\u00e9', { trackNumber: 2 }),
      track('Cafe\u0301', { trackNumber: 2 }),
    ];
    const first = buildAlbumLayout(album(tracks), linux);
    expect(first.tracks.map((file) => file.segments[2])).toEqual([
      '01 - Intro.flac',
      '01 - intro (2).flac',
      '01 - INTRO (3).flac',
      '02 - Caf\u00e9.flac',
      '02 - Caf\u00e9 (2).flac',
    ]);
    expect(buildAlbumLayout(album(tracks), linux)).toEqual(first);
  });

  it('truncates the file name to fit the Windows path limit', () => {
    const layout = buildAlbumLayout(album([track('x'.repeat(300))]), win32);
    const file = layout.tracks[0];
    expect(file?.path.length).toBeLessThanOrEqual(259);
    expect(file?.path.endsWith('.flac')).toBe(true);
  });

  it('rejects a path that cannot fit the Windows limit', () => {
    const deep = album([track('Song')], {
      title: 'y'.repeat(200),
      artists: [{ id: 'a', name: 'z'.repeat(40) }],
    });
    expect(() => buildAlbumLayout(deep, win32)).toThrow(ValidationError);
  });
});

describe('buildPlaylistLayout', () => {
  const playlist: Playlist = {
    id: 'playlist:1',
    title: 'Любимое',
    tracks: [
      { position: 1, track: track('Звезда') },
      { position: 2, track: track('Кукушка') },
      { position: 3, track: track('Звезда') },
    ],
  };

  it('builds NN - Artist - Track.ext with cover.jpg and m3u8', () => {
    const layout = buildPlaylistLayout(playlist, linux);
    expect(layout.directory.path).toBe('/music/Любимое');
    expect(layout.cover.segments).toEqual(['Любимое', 'cover.jpg']);
    expect(layout.playlistFile.segments).toEqual(['Любимое', 'Любимое.m3u8']);
    expect(names(layout)).toEqual([
      'Любимое/01 - Кино - Звезда.flac',
      'Любимое/02 - Кино - Кукушка.flac',
      'Любимое/03 - Кино - Звезда.flac',
    ]);
  });

  it('accepts a playlist name starting with dots', () => {
    const layout = buildPlaylistLayout(
      { ...playlist, title: '...любимое' },
      win32,
    );
    expect(layout.playlistFile.path).toBe(
      'C:\\Music\\...любимое\\...любимое.m3u8',
    );
  });

  it('falls back to Unknown for an empty playlist name', () => {
    const layout = buildPlaylistLayout({ ...playlist, title: ' / ' }, linux);
    expect(layout.directory.segments).toEqual(['_']);
    const empty = buildPlaylistLayout({ ...playlist, title: '  ' }, linux);
    expect(empty.playlistFile.segments).toEqual(['Unknown', 'Unknown.m3u8']);
  });
});
