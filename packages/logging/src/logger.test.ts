import { describe, expect, it, vi } from 'vitest';
import { loggingPackage } from './index.js';
import { createLogger } from './logger.js';

describe('createLogger', () => {
  it('пишет JSON info по умолчанию и не включает debug/trace', () => {
    const sink = vi.fn();
    const logger = createLogger({
      sink,
      clock: () => new Date('2026-10-09T00:00:00.000Z'),
    });
    logger.debug('скрыто');
    logger.trace('скрыто');
    logger.info('готово');

    expect(sink).toHaveBeenCalledTimes(1);
    expect(JSON.parse(sink.mock.calls[0]?.[0] ?? '')).toEqual({
      level: 'info',
      time: '2026-10-09T00:00:00.000Z',
      message: 'готово',
      context: {},
    });
  });

  it('включает debug и trace при соответствующем уровне', () => {
    const sink = vi.fn();
    const logger = createLogger({ level: 'trace', sink });
    logger.debug('debug');
    logger.trace('trace');

    expect(sink).toHaveBeenCalledTimes(2);
  });

  it('наследует job-контекст без изменения родителя и очищает запись до sink', () => {
    const sink = vi.fn();
    const parent = createLogger({
      sink,
      context: { correlationId: 'correlation-1' },
    });
    const child = parent.child({ jobId: 'job-1', trackId: 'track-1' });
    child.info('загрузка', {
      token: 'known-token-789',
      url: 'https://cdn.example.test/a?signature=known-token-789',
    });
    parent.info('родитель');

    const childRecord = JSON.parse(sink.mock.calls[0]?.[0] ?? '');
    const parentRecord = JSON.parse(sink.mock.calls[1]?.[0] ?? '');
    expect(childRecord.context).toEqual({
      correlationId: 'correlation-1',
      jobId: 'job-1',
      trackId: 'track-1',
    });
    expect(parentRecord.context).toEqual({ correlationId: 'correlation-1' });
    expect(sink.mock.calls[0]?.[0]).not.toContain('known-token-789');
    expect(sink.mock.calls[0]?.[0]).not.toContain('?signature');
  });

  it('по умолчанию направляет записи в stderr', () => {
    const write = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
    createLogger().info('диагностика');

    expect(write).toHaveBeenCalledWith(
      expect.stringContaining('"диагностика"'),
    );
    write.mockRestore();
  });

  it('сохраняет marker пакета', () => {
    expect(loggingPackage).toBe('@music-downloader/logging');
  });
});
