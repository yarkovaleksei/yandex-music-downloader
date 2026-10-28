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
    getSettings: vi.fn(async () => result(defaultDesktopSettings)),
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
    listJobs: vi.fn(async () => result([] as readonly JobSnapshot[])),
    getJob: vi.fn(async () => result(snapshot)),
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
    fireEvent.click(within(dialog).getByLabelText('Высокое · 1 / 1 треков'));
    fireEvent.click(within(dialog).getByText('Готово'));
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
  await screen.findByText('1 / 2 · 50%');
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
it('действия используют ID и свежую state machine, OUTCOME_UNKNOWN перечитывает без replay', async () => {
  const mock = mockApi();
  mock.mocks.listJobs.mockResolvedValue(result([job()]));
  render(<App api={mock.api} />);
  fireEvent.click(await screen.findByText('Загрузки (1)'));
  const button = (name: string) =>
    screen.getByRole('button', { name }) as HTMLButtonElement;
  expect(button('Продолжить').disabled).toBe(true);
  for (const [label, method] of [
    ['Приостановить', 'pause'],
    ['Отменить', 'cancel'],
    ['Повторить', 'retry'],
    ['Показать в папке', 'showItemInFolder'],
  ] as const) {
    fireEvent.click(button(label));
    await waitFor(() =>
      expect(mock.mocks[method]).toHaveBeenCalledWith({ jobId: 'j' }),
    );
    await waitFor(() => expect(button(label).disabled).toBe(false));
  }
  mock.setJob(job('paused'));
  mock.emit({ schemaVersion: 1, event: 'job.progress', jobId: 'j', seq: 1 });
  await waitFor(() => expect(button('Продолжить').disabled).toBe(false));
  expect(button('Приостановить').disabled).toBe(true);
  mock.mocks.resume.mockResolvedValueOnce({
    schemaVersion: 1,
    kind: 'error',
    command: 'resume',
    error: { code: 'OUTCOME_UNKNOWN', message: 'Неизвестно', retryable: false },
  } as never);
  fireEvent.click(button('Продолжить'));
  await screen.findByText(/Исход операции неизвестен/);
  expect(mock.mocks.resume).toHaveBeenCalledTimes(1);
  const reads = mock.mocks.listJobs.mock.calls.length;
  mock.emit({ event: 'host.status', connected: false });
  mock.emit({ event: 'host.status', connected: true });
  await waitFor(() =>
    expect(mock.mocks.listJobs.mock.calls.length).toBeGreaterThan(reads),
  );
  expect(mock.mocks.resume).toHaveBeenCalledTimes(1);
  mock.setJob({
    ...job('cancelled'),
    tracks: [{ trackKey: '1:track', status: 'cancelled' }],
  });
  mock.emit({ schemaVersion: 1, event: 'job.progress', jobId: 'j', seq: 2 });
  await waitFor(() => expect(button('Отменить').disabled).toBe(true));
  for (const name of [
    'Приостановить',
    'Продолжить',
    'Повторить',
    'Показать в папке',
  ])
    expect(button(name).disabled).toBe(true);
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
      'Без потерь · 1 / 2 треков',
    ),
  ).toBeTruthy();
  fireEvent.click(screen.getByText('Готово'));
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
    await waitFor(() => expect(mock.mocks.getJob).toHaveBeenCalledTimes(1));
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
