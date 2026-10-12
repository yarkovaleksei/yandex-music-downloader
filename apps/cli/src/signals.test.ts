import { describe, expect, it, vi } from 'vitest';
import type { ApplicationApi } from '@music-downloader/application/contracts';
import { installPauseOnSigint } from './signals.js';
describe('SIGINT', () => {
  it('откладывает pause до подтверждённого запуска и не дублирует запрос', async () => {
    let listener: (() => void) | undefined;
    const pause = vi.fn(async () => ({
      schemaVersion: 1,
      kind: 'result' as const,
      command: 'pause',
      data: {
        jobId: 'job',
        source: { provider: 'mock', kind: 'track' as const, id: '1' },
        status: 'paused' as const,
        tracks: [],
      },
    }));
    let started = false;
    const controller = installPauseOnSigint(
      {
        on: (_, callback) => {
          listener = callback;
        },
        off: () => undefined,
      },
      {
        pause,
        getJob: async () => ({
          schemaVersion: 1,
          kind: 'result',
          command: 'getJob',
          data: {
            jobId: 'job',
            source: { provider: 'mock', kind: 'track' },
            status: 'queued',
            tracks: [],
          },
        }),
      } as unknown as ApplicationApi,
      () => 'job',
      () => started,
    );
    listener!();
    expect(pause).not.toHaveBeenCalled();
    started = true;
    controller.notifyStarted();
    controller.notifyStarted();
    await Promise.resolve();
    expect(pause).toHaveBeenCalledTimes(1);
  });
});
