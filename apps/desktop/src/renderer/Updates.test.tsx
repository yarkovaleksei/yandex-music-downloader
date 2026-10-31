// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { Updates } from './Updates.js';
import { failure, success } from '../contract/result.js';
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
  expect(screen.queryByRole('button', { name: 'Что нового' })).toBeNull();
});

it('«Что нового» показывает описание релиза как текст: без HTML, переходов и загрузки картинок', async () => {
  const api = {
    checkUpdate: vi.fn(async () =>
      success('checkUpdate', {
        status: 'available',
        currentVersion: '0.0.0',
        version: '0.0.1',
        message: 'Доступна новая версия.',
      }),
    ),
    updateNotes: vi
      .fn()
      .mockResolvedValueOnce(
        success(
          'updateNotes',
          [
            '## Исправления',
            '',
            '- Выбор треков в альбоме',
            '',
            '[Подробнее](https://example.test/notes) ![Схема](https://example.test/a.png)',
            '',
            '<script>window.injected = true</script><b>жирный</b>',
          ].join('\n'),
        ),
      )
      .mockResolvedValueOnce(failure('updateNotes')),
  };
  render(<Updates api={api as unknown as DesktopApi} />);
  expect(screen.queryByRole('button', { name: 'Что нового' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Проверить обновления' }));
  expect(await screen.findByText(/Версия: 0\.0\.1/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Что нового' }));
  const dialog = await screen.findByRole('dialog', {
    name: 'Что нового в версии 0.0.1',
  });
  expect(
    await within(dialog).findByRole('heading', { name: 'Исправления' }),
  ).toBeTruthy();
  expect(within(dialog).getByText('Выбор треков в альбоме')).toBeTruthy();
  expect(within(dialog).getByText('Подробнее')).toBeTruthy();
  expect(within(dialog).getByText('Схема')).toBeTruthy();
  expect(dialog.querySelector('a, img, script, b')).toBeNull();
  expect((window as { injected?: boolean }).injected).toBeUndefined();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Закрыть' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  fireEvent.click(screen.getByRole('button', { name: 'Что нового' }));
  expect(
    await screen.findByText(/Не удалось загрузить описание версии/),
  ).toBeTruthy();
});
