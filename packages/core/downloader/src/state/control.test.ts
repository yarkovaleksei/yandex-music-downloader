import { describe, expect, it } from 'vitest';
import {
  pauseJobOnFatalError,
  resumeJob,
  transitionJobControl,
  type JobControlState,
} from './control.js';

const running: JobControlState = { control: 'running' };
const paused: JobControlState = { control: 'paused' };
const cancelled: JobControlState = { control: 'cancelled' };

describe('transitionJobControl', () => {
  it('allows running <-> paused and cancel from running or paused', () => {
    expect(transitionJobControl(running, 'pause')).toEqual({
      ok: true,
      state: paused,
    });
    expect(transitionJobControl(paused, 'resume')).toEqual({
      ok: true,
      state: running,
    });
    expect(transitionJobControl(running, 'cancel')).toEqual({
      ok: true,
      state: cancelled,
    });
    expect(transitionJobControl(paused, 'cancel')).toEqual({
      ok: true,
      state: cancelled,
    });
  });

  it('rejects redundant pause/resume', () => {
    expect(transitionJobControl(paused, 'pause').ok).toBe(false);
    expect(transitionJobControl(running, 'resume').ok).toBe(false);
  });

  it('keeps cancelled terminal', () => {
    for (const command of ['pause', 'resume', 'cancel', 'retry'] as const) {
      expect(transitionJobControl(cancelled, command).ok).toBe(false);
    }
    expect(resumeJob(cancelled).ok).toBe(false);
  });
});

describe('transitionJobControl retry', () => {
  it('allows retry for running and paused jobs without changing control', () => {
    expect(transitionJobControl(running, 'retry')).toEqual({
      ok: true,
      state: running,
    });
    expect(transitionJobControl(paused, 'retry')).toEqual({
      ok: true,
      state: paused,
    });
  });

  it('keeps the pause reason when retry is allowed', () => {
    const state: JobControlState = {
      control: 'paused',
      pauseReason: 'DISK_FULL',
      pauseTrackKey: 'track-1',
    };
    expect(transitionJobControl(state, 'retry')).toEqual({ ok: true, state });
  });
});

describe('pauseJobOnFatalError', () => {
  it.each(['AUTH_REQUIRED', 'DISK_FULL', 'PERMISSION_DENIED'] as const)(
    'pauses a running job with reason %s',
    (reason) => {
      expect(pauseJobOnFatalError(running, reason, 'track-3')).toEqual({
        ok: true,
        state: {
          control: 'paused',
          pauseReason: reason,
          pauseTrackKey: 'track-3',
        },
      });
    },
  );

  it('keeps the first stopping track when called again', () => {
    const first = pauseJobOnFatalError(running, 'AUTH_REQUIRED', 'track-1');
    if (!first.ok) throw new Error('expected pause');
    expect(
      pauseJobOnFatalError(first.state, 'AUTH_REQUIRED', 'track-2').ok,
    ).toBe(false);
    expect(pauseJobOnFatalError(paused, 'DISK_FULL', 'track-2').ok).toBe(false);
    expect(pauseJobOnFatalError(cancelled, 'DISK_FULL', 'track-2').ok).toBe(
      false,
    );
  });
});

describe('resumeJob', () => {
  it('returns exactly one track to requeue after AUTH_REQUIRED', () => {
    const state: JobControlState = {
      control: 'paused',
      pauseReason: 'AUTH_REQUIRED',
      pauseTrackKey: 'track-3',
    };
    expect(resumeJob(state)).toEqual({
      ok: true,
      state: { state: running, requeueTrackKey: 'track-3' },
    });
  });

  it.each(['DISK_FULL', 'PERMISSION_DENIED'] as const)(
    'clears the reason without requeueing for %s',
    (pauseReason) => {
      expect(
        resumeJob({ control: 'paused', pauseReason, pauseTrackKey: 'track-1' }),
      ).toEqual({
        ok: true,
        state: { state: running },
      });
    },
  );

  it('resumes a user pause without requeueing', () => {
    expect(resumeJob(paused)).toEqual({ ok: true, state: { state: running } });
  });

  it('rejects resume of a running job', () => {
    expect(resumeJob(running).ok).toBe(false);
  });
});
