import { describe, expect, it, vi } from 'vitest';
import { createLogger } from '@music-downloader/logging';
import {
  CommandRefusalError,
  DomainError,
  isCommandResult,
} from '@music-downloader/shared';
import { command } from './results.js';

describe('DTO причины отказа application', () => {
  it.each([
    'JOB_NOT_FOUND',
    'LEASE_HELD_BY_OTHER_OWNER',
    'OWNER_ACK_TIMEOUT',
  ] as const)(
    'передаёт только безопасную причину %s и логирует её',
    async (reason) => {
      const logger = createLogger();
      const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      const result = await command('resume', logger, async () => {
        throw new CommandRefusalError(reason);
      });
      expect(isCommandResult(result)).toBe(true);
      expect(result).toMatchObject({
        schemaVersion: 1,
        kind: 'error',
        error: { details: { reason }, retryable: false },
      });
      expect(
        result.kind === 'error' && Object.keys(result.error).sort(),
      ).toEqual(['code', 'details', 'message', 'retryable']);
      expect(JSON.stringify(result)).not.toMatch(
        /ownerToken|pid|hostname|cause|stack|\/raw\/path/,
      );
      expect(warn).toHaveBeenCalledWith(expect.any(String), {
        command: 'resume',
        code:
          reason === 'OWNER_ACK_TIMEOUT'
            ? 'DOWNLOAD_ERROR'
            : 'VALIDATION_ERROR',
        reason,
      });
    },
  );

  it('оставляет обычный DomainError без details и исходного исключения', async () => {
    const logger = createLogger();
    vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const result = await command('cancel', logger, async () => {
      throw new DomainError('DOWNLOAD_ERROR', false, {
        cause: new Error(
          'ownerToken=секрет; pid=123; hostname=хост; /raw/path',
        ),
      });
    });
    expect(result).toMatchObject({
      kind: 'error',
      error: { code: 'DOWNLOAD_ERROR' },
    });
    expect(result.kind === 'error' && result.error).not.toHaveProperty(
      'details',
    );
    expect(JSON.stringify(result)).not.toMatch(
      /ownerToken|pid|hostname|cause|stack|\/raw\/path/,
    );
  });

  it('объединяет причину и debug без native stack и переживает отказ sink', async () => {
    const logger = createLogger();
    vi.spyOn(logger, 'warn').mockImplementation(() => {
      throw new Error('sink failure');
    });
    const result = await command(
      'resume',
      logger,
      async () => {
        throw new CommandRefusalError('JOB_NOT_FOUND');
      },
      true,
    );
    expect(result).toMatchObject({
      kind: 'error',
      error: {
        details: {
          reason: 'JOB_NOT_FOUND',
          debug: { stack: expect.stringContaining('VALIDATION_ERROR') },
        },
      },
    });
    expect(JSON.stringify(result)).not.toContain('sink failure');
  });

  it('пишет в debug-лог тот же DTO с причиной отказа', async () => {
    const sink = vi.fn();
    const logger = createLogger({ sink });
    await command(
      'resume',
      logger,
      async () => {
        throw new CommandRefusalError('JOB_NOT_FOUND');
      },
      true,
    );
    expect(JSON.parse(sink.mock.calls[0]?.[0] ?? '')).toMatchObject({
      data: {
        error: {
          details: {
            reason: 'JOB_NOT_FOUND',
            debug: { stack: expect.stringContaining('VALIDATION_ERROR') },
          },
        },
      },
    });
  });
});
