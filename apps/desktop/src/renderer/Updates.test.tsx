// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Updates } from './Updates.js';
import { success } from '../contract/result.js';
import type { DesktopApi } from '../contract/desktop-api.js';
afterEach(cleanup);
it('REQ-055: проверка, скачивание и открытие папки требуют отдельных действий пользователя', async () => {
  const view = {
    currentVersion: '0.0.0',
    version: '0.0.1',
    message: 'Проверено',
  };
  const api = {
    checkUpdate: vi.fn(async () =>
      success('checkUpdate', { ...view, status: 'available' }),
    ),
    downloadUpdate: vi.fn(async () =>
      success('downloadUpdate', { ...view, status: 'ready' }),
    ),
    openUpdateFolder: vi.fn(async () =>
      success('openUpdateFolder', { ...view, status: 'ready' }),
    ),
  };
  render(<Updates api={api as unknown as DesktopApi} />);
  expect(api.checkUpdate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Проверить обновления' }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Скачать обновление' }),
  );
  expect(api.openUpdateFolder).not.toHaveBeenCalled();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Открыть папку с обновлением' }),
  );
  expect(api.checkUpdate).toHaveBeenCalledWith();
  expect(api.downloadUpdate).toHaveBeenCalledWith();
  expect(api.openUpdateFolder).toHaveBeenCalledWith();
});
it('REQ-055: отсутствие доверенного feed явно показано и не предлагает скачивание', async () => {
  const api = {
    checkUpdate: vi.fn(async () =>
      success('checkUpdate', {
        status: 'disabled',
        currentVersion: '0.0.0',
        message: 'Обновления пока не настроены.',
      }),
    ),
  };
  render(<Updates api={api as unknown as DesktopApi} />);
  fireEvent.click(screen.getByRole('button', { name: 'Проверить обновления' }));
  expect(await screen.findByText('Обновления пока не настроены.')).toBeTruthy();
  expect(
    screen.queryByRole('button', { name: 'Скачать обновление' }),
  ).toBeNull();
});
