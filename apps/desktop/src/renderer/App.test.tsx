import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import type { DesktopApi } from '../contract/desktop-api.js';
import { App } from './App.js';
it('минимальный экран использует MUI и предлагает безопасный browser login', () => {
  const api = { account: vi.fn(), subscribe: vi.fn() } as unknown as DesktopApi;
  const html = renderToStaticMarkup(<App api={api} />);
  expect(html).toContain('Войти через браузер');
  expect(html).toContain('защищённом хранилище');
  expect(html).not.toContain('Пароль');
});
