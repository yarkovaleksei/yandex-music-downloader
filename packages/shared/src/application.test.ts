import { describe, expect, it } from 'vitest';
import { isCommandResult, isJobEvent } from './events.js';

describe('ApplicationApi DTO', () => {
  it('принимает JSON round-trip успешного и ошибочного результата', () => {
    const result = {
      schemaVersion: 1,
      kind: 'result',
      command: 'preview',
      data: { title: 'Трек' },
    } as const;
    const failure = {
      schemaVersion: 1,
      kind: 'error',
      command: 'preview',
      error: { code: 'DOWNLOAD_ERROR', message: 'Ошибка', retryable: false },
    } as const;
    expect(isCommandResult(JSON.parse(JSON.stringify(result)))).toBe(true);
    expect(isCommandResult(JSON.parse(JSON.stringify(failure)))).toBe(true);
  });

  it('отклоняет неполные и неизвестные versioned записи', () => {
    expect(
      isCommandResult({
        schemaVersion: 2,
        kind: 'result',
        command: 'x',
        data: null,
      }),
    ).toBe(false);
    expect(
      isCommandResult({ schemaVersion: 1, kind: 'error', command: 'x' }),
    ).toBe(false);
    expect(
      isJobEvent({
        schemaVersion: 2,
        event: 'job.created',
        seq: 1,
        jobId: 'job',
      }),
    ).toBe(false);
    expect(
      isJobEvent({
        schemaVersion: 1,
        event: 'unknown.event',
        seq: 1,
        jobId: 'job',
      }),
    ).toBe(false);
    expect(
      isJobEvent({
        schemaVersion: 1,
        event: 'track.started',
        seq: 1,
        jobId: 'job',
      }),
    ).toBe(false);
    expect(
      isJobEvent({
        schemaVersion: 1,
        event: 'job.created',
        seq: 1,
        jobId: 'job',
      }),
    ).toBe(false);
    expect(
      isJobEvent({
        schemaVersion: 1,
        event: 'job.created',
        seq: 0,
        jobId: 'job',
      }),
    ).toBe(false);
  });

  it('принимает обязательные поля JobEvent', () => {
    expect(
      isJobEvent({
        schemaVersion: 1,
        event: 'job.created',
        seq: 1,
        jobId: 'job',
        durationMs: 0,
      }),
    ).toBe(true);
    expect(
      isJobEvent({
        schemaVersion: 1,
        event: 'track.started',
        seq: 2,
        jobId: 'job',
        trackKey: '1',
        durationMs: 0,
      }),
    ).toBe(true);
    expect(
      isJobEvent({
        schemaVersion: 1,
        event: 'track.progress',
        seq: 3,
        jobId: 'job',
        trackKey: '1',
      }),
    ).toBe(true);
  });
});
