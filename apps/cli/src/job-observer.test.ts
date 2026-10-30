import { describe, expect, it, vi } from 'vitest';
import type { ApplicationApi } from '@music-downloader/application/contracts';
import { observeJob } from './job-observer.js';

const snapshot = (status: string) => ({
  jobId: 'remote',
  source: { provider: 'mock', kind: 'track' as const, id: '1' },
  status,
  tracks: [],
});
describe('наблюдение удалённого job', () => {
  it('дожидается terminal snapshot без событий текущего процесса', async () => {
    const getJob = vi
      .fn()
      .mockResolvedValueOnce({
        schemaVersion: 1,
        kind: 'result',
        command: 'getJob',
        data: snapshot('queued'),
      })
      .mockResolvedValueOnce({
        schemaVersion: 1,
        kind: 'result',
        command: 'getJob',
        data: snapshot('running'),
      })
      .mockResolvedValueOnce({
        schemaVersion: 1,
        kind: 'result',
        command: 'getJob',
        data: snapshot('completed'),
      });
    await expect(
      observeJob({ getJob } as unknown as ApplicationApi, 'remote'),
    ).resolves.toMatchObject({ kind: 'result', data: { status: 'completed' } });
    expect(getJob).toHaveBeenCalledTimes(3);
  });
  it('не превращает ошибку или исчезновение job в успех', async () => {
    await expect(
      observeJob(
        {
          getJob: async () => ({
            schemaVersion: 1,
            kind: 'error',
            command: 'getJob',
            error: {
              code: 'DOWNLOAD_ERROR',
              message: 'Ошибка',
              retryable: false,
            },
          }),
        } as unknown as ApplicationApi,
        'remote',
      ),
    ).resolves.toMatchObject({
      kind: 'error',
      error: { code: 'DOWNLOAD_ERROR' },
    });
    await expect(
      observeJob(
        {
          getJob: async () => ({
            schemaVersion: 1,
            kind: 'result',
            command: 'getJob',
            data: null,
          }),
        } as unknown as ApplicationApi,
        'remote',
      ),
    ).resolves.toMatchObject({
      kind: 'error',
      error: { details: { reason: 'JOB_NOT_FOUND' } },
    });
  });
});
