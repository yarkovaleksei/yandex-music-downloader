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
    accountAvatar: vi.fn(async () => success('accountAvatar', null)),
    account: vi.fn(async () => success('account', account)),
    logout: vi.fn(async () => {
      account = null;
      return success('logout', null);
    }),
  };
  const changed = vi.fn();
  render(<Account api={api as unknown as DesktopApi} onChanged={changed} />);
  await screen.findByText('Тестовый пользователь');
  expect(screen.getByText('fixture-id')).toBeTruthy();
  expect(screen.getByText('Регион')).toBeTruthy();
  expect(screen.getAllByText('Нет данных')).toHaveLength(3);
  expect(screen.getByText(/Общего перечня нет/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Выйти из аккаунта' }));
  await screen.findByText('Аккаунт не подключён');
  expect(api.logout).toHaveBeenCalledOnce();
  await waitFor(() => expect(changed).toHaveBeenCalledOnce());
});

it('REQ-058: optional поля показаны ровно из provider DTO без вывода форматов из подписки', async () => {
  const api = {
    accountAvatar: vi.fn(async () => success('accountAvatar', null)),
    account: async () =>
      success('account', {
        id: 'synthetic',
        displayName: 'Тест',
        email: 'synthetic@example.test',
        region: 'Тестовый регион',
        subscription: 'Тестовая подписка',
        formats: ['MP3', 'AAC'],
      }),
  } as unknown as DesktopApi;
  render(<Account api={api} onChanged={() => {}} />);
  expect(await screen.findByText('Тестовый регион')).toBeTruthy();
  expect(screen.getByText('MP3, AAC')).toBeTruthy();
  expect(screen.queryByText(/FLAC/)).toBeNull();
});

it('Plus без codec inference, account не ждёт avatar, logout отбрасывает позднее фото', async () => {
  let account: AccountDto | null = {
    id: 'first',
    displayName: 'Первый',
    subscription: 'Яндекс Плюс активен',
  };
  let complete!: (
    value: ReturnType<typeof success<{ mimeType: string; base64: string }>>,
  ) => void;
  const image = new Promise<
    ReturnType<typeof success<{ mimeType: string; base64: string }>>
  >((resolve) => {
    complete = resolve;
  });
  const api = {
    account: async () => success('account', account),
    accountAvatar: vi.fn(() => image),
    logout: async () => {
      account = null;
      return success('logout', null);
    },
  };
  const view = render(
    <Account api={api as unknown as DesktopApi} onChanged={() => {}} />,
  );
  await screen.findByText('Первый');
  expect(screen.getAllByText('Яндекс Плюс активен')).toHaveLength(2);
  expect(screen.getByText(/сервис сообщает варианты/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Выйти из аккаунта' }));
  await screen.findByText('Аккаунт не подключён');
  complete(
    success('accountAvatar', { mimeType: 'image/png', base64: 'aW1hZ2U=' }),
  );
  await waitFor(() => expect(view.container.querySelector('img')).toBeNull());
});

it('безопасный avatar отображается, unknown объяснён', async () => {
  const api = {
    account: async () =>
      success('account', {
        id: 'fixture',
        displayName: 'Тест',
        subscriptionReason: 'Сервис не передал сведения о подписке.',
      }),
    accountAvatar: async () =>
      success('accountAvatar', { mimeType: 'image/png', base64: 'aW1hZ2U=' }),
  };
  render(<Account api={api as unknown as DesktopApi} onChanged={() => {}} />);
  expect(await screen.findByAltText('Аватар аккаунта')).toBeTruthy();
  expect(
    screen.getAllByText('Сервис не передал сведения о подписке.'),
  ).toHaveLength(2);
});
