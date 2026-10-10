import { AuthenticationError, ProviderError } from '@music-downloader/shared';
import { describe, expect, it } from 'vitest';
import { decideRetry } from './decide.js';

const transient = { status: 503 };
const base = { random: () => 1, now: () => 10_000 } as const;

describe('decideRetry', () => {
  it('retries four times and fails on the fifth failure with the default budget', () => {
    const actions = [1, 2, 3, 4, 5].map(
      (failedAttempts) =>
        decideRetry({ ...base, error: transient, failedAttempts }).action,
    );
    expect(actions).toEqual(['retry', 'retry', 'retry', 'retry', 'fail']);
  });

  it('honors a configured maxAttempts', () => {
    const config = { maxAttempts: 2 };
    expect(
      decideRetry({ ...base, error: transient, failedAttempts: 1, config })
        .action,
    ).toBe('retry');
    expect(
      decideRetry({ ...base, error: transient, failedAttempts: 2, config })
        .action,
    ).toBe('fail');
  });

  it('schedules retryAt from the injected clock and delay', () => {
    const decision = decideRetry({
      ...base,
      error: transient,
      failedAttempts: 2,
    });
    if (decision.action !== 'retry') throw new Error('expected retry');
    expect(decision.delayMs).toBe(2000);
    expect(decision.retryAt).toBe(12_000);
    expect(decision.record).toEqual({
      attempt: 2,
      code: 'SERVICE_UNAVAILABLE',
      retryable: true,
      delayMs: 2000,
    });
  });

  it('reopens the stream on STREAM_EXPIRED within the same attempt budget', () => {
    const error = new ProviderError('STREAM_EXPIRED', true);
    expect(decideRetry({ ...base, error, failedAttempts: 1 }).action).toBe(
      'reopen_stream',
    );
    expect(decideRetry({ ...base, error, failedAttempts: 5 }).action).toBe(
      'fail',
    );
  });

  it('fails non-retryable errors immediately', () => {
    const decision = decideRetry({
      ...base,
      error: { status: 404 },
      failedAttempts: 1,
    });
    expect(decision.action).toBe('fail');
    expect(decision.record).toMatchObject({
      code: 'TRACK_UNAVAILABLE',
      retryable: false,
    });
  });

  it('pauses the job on global errors without consuming the retry budget', () => {
    const decision = decideRetry({
      ...base,
      error: new AuthenticationError(),
      failedAttempts: 1,
    });
    expect(decision).toMatchObject({
      action: 'pause_job',
      reason: 'AUTH_REQUIRED',
    });
  });

  it('keeps the attempt record free of causes and messages', () => {
    const error = new ProviderError(
      'NETWORK_ERROR',
      true,
      new Error('token=SECRET'),
    );
    const decision = decideRetry({ ...base, error, failedAttempts: 1 });
    expect(JSON.stringify(decision)).not.toContain('SECRET');
  });
});
