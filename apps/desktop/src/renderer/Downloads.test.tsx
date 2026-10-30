// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { JobSnapshot } from '@music-downloader/shared';
import type { DesktopApi } from '../contract/desktop-api.js';
import { failure, success } from '../contract/result.js';
import { Downloads } from './Downloads.js';
import { useDownloads } from './useDownloads.js';
afterEach(cleanup);
const job = (jobId: string, status: JobSnapshot['status']): JobSnapshot => ({
  jobId,
  status,
  source: { provider: 'mock', kind: 'playlist', id: jobId },
  publicUrl: `https://music.yandex.ru/playlists/${jobId}`,
  tracks: [{ trackKey: '1', status: 'downloading' }],
});

it('REQ-057: заголовок свёрнутого задания содержит ссылку и управление, действия не раскрывают подробности', async () => {
  const current = job('one', 'running');
  const command = vi.fn(async () => {});
  const openSource = vi.fn(async () => {});
  render(
    <Downloads
      jobs={[current]}
      progress={{}}
      trackProgress={{}}
      pending={{}}
      connected
      command={command}
      batch={vi.fn()}
      clearCompleted={vi.fn()}
      openFolder={vi.fn()}
      openSource={openSource}
    />,
  );
  const toggle = screen.getByRole('button', { name: 'Подробности one' });
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(screen.queryByText('Трек 1 · Загрузка')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Приостановить' }));
  expect(command).toHaveBeenCalledWith(current, 'pause');
  fireEvent.click(screen.getByRole('link', { name: 'one' }));
  expect(openSource).toHaveBeenCalledWith(current.publicUrl);
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(toggle);
  expect(await screen.findByText('Трек 1 · Загрузка')).toBeTruthy();
});

it('REQ-057: массовые действия выбирают допустимые состояния, частичный unknown не повторяет mutation; очистка перечитывает список', async () => {
  const jobs = [
    job('running', 'running'),
    job('queued', 'queued'),
    job('paused', 'paused'),
    job('done', 'completed'),
  ];
  const api = {
    listJobs: vi.fn(async () => success('listJobs', jobs)),
    pause: vi.fn(async ({ jobId }: { jobId: string }) =>
      jobId === 'queued'
        ? failure('pause', 'OUTCOME_UNKNOWN')
        : success('pause', jobs[0]),
    ),
    resume: vi.fn(async () => success('resume', jobs[2])),
    clearDownloads: vi.fn(async () => success('clearDownloads', 1)),
    subscribe: () => () => {},
  };
  const hook = renderHook(() => useDownloads(api as unknown as DesktopApi));
  await waitFor(() => expect(hook.result.current.jobs).toHaveLength(4));
  await act(() => hook.result.current.batch('pause'));
  expect(api.pause.mock.calls.map(([input]) => input.jobId)).toEqual([
    'running',
    'queued',
  ]);
  expect(hook.result.current.notice?.message).toContain('Не выполнено: 1');
  expect(hook.result.current.notice?.message).toContain('неизвестен');
  await act(() => hook.result.current.batch('resume'));
  expect(api.resume).toHaveBeenCalledExactlyOnceWith({ jobId: 'paused' });
  api.listJobs.mockResolvedValueOnce(success('listJobs', jobs.slice(0, 3)));
  await act(() => hook.result.current.clearCompleted());
  expect(api.clearDownloads).toHaveBeenCalledOnce();
  expect(hook.result.current.jobs).toHaveLength(3);
});

it('REQ-058: четыре вкладки используют единые состояния и реальные подписи; меню не раскрывает строку', async () => {
  const states = [
    'queued',
    'paused',
    'interrupted',
    'running',
    'completed',
    'cancelled',
    'failed',
    'completed_with_errors',
  ] as const;
  const jobs = states.map((status) => ({
    ...job(status, status),
    title: `Название ${status}`,
    author: 'Тестовый автор',
  }));
  const command = vi.fn();
  render(
    <Downloads
      jobs={jobs}
      progress={{}}
      trackProgress={{}}
      pending={{}}
      connected
      command={command}
      batch={vi.fn()}
      clearCompleted={vi.fn()}
      openFolder={vi.fn()}
      openSource={vi.fn()}
    />,
  );
  for (const [label, count] of [
    ['Очередь (3)', 3],
    ['Активные (1)', 1],
    ['Завершённые (2)', 2],
    ['Ошибки (2)', 2],
  ] as const) {
    fireEvent.click(screen.getByRole('tab', { name: label }));
    expect(screen.getAllByRole('article')).toHaveLength(count);
  }
  const row = screen.getByRole('button', { name: 'Подробности failed' });
  fireEvent.click(
    screen.getByRole('button', { name: 'Действия Название failed' }),
  );
  expect(
    screen
      .getByRole('menuitem', { name: 'Отменить' })
      .getAttribute('aria-disabled'),
  ).toBe('true');
  expect(row.getAttribute('aria-expanded')).toBe('false');
  expect(screen.getByText('Название failed')).toBeTruthy();
});
