// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { HistoryEntry } from '@music-downloader/shared';
import type { DesktopApi } from '../contract/desktop-api.js';
import { success, failure } from '../contract/result.js';
import { History } from './History.js';
afterEach(cleanup);
const entry = (
  jobId: string,
  kind: HistoryEntry['source']['kind'],
  title: string,
  replayAvailable = true,
): HistoryEntry => ({
  jobId,
  source: { provider: 'mock', kind, id: jobId },
  title,
  artists: ['Автор'],
  count: 2,
  bytes: null,
  completedAt: new Date().toISOString(),
  replayAvailable,
  replayReason: replayAvailable
    ? null
    : 'Исходные настройки старого задания неизвестны.',
});
function fixture() {
  let entries = [
    entry('new', 'album', 'Новый альбом'),
    entry('old', 'playlist', 'Старый плейлист', false),
  ];
  const api = {
    history: vi.fn(async () => success('history', entries)),
    replay: vi.fn(async () => failure('replay', 'OUTCOME_UNKNOWN')),
    hideHistory: vi.fn(async ({ jobId }: { jobId: string }) => {
      entries = entries.filter((item) => item.jobId !== jobId);
      return success('hideHistory', null);
    }),
    showItemInFolder: vi.fn(async () => success('showItemInFolder', null)),
  };
  return { api: api as unknown as DesktopApi, mocks: api };
}
it('REQ-051: поиск metadata и фильтр типа меняют список, legacy replay объяснён и выключен', async () => {
  const { api } = fixture();
  render(<History api={api} onReplay={() => undefined} />);
  await screen.findByText('Новый альбом');
  expect(
    (
      within(screen.getByText('Старый плейлист').closest('tr')!).getByRole(
        'button',
        { name: 'Скачать снова' },
      ) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(
    screen.getByText('Исходные настройки старого задания неизвестны.'),
  ).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Поиск в истории'), {
    target: { value: 'Новый' },
  });
  expect(screen.queryByText('Старый плейлист')).toBeNull();
  fireEvent.change(screen.getByLabelText('Поиск в истории'), {
    target: { value: '' },
  });
  fireEvent.mouseDown(screen.getByLabelText('Тип'));
  fireEvent.click(within(screen.getByRole('listbox')).getByText('Плейлист'));
  expect(screen.queryByText('Новый альбом')).toBeNull();
});
it('REQ-051/ADR-016: действия передают только jobId, unknown replay перечитывает историю без повторного create', async () => {
  const { api, mocks } = fixture();
  const onReplay = vi.fn();
  render(<History api={api} onReplay={onReplay} />);
  const row = (await screen.findByText('Новый альбом')).closest('tr')!;
  fireEvent.click(within(row).getByRole('button', { name: 'Открыть папку' }));
  await waitFor(() =>
    expect(mocks.showItemInFolder).toHaveBeenCalledWith({ jobId: 'new' }),
  );
  await waitFor(() =>
    expect(
      (
        within(row).getByRole('button', {
          name: 'Скачать снова',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
  fireEvent.click(within(row).getByRole('button', { name: 'Скачать снова' }));
  await screen.findByText(/Исход операции неизвестен/);
  expect(mocks.replay).toHaveBeenCalledOnce();
  expect(onReplay).toHaveBeenCalledExactlyOnceWith(false);
  fireEvent.click(
    within(row).getByRole('button', { name: 'Убрать из истории' }),
  );
  await waitFor(() => expect(screen.queryByText('Новый альбом')).toBeNull());
  expect(mocks.hideHistory).toHaveBeenCalledWith({ jobId: 'new' });
  expect(mocks.history.mock.calls.length).toBeGreaterThan(1);
});
