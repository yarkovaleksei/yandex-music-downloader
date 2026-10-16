import { describe, expect, it } from 'vitest';
import { writeRecord } from './output.js';
describe('вывод', () => {
  it('показывает debug stack только при --debug', () => {
    const lines: string[] = [];
    const record = {
      schemaVersion: 1 as const,
      kind: 'error' as const,
      command: 'x',
      error: {
        code: 'DOWNLOAD_ERROR',
        message: 'Ошибка',
        retryable: false,
        details: { debug: { stack: 'безопасный stack' } },
      },
    };
    writeRecord(
      {
        json: false,
        stdout: () => undefined,
        stderr: (line) => lines.push(line),
      },
      record,
    );
    expect(lines.join('\n')).not.toContain('stack');
    writeRecord(
      {
        json: false,
        debug: true,
        stdout: () => undefined,
        stderr: (line) => lines.push(line),
      },
      record,
    );
    expect(lines.join('\n')).toContain('безопасный stack');
  });

  it('подсказывает обновление при STATE_SCHEMA_UNSUPPORTED', () => {
    const lines: string[] = [];
    writeRecord(
      {
        json: false,
        stdout: () => undefined,
        stderr: (line) => lines.push(line),
      },
      {
        schemaVersion: 1,
        kind: 'error',
        command: 'jobs',
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Данные не прошли проверку.',
          retryable: false,
          details: { reason: 'STATE_SCHEMA_UNSUPPORTED' },
        },
      },
    );
    expect(lines).toEqual([
      'VALIDATION_ERROR: Данные не прошли проверку.',
      'База состояния создана более новой версией приложения; обновите music-downloader.',
    ]);
  });
});
