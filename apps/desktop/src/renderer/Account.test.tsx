// @vitest-environment jsdom
import {
  act,
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
/** Выход идёт через подтверждение, чтобы случайный клик не удалил вход. */
async function confirmLogout() {
  fireEvent.click(screen.getByRole('button', { name: 'Выйти из аккаунта' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Выйти' }));
}
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
  expect(screen.queryByText('Авторизация активна')).toBeNull();
  expect(screen.queryByText(/Войдите через браузер/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Выйти из аккаунта' }));
  expect(await screen.findByText('Выйти из аккаунта?')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
  await waitFor(() =>
    expect(screen.queryByText('Выйти из аккаунта?')).toBeNull(),
  );
  expect(api.logout).not.toHaveBeenCalled();
  await confirmLogout();
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
  await confirmLogout();
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

it('до первого ответа показывает загрузку, а отсутствие аккаунта — только после подтверждённого null', async () => {
  let finish!: (value: ReturnType<typeof success<AccountDto | null>>) => void;
  const pending = new Promise<ReturnType<typeof success<AccountDto | null>>>(
    (resolve) => {
      finish = resolve;
    },
  );
  const api = {
    account: () => pending,
    accountAvatar: vi.fn(),
  } as unknown as DesktopApi;
  render(<Account api={api} onChanged={() => {}} />);
  expect(screen.queryByText('Аккаунт не подключён')).toBeNull();
  expect(screen.queryByText(/Войдите через браузер/)).toBeNull();
  expect(screen.queryByText('Email: нет данных')).toBeNull();
  expect(
    (screen.getByRole('button', { name: 'Загрузка…' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  await act(async () => finish(success('account', null)));
  expect(screen.getByText('Аккаунт не подключён')).toBeTruthy();
  expect(screen.getByText(/Войдите через браузер/)).toBeTruthy();
  expect(
    screen.getByRole('button', { name: 'Войти через браузер' }),
  ).toBeTruthy();
});

it('Яндекс Плюс: значок и управление подпиской только для активного Плюса', async () => {
  let account: AccountDto = {
    id: 'plus',
    displayName: 'Подписчик',
    subscription: 'Яндекс Плюс активен',
    premium: true,
    subscriptionUrl: 'https://plus.yandex.ru/my',
  };
  const api = {
    account: async () => success('account', account),
    accountAvatar: async () => success('accountAvatar', null),
    openExternal: vi.fn(async () => success('openExternal', null)),
  };
  render(<Account api={api as unknown as DesktopApi} onChanged={() => {}} />);
  expect(await screen.findByText('Яндекс Плюс')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Управлять подпиской' }));
  expect(api.openExternal).toHaveBeenCalledWith({
    url: 'https://plus.yandex.ru/my',
  });
  cleanup();
  account = { id: 'free', displayName: 'Без подписки' };
  render(<Account api={api as unknown as DesktopApi} onChanged={() => {}} />);
  await screen.findByText('Без подписки');
  expect(screen.queryByText('Яндекс Плюс')).toBeNull();
  expect(
    screen.queryByRole('button', { name: 'Управлять подпиской' }),
  ).toBeNull();
});
