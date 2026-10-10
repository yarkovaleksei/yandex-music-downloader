import {
  ValidationError,
  type Album,
  type AvailableTrack,
  type DownloadPlan,
  type MediaReference,
  type Playlist,
  type Track,
  type UnavailableTrack,
} from '@music-downloader/shared';
import { describe, expect, it } from 'vitest';
import {
  buildAlbumPlan,
  buildPlaylistPlan,
  buildTrackPlan,
  createTrackJobs,
  withSelectedVariant,
} from './index.js';

function track(id: string, title = `Title ${id}`): AvailableTrack {
  return {
    id,
    availability: 'available',
    title,
    artists: [{ id: 'a1', name: 'Artist' }],
  };
}

const ref = (kind: MediaReference['kind']): MediaReference => ({
  provider: 'mock',
  kind,
  id: `${kind}:1`,
});

const album: Album = {
  id: 'album:1',
  title: 'Album',
  artists: [{ id: 'a1', name: 'Artist' }],
  tracks: [track('t1'), track('t2'), track('t3')],
};

describe('plan building', () => {
  it('builds a single-track plan with position 1', () => {
    const plan = buildTrackPlan(ref('track'), track('t1', 'Solo'));
    expect(plan.title).toBe('Solo');
    expect(plan.tracks).toHaveLength(1);
    expect(plan.tracks[0]).toMatchObject({ position: 1, trackKey: '1' });
  });

  it('uses an empty title for a track without metadata', () => {
    const unknown: Track = { id: 'x', availability: 'unknown' };
    expect(buildTrackPlan(ref('track'), unknown).title).toBe('');
  });

  it('numbers album tracks 1..N in list order', () => {
    const plan = buildAlbumPlan(ref('album'), album);
    expect(plan.title).toBe('Album');
    expect(
      plan.tracks.map((t) => [t.position, t.trackKey, t.track.id]),
    ).toEqual([
      [1, '1', 't1'],
      [2, '2', 't2'],
      [3, '3', 't3'],
    ]);
  });

  it('gives repeated playlist tracks different positions', () => {
    const playlist: Playlist = {
      id: 'playlist:1',
      title: 'Mix',
      tracks: [
        { position: 1, track: track('t1') },
        { position: 2, track: track('t2') },
        { position: 3, track: track('t1') },
      ],
    };
    const plan = buildPlaylistPlan(ref('playlist'), playlist);
    expect(plan.tracks.map((t) => [t.position, t.track.id])).toEqual([
      [1, 't1'],
      [2, 't2'],
      [3, 't1'],
    ]);
  });

  it('keeps unavailable tracks in place without shifting numbering', () => {
    const missing: UnavailableTrack = {
      id: 'gone',
      availability: 'unavailable',
    };
    const plan = buildAlbumPlan(ref('album'), {
      ...album,
      tracks: [track('t1'), missing, track('t3')],
    });
    expect(plan.tracks.map((t) => [t.position, t.track.id])).toEqual([
      [1, 't1'],
      [2, 'gone'],
      [3, 't3'],
    ]);
  });

  it('allows an empty collection', () => {
    expect(
      buildAlbumPlan(ref('album'), { ...album, tracks: [] }).tracks,
    ).toEqual([]);
  });

  it.each([
    ['track plan', () => buildTrackPlan(ref('album'), track('t1'))],
    ['album plan', () => buildAlbumPlan(ref('playlist'), album)],
    [
      'playlist plan',
      () =>
        buildPlaylistPlan(ref('track'), { id: 'p', title: 'P', tracks: [] }),
    ],
  ])('rejects a source of the wrong kind in %s', (_name, build) => {
    expect(build).toThrow(ValidationError);
  });
});

describe('plan immutability', () => {
  it('is frozen on every level at runtime', () => {
    const plan = buildAlbumPlan(ref('album'), album);
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.source)).toBe(true);
    expect(Object.isFrozen(plan.tracks)).toBe(true);
    expect(Object.isFrozen(plan.tracks[0])).toBe(true);
    expect(Object.isFrozen(plan.tracks[0]?.track)).toBe(true);
    const first = plan.tracks[0]?.track;
    expect(Object.isFrozen(first?.artists)).toBe(true);
  });

  it('throws on mutation attempts in strict mode and rejects them at compile time', () => {
    const plan: DownloadPlan = buildAlbumPlan(ref('album'), album);
    expect(() => {
      // @ts-expect-error tracks is readonly
      plan.tracks = [];
    }).toThrow(TypeError);
    expect(() => {
      // @ts-expect-error readonly array has no push
      plan.tracks.push(plan.tracks[0]);
    }).toThrow(TypeError);
    expect(() => {
      const target = plan.tracks[0];
      // @ts-expect-error position is readonly
      if (target) target.position = 9;
    }).toThrow(TypeError);
  });

  it('is isolated from later mutation of the input', () => {
    const input: Album = {
      ...album,
      tracks: [track('t1')],
    };
    const plan = buildAlbumPlan(ref('album'), input);
    (input.tracks as Track[]).push(track('late'));
    (input as { title: string }).title = 'Changed';
    expect(plan.tracks).toHaveLength(1);
    expect(plan.title).toBe('Album');
  });

  it('keeps positions and keys after a JSON round trip (resume)', () => {
    const plan = buildAlbumPlan(ref('album'), album);
    const restored = JSON.parse(JSON.stringify(plan)) as DownloadPlan;
    expect(restored).toEqual(plan);
    expect(restored.tracks.map((t) => [t.position, t.trackKey])).toEqual([
      [1, '1'],
      [2, '2'],
      [3, '3'],
    ]);
  });
});

describe('track jobs', () => {
  it('starts every track queued with its position key', () => {
    const jobs = createTrackJobs(buildAlbumPlan(ref('album'), album));
    expect(jobs).toEqual([
      { trackKey: '1', trackId: 't1', status: 'queued' },
      { trackKey: '2', trackId: 't2', status: 'queued' },
      { trackKey: '3', trackId: 't3', status: 'queued' },
    ]);
  });

  it('records the selected variant in a new job object', () => {
    const [job] = createTrackJobs(buildTrackPlan(ref('track'), track('t1')));
    if (!job) throw new Error('expected a job');
    const variant = { key: 'v1', codec: 'x', container: 'y', lossless: false };
    const updated = withSelectedVariant(job, variant);
    expect(updated.variant).toEqual(variant);
    expect(job.variant).toBeUndefined();
    expect(updated).not.toBe(job);
  });
});
