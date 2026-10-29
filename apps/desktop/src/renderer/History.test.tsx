// @vitest-environment jsdom
import {
  act,
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
    historyArtwork: vi.fn(async () => success('historyArtwork', null)),
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
    screen.queryByText('Исходные настройки старого задания неизвестны.'),
  ).toBeNull();
  fireEvent.keyDown(document, { key: 'Tab' });
  act(() =>
    screen
      .getByLabelText(
        'Скачать снова: Исходные настройки старого задания неизвестны.',
      )
      .focus(),
  );
  expect(await screen.findByRole('tooltip')).toBeTruthy();
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

it('REQ-057: название открывает публичный источник, обложка доступна, playlist не перечисляет исполнителей', async () => {
  const value = {
    ...entry('playlist', 'playlist', 'Мой плейлист'),
    publicUrl: 'https://music.yandex.ru/playlists/fixture',
    artwork: { mimeType: 'image/png', base64: 'aW1hZ2U=' },
    artists: ['Первый', 'Второй', 'Третий'],
  };
  const api = {
    history: async () => success('history', [value]),
    openExternal: vi.fn(async () => success('openExternal', null)),
  };
  const view = render(
    <History api={api as unknown as DesktopApi} onReplay={() => {}} />,
  );
  const link = await screen.findByRole('link', { name: 'Мой плейлист' });
  fireEvent.click(link);
  expect(api.openExternal).toHaveBeenCalledWith({ url: value.publicUrl });
  expect(view.container.querySelector('img')?.getAttribute('src')).toBe(
    'data:image/png;base64,aW1hZ2U=',
  );
  expect(screen.queryByText(/Первый/)).toBeNull();
});

it('F-001 STEP-056: строки и действия доступны до обложки, поздний результат не возвращает скрытую запись', async () => {
  let entries = [entry('pending', 'album', 'Локальный альбом')];
  let complete!: (
    value: ReturnType<typeof success<{ mimeType: string; base64: string }>>,
  ) => void;
  const image = new Promise<
    ReturnType<typeof success<{ mimeType: string; base64: string }>>
  >((resolve) => {
    complete = resolve;
  });
  const api = {
    history: vi.fn(async () => success('history', entries)),
    historyArtwork: vi.fn(() => image),
    hideHistory: vi.fn(async () => {
      entries = [];
      return success('hideHistory', null);
    }),
  };
  const view = render(
    <History api={api as unknown as DesktopApi} onReplay={() => {}} />,
  );
  const row = (await screen.findByText('Локальный альбом')).closest('tr')!;
  expect(api.historyArtwork).toHaveBeenCalledExactlyOnceWith({
    jobId: 'pending',
  });
  expect(view.container.querySelector('img')).toBeNull();
  fireEvent.click(
    within(row).getByRole('button', { name: 'Убрать из истории' }),
  );
  await waitFor(() =>
    expect(screen.queryByText('Локальный альбом')).toBeNull(),
  );
  await act(async () => {
    complete(
      success('historyArtwork', { mimeType: 'image/png', base64: 'aW1hZ2U=' }),
    );
  });
  expect(screen.queryByText('Локальный альбом')).toBeNull();
});

it('F-001 STEP-056: независимая обложка дополняет видимую строку безопасным DTO, отказ сохраняет fallback', async () => {
  let complete!: (
    value: ReturnType<typeof success<{ mimeType: string; base64: string }>>,
  ) => void;
  const image = new Promise<
    ReturnType<typeof success<{ mimeType: string; base64: string }>>
  >((resolve) => {
    complete = resolve;
  });
  const api = {
    history: async () =>
      success('history', [
        entry('cover', 'album', 'Альбом с обложкой'),
        entry('offline', 'album', 'Альбом без сети'),
      ]),
    historyArtwork: vi.fn(({ jobId }: { jobId: string }) =>
      jobId === 'cover'
        ? image
        : Promise.reject(new Error('Синтетический отказ сети')),
    ),
  };
  const view = render(
    <History api={api as unknown as DesktopApi} onReplay={() => {}} />,
  );
  await screen.findByText('Альбом с обложкой');
  expect(screen.getByText('Альбом без сети')).toBeTruthy();
  expect(view.container.querySelectorAll('img')).toHaveLength(0);
  await act(async () => {
    complete(
      success('historyArtwork', { mimeType: 'image/png', base64: 'aW1hZ2U=' }),
    );
  });
  expect(view.container.querySelectorAll('img')).toHaveLength(1);
  expect(screen.getByText('Альбом без сети')).toBeTruthy();
});
