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
    jobFolderAvailability: vi.fn(async () =>
      success('jobFolderAvailability', { available: true }),
    ),
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
    jobFolderAvailability: vi.fn(async () =>
      success('jobFolderAvailability', { available: true }),
    ),
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

it('строки и действия доступны до обложки, поздний результат не возвращает скрытую запись', async () => {
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
    jobFolderAvailability: vi.fn(async () =>
      success('jobFolderAvailability', { available: true }),
    ),
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

it('независимая обложка дополняет видимую строку безопасным DTO, отказ сохраняет fallback', async () => {
  let complete!: (
    value: ReturnType<typeof success<{ mimeType: string; base64: string }>>,
  ) => void;
  const image = new Promise<
    ReturnType<typeof success<{ mimeType: string; base64: string }>>
  >((resolve) => {
    complete = resolve;
  });
  const api = {
    jobFolderAvailability: vi.fn(async () =>
      success('jobFolderAvailability', { available: true }),
    ),
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

it('REQ-058: сортировка стабильна, неизвестные размеры в конце, календарь включает обе границы местного дня', async () => {
  const first = {
    ...entry('a', 'track', 'Альфа'),
    completedAt: new Date(2026, 9, 28, 0, 0).toISOString(),
    bytes: 100,
  };
  const last = {
    ...entry('b', 'album', 'Бета'),
    completedAt: new Date(2026, 9, 28, 23, 59, 59, 999).toISOString(),
    bytes: 200,
  };
  const unknown = {
    ...entry('c', 'playlist', 'Гамма'),
    completedAt: new Date(2026, 9, 29, 0, 0).toISOString(),
  };
  const api = {
    jobFolderAvailability: vi.fn(async () =>
      success('jobFolderAvailability', { available: true }),
    ),
    history: async () => success('history', [last, unknown, first]),
    historyArtwork: async () => success('historyArtwork', null),
  } as unknown as DesktopApi;
  render(<History api={api} onReplay={() => {}} />);
  await screen.findByText('Альфа');
  const titles = () =>
    screen
      .getAllByRole('row')
      .slice(1)
      .map((row) => row.textContent);
  fireEvent.click(
    screen.getByText('Название', { selector: '.MuiTableSortLabel-root' }),
  );
  expect(titles()[0]).toContain('Альфа');
  fireEvent.click(
    screen.getByText('Название', { selector: '.MuiTableSortLabel-root' }),
  );
  expect(titles()[0]).toContain('Гамма');
  fireEvent.click(
    screen.getByText('Размер', { selector: '.MuiTableSortLabel-root' }),
  );
  expect(titles().at(-1)).toContain('Гамма');
  fireEvent.click(
    screen.getByText('Размер', { selector: '.MuiTableSortLabel-root' }),
  );
  expect(titles().at(-1)).toContain('Гамма');
  // Даты — часть «Периода»: без «Выбрать даты» полей нет и два фильтра не спорят.
  expect(screen.queryByLabelText('Дата с')).toBeNull();
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Период' }));
  fireEvent.click(
    within(screen.getByRole('listbox')).getByText('Выбрать даты'),
  );
  fireEvent.change(screen.getByLabelText('Дата с'), {
    target: { value: '2026-10-28' },
  });
  fireEvent.change(screen.getByLabelText('Дата по'), {
    target: { value: '2026-10-28' },
  });
  expect(titles()).toHaveLength(2);
  expect(screen.queryByText('Гамма')).toBeNull();
  expect(screen.getByText(/00:00/)).toBeTruthy();
  expect(screen.getByText(/23:59/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Дата с'), {
    target: { value: '2026-10-29' },
  });
  expect(screen.getByText('Дата окончания раньше начала')).toBeTruthy();
  expect(screen.getByText('Пока ничего не найдено')).toBeTruthy();
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Период' }));
  fireEvent.click(
    within(screen.getByRole('listbox')).getByText('За всё время'),
  );
  expect(screen.queryByLabelText('Дата с')).toBeNull();
  expect(titles()).toHaveLength(3);
});

it('deferred availability не блокирует фильтр, открытие локально и не перечитывает обложки', async () => {
  const { api, mocks } = fixture();
  let complete!: (
    value: ReturnType<typeof success<{ available: boolean; reason?: string }>>,
  ) => void;
  const availability = new Promise<
    ReturnType<typeof success<{ available: boolean; reason?: string }>>
  >((resolve) => {
    complete = resolve;
  });
  mocks.jobFolderAvailability.mockImplementationOnce(() => availability);
  let finishOpen!: (value: ReturnType<typeof failure>) => void;
  mocks.showItemInFolder.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishOpen = resolve;
      }),
  );
  render(<History api={api} onReplay={() => {}} />);
  const row = (await screen.findByText('Новый альбом')).closest('tr')!;
  expect(
    (
      within(row).getByRole('button', {
        name: 'Открыть папку',
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  fireEvent.change(screen.getByLabelText('Поиск в истории'), {
    target: { value: 'Новый' },
  });
  expect(screen.queryByText('Старый плейлист')).toBeNull();
  await act(async () =>
    complete(success('jobFolderAvailability', { available: true })),
  );
  fireEvent.change(screen.getByLabelText('Поиск в истории'), {
    target: { value: '' },
  });
  fireEvent.click(within(row).getByRole('button', { name: 'Открыть папку' }));
  expect(
    (
      within(screen.getByText('Старый плейлист').closest('tr')!).getByRole(
        'button',
        { name: 'Открыть папку' },
      ) as HTMLButtonElement
    ).disabled,
  ).toBe(false);
  await act(async () =>
    finishOpen(failure('showItemInFolder', 'PERMISSION_DENIED')),
  );
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(mocks.history).toHaveBeenCalledTimes(1);
  expect(mocks.historyArtwork).toHaveBeenCalledTimes(2);
});

it('missing folder disabled и имеет доступное объяснение', async () => {
  const { api, mocks } = fixture();
  mocks.jobFolderAvailability.mockResolvedValue(
    success('jobFolderAvailability', {
      available: false,
      reason: 'Папка удалена.',
    }),
  );
  render(<History api={api} onReplay={() => {}} />);
  const row = (await screen.findByText('Новый альбом')).closest('tr')!;
  await waitFor(() =>
    expect(
      within(row)
        .getByRole('button', { name: 'Открыть папку' })
        .parentElement?.getAttribute('title'),
    ).toBe('Папка удалена.'),
  );
  expect(
    (
      within(row).getByRole('button', {
        name: 'Открыть папку',
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
});

it('длинный список исполнителей сокращён, но полностью доступен в подсказке и поиске', async () => {
  const { api } = fixture();
  const artists = ['Первый', 'Второй', 'Третий', 'Четвёртый', 'Пятый'];
  render(
    <History
      api={{
        ...api,
        history: async () =>
          success('history', [
            { ...entry('many', 'album', 'Сборник'), artists },
          ]),
      }}
      onReplay={() => {}}
    />,
  );
  const summary = await screen.findByText('Первый, Второй, Третий и ещё 2');
  expect(screen.queryByText(artists.join(', '))).toBeNull();
  fireEvent.mouseOver(summary);
  expect((await screen.findByRole('tooltip')).textContent).toBe(
    artists.join(', '),
  );
  fireEvent.mouseLeave(summary);
  fireEvent.change(screen.getByLabelText('Поиск в истории'), {
    target: { value: 'Пятый' },
  });
  expect(screen.getByText('Сборник')).toBeTruthy();
});

it('общая очистка требует подтверждения и убирает всю историю независимо от фильтра', async () => {
  const { api, mocks } = fixture();
  render(<History api={api} onReplay={() => {}} />);
  const clear = screen.getByRole('button', { name: 'Очистить историю' });
  expect(clear.hasAttribute('disabled')).toBe(true);
  await screen.findByText('Новый альбом');
  fireEvent.change(screen.getByLabelText('Поиск в истории'), {
    target: { value: 'Новый' },
  });
  expect(screen.queryByText('Старый плейлист')).toBeNull();
  fireEvent.click(clear);
  let dialog = screen.getByRole('dialog');
  expect(dialog.textContent).toContain('Скачанные файлы останутся на диске.');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Отмена' }));
  expect(mocks.hideHistory).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  fireEvent.click(clear);
  dialog = screen.getByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Очистить' }));
  await waitFor(() => expect(mocks.hideHistory).toHaveBeenCalledTimes(2));
  expect(mocks.hideHistory).toHaveBeenNthCalledWith(1, { jobId: 'new' });
  expect(mocks.hideHistory).toHaveBeenNthCalledWith(2, { jobId: 'old' });
  await waitFor(() => expect(clear.hasAttribute('disabled')).toBe(true));
  fireEvent.change(screen.getByLabelText('Поиск в истории'), {
    target: { value: '' },
  });
  expect(screen.queryByText('Новый альбом')).toBeNull();
  expect(screen.queryByText('Старый плейлист')).toBeNull();
});
