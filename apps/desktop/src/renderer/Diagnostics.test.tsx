// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { DesktopApi } from '../contract/desktop-api.js';
import { success, failure } from '../contract/result.js';
import { Diagnostics } from './Diagnostics.js';
afterEach(cleanup);
it('REQ-052: показывает каждый статус doctor и не выдаёт неудачный refresh за свежий успех', async () => {
  const value = {
    checkedAt: '2026-01-01T00:00:00Z',
    diagnostics: {
      available: false,
      configuration: {
        checks: {
          runtime: { status: 'ok' },
          provider: { status: 'api-changed', code: 'API_CHANGED' },
          account: { status: 'failed', code: 'AUTH_ERROR' },
          metadata: { status: 'skipped' },
          ffmpeg: { status: 'optional', optional: true },
        },
      },
    },
  };
  const api = {
    lastDiagnostics: vi.fn(async () => success('lastDiagnostics', value)),
    refreshDiagnostics: vi.fn(async () =>
      failure('refreshDiagnostics', 'HOST_UNAVAILABLE'),
    ),
  };
  render(<Diagnostics api={api as unknown as DesktopApi} />);
  await screen.findByText('API изменился');
  for (const text of [
    'Успешно',
    'Ошибка',
    'Пропущено',
    'Необязательно · необязательно',
  ])
    expect(screen.getByText(text)).toBeTruthy();
  const previous = screen.getByText(/Последняя проверка:/).textContent;
  fireEvent.click(screen.getByRole('button', { name: 'Повторить проверки' }));
  await screen.findByText(/Проверка не обновлена/);
  expect(screen.getByText(/Последняя проверка:/).textContent).toBe(previous);
  expect(api.refreshDiagnostics).toHaveBeenCalledOnce();
});
