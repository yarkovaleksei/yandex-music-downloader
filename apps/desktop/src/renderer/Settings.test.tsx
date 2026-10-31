// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { DesktopSettings } from '@music-downloader/shared';
import type { DesktopApi } from '../contract/desktop-api.js';
import { success, failure } from '../contract/result.js';
import { Settings } from './Settings.js';
const defaultDesktopSettings: DesktopSettings = {
  outputDirectory: null,
  quality: 'best',
  concurrency: 4,
  naming: 'collection',
  overwrite: false,
  ffmpegPath: null,
  logging: 'info',
};
afterEach(cleanup);
it('REQ-052: сохранённые settings загружаются, выбор путей передаёт только opaque refs и показывает restart hint', async () => {
  const settings = {
    ...defaultDesktopSettings,
    outputDirectory: '/fixture/old',
    ffmpegPath: '/fixture/old-ffmpeg',
  };
  const api = {
    ffmpegHelp: vi.fn(async () =>
      success('ffmpegHelp', {
        platform: 'linux',
        url: 'https://ffmpeg.org/download.html#build-linux',
        instruction: 'Linux: установите ffmpeg из репозитория дистрибутива.',
      }),
    ),
    appInfo: vi.fn(async () =>
      success('appInfo', { version: '1.2.3', dev: true }),
    ),
    getSettings: vi.fn(async () => success('getSettings', settings)),
    selectDirectory: vi.fn(async () =>
      success('selectDirectory', {
        directoryRef: 'dir:00000000-0000-0000-0000-000000000001',
        displayPath: '/fixture/new',
      }),
    ),
    selectFfmpeg: vi.fn(async () =>
      success('selectFfmpeg', {
        executableRef: 'exe:00000000-0000-0000-0000-000000000001',
        displayPath: '/fixture/new-ffmpeg',
      }),
    ),
    saveSettings: vi.fn(async () => success('saveSettings', settings)),
    checkFfmpeg: vi.fn(async () => success('checkFfmpeg', { available: true })),
  };
  const onSaved = vi.fn();
  render(<Settings api={api as unknown as DesktopApi} onSaved={onSaved} />);
  expect(await screen.findByDisplayValue('/fixture/old')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Выбрать папку' }));
  await screen.findByDisplayValue('/fixture/new');
  fireEvent.click(screen.getByRole('tab', { name: 'Дополнительно' }));
  fireEvent.click(screen.getByRole('button', { name: 'Указать файл ffmpeg' }));
  await screen.findByDisplayValue('/fixture/new-ffmpeg');
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить настройки' }));
  await screen.findByText(/Настройки сохранены/);
  // Итог сохранения относится к форме и исчезает при смене вкладки.
  fireEvent.click(screen.getByRole('tab', { name: 'Файлы' }));
  expect(screen.queryByText(/Настройки сохранены/)).toBeNull();
  expect(api.saveSettings).toHaveBeenCalledWith({
    quality: 'best',
    concurrency: 4,
    naming: 'collection',
    overwrite: false,
    logging: 'info',
    writeTags: true,
    saveCoverFile: true,
    writeM3u8: true,
    theme: 'light',
    directoryRef: 'dir:00000000-0000-0000-0000-000000000001',
    ffmpegRef: 'exe:00000000-0000-0000-0000-000000000001',
  });
  expect(onSaved).toHaveBeenCalledOnce();
});
it('ADR-016: unknown сохранение перечитывает snapshot и не повторяет mutation', async () => {
  const api = {
    ffmpegHelp: vi.fn(async () =>
      success('ffmpegHelp', {
        platform: 'linux',
        url: 'https://ffmpeg.org/download.html#build-linux',
        instruction: 'Linux: установите ffmpeg из репозитория дистрибутива.',
      }),
    ),
    appInfo: vi.fn(async () =>
      success('appInfo', { version: '1.2.3', dev: true }),
    ),
    getSettings: vi.fn(async () =>
      success('getSettings', defaultDesktopSettings),
    ),
    saveSettings: vi.fn(async () => failure('saveSettings', 'OUTCOME_UNKNOWN')),
    checkFfmpeg: async () => success('checkFfmpeg', { available: true }),
  };
  render(
    <Settings api={api as unknown as DesktopApi} onSaved={() => undefined} />,
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Сохранить настройки' }),
  );
  await screen.findByText(/Исход сохранения неизвестен/);
  await waitFor(() => expect(api.getSettings).toHaveBeenCalledTimes(2));
  expect(api.saveSettings).toHaveBeenCalledOnce();
});

it('REQ-057: FFmpeg проверяется при открытии и смене пути; предупреждение только когда он не найден', async () => {
  const available = { current: false };
  const api = {
    appInfo: vi.fn(async () =>
      success('appInfo', { version: '1.2.3', dev: true }),
    ),
    getSettings: async () =>
      success('getSettings', {
        ...defaultDesktopSettings,
        ffmpegPath: '/fixture/saved-ffmpeg',
      }),
    ffmpegHelp: async () =>
      success('ffmpegHelp', {
        platform: 'win32',
        url: 'https://www.gyan.dev/ffmpeg/builds/',
        instruction: 'Windows: распакуйте архив и выберите bin/ffmpeg.exe.',
      }),
    selectFfmpeg: async () =>
      success('selectFfmpeg', {
        executableRef: 'exe:00000000-0000-0000-0000-000000000001',
        displayPath: '/fixture/ffmpeg',
      }),
    checkFfmpeg: vi.fn(async () =>
      success('checkFfmpeg', { available: available.current }),
    ),
    openExternal: vi.fn(async () => success('openExternal', null)),
  };
  render(<Settings api={api as unknown as DesktopApi} onSaved={() => {}} />);
  await waitFor(() => expect(api.checkFfmpeg).toHaveBeenCalledWith({}));
  fireEvent.click(screen.getByRole('tab', { name: 'Дополнительно' }));
  expect(await screen.findByText(/FFmpeg не найден/)).toBeTruthy();
  expect(screen.getByText(/Он необязателен/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Скачать FFmpeg' }));
  expect(api.openExternal).toHaveBeenCalledWith({
    url: 'https://www.gyan.dev/ffmpeg/builds/',
  });
  available.current = true;
  fireEvent.click(screen.getByRole('button', { name: 'Указать файл ffmpeg' }));
  await screen.findByDisplayValue('/fixture/ffmpeg');
  expect(api.checkFfmpeg).toHaveBeenLastCalledWith({
    ffmpegRef: 'exe:00000000-0000-0000-0000-000000000001',
  });
  // Найденный FFmpeg не требует внимания: ни сообщения, ни кнопок.
  await waitFor(() =>
    expect(screen.queryByText(/FFmpeg не найден/)).toBeNull(),
  );
  expect(screen.queryByRole('button', { name: 'Проверить снова' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Скачать FFmpeg' })).toBeNull();
  available.current = false;
  fireEvent.click(screen.getByRole('button', { name: 'Искать в PATH' }));
  expect(await screen.findByDisplayValue('Автоматически из PATH')).toBeTruthy();
  expect(api.checkFfmpeg).toHaveBeenLastCalledWith({ ffmpegRef: null });
  expect(
    (
      (await screen.findByRole('button', {
        name: 'Искать в PATH',
      })) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  available.current = true;
  fireEvent.click(
    await screen.findByRole('button', { name: 'Проверить снова' }),
  );
  await waitFor(() =>
    expect(screen.queryByText(/FFmpeg не найден/)).toBeNull(),
  );
  expect(api.checkFfmpeg).toHaveBeenLastCalledWith({ ffmpegRef: null });
});

it('потерянная связь при проверке FFmpeg показывает предупреждение, а не ломает экран', async () => {
  const api = {
    appInfo: async () => success('appInfo', { version: '1.2.3', dev: true }),
    getSettings: async () => success('getSettings', defaultDesktopSettings),
    ffmpegHelp: async () => success('ffmpegHelp', null),
    checkFfmpeg: vi.fn(async () => {
      throw new Error('IPC закрыт');
    }),
  };
  render(<Settings api={api as unknown as DesktopApi} onSaved={() => {}} />);
  fireEvent.click(await screen.findByRole('tab', { name: 'Дополнительно' }));
  expect(await screen.findByText(/Не удалось проверить FFmpeg/)).toBeTruthy();
});

it('журнал: пояснение и кнопка открытия папки, отказ main показан пользователю', async () => {
  const api = {
    appInfo: async () => success('appInfo', { version: '1.2.3', dev: true }),
    getSettings: async () => success('getSettings', defaultDesktopSettings),
    ffmpegHelp: async () => success('ffmpegHelp', null),
    checkFfmpeg: async () => success('checkFfmpeg', { available: true }),
    openLogFolder: vi.fn(async () => success('openLogFolder', null)),
  };
  render(<Settings api={api as unknown as DesktopApi} onSaved={() => {}} />);
  fireEvent.click(await screen.findByRole('tab', { name: 'Дополнительно' }));
  expect(screen.getByText(/Пароли и токены в него не попадают/)).toBeTruthy();
  expect(screen.getByLabelText('Подробность журнала')).toBeTruthy();
  const open = screen.getByRole('button', { name: 'Открыть папку журнала' });
  fireEvent.click(open);
  await waitFor(() => expect(api.openLogFolder).toHaveBeenCalledOnce());
  expect(screen.queryByText('Не удалось открыть папку журнала.')).toBeNull();
  api.openLogFolder.mockResolvedValueOnce(
    failure('openLogFolder', 'PERMISSION_DENIED') as never,
  );
  fireEvent.click(open);
  expect(
    await screen.findByText('Не удалось открыть папку журнала.'),
  ).toBeTruthy();
});

it('REQ-058: вкладки сохраняют переключатели файлов, тема берётся из боковой панели', async () => {
  let settings = { ...defaultDesktopSettings };
  const api = {
    appInfo: vi.fn(async () =>
      success('appInfo', { version: '1.2.3', dev: true }),
    ),
    getSettings: async () => success('getSettings', settings),
    ffmpegHelp: async () => success('ffmpegHelp', null),
    checkFfmpeg: async () => success('checkFfmpeg', { available: true }),
    saveSettings: vi.fn(async (input) => {
      settings = { ...settings, ...input };
      return success('saveSettings', settings);
    }),
  };
  // Тема переключается в боковой панели и приходит подтверждённой.
  const view = render(
    <Settings
      api={api as unknown as DesktopApi}
      onSaved={() => {}}
      confirmedTheme="dark"
    />,
  );
  expect(screen.queryByRole('tab', { name: 'Внешний вид' })).toBeNull();
  await screen.findByRole('button', { name: 'Сохранить настройки' });
  fireEvent.click(screen.getByRole('tab', { name: 'Файлы' }));
  for (const label of [
    'Скачивать обложки альбомов',
    'Сохранять метаданные (ID3/FLAC tags)',
    'Создавать плейлисты .m3u8',
  ])
    fireEvent.click(screen.getByLabelText(label));
  fireEvent.click(screen.getByRole('tab', { name: 'Загрузка' }));
  expect(
    screen.queryByLabelText('Открывать папку после завершения загрузки'),
  ).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить настройки' }));
  await waitFor(() =>
    expect(api.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        quality: 'best',
        writeTags: false,
        saveCoverFile: false,
        writeM3u8: false,
        theme: 'dark',
      }),
    ),
  );
  view.unmount();
  render(<Settings api={api as unknown as DesktopApi} onSaved={() => {}} />);
  await screen.findByRole('button', { name: 'Сохранить настройки' });
  fireEvent.click(screen.getByRole('tab', { name: 'Файлы' }));
  expect(
    (screen.getByLabelText('Создавать плейлисты .m3u8') as HTMLInputElement)
      .checked,
  ).toBe(false);
  fireEvent.click(screen.getByRole('tab', { name: 'О программе' }));
  expect(screen.getByText('Обновления приложения')).toBeTruthy();
  expect(
    screen.queryByRole('button', { name: 'Сохранить настройки' }),
  ).toBeNull();
});

it('целое 1–8 без меню, invalid не сохраняется, About использует только local appInfo', async () => {
  const api = {
    getSettings: async () => success('getSettings', defaultDesktopSettings),
    appInfo: vi.fn(async () =>
      success('appInfo', { version: '9.8.7', dev: true }),
    ),
    ffmpegHelp: async () => success('ffmpegHelp', null),
    checkUpdate: vi.fn(),
    checkFfmpeg: async () => success('checkFfmpeg', { available: true }),
    saveSettings: vi.fn(async (input) =>
      success('saveSettings', { ...defaultDesktopSettings, ...input }),
    ),
  };
  render(<Settings api={api as unknown as DesktopApi} onSaved={() => {}} />);
  const input = await screen.findByRole('spinbutton', {
    name: 'Параллельных загрузок',
  });
  const save = screen.getByRole('button', { name: 'Сохранить настройки' });
  for (const value of ['', '0', '9', '1.5']) {
    fireEvent.change(input, { target: { value } });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(save);
  }
  expect(api.saveSettings).not.toHaveBeenCalled();
  for (const value of ['1', '8']) {
    fireEvent.change(input, { target: { value } });
    fireEvent.click(save);
    await waitFor(() =>
      expect(api.saveSettings).toHaveBeenLastCalledWith(
        expect.objectContaining({ concurrency: Number(value) }),
      ),
    );
    await waitFor(() =>
      expect((save as HTMLButtonElement).disabled).toBe(false),
    );
  }
  fireEvent.click(screen.getByRole('tab', { name: 'О программе' }));
  expect(await screen.findByText('Версия: 9.8.7 (dev)')).toBeTruthy();
  expect(api.checkUpdate).not.toHaveBeenCalled();
});
