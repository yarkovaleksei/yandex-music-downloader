// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { renderAuthPage } from './auth-page.js';

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  document.documentElement.innerHTML = '';
});

/** Исполняем реальный inline-скрипт страницы: таймер не должен перезаписать подтверждённый итог. */
it.each([
  ['completed', 'Вход выполнен'],
  ['cancelled', 'Вход отменён'],
  ['closed', 'Вход не завершён'],
])(
  'страница показывает итог %s и останавливает ожидание',
  async (status, title) => {
    vi.useFakeTimers();
    let finish!: (value: {
      ok: boolean;
      json: () => Promise<{ status: string }>;
    }) => void;
    const pending = new Promise<{
      ok: boolean;
      json: () => Promise<{ status: string }>;
    }>((resolve) => {
      finish = resolve;
    });
    const fetcher = vi.fn(() => pending);
    const html = renderAuthPage(
      'test-code',
      'https://ya.ru/device',
      '/private',
      { deadline: Date.now() + 60_000, duration: 60_000 },
    );
    document.documentElement.innerHTML = html;
    const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    expect(script).toBeTruthy();
    new Function('fetch', script!)(fetcher);
    expect(document.getElementById('wait-title')?.textContent).toBe(
      'Ожидаем подтверждения',
    );
    expect(fetcher).toHaveBeenCalledWith('/private/status', {
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
    });
    finish({ ok: true, json: async () => ({ status }) });
    await vi.advanceTimersByTimeAsync(0);
    expect(document.getElementById('wait-title')?.textContent).toBe(title);
    expect(
      (document.getElementById('copy-code') as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (document.getElementById('cancel-auth') as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      document.getElementById('yandex-link')?.getAttribute('aria-disabled'),
    ).toBe('true');
    expect(
      (document.querySelector('.spinner') as HTMLElement).style.display,
    ).toBe('none');
    if (status === 'completed') {
      expect(document.getElementById('wait-description')?.textContent).toBe(
        'Закройте эту страницу и вернитесь в приложение.',
      );
      expect(
        document
          .getElementById('waiting-chip')
          ?.classList.contains('completed'),
      ).toBe(true);
    }
    await vi.advanceTimersByTimeAsync(61_000);
    expect(document.getElementById('wait-title')?.textContent).toBe(title);
  },
);

it('потеря соединения предлагает вернуться в приложение и не выдаётся за успешный вход', async () => {
  vi.useFakeTimers();
  const html = renderAuthPage('test-code', 'https://ya.ru/device', '/private', {
    deadline: Date.now() + 60_000,
    duration: 60_000,
  });
  document.documentElement.innerHTML = html;
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  new Function('fetch', script!)(
    vi.fn(async () => {
      throw new Error('Отключено');
    }),
  );
  await vi.advanceTimersByTimeAsync(0);
  expect(document.getElementById('wait-title')?.textContent).toBe(
    'Связь с приложением прервана',
  );
  expect(document.getElementById('wait-description')?.textContent).toContain(
    'проверьте результат входа в приложении',
  );
  expect(
    document.getElementById('waiting-chip')?.classList.contains('completed'),
  ).toBe(false);
});
