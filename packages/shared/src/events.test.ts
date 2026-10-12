import { describe, expect, expectTypeOf, it } from 'vitest';
import type { CliRecord, CommandResult, JobEvent } from './events.js';
import { isCommandResult, isJobEvent } from './events.js';
import { sharedPackage } from './index.js';

describe('контракты событий', () => {
  it('сериализует и восстанавливает событие job', () => {
    const event: JobEvent = {
      schemaVersion: 1,
      event: 'download.completed',
      seq: 4,
      jobId: 'job-1',
      trackKey: '2',
      trackId: 'track-7',
      durationMs: 230,
      payload: { bytes: 42 },
    };

    expect(JSON.parse(JSON.stringify(event))).toEqual(event);
  });

  it('различает оба результата команды', () => {
    const result: CommandResult = {
      schemaVersion: 1,
      kind: 'result',
      command: 'doctor',
      data: { ready: true },
    };
    const failure: CommandResult = {
      schemaVersion: 1,
      kind: 'error',
      command: 'doctor',
      error: { code: 'DOWNLOAD_ERROR', message: 'Ошибка', retryable: false },
    };

    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(JSON.parse(JSON.stringify(failure))).toEqual(failure);
  });

  it('сохраняет проверку DTO v1 при независимом debug detail', () => {
    expect(
      isCommandResult({
        schemaVersion: 1,
        kind: 'error',
        command: 'doctor',
        error: {
          code: 'DOWNLOAD_ERROR',
          message: 'Ошибка',
          retryable: false,
          details: {
            reason: 'JOB_NOT_FOUND',
            debug: { stack: 'DOWNLOAD_ERROR: Ошибка' },
          },
        },
      }),
    ).toBe(true);
    expect(
      isJobEvent({
        schemaVersion: 1,
        event: 'job.created',
        seq: 1,
        jobId: 'job',
        durationMs: 1,
      }),
    ).toBe(true);
  });

  it('экспортирует DTO через публичный shared entrypoint', () => {
    expect(sharedPackage).toBe('@music-downloader/shared');
    expectTypeOf<CliRecord>().toMatchTypeOf<JobEvent | CommandResult>();
  });

  it('отклоняет неполные versioned DTO на этапе типов', () => {
    expectTypeOf<{
      schemaVersion: 2;
      kind: 'result';
      command: 'doctor';
      data: null;
    }>().not.toMatchTypeOf<CommandResult>();
    expectTypeOf<{
      schemaVersion: 1;
      event: 'job.created';
      seq: 1;
      jobId: 'job-1';
    }>().not.toMatchTypeOf<JobEvent>();
    expectTypeOf<{
      schemaVersion: 1;
      event: 'track.started';
      seq: 1;
      jobId: 'job-1';
      durationMs: 1;
    }>().not.toMatchTypeOf<JobEvent>();
    const mixedResult = {
      schemaVersion: 1 as const,
      kind: 'result' as const,
      command: 'doctor',
      data: null,
      error: { code: 'X', message: 'X', retryable: false },
    };
    const mixedError = {
      schemaVersion: 1 as const,
      kind: 'error' as const,
      command: 'doctor',
      error: { code: 'X', message: 'X', retryable: false },
      data: null,
    };
    // @ts-expect-error F-001: переменная результата не может содержать error.
    const rejectedResult: CommandResult = mixedResult;
    // @ts-expect-error F-001: переменная ошибки не может содержать data.
    const rejectedError: CommandResult = mixedError;
    expect([rejectedResult, rejectedError]).toHaveLength(2);
  });
});
