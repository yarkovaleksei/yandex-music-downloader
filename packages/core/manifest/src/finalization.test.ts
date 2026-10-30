import { describe, expect, it } from 'vitest';
import type { JobManifestV1, LeaseSession } from '@music-downloader/shared';
import { finalizeWithManifestCheckpoint } from './finalization.js';

const manifest = (): JobManifestV1 => ({
  version: 1,
  jobId: 'job',
  provider: 'test',
  quality: 'best',
  destination: '/music',
  source: { provider: 'test', kind: 'track', id: 'source' },
  plan: {
    source: { provider: 'test', kind: 'track', id: 'source' },
    title: 'Трек',
    tracks: [
      {
        position: 1,
        trackKey: '1',
        track: { id: 'track', availability: 'unknown' },
      },
    ],
  },
  control: { state: 'running' },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  tracks: [
    {
      position: 1,
      trackKey: '1',
      status: 'downloading',
      attempts: 0,
      history: [],
      updatedAt: '2026-01-01T00:00:00.000Z',
      partial: { bytes: 2, expectedSize: 4, variantKey: 'v', tagged: false },
    },
  ],
});

describe('finalizeWithManifestCheckpoint', () => {
  it('F-004 сохраняет tagged guard до mutation и не выполняет rename после ошибки', async () => {
    const saves: JobManifestV1[] = [];
    const session = {
      manifest: manifest(),
      runOwned: async <T>(operation: () => Promise<T>) => operation(),
      save: async (next: JobManifestV1) => {
        saves.push(next);
        (session as { manifest: JobManifestV1 }).manifest = next;
      },
    } as unknown as LeaseSession;
    await expect(
      finalizeWithManifestCheckpoint(session, '1', {
        mutateAndValidate: async () => {
          expect(saves[0]?.tracks[0]?.partial?.tagged).toBe(true);
          throw new Error('mutation failed');
        },
        size: async () => 4,
        rename: async () => {
          throw new Error('rename must not run');
        },
      }),
    ).rejects.toThrow('mutation failed');
    expect(saves).toHaveLength(1);
    expect(saves[0]?.tracks[0]?.status).toBe('processing');
  });
});
