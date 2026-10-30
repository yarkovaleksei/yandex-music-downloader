// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type {
  ApplicationResult,
  DesktopSettings,
  JobSnapshot,
  MediaReference,
  PreviewDto,
} from '@music-downloader/shared';
import type { DesktopApi, DesktopEvent } from '../contract/desktop-api.js';
import { App } from './App.js';
import { useDownloads } from './useDownloads.js';

const defaultDesktopSettings: DesktopSettings = {
  outputDirectory: null,
  quality: 'best',
  concurrency: 4,
  naming: 'collection',
  overwrite: false,
  ffmpegPath: null,
  logging: 'info',
};
const result = <T,>(data: T): ApplicationResult<T> => ({
  schemaVersion: 1,
  kind: 'result',
  command: 'mock',
  data,
});
const source: MediaReference = { provider: 'mock', kind: 'playlist', id: '1' };
const job = (status: JobSnapshot['status'] = 'running'): JobSnapshot => ({
  jobId: 'j',
  source,
  status,
  tracks: [
    { trackKey: '1:track', status: 'downloading' },
    {
      trackKey: '2:track',
      status: 'failed',
      resultPath: '/synthetic/track.mp3',
    },
  ],
});
function mockApi(kind: MediaReference['kind'] = 'playlist') {
  let snapshot = job();
  const listeners = new Set<(event: DesktopEvent) => void>();
  const preview: PreviewDto = {
    source: { ...source, kind },
    kind,
    title: 'Синтетическая коллекция',
    author: 'Тестовый автор',
    tracks:
      kind === 'playlist'
        ? [
            {
              position: 1,
              track: {
                id: 'track',
                title: 'Песня',
                artists: [{ name: 'Исполнитель' }],
                availability: 'available',
              },
            },
          ]
        : [
            {
              id: 'track',
              title: 'Песня',
              artists: [{ name: 'Исполнитель' }],
              availability: 'available',
            },
          ],
    qualities: [
      { preference: 'best', available: 1, total: 1 },
      { preference: 'lossless', available: 0, total: 1 },
      { preference: 'high', available: 1, total: 1 },
    ],
  };
  const api = {
    appInfo: vi.fn(async () => result({ version: '1.2.3', dev: true })),
    getSettings: vi.fn(async () => result(defaultDesktopSettings)),
    accountAvatar: vi.fn(async () => result(null)),
    account: vi.fn(async () => result(null)),
    authenticate: vi.fn(async () =>
      result({ id: 'a', displayName: 'Пользователь' }),
    ),
    logout: vi.fn(async () => result(null)),
    resolve: vi.fn(async () => result(preview.source)),
    preview: vi.fn(async () => result(preview)),
    selectDirectory: vi.fn(async () =>
      result({
        directoryRef: 'dir:00000000-0000-0000-0000-000000000001',
        displayPath: '/synthetic/music',
      }),
    ),
    createDownload: vi.fn(async () => result(snapshot)),
    jobFolderAvailability: vi.fn(async () => result({ available: true })),
    historyArtwork: vi.fn(async () => result(null)),
    listJobs: vi.fn(async () => result([] as readonly JobSnapshot[])),
    getJob: vi.fn(async () => result(snapshot)),
    getDownload: vi.fn(async () => result(snapshot)),
    pause: vi.fn(async () => result(snapshot)),
    resume: vi.fn(async () => result(snapshot)),
    cancel: vi.fn(async () => result(snapshot)),
    retry: vi.fn(async () => result(snapshot)),
    showItemInFolder: vi.fn(async () => result(null)),
    subscribe: (listener: (event: DesktopEvent) => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return {
    api: api as unknown as DesktopApi,
    mocks: api,
    preview,
    setJob: (next: JobSnapshot) => {
      snapshot = next;
    },
    emit: (event: DesktopEvent) => {
      act(() => {
        for (const listener of listeners) listener(event);
      });
    },
    listeners,
  };
}
afterEach(cleanup);
async function analyze() {
  fireEvent.change(screen.getByLabelText('Ссылка на музыку'), {
    target: { value: 'https://music.yandex.ru/album/1' },
  });
  fireEvent.click(screen.getByText('Анализировать'));
  await screen.findByText('Синтетическая коллекция');
}
it.each(['track', 'album', 'playlist'] as const)(
  'preview %s показывает поля и не начинает загрузку до явного действия',
  async (kind) => {
    const { api, mocks } = mockApi(kind);
    render(<App api={api} />);
    await analyze();
    expect(screen.getByText('Автор: Тестовый автор')).toBeTruthy();
    expect(screen.getByText('Объём не определён')).toBeTruthy();
    expect(screen.getByText('Исполнитель', { selector: 'td' })).toBeTruthy();
    expect(mocks.createDownload).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Качество: Лучшее доступное'));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByText(/Без потерь/)).toBeNull();
    fireEvent.click(within(dialog).getByLabelText('Высокое · 1 / 1 трек'));
    fireEvent.click(within(dialog).getByText('Применить'));
    fireEvent.click(screen.getByText('Выбрать папку'));
    await screen.findByText(/Папка: \/synthetic\/music/);
    mocks.selectDirectory.mockResolvedValueOnce(result(null) as never);
    fireEvent.click(screen.getByText('Выбрать папку'));
    await waitFor(() => expect(mocks.selectDirectory).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByText('Добавить в загрузки'));
    await waitFor(() =>
      expect(mocks.createDownload).toHaveBeenCalledWith({
        source: { ...source, kind },
        quality: 'high',
        directoryRef: 'dir:00000000-0000-0000-0000-000000000001',
      }),
    );
  },
);
it('unsupported URL даёт локальную ошибку, смена URL убирает старый preview', async () => {
  const { api, mocks } = mockApi();
  render(<App api={api} />);
  await analyze();
  fireEvent.change(screen.getByLabelText('Ссылка на музыку'), {
    target: { value: 'https://unsupported.invalid' },
  });
  expect(screen.queryByText('Синтетическая коллекция')).toBeNull();
  mocks.resolve.mockResolvedValueOnce({
    schemaVersion: 1,
    kind: 'error',
    command: 'resolve',
    error: {
      code: 'UNSUPPORTED_URL',
      message: 'Ссылка не поддерживается',
      retryable: false,
    },
  } as never);
  fireEvent.click(screen.getByText('Анализировать'));
  await screen.findByText('Ссылка не поддерживается');
  expect(mocks.createDownload).not.toHaveBeenCalled();
});
it('события показывают job и позиционный прогресс до завершения createDownload', async () => {
  const mock = mockApi();
  let finish!: (value: ApplicationResult<JobSnapshot>) => void;
  mock.mocks.createDownload.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = render(<App api={mock.api} />);
  await analyze();
  fireEvent.click(screen.getByText('Выбрать папку'));
  await screen.findByText(/Папка:/);
  fireEvent.click(screen.getByText('Добавить в загрузки'));
  mock.emit({
    schemaVersion: 1,
    event: 'job.progress',
    jobId: 'j',
    seq: 1,
    payload: { completed: 1, total: 2, fraction: 0.5 },
  });
  mock.emit({
    schemaVersion: 1,
    event: 'track.progress',
    jobId: 'j',
    trackKey: '1:track',
    seq: 2,
    payload: { bytes: 100, fraction: 0.25 },
  });
  await screen.findByText('1 / 2 трека · 50%');
  fireEvent.click(screen.getByRole('button', { name: 'Подробности 1' }));
  expect(screen.getByText(/Трек 1 · Загрузка · 25%/)).toBeTruthy();
  expect(screen.getByText(/Трек 2 · Ошибка/)).toBeTruthy();
  expect(screen.queryByText(/Скорость:/)).toBeNull();
  expect(screen.queryByText(/Осталось:/)).toBeNull();
  mock.emit({
    schemaVersion: 1,
    event: 'track.progress',
    jobId: 'j',
    trackKey: '1:track',
    seq: 3,
    payload: { bytes: 200, fraction: 0.5, speed: 1048576, eta: 2000 },
  });
  await screen.findByText('Скорость: 1.0 МБ/с');
  await screen.findByText('Осталось: 2 с');
  mock.setJob({
    ...job('completed_with_errors'),
    tracks: [
      { trackKey: '1:track', status: 'completed' },
      { trackKey: '2:track', status: 'failed' },
    ],
  });
  mock.emit({
    schemaVersion: 1,
    event: 'job.completed',
    jobId: 'j',
    seq: 4,
    durationMs: 0,
  });
  await screen.findByText('Завершено с ошибками: коллекция 1');
  await act(async () => {
    finish(result(job('completed_with_errors')));
  });
  view.unmount();
  expect(mock.listeners.size).toBe(0);
});
it('действия меню используют ID, OUTCOME_UNKNOWN перечитывает без повтора', async () => {
  const mock = mockApi();
  mock.mocks.listJobs.mockResolvedValue(result([job()]));
  render(<App api={mock.api} />);
  fireEvent.click(await screen.findByText('Загрузки (1)'));
  for (const [label, method] of [
    ['Приостановить', 'pause'],
    ['Отменить', 'cancel'],
    ['Повторить', 'retry'],
    ['Показать в папке', 'showItemInFolder'],
  ] as const) {
    fireEvent.click(screen.getByRole('button', { name: 'Действия 1' }));
    fireEvent.click(screen.getByRole('menuitem', { name: label }));
    await waitFor(() =>
      expect(mock.mocks[method]).toHaveBeenCalledWith({ jobId: 'j' }),
    );
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  }
  mock.setJob(job('paused'));
  mock.emit({ schemaVersion: 1, event: 'job.progress', jobId: 'j', seq: 1 });
  fireEvent.click(await screen.findByRole('tab', { name: 'Очередь (1)' }));
  await screen.findByRole('button', { name: 'Продолжить' });
  mock.mocks.resume.mockResolvedValueOnce({
    schemaVersion: 1,
    kind: 'error',
    command: 'resume',
    error: { code: 'OUTCOME_UNKNOWN', message: 'Неизвестно', retryable: false },
  } as never);
  fireEvent.click(screen.getByRole('button', { name: 'Продолжить' }));
  await screen.findByText(/Исход операции неизвестен/);
  expect(mock.mocks.resume).toHaveBeenCalledTimes(1);
  const reads = mock.mocks.listJobs.mock.calls.length;
  mock.emit({ event: 'host.status', connected: false });
  mock.emit({ event: 'host.status', connected: true });
  await waitFor(() =>
    expect(mock.mocks.listJobs.mock.calls.length).toBeGreaterThan(reads),
  );
  expect(mock.mocks.resume).toHaveBeenCalledTimes(1);
});
it('авторизация остаётся browser-only и ошибки/успех видны в интерфейсе', async () => {
  const mock = mockApi();
  const view = render(<App api={mock.api} />);
  fireEvent.click(screen.getByText('Войти через браузер'));
  await screen.findByText('Вы вошли как Пользователь');
  expect(mock.mocks.authenticate).toHaveBeenCalledTimes(1);
  expect(screen.queryByLabelText('Пароль')).toBeNull();
  mock.setJob(job('completed'));
  mock.emit({
    schemaVersion: 1,
    event: 'job.completed',
    jobId: 'j',
    seq: 1,
    durationMs: 0,
  });
  await screen.findByText('Завершено: коллекция 1');
  mock.setJob(job('failed'));
  mock.emit({
    schemaVersion: 1,
    event: 'job.completed',
    jobId: 'j',
    seq: 2,
    durationMs: 0,
  });
  await screen.findByText('Ошибка: коллекция 1');
  view.unmount();
});
it('частичное покрытие видно, неизвестный исход запуска перечитывает очередь без повторения', async () => {
  const mock = mockApi();
  mock.mocks.preview.mockResolvedValueOnce(
    result({
      ...mock.preview,
      tracks: [...mock.preview.tracks, ...mock.preview.tracks],
      qualities: [{ preference: 'lossless', available: 1, total: 2 }],
    }),
  );
  mock.mocks.createDownload.mockResolvedValueOnce({
    schemaVersion: 1,
    kind: 'error',
    command: 'createDownload',
    error: { code: 'OUTCOME_UNKNOWN', message: 'Неизвестно', retryable: false },
  } as never);
  render(<App api={mock.api} />);
  await analyze();
  expect(screen.getByText(/Покрытие качества: 1 \/ 2/)).toBeTruthy();
  fireEvent.click(screen.getByText('Качество: Без потерь'));
  expect(
    within(screen.getByRole('dialog')).getByLabelText(
      'Без потерь · 1 / 2 трека',
    ),
  ).toBeTruthy();
  fireEvent.click(screen.getByText('Применить'));
  fireEvent.click(screen.getByText('Выбрать папку'));
  await screen.findByText(/Папка:/);
  const reads = mock.mocks.listJobs.mock.calls.length;
  fireEvent.click(screen.getByText('Добавить в загрузки'));
  await screen.findByText(/Исход запуска неизвестен/);
  await waitFor(() =>
    expect(mock.mocks.listJobs.mock.calls.length).toBeGreaterThan(reads),
  );
  expect(mock.mocks.createDownload).toHaveBeenCalledTimes(1);
});
it('поздний начальный список не стирает job, уже полученный из события', async () => {
  const mock = mockApi();
  let finishList!: (value: ApplicationResult<readonly JobSnapshot[]>) => void;
  mock.mocks.listJobs.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishList = resolve;
      }),
  );
  render(<App api={mock.api} />);
  mock.emit({
    schemaVersion: 1,
    event: 'job.created',
    jobId: 'j',
    seq: 1,
    durationMs: 0,
  });
  await screen.findByText('Загрузки (1)');
  await act(async () => {
    finishList(result([]));
  });
  expect(screen.getByText('Загрузки (1)')).toBeTruthy();
});

// F-001: свежие list/get snapshots должны уведомлять и без terminal-события.
it.each(['AUTH_REQUIRED', 'DISK_FULL'])(
  'ошибочная пауза %s уведомляет один раз и снова после самостоятельного resume',
  async (pauseReason) => {
    const mock = mockApi();
    const paused = { ...job('paused'), pauseReason };
    mock.setJob(paused);
    mock.mocks.listJobs.mockResolvedValue(result([paused]));
    const hook = renderHook(() => useDownloads(mock.api));
    await waitFor(() =>
      expect(hook.result.current.notice?.severity).toBe('error'),
    );
    expect(hook.result.current.notice?.message).toContain(
      pauseReason === 'AUTH_REQUIRED' ? 'повторный вход' : 'место на диске',
    );
    act(() => hook.result.current.setNotice(undefined));
    await act(async () => {
      await hook.result.current.refresh();
    });
    mock.emit({
      schemaVersion: 1,
      event: 'job.created',
      jobId: 'j',
      seq: 1,
      durationMs: 0,
    });
    await waitFor(() =>
      expect(mock.mocks.getDownload).toHaveBeenCalledTimes(1),
    );
    expect(hook.result.current.notice).toBeUndefined();
    await act(async () => {
      await hook.result.current.command(paused, 'resume');
    });
    expect(hook.result.current.notice?.severity).toBe('error');
    act(() => hook.result.current.setNotice(undefined));
    await act(async () => {
      await hook.result.current.command(paused, 'retry');
    });
    expect(hook.result.current.notice).toBeUndefined();
    mock.setJob(job('paused'));
    mock.emit({
      schemaVersion: 1,
      event: 'job.created',
      jobId: 'j',
      seq: 2,
      durationMs: 0,
    });
    await waitFor(() =>
      expect(hook.result.current.jobs[0]?.pauseReason).toBeUndefined(),
    );
    mock.setJob({ ...paused, status: 'cancelled' });
    mock.emit({
      schemaVersion: 1,
      event: 'job.created',
      jobId: 'j',
      seq: 3,
      durationMs: 0,
    });
    await waitFor(() =>
      expect(hook.result.current.jobs[0]?.status).toBe('cancelled'),
    );
    expect(hook.result.current.notice).toBeUndefined();
    hook.unmount();
  },
);
it('createDownload с AUTH_REQUIRED без job.completed показывает ошибку после свежего списка', async () => {
  const mock = mockApi();
  const paused = { ...job('paused'), pauseReason: 'AUTH_REQUIRED' };
  mock.mocks.createDownload.mockImplementation(async () => {
    mock.setJob(paused);
    mock.mocks.listJobs.mockResolvedValue(result([paused]));
    return result(paused);
  });
  render(<App api={mock.api} />);
  await analyze();
  fireEvent.click(screen.getByText('Выбрать папку'));
  await screen.findByText(/Папка:/);
  fireEvent.click(screen.getByText('Добавить в загрузки'));
  await screen.findByText(
    'Загрузка приостановлена: требуется повторный вход в аккаунт.',
  );
  expect(mock.mocks.createDownload).toHaveBeenCalledTimes(1);
});

it.each(['VALIDATION_ERROR', 'OUTCOME_UNKNOWN'] as const)(
  'F-002/ADR-016: App сохраняет предупреждение replay %s на History и перечитывает очередь без повтора',
  async (code) => {
    const { api, mocks } = mockApi();
    const history = vi.fn(async () =>
      result([
        {
          jobId: 'saved',
          source,
          title: 'Сохранённый плейлист',
          artists: ['Автор'],
          count: 1,
          bytes: null,
          completedAt: '2026-01-01T00:00:00Z',
          replayAvailable: true,
          replayReason: null,
        },
      ]),
    );
    const replay = vi.fn(
      async () =>
        ({
          schemaVersion: 1,
          kind: 'error',
          command: 'replay',
          error: {
            code,
            message: 'Повторная загрузка отклонена.',
            retryable: false,
          },
        }) as const,
    );
    render(<App api={{ ...api, history, replay }} />);
    fireEvent.click(screen.getByRole('button', { name: 'История' }));
    await screen.findByText('Сохранённый плейлист');
    const refreshes = mocks.listJobs.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Скачать снова' }));
    await screen.findByText(
      code === 'OUTCOME_UNKNOWN'
        ? /Исход операции неизвестен/
        : 'Повторная загрузка отклонена.',
    );
    await waitFor(() =>
      expect(mocks.listJobs.mock.calls.length).toBeGreaterThan(refreshes),
    );
    await waitFor(() => expect(history).toHaveBeenCalledTimes(2));
    expect(
      screen.getByRole('heading', { name: 'История загрузок' }),
    ).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Загрузки' })).toBeNull();
    expect(replay).toHaveBeenCalledExactlyOnceWith({ jobId: 'saved' });
    expect(mocks.createDownload).not.toHaveBeenCalled();
  },
);

it('REQ-058: примеры заполняют ссылку без запроса; очистка сбрасывает предпросмотр', async () => {
  const mock = mockApi();
  render(<App api={mock.api} />);
  fireEvent.click(screen.getByRole('button', { name: /album\/123456/ }));
  expect(
    (screen.getByLabelText('Ссылка на музыку') as HTMLInputElement).value,
  ).toContain('album/123456');
  expect(mock.mocks.resolve).not.toHaveBeenCalled();
  await analyze();
  fireEvent.click(screen.getByRole('button', { name: 'Очистить ссылку' }));
  expect(screen.queryByText('Синтетическая коллекция')).toBeNull();
  expect(
    (screen.getByLabelText('Ссылка на музыку') as HTMLInputElement).value,
  ).toBe('');
});

it('REQ-058: черновик exact качества отменяется кнопкой, Escape и backdrop; Apply передаёт точный descriptor', async () => {
  const mock = mockApi();
  const selection = {
    codec: 'aac',
    container: 'm4a',
    bitrate: 256,
    lossless: false,
  };
  mock.mocks.preview.mockResolvedValue(
    result({
      ...mock.preview,
      variants: [
        { selection, available: 1, total: 2 },
        {
          selection: { codec: 'flac', container: 'm4a', lossless: true },
          available: 0,
          total: 2,
        },
      ],
    }),
  );
  render(<App api={mock.api} />);
  await analyze();
  const open = () =>
    fireEvent.click(
      screen.getByRole('button', { name: 'Качество: Лучшее доступное' }),
    );
  const choose = () =>
    fireEvent.click(
      within(screen.getByRole('dialog')).getByLabelText(
        'AAC / M4A · 256 кбит/с · 1 / 2 трека',
      ),
    );
  open();
  choose();
  fireEvent.click(screen.getByText('Отмена'));
  expect(
    await screen.findByRole('button', { name: 'Качество: Лучшее доступное' }),
  ).toBeTruthy();
  open();
  choose();
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  expect(
    await screen.findByRole('button', { name: 'Качество: Лучшее доступное' }),
  ).toBeTruthy();
  open();
  choose();
  fireEvent.mouseDown(document.querySelector('.MuiDialog-container')!);
  fireEvent.click(document.querySelector('.MuiDialog-container')!);
  expect(
    await screen.findByRole('button', { name: 'Качество: Лучшее доступное' }),
  ).toBeTruthy();
  open();
  expect(
    (
      within(screen.getByRole('dialog')).getByLabelText(
        /FLAC.*недоступно/,
      ) as HTMLInputElement
    ).disabled,
  ).toBe(true);
  choose();
  fireEvent.click(screen.getByText('Применить'));
  expect(
    await screen.findByRole('button', {
      name: 'Качество: AAC / M4A · 256 кбит/с',
    }),
  ).toBeTruthy();
  fireEvent.click(screen.getByText('Выбрать папку'));
  await screen.findByText(/Папка:/);
  fireEvent.click(screen.getByText('Добавить в загрузки'));
  await waitFor(() =>
    expect(mock.mocks.createDownload).toHaveBeenCalledWith(
      expect.objectContaining({ variantSelection: selection, quality: 'best' }),
    ),
  );
});

it('REQ-058: сохранённая тема восстанавливается, sidebar сохраняет остальные параметры', async () => {
  const mock = mockApi();
  let settings: DesktopSettings = {
    ...defaultDesktopSettings,
    theme: 'dark',
    writeTags: false,
    concurrency: 3,
  };
  mock.mocks.getSettings.mockImplementation(async () => result(settings));
  const saveSettings = vi.fn(async (input) => {
    settings = { ...settings, ...input };
    return result(settings);
  });
  const api = { ...mock.api, saveSettings };
  const view = render(<App api={api} />);
  await waitFor(() =>
    expect(
      (screen.getByLabelText('Тёмная тема') as HTMLInputElement).checked,
    ).toBe(true),
  );
  fireEvent.click(screen.getByLabelText('Тёмная тема'));
  await waitFor(() =>
    expect(saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        theme: 'light',
        writeTags: false,
        concurrency: 3,
      }),
    ),
  );
  view.unmount();
  render(<App api={api} />);
  await waitFor(() => expect(mock.mocks.getSettings).toHaveBeenCalledTimes(2));
  expect(
    (screen.getByLabelText('Тёмная тема') as HTMLInputElement).checked,
  ).toBe(false);
});

it('REQ-058: metadata предпросмотра показывает реальные описание, длительность, изображения и честный fallback', async () => {
  const mock = mockApi();
  const artwork = { mimeType: 'image/png', base64: 'c3ludGhldGlj' };
  mock.mocks.preview.mockResolvedValueOnce(
    result({
      ...mock.preview,
      description: 'Описание синтетической коллекции',
      durationMs: 8940000,
      artwork,
      authorArtwork: artwork,
      tracks: mock.preview.tracks.map((track) => ({ ...track, artwork })),
    }),
  );
  render(<App api={mock.api} />);
  await analyze();
  expect(screen.getByText('Описание синтетической коллекции')).toBeTruthy();
  expect(screen.getByText('Продолжительность: 2 ч 29 мин')).toBeTruthy();
  expect(
    document.querySelectorAll('img[src="data:image/png;base64,c3ludGhldGlj"]'),
  ).toHaveLength(3);
  fireEvent.click(screen.getByRole('button', { name: 'Очистить ссылку' }));
  const { source: previewSource, title, kind, tracks } = mock.preview;
  mock.mocks.preview.mockResolvedValueOnce(
    result({ source: previewSource, title, kind, tracks }),
  );
  await analyze();
  expect(screen.getByText('Описание не указано')).toBeTruthy();
  expect(screen.getByText('Продолжительность: не указана')).toBeTruthy();
  expect(screen.getByText('Автор: не указан')).toBeTruthy();
});

// F-002: отмена подтверждается командой, без вымышленного job.completed.
// @link planning/reviews/STEP-058/REVIEW-20261029T193045Z.md
it('F-002: подтверждённый cancel уведомляет один раз без job.completed', async () => {
  const mock = mockApi();
  const cancelled = job('cancelled');
  mock.mocks.listJobs.mockResolvedValue(result([job()]));
  mock.mocks.cancel.mockImplementation(async () => {
    mock.setJob(cancelled);
    return result(cancelled);
  });
  const hook = renderHook(() => useDownloads(mock.api));
  await waitFor(() => expect(hook.result.current.jobs).toHaveLength(1));
  await act(async () => {
    await hook.result.current.command(job(), 'cancel');
  });
  expect(hook.result.current.jobs[0]?.status).toBe('cancelled');
  expect(hook.result.current.notice).toEqual({
    severity: 'info',
    message: 'Отменено: коллекция 1',
  });
  act(() => hook.result.current.setNotice(undefined));
  await act(async () => {
    await hook.result.current.refresh();
  });
  expect(hook.result.current.notice).toBeUndefined();
  expect(mock.mocks.cancel).toHaveBeenCalledExactlyOnceWith({ jobId: 'j' });
  hook.unmount();
});

it('F-002: unknown cancel перечитывает cancelled snapshot без ложного подтверждения и повтора', async () => {
  const mock = mockApi();
  mock.mocks.listJobs.mockResolvedValue(result([job()]));
  mock.mocks.cancel.mockImplementation(async () => {
    mock.setJob(job('cancelled'));
    return {
      schemaVersion: 1,
      kind: 'error',
      command: 'cancel',
      error: {
        code: 'OUTCOME_UNKNOWN',
        message: 'Неизвестно',
        retryable: false,
      },
    } as never;
  });
  const hook = renderHook(() => useDownloads(mock.api));
  await waitFor(() => expect(hook.result.current.jobs).toHaveLength(1));
  await act(async () => {
    await hook.result.current.command(job(), 'cancel');
  });
  expect(hook.result.current.jobs[0]?.status).toBe('cancelled');
  expect(hook.result.current.notice?.severity).toBe('error');
  expect(hook.result.current.notice?.message).toContain(
    'Исход операции неизвестен',
  );
  expect(mock.mocks.cancel).toHaveBeenCalledExactlyOnceWith({ jobId: 'j' });
  hook.unmount();
});

// F-001: подтверждение темы sidebar не сбрасывает несохранённые поля и выборы main-dialog.
// @link planning/reviews/STEP-058/REVIEW-20261029T193045Z.md
it('F-001: открытая форма сохраняет подтверждённую тему sidebar вместе с черновиком и opaque refs', async () => {
  const mock = mockApi();
  let settings: DesktopSettings = { ...defaultDesktopSettings, theme: 'light' };
  mock.mocks.getSettings.mockImplementation(async () => result(settings));
  const saveSettings = vi.fn(async (input) => {
    settings = { ...settings, ...input };
    return result(settings);
  });
  const api = {
    ...mock.api,
    saveSettings,
    ffmpegHelp: async () =>
      result({
        url: 'https://ffmpeg.org/download.html',
        instruction: 'Тестовая инструкция',
        platform: 'linux',
      }),
    selectFfmpeg: async () =>
      result({
        executableRef: 'exe:00000000-0000-0000-0000-000000000058',
        displayPath: '/synthetic/ffmpeg',
      }),
  } as DesktopApi;
  render(<App api={api} />);
  fireEvent.click(screen.getByRole('button', { name: 'Настройки' }));
  await screen.findByRole('button', { name: 'Сохранить настройки' });
  fireEvent.click(screen.getByRole('button', { name: 'Выбрать папку' }));
  await screen.findByDisplayValue('/synthetic/music');
  fireEvent.click(screen.getByRole('tab', { name: 'Файлы' }));
  fireEvent.click(
    screen.getByLabelText('Сохранять метаданные (ID3/FLAC tags)'),
  );
  fireEvent.click(screen.getByLabelText('Заменять существующие файлы'));
  fireEvent.click(screen.getByRole('tab', { name: 'Загрузка' }));
  fireEvent.click(screen.getByRole('button', { name: 'Выбрать FFmpeg' }));
  await screen.findByDisplayValue('/synthetic/ffmpeg');
  fireEvent.click(
    within(document.querySelector('aside')!).getByLabelText('Тёмная тема'),
  );
  await waitFor(() => expect(settings.theme).toBe('dark'));
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить настройки' }));
  await screen.findByText(/Настройки сохранены/);
  expect(saveSettings).toHaveBeenLastCalledWith(
    expect.objectContaining({
      theme: 'dark',
      writeTags: false,
      overwrite: true,
      directoryRef: 'dir:00000000-0000-0000-0000-000000000001',
      ffmpegRef: 'exe:00000000-0000-0000-0000-000000000058',
    }),
  );
  expect(settings.theme).toBe('dark');
});

it.each([false, true])(
  'STEP-059 F-001: sidebar logout очищает открытый Account и отбрасывает поздний avatar (pending=%s)',
  async (pending) => {
    const { api, mocks } = mockApi();
    let account: { id: string; displayName: string } | null = {
      id: 'synthetic-A',
      displayName: 'Аккаунт А',
    };
    let finish!: (
      value: ReturnType<typeof result<{ mimeType: string; base64: string }>>,
    ) => void;
    const photo = { mimeType: 'image/png', base64: 'c3ludGhldGlj' };
    const avatar = new Promise<ReturnType<typeof result<typeof photo>>>(
      (resolve) => {
        finish = resolve;
      },
    );
    const currentApi = {
      ...api,
      account: async () => result(account),
      accountAvatar: vi.fn(async () => (pending ? avatar : result(photo))),
      logout: vi.fn(async () => {
        account = null;
        return result(null);
      }),
    } as unknown as DesktopApi;
    render(<App api={currentApi} />);
    await screen.findByText('Вы вошли как Аккаунт А');
    fireEvent.click(screen.getByRole('button', { name: 'Аккаунт' }));
    await screen.findByRole('button', { name: 'Выйти из аккаунта' });
    if (!pending) await screen.findByAltText('Аватар аккаунта');
    fireEvent.click(screen.getByRole('button', { name: 'Выйти' }));
    await screen.findByText('Войдите, чтобы подключить музыку');
    await screen.findByText('Аккаунт не подключён');
    await act(async () => finish(result(photo)));
    expect(screen.queryByAltText('Аватар аккаунта')).toBeNull();
    expect(screen.queryByText('Аккаунт А')).toBeNull();
    expect(mocks.authenticate).not.toHaveBeenCalled();
  },
);
