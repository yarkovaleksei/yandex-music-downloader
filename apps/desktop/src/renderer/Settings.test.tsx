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
  };
  const onSaved = vi.fn();
  render(<Settings api={api as unknown as DesktopApi} onSaved={onSaved} />);
  expect(await screen.findByDisplayValue('/fixture/old')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Выбрать папку' }));
  await screen.findByDisplayValue('/fixture/new');
  fireEvent.click(screen.getByRole('button', { name: 'Выбрать FFmpeg' }));
  await screen.findByDisplayValue('/fixture/new-ffmpeg');
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить настройки' }));
  await screen.findByText(/Настройки сохранены/);
  expect(api.saveSettings).toHaveBeenCalledWith({
    quality: 'best',
    concurrency: 4,
    naming: 'collection',
    overwrite: false,
    logging: 'info',
    directoryRef: 'dir:00000000-0000-0000-0000-000000000001',
    ffmpegRef: 'exe:00000000-0000-0000-0000-000000000001',
  });
  expect(onSaved).toHaveBeenCalledOnce();
});
it('ADR-016: unknown сохранение перечитывает snapshot и не повторяет mutation', async () => {
  const api = {
    getSettings: vi.fn(async () =>
      success('getSettings', defaultDesktopSettings),
    ),
    saveSettings: vi.fn(async () => failure('saveSettings', 'OUTCOME_UNKNOWN')),
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
