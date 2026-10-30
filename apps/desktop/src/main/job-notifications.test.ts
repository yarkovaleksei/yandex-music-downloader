import { expect, it, vi } from 'vitest';
import type { ApplicationResult, JobSnapshot } from '@music-downloader/shared';
import { jobNotifications } from './job-notifications.js';
it('main уведомляет по snapshot и не выдаёт частичный результат за успех', async () => {
  const show = vi.fn();
  let status: JobSnapshot['status'] = 'completed_with_errors';
  const read = vi.fn(
    async (): Promise<ApplicationResult<JobSnapshot | null>> => ({
      schemaVersion: 1,
      kind: 'result',
      command: 'getJob',
      data: {
        jobId: 'j',
        source: { provider: 'mock', kind: 'track', id: '1' },
        status,
        tracks: [],
      },
    }),
  );
  const notify = jobNotifications(read, show);
  const event = {
    schemaVersion: 1 as const,
    event: 'job.completed' as const,
    jobId: 'j',
    seq: 1,
    durationMs: 0,
  };
  await notify(event);
  await notify(event);
  expect(show).toHaveBeenCalledTimes(1);
  expect(show.mock.calls[0]?.[0]).toBe('Ошибка загрузки');
  status = 'cancelled';
  await notify(event);
  expect(show).toHaveBeenCalledTimes(2);
  expect(show.mock.calls[1]?.[0]).toBe('Загрузка отменена');
  status = 'completed';
  await notify(event);
  expect(show.mock.calls[2]?.[0]).toBe('Загрузка завершена');
});

// F-001: штатная ошибочная пауза не сопровождается job.completed.
it.each(['AUTH_REQUIRED', 'DISK_FULL'])(
  'main уведомляет об ошибочной паузе %s из существующих ответов без дополнительных запросов',
  async (pauseReason) => {
    const show = vi.fn();
    const read = vi.fn(
      async (): Promise<ApplicationResult<JobSnapshot | null>> => ({
        schemaVersion: 1,
        kind: 'result',
        command: 'getJob',
        data: null,
      }),
    );
    const notify = jobNotifications(read, show);
    const paused: JobSnapshot = {
      jobId: 'paused-job',
      source: { provider: 'mock', kind: 'track', id: '1' },
      status: 'paused',
      pauseReason,
      tracks: [],
    };
    const result = (data: unknown) => ({
      schemaVersion: 1,
      kind: 'result',
      command: 'mock',
      data,
    });
    for (const method of [
      'createDownload',
      'resume',
      'retry',
      'getJob',
    ] as const)
      notify.observeResult(method, result(paused));
    notify.observeResult('listJobs', result([paused]));
    await notify({
      schemaVersion: 1,
      event: 'track.progress',
      jobId: paused.jobId,
      trackKey: '1',
      seq: 1,
      payload: { bytes: 100 },
    });
    expect(show).toHaveBeenCalledTimes(1);
    expect(show.mock.calls[0]?.[0]).toBe('Ошибка загрузки');
    expect(show.mock.calls[0]?.[1]).toContain(
      pauseReason === 'AUTH_REQUIRED' ? 'повторный вход' : 'место на диске',
    );
    expect(read).not.toHaveBeenCalled();
    notify.beginResume(paused.jobId);
    notify.observeResult('resume', result(paused));
    expect(show).toHaveBeenCalledTimes(2);
    notify.observeResult(
      'getJob',
      result({ ...paused, pauseReason: undefined }),
    );
    notify.observeResult('getJob', result({ ...paused, status: 'cancelled' }));
    expect(show).toHaveBeenCalledTimes(2);
  },
);

it.each(['completed', 'completed_with_errors', 'failed', 'cancelled'] as const)(
  'legacy true не открывает папку, уведомления сохранены: %s',
  async (status) => {
    const show = vi.fn();
    let enabled = false;
    const read = vi.fn(
      async (): Promise<ApplicationResult<JobSnapshot | null>> => ({
        schemaVersion: 1,
        kind: 'result',
        command: 'getJob',
        data: {
          jobId: 'original',
          source: { provider: 'mock', kind: 'album', id: '1' },
          status,
          tracks: [],
          ...{ openFolderOnComplete: enabled },
        },
      }),
    );
    const notify = jobNotifications(read, show);
    notify.observeResult('listJobs', {
      schemaVersion: 1,
      kind: 'result',
      command: 'listJobs',
      data: [(await read()).data],
    });
    const event = {
      schemaVersion: 1 as const,
      event: 'job.completed' as const,
      jobId: 'original',
      seq: 1,
      durationMs: 0,
    };
    await notify(event);
    enabled = true;
    await notify({ ...event, seq: 2 });
    await notify({ ...event, seq: 2 });
    expect(show).toHaveBeenCalledTimes(2);
  },
);

it('REQ-058: подтверждённая отмена уведомляет из ответа, без job.completed и повторов от списка', () => {
  const show = vi.fn();
  const read = vi.fn();
  const notify = jobNotifications(read, show);
  const data = {
    jobId: 'cancelled',
    status: 'cancelled',
    tracks: [],
    source: { provider: 'mock', kind: 'track', id: '1' },
  };
  const result = { schemaVersion: 1, kind: 'result', command: 'cancel', data };
  notify.observeResult('cancel', result);
  notify.observeResult('cancel', result);
  notify.observeResult('listJobs', { ...result, data: [data] });
  expect(show).toHaveBeenCalledExactlyOnceWith(
    'Загрузка отменена',
    'Загрузка остановлена пользователем.',
  );
  expect(read).not.toHaveBeenCalled();
});
