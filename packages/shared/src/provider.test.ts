import { describe, expect, it } from 'vitest';
import type {
  AudioStream,
  DownloadJobStatus,
  MusicProvider,
  Playlist,
  Track,
} from './index.js';

describe('MusicProvider contract', () => {
  it('uses portable stream types in exported contract', () => {
    const stream: AudioStream = {
      stream: new ReadableStream<Uint8Array>(),
      contentLength: 10,
      container: 'mp3',
      acceptsRanges: true,
      startOffset: 3,
    };
    expect(stream.stream).toBeInstanceOf(ReadableStream);
  });

  it('allows a structural provider implementation without third-party types', () => {
    const provider: Pick<MusicProvider, 'logout' | 'getAccount'> = {
      async getAccount() {
        return null;
      },
      async logout() {},
    };
    expect(provider).toHaveProperty('getAccount');
  });

  it('экспортирует метаданные трека и плейлиста и точный статус job', () => {
    const track: Track = {
      id: 'track',
      availability: 'available',
      title: 'Трек',
      artists: [],
      trackNumber: 1,
      discNumber: 2,
      year: 2026,
    };
    const playlist: Playlist = {
      id: 'playlist',
      title: 'Плейлист',
      owner: 'Владелец',
      tracks: [],
    };
    const statuses: readonly DownloadJobStatus[] = [
      'queued',
      'running',
      'paused',
      'cancelled',
      'interrupted',
      'completed',
      'completed_with_errors',
      'failed',
    ];
    // @ts-expect-error: F-003 запрещает фазу track в публичном агрегате job.
    const invalidStatus: DownloadJobStatus = 'downloading';

    expect(track.trackNumber).toBe(1);
    expect(playlist.owner).toBe('Владелец');
    expect(statuses).toHaveLength(8);
    void invalidStatus;
  });
});
