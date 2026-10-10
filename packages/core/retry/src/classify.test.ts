import {
  AuthenticationError,
  DiskFullError,
  DownloadError,
  PermissionError,
  ProviderError,
  TrackUnavailableError,
} from '@music-downloader/shared';
import { describe, expect, it } from 'vitest';
import { classifyError } from './classify.js';

describe('classifyError: raw transport errors (REQ-014)', () => {
  it.each([
    ['timeout', { code: 'ETIMEDOUT' }],
    ['connection reset', { code: 'ECONNRESET' }],
    ['HTTP 429', { status: 429 }],
    ['HTTP 500', { status: 500 }],
    ['HTTP 502', { status: 502 }],
    ['HTTP 503', { status: 503 }],
    ['HTTP 504', { status: 504 }],
  ])('retries %s', (_name, error) => {
    const result = classifyError(error);
    expect(result.retryable).toBe(true);
    expect(result.action).toBe('retry');
    expect(result.scope).toBe('track');
  });

  it.each([
    ['HTTP 401', { status: 401 }, 'pause_job', 'AUTH_REQUIRED'],
    ['HTTP 403', { status: 403 }, 'pause_job', 'AUTH_REQUIRED'],
    ['permission denied', { code: 'EACCES' }, 'pause_job', 'PERMISSION_DENIED'],
    ['EPERM', { code: 'EPERM' }, 'pause_job', 'PERMISSION_DENIED'],
    ['no disk space', { code: 'ENOSPC' }, 'pause_job', 'DISK_FULL'],
  ])('does not retry %s and pauses the job', (_name, error, action, reason) => {
    const result = classifyError(error);
    expect(result.retryable).toBe(false);
    expect(result.action).toBe(action);
    expect(result.scope).toBe('job');
    expect(result.pauseReason).toBe(reason);
  });

  it.each([
    ['HTTP 404', { status: 404 }],
    ['invalid URL', new TypeError('Invalid URL')],
    ['unsupported codec', { code: 'UNSUPPORTED_CODEC' }],
    ['unknown value', 'boom'],
    ['null', null],
  ])('does not retry %s', (_name, error) => {
    const result = classifyError(error);
    expect(result.retryable).toBe(false);
    expect(result.action).toBe('fail');
    expect(result.scope).toBe('track');
  });
});

describe('classifyError: domain errors', () => {
  it('reopens the stream on STREAM_EXPIRED and does not treat it as auth', () => {
    const result = classifyError(new ProviderError('STREAM_EXPIRED', true));
    expect(result).toMatchObject({
      code: 'STREAM_EXPIRED',
      retryable: true,
      action: 'reopen_stream',
      scope: 'track',
    });
    expect(result.pauseReason).toBeUndefined();
  });

  it('reopens the stream even if the provider marked it non-retryable', () => {
    expect(
      classifyError(new ProviderError('STREAM_EXPIRED', false)).action,
    ).toBe('reopen_stream');
  });

  it.each([
    [new AuthenticationError(), 'AUTH_REQUIRED'],
    [new DiskFullError(), 'DISK_FULL'],
    [new PermissionError(), 'PERMISSION_DENIED'],
  ] as const)('pauses the job on %s', (error, reason) => {
    expect(classifyError(error)).toMatchObject({
      action: 'pause_job',
      scope: 'job',
      pauseReason: reason,
      retryable: false,
    });
  });

  it('trusts the retryable flag of other domain errors', () => {
    expect(classifyError(new ProviderError('NETWORK_ERROR', true)).action).toBe(
      'retry',
    );
    expect(
      classifyError(new ProviderError('SERVICE_UNAVAILABLE', false)).action,
    ).toBe('fail');
    expect(classifyError(new DownloadError(true)).action).toBe('retry');
    expect(classifyError(new TrackUnavailableError()).action).toBe('fail');
  });

  it('does not expose the original message or cause', () => {
    const result = classifyError(
      new ProviderError(
        'NETWORK_ERROR',
        true,
        new Error('https://cdn/x?sign=SECRET'),
      ),
    );
    expect(JSON.stringify(result)).not.toContain('SECRET');
  });
});
