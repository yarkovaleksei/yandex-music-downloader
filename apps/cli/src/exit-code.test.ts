import { describe, expect, it } from 'vitest';
import { exitCode } from './exit-code.js';

const result = (status: string) => ({
  schemaVersion: 1 as const,
  kind: 'result' as const,
  command: 'x',
  data: { status },
});
const error = (reason?: 'LEASE_HELD_BY_OTHER_OWNER' | 'OWNER_ACK_TIMEOUT') => ({
  schemaVersion: 1 as const,
  kind: 'error' as const,
  command: 'x',
  error: {
    code: 'DOWNLOAD_ERROR',
    message: 'Ошибка',
    retryable: false,
    ...(reason === undefined
      ? {}
      : { details: { reason, debug: { stack: 'безопасный stack' } } }),
  },
});
describe('коды завершения', () => {
  it.each([
    ['completed', 0],
    ['completed_with_errors', 1],
    ['failed', 3],
    ['interrupted', 3],
    ['paused', 4],
    ['cancelled', 5],
  ])('назначает %s в %i', (status, code) =>
    expect(exitCode(result(status))).toBe(code),
  );
  it('сохраняет приоритет машиночитаемой причины независимо от debug', () => {
    expect(exitCode(error('LEASE_HELD_BY_OTHER_OWNER'))).toBe(6);
    expect(exitCode(error('OWNER_ACK_TIMEOUT'))).toBe(6);
    expect(exitCode(error())).toBe(3);
  });
});
