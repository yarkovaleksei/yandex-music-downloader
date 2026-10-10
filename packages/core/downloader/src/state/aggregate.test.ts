import type {
  DownloadJobControl,
  DownloadJobStatus,
  DownloadTrackStatus as S,
} from '@music-downloader/shared';
import { describe, expect, it } from 'vitest';
import { aggregateJobStatus } from './aggregate.js';

type Row = [
  name: string,
  control: DownloadJobControl,
  leaseAlive: boolean,
  tracks: S[],
  expected: DownloadJobStatus,
];

const rows: Row[] = [
  [
    'cancelled beats everything',
    'cancelled',
    true,
    ['completed', 'failed'],
    'cancelled',
  ],
  [
    'cancelled with stale lease',
    'cancelled',
    false,
    ['downloading'],
    'cancelled',
  ],
  [
    'paused beats terminal tracks',
    'paused',
    true,
    ['completed', 'failed'],
    'paused',
  ],
  [
    'paused after a failed last track (AUTH_REQUIRED)',
    'paused',
    true,
    ['completed', 'failed'],
    'paused',
  ],
  ['paused with stale lease', 'paused', false, ['paused'], 'paused'],
  [
    'interrupted: stale lease and pending tracks',
    'running',
    false,
    ['completed', 'downloading'],
    'interrupted',
  ],
  [
    'interrupted even when nothing started',
    'running',
    false,
    ['queued', 'queued'],
    'interrupted',
  ],
  [
    'interrupted with retry_wait',
    'running',
    false,
    ['retry_wait'],
    'interrupted',
  ],
  [
    'stale lease does not matter when finished',
    'running',
    false,
    ['completed', 'skipped'],
    'completed',
  ],
  ['completed', 'running', true, ['completed', 'completed'], 'completed'],
  [
    'completed with skipped',
    'running',
    true,
    ['completed', 'skipped'],
    'completed',
  ],
  ['only skipped', 'running', true, ['skipped'], 'completed'],
  ['empty job follows ADR literally', 'running', true, [], 'completed'],
  [
    'completed_with_errors (unavailable tracks)',
    'running',
    true,
    ['completed', 'failed'],
    'completed_with_errors',
  ],
  [
    'completed_with_errors with skipped',
    'running',
    true,
    ['skipped', 'failed', 'failed'],
    'completed_with_errors',
  ],
  ['failed', 'running', true, ['failed', 'failed'], 'failed'],
  ['failed single track', 'running', true, ['failed'], 'failed'],
  [
    'running: one active, one failed',
    'running',
    true,
    ['failed', 'downloading'],
    'running',
  ],
  [
    'running: waiting retry',
    'running',
    true,
    ['completed', 'retry_wait'],
    'running',
  ],
  [
    'running: some queued some completed',
    'running',
    true,
    ['completed', 'queued'],
    'running',
  ],
  ['queued: nothing started', 'running', true, ['queued', 'queued'], 'queued'],
  [
    'cancelled tracks only (defensive rule)',
    'running',
    true,
    ['cancelled', 'cancelled'],
    'cancelled',
  ],
  [
    'completed + cancelled (defensive rule)',
    'running',
    true,
    ['completed', 'cancelled'],
    'completed_with_errors',
  ],
  ['failed + cancelled', 'running', true, ['failed', 'cancelled'], 'failed'],
];

describe('aggregateJobStatus', () => {
  it.each(rows)('%s', (_name, control, leaseAlive, tracks, expected) => {
    expect(aggregateJobStatus({ control, leaseAlive, tracks })).toBe(expected);
  });

  it('does not depend on track order', () => {
    const base: S[] = ['completed', 'failed', 'retry_wait', 'queued'];
    const permutations = (items: S[]): S[][] =>
      items.length <= 1
        ? [items]
        : items.flatMap((item, index) =>
            permutations([
              ...items.slice(0, index),
              ...items.slice(index + 1),
            ]).map((rest) => [item, ...rest]),
          );
    const results = new Set(
      permutations(base).map((tracks) =>
        aggregateJobStatus({ control: 'running', leaseAlive: true, tracks }),
      ),
    );
    expect([...results]).toEqual(['running']);
  });
});
