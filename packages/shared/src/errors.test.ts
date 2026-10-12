import { describe, expect, it } from 'vitest';
import {
  AuthenticationError,
  CommandRefusalError,
  DomainError,
  DiskFullError,
  DownloadError,
  MetadataError,
  normalizeDomainError,
  PermissionError,
  ProviderError,
  QualityUnavailableError,
  TrackUnavailableError,
  UnsupportedUrlError,
  ValidationError,
} from './index.js';

describe('DomainError', () => {
  it.each([
    ['JOB_NOT_FOUND', 'VALIDATION_ERROR'],
    ['LEASE_HELD_BY_OTHER_OWNER', 'VALIDATION_ERROR'],
    ['OWNER_ACK_TIMEOUT', 'DOWNLOAD_ERROR'],
  ] as const)(
    'сохраняет безопасный базовый JSON для причины %s',
    (reason, code) => {
      const error = new CommandRefusalError(reason);
      expect(error).toBeInstanceOf(DomainError);
      expect(error.reason).toBe(reason);
      expect(error.code).toBe(code);
      expect(error.retryable).toBe(false);
      expect(error.toJSON()).toEqual({
        code,
        message: error.message,
        retryable: false,
      });
      expect(error).not.toHaveProperty('cause');
      expect(new CommandRefusalError(reason, 'DOWNLOAD_ERROR').code).toBe(
        'DOWNLOAD_ERROR',
      );
      expect(
        new CommandRefusalError(reason, 'VALIDATION_ERROR').retryable,
      ).toBe(false);
    },
  );
  it.each([
    [new ProviderError('NETWORK_ERROR', true), 'NETWORK_ERROR', true],
    [new AuthenticationError(), 'AUTH_ERROR', false],
    [new UnsupportedUrlError(), 'UNSUPPORTED_URL', false],
    [new TrackUnavailableError(), 'TRACK_UNAVAILABLE', false],
    [new QualityUnavailableError(), 'QUALITY_UNAVAILABLE', false],
    [new DownloadError(), 'DOWNLOAD_ERROR', false],
    [new DiskFullError(), 'DISK_FULL', false],
    [new PermissionError(), 'PERMISSION_DENIED', false],
    [new ValidationError(), 'VALIDATION_ERROR', false],
    [new MetadataError(), 'METADATA_ERROR', false],
  ])('serializes %s safely', (error, code, retryable) => {
    expect(error.code).toBe(code);
    expect(error.retryable).toBe(retryable);
    expect(error.toJSON()).toEqual({ code, message: error.message, retryable });
  });

  it('does not serialize original message, cause or stack', () => {
    const error = new ProviderError(
      'NETWORK_ERROR',
      true,
      new Error('token=secret'),
    );
    expect(JSON.stringify(error)).not.toContain('secret');
    expect(error.toJSON()).not.toHaveProperty('cause');
    expect(error.toJSON()).not.toHaveProperty('stack');
  });

  it.each([
    ['NETWORK_ERROR', true],
    ['AUTH_ERROR', false],
    ['API_CHANGED', false],
    ['SERVICE_UNAVAILABLE', true],
    ['PROVIDER_RESPONSE_INVALID', false],
    ['STREAM_EXPIRED', true],
  ] as const)(
    'сериализует безопасно provider-код %s из F-004',
    (code, retryable) => {
      const error = new ProviderError(
        code,
        retryable,
        new Error('token=secret'),
      );
      expect(error.code).toBe(code);
      expect(error.retryable).toBe(retryable);
      expect(error.toJSON()).toEqual({
        code,
        message: error.message,
        retryable,
      });
      expect(JSON.stringify(error)).not.toContain('secret');
      expect(error.toJSON()).not.toHaveProperty('cause');
      expect(error.toJSON()).not.toHaveProperty('stack');
    },
  );

  it.each([
    [{ code: 'ENOSPC' }, 'DISK_FULL', false],
    [{ code: 'EACCES' }, 'PERMISSION_DENIED', false],
    [{ status: 404 }, 'TRACK_UNAVAILABLE', false],
    [{ status: 429 }, 'SERVICE_UNAVAILABLE', true],
    [{ status: 503 }, 'SERVICE_UNAVAILABLE', true],
    [{ code: 'ETIMEDOUT' }, 'NETWORK_ERROR', true],
    [{ message: 'Authorization: bearer secret' }, 'DOWNLOAD_ERROR', false],
  ])(
    'normalizes a confirmed failure without exposing its details',
    (input, code, retryable) => {
      const error = normalizeDomainError(input);
      expect(error.code).toBe(code);
      expect(error.retryable).toBe(retryable);
      expect(JSON.stringify(error)).not.toContain('secret');
    },
  );
});
