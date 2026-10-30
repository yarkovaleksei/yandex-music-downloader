import {
  DiskFullError,
  DownloadError,
  PermissionError,
  ValidationError,
} from '@music-downloader/shared';
import { describe, expect, it } from 'vitest';
import { mapFileError } from './file-errors.js';

function systemError(code: string): NodeJS.ErrnoException {
  const error: NodeJS.ErrnoException = new Error(
    `${code}: failure at /secret/path/token=abc123`,
  );
  error.code = code;
  return error;
}

describe('mapFileError', () => {
  it('maps ENOSPC to DiskFullError', () => {
    expect(mapFileError(systemError('ENOSPC'))).toBeInstanceOf(DiskFullError);
  });

  it.each(['EACCES', 'EPERM'])('maps %s to PermissionError', (code) => {
    expect(mapFileError(systemError(code))).toBeInstanceOf(PermissionError);
  });

  it.each(['EBUSY', 'EIO', 'EMFILE'])(
    'maps %s to a non-retryable DownloadError',
    (code) => {
      const mapped = mapFileError(systemError(code));
      expect(mapped).toBeInstanceOf(DownloadError);
      expect(mapped.retryable).toBe(false);
    },
  );

  it('maps errors without a code and non-error values', () => {
    expect(mapFileError(new Error('boom'))).toBeInstanceOf(DownloadError);
    expect(mapFileError('boom')).toBeInstanceOf(DownloadError);
  });

  it('returns domain errors unchanged', () => {
    const error = new ValidationError();
    expect(mapFileError(error)).toBe(error);
  });

  it.each(['ENOSPC', 'EACCES', 'EPERM', 'EIO'])(
    'does not leak the original %s text into public JSON',
    (code) => {
      const json = JSON.stringify(mapFileError(systemError(code)));
      expect(json).not.toContain('secret');
      expect(json).not.toContain('abc123');
    },
  );
});
