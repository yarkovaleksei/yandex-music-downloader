import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { DomainError } from '@music-downloader/shared';
import { createFileSink } from './file-sink.js';
import { createLogger } from './logger.js';

describe('файловый sink', () => {
  it('добавляет очищенную запись в stderr и явный файл без stdout', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'logging-sink-'));
    const filePath = path.join(root, 'diagnostics.jsonl');
    const stderr = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
    const stdout = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    try {
      const logger = createLogger({
        level: 'trace',
        sink: createFileSink(filePath),
      });
      logger.info('первая запись', {
        token: 'known-token-046',
        Authorization: 'Bearer known-token-046',
        cookie: 'session=known-token-046',
        url: 'https://cdn.example.test/file?signature=known-token-046',
        challenge: 'known-challenge-046',
      });
      logger.trace('вторая запись');

      const file = await readFile(filePath, 'utf8');
      expect(file).toBe(stderr.mock.calls.map(([line]) => line).join(''));
      expect(file).toContain('первая запись');
      expect(file).toContain('вторая запись');
      expect(file).not.toMatch(
        /known-token-046|known-challenge-046|signature/u,
      );
      expect(stdout).not.toHaveBeenCalled();
    } finally {
      stderr.mockRestore();
      stdout.mockRestore();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('безопасно отклоняет пустой или недоступный путь', () => {
    expect(() => createFileSink('   ')).toThrow(DomainError);
    expect(() => createFileSink('/missing-parent-046/log.jsonl')).toThrow(
      DomainError,
    );
  });

  it.each([
    ['EACCES', 'PERMISSION_DENIED'],
    ['EPERM', 'PERMISSION_DENIED'],
    ['ENOSPC', 'DISK_FULL'],
  ] as const)(
    'нормализует %s при readiness файла в %s',
    async (nativeCode, code) => {
      const append = vi.fn(() => {
        throw nativeError(nativeCode);
      });
      const createMockedSink = await mockedFileSink(append);
      try {
        expect(() => createMockedSink('/safe/log.jsonl')).toThrow(
          expect.objectContaining({ code }),
        );
      } finally {
        vi.doUnmock('node:fs');
        vi.resetModules();
      }
    },
  );

  it.each([
    ['EACCES', 'PERMISSION_DENIED'],
    ['EPERM', 'PERMISSION_DENIED'],
    ['ENOSPC', 'DISK_FULL'],
  ] as const)(
    'нормализует %s при append записи в %s',
    async (nativeCode, code) => {
      const append = vi
        .fn()
        .mockImplementationOnce(() => undefined)
        .mockImplementation(() => {
          throw nativeError(nativeCode);
        });
      const createMockedSink = await mockedFileSink(append);
      const stderr = vi
        .spyOn(process.stderr, 'write')
        .mockImplementation(() => true);
      try {
        const sink = createMockedSink('/safe/log.jsonl');
        expect(() => sink('{"level":"info"}')).toThrow(
          expect.objectContaining({ code }),
        );
      } finally {
        vi.doUnmock('node:fs');
        vi.resetModules();
        stderr.mockRestore();
      }
    },
  );
});

function nativeError(code: string): NodeJS.ErrnoException {
  const error = new Error(code) as NodeJS.ErrnoException;
  error.code = code;
  return error;
}

async function mockedFileSink(appendFileSync: () => void) {
  vi.resetModules();
  vi.doMock('node:fs', () => ({ appendFileSync }));
  return (await import('./file-sink.js')).createFileSink;
}
