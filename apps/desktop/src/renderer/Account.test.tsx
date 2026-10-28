// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { Account as AccountDto } from '@music-downloader/shared';
import type { DesktopApi } from '../contract/desktop-api.js';
import { success } from '../contract/result.js';
import { Account } from './Account.js';
afterEach(cleanup);
it('REQ-052: показывает подтверждённый account и после logout перечитывает состояние', async () => {
  let account: AccountDto | null = {
    id: 'fixture-id',
    displayName: 'Тестовый пользователь',
  };
  const api = {
    account: vi.fn(async () => success('account', account)),
    logout: vi.fn(async () => {
      account = null;
      return success('logout', null);
    }),
  };
  const changed = vi.fn();
  render(<Account api={api as unknown as DesktopApi} onChanged={changed} />);
  await screen.findByText('Тестовый пользователь');
  expect(screen.getByText('ID аккаунта: fixture-id')).toBeTruthy();
  expect(screen.queryByText(/Подписка|Регион/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Выйти из аккаунта' }));
  await screen.findByText('Аккаунт не подключён');
  expect(api.logout).toHaveBeenCalledOnce();
  await waitFor(() => expect(changed).toHaveBeenCalledOnce());
});
