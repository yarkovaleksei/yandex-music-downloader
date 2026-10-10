import type { DownloadTrackStatus } from '@music-downloader/shared';
import { describe, expect, it } from 'vitest';
import {
  recoverTrack,
  trackEvents,
  transitionRules,
  transitionTrack,
  type RetryPhase,
  type TrackEvent,
  type TrackState,
} from './transitions.js';

const statuses: readonly DownloadTrackStatus[] = [
  'queued',
  'resolving',
  'ready',
  'downloading',
  'processing',
  'retry_wait',
  'paused',
  'completed',
  'skipped',
  'failed',
  'cancelled',
];

/** Исходные состояния матрицы: retry_wait учитывается с обеими фазами. */
const sources: readonly TrackState[] = statuses.flatMap(
  (status): TrackState[] =>
    status === 'retry_wait'
      ? [
          { status, retryPhase: 'resolving' },
          { status, retryPhase: 'downloading' },
        ]
      : [{ status }],
);

interface Expected {
  readonly from: string;
  readonly event: TrackEvent;
  readonly to: DownloadTrackStatus;
  readonly phase?: RetryPhase;
}

/** Выписано вручную из таблицы ADR-003 и правил ADR-006, независимо от реализации. */
const allowed: readonly Expected[] = [
  { from: 'queued', event: 'start_resolving', to: 'resolving' },
  { from: 'resolving', event: 'variant_selected', to: 'ready' },
  {
    from: 'resolving',
    event: 'transient_error',
    to: 'retry_wait',
    phase: 'resolving',
  },
  { from: 'ready', event: 'skip_existing', to: 'skipped' },
  { from: 'processing', event: 'skip_existing', to: 'skipped' },
  { from: 'ready', event: 'start_download', to: 'downloading' },
  { from: 'downloading', event: 'stream_complete', to: 'processing' },
  { from: 'processing', event: 'commit', to: 'completed' },
  {
    from: 'downloading',
    event: 'transient_error',
    to: 'retry_wait',
    phase: 'downloading',
  },
  { from: 'retry_wait:resolving', event: 'backoff_elapsed', to: 'resolving' },
  {
    from: 'retry_wait:downloading',
    event: 'backoff_elapsed',
    to: 'downloading',
  },
  { from: 'downloading', event: 'pause', to: 'paused' },
  { from: 'retry_wait:downloading', event: 'pause', to: 'paused' },
  { from: 'paused', event: 'resume', to: 'downloading' },
  { from: 'resolving', event: 'fatal_error', to: 'failed' },
  { from: 'downloading', event: 'fatal_error', to: 'failed' },
  { from: 'processing', event: 'fatal_error', to: 'failed' },
  { from: 'retry_wait:resolving', event: 'attempts_exhausted', to: 'failed' },
  { from: 'retry_wait:downloading', event: 'attempts_exhausted', to: 'failed' },
  ...[
    'queued',
    'resolving',
    'ready',
    'downloading',
    'paused',
    'processing',
  ].map((from): Expected => ({ from, event: 'cancel', to: 'cancelled' })),
  { from: 'retry_wait:resolving', event: 'cancel', to: 'cancelled' },
  { from: 'retry_wait:downloading', event: 'cancel', to: 'cancelled' },
  { from: 'failed', event: 'retry', to: 'queued' },
  { from: 'failed', event: 'auth_resume', to: 'queued' },
];

/** Recovery-переходы проверяются отдельно с actor='recovery'. */
const recovery: readonly Expected[] = [
  ...['resolving', 'ready', 'downloading', 'processing'].map(
    (from): Expected => ({ from, event: 'recover', to: 'queued' }),
  ),
  { from: 'retry_wait:resolving', event: 'recover', to: 'queued' },
  { from: 'retry_wait:downloading', event: 'recover', to: 'queued' },
  { from: 'processing', event: 'recover_committed', to: 'completed' },
];

function key(state: TrackState): string {
  return state.retryPhase === undefined
    ? state.status
    : `${state.status}:${state.retryPhase}`;
}

function expectedFor(
  table: readonly Expected[],
  state: TrackState,
  event: TrackEvent,
): Expected | undefined {
  return table.find((row) => row.from === key(state) && row.event === event);
}

describe('transitionTrack matrix (ADR-003/ADR-006)', () => {
  it('covers 12 source states and every event', () => {
    expect(sources).toHaveLength(12);
    expect(trackEvents).toHaveLength(17);
    expect(transitionRules.length).toBeGreaterThan(0);
  });

  describe.each(sources)('from $status $retryPhase', (state) => {
    it.each(trackEvents)('%s matches the ADR table', (event) => {
      const row = expectedFor(allowed, state, event);
      const result = transitionTrack(state, event);
      if (row === undefined) {
        expect(result.ok).toBe(false);
        return;
      }
      expect(result).toEqual({
        ok: true,
        state:
          row.phase === undefined
            ? { status: row.to }
            : { status: row.to, retryPhase: row.phase },
      });
    });
  });

  it('allows exactly the ADR transitions and nothing else', () => {
    let accepted = 0;
    for (const state of sources) {
      for (const event of trackEvents) {
        if (transitionTrack(state, event).ok) accepted += 1;
      }
    }
    expect(accepted).toBe(allowed.length);
  });
});

describe('recovery transitions', () => {
  const context = { actor: 'recovery', resultVerified: true } as const;

  it.each(sources)('recovery events from $status $retryPhase', (state) => {
    for (const event of ['recover', 'recover_committed'] as const) {
      const row = expectedFor(recovery, state, event);
      const result = transitionTrack(state, event, context);
      expect(result.ok).toBe(row !== undefined);
      if (row !== undefined && result.ok)
        expect(result.state).toEqual({ status: row.to });
    }
  });

  it('rejects recovery events for any other actor', () => {
    expect(transitionTrack({ status: 'downloading' }, 'recover').ok).toBe(
      false,
    );
    expect(
      transitionTrack({ status: 'processing' }, 'recover_committed', {
        resultVerified: true,
      }).ok,
    ).toBe(false);
  });

  it('rejects recover_committed without a verified result', () => {
    expect(
      transitionTrack({ status: 'processing' }, 'recover_committed', {
        actor: 'recovery',
      }).ok,
    ).toBe(false);
  });

  it('recoverTrack normalizes unfinished tracks and keeps the rest', () => {
    for (const status of [
      'resolving',
      'ready',
      'downloading',
      'processing',
    ] as const) {
      expect(recoverTrack({ status })).toEqual({ status: 'queued' });
    }
    expect(
      recoverTrack({ status: 'retry_wait', retryPhase: 'downloading' }),
    ).toEqual({
      status: 'queued',
    });
    expect(
      recoverTrack({ status: 'processing' }, { resultVerified: true }),
    ).toEqual({
      status: 'completed',
    });
    for (const status of [
      'queued',
      'paused',
      'completed',
      'skipped',
      'failed',
      'cancelled',
    ] as const) {
      expect(recoverTrack({ status })).toEqual({ status });
    }
  });
});

describe('invariants', () => {
  it.each(['completed', 'skipped', 'cancelled'] as const)(
    '%s is terminal',
    (status) => {
      for (const event of trackEvents) {
        expect(
          transitionTrack({ status }, event, {
            actor: 'recovery',
            resultVerified: true,
          }).ok,
        ).toBe(false);
      }
    },
  );

  it('leaves failed only through retry and auth_resume', () => {
    const exits = trackEvents.filter(
      (event) =>
        transitionTrack({ status: 'failed' }, event, {
          actor: 'recovery',
          resultVerified: true,
        }).ok,
    );
    expect(exits).toEqual(['retry', 'auth_resume']);
  });

  it('does not let a plain resume restart a failed track', () => {
    expect(transitionTrack({ status: 'failed' }, 'resume').ok).toBe(false);
  });

  it('keeps retryPhase only in retry_wait', () => {
    expect(
      transitionTrack(
        { status: 'downloading', retryPhase: 'downloading' },
        'pause',
      ).ok,
    ).toBe(false);
    expect(transitionTrack({ status: 'retry_wait' }, 'cancel').ok).toBe(false);
    const entered = transitionTrack(
      { status: 'downloading' },
      'transient_error',
    );
    expect(entered).toEqual({
      ok: true,
      state: { status: 'retry_wait', retryPhase: 'downloading' },
    });
    if (!entered.ok) return;
    const left = transitionTrack(entered.state, 'backoff_elapsed');
    expect(left).toEqual({ ok: true, state: { status: 'downloading' } });
  });

  it('refuses pause from retry_wait(resolving) and accepts retry_wait(downloading)', () => {
    expect(
      transitionTrack(
        { status: 'retry_wait', retryPhase: 'resolving' },
        'pause',
      ).ok,
    ).toBe(false);
    expect(
      transitionTrack(
        { status: 'retry_wait', retryPhase: 'downloading' },
        'pause',
      ).ok,
    ).toBe(true);
  });
});
