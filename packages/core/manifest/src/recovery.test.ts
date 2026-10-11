import { describe, expect, it } from 'vitest';
import { recoverJob } from './recovery.js';

const fixture = (status: 'processing' | 'downloading' = 'processing') => ({
  version: 1 as const,
  jobId: 'job',
  provider: 'test',
  source: { provider: 'test', kind: 'track' as const, id: 'source' },
  quality: 'best',
  destination: '/music',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  control: { state: 'paused' as const },
  plan: {
    source: { provider: 'test', kind: 'track' as const, id: 'source' },
    title: 'Трек',
    tracks: [
      {
        position: 1,
        trackKey: '1',
        track: { id: 'track', availability: 'unknown' as const },
      },
    ],
  },
  tracks: [
    {
      position: 1,
      trackKey: '1',
      status,
      attempts: 0,
      history: [],
      resultPath: 'final',
      partPath: 'part',
      updatedAt: '2026-01-01T00:00:00.000Z',
      postProcessing: { size: 4, identity: 'marker' },
    },
  ],
});
describe('recoverJob', () => {
  it('закрывает rename-gap только для processing с совпавшим marker', async () => {
    const recovered = await recoverJob(fixture(), {
      exists: async () => false,
      size: async () => 4,
      validateFinal: async (_path, marker) => marker === 'marker',
    });
    expect(recovered.tracks[0]?.status).toBe('completed');
  });
  it('не считает обычный final доказательством completed для другого состояния', async () => {
    const recovered = await recoverJob(fixture('downloading'), {
      exists: async () => false,
      size: async () => 4,
      validateFinal: async () => true,
    });
    expect(recovered.tracks[0]?.status).toBe('queued');
  });
  it.each([
    'queued',
    'resolving',
    'ready',
    'downloading',
    'processing',
    'retry_wait',
  ] as const)('возвращает незавершённый %s в очередь', async (status) => {
    const recovered = await recoverJob(
      { ...fixture(), tracks: [{ ...fixture().tracks[0]!, status }] },
      {
        exists: async () => true,
        size: async () => undefined,
        validateFinal: async () => false,
      },
    );
    expect(recovered.tracks[0]?.status).toBe('queued');
  });
  it.each(['completed', 'skipped', 'cancelled', 'failed', 'paused'] as const)(
    'сохраняет terminal, failed и paused %s',
    async (status) => {
      const recovered = await recoverJob(
        { ...fixture(), tracks: [{ ...fixture().tracks[0]!, status }] },
        {
          exists: async () => true,
          size: async () => undefined,
          validateFinal: async () => false,
        },
      );
      expect(recovered.tracks[0]?.status).toBe(status);
    },
  );
});
