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
});
