import { describe, expect, it } from 'vitest';
import { openPrivateChallenge } from './auth-browser.js';

describe('приватная browser-страница', () => {
  it('слушает loopback, не кешируется и не раскрывается по неизвестному пути', async () => {
    let address = '';
    const challenge = await openPrivateChallenge(
      'canary-user-code',
      'https://ya.ru/device',
      {
        async open(url) {
          address = url;
        },
      },
    );
    try {
      const page = await fetch(address);
      expect(page.url.startsWith('http://127.0.0.1:')).toBe(true);
      expect(page.headers.get('cache-control')).toBe('no-store');
      expect(page.headers.get('referrer-policy')).toBe('no-referrer');
      const html = await page.text();
      expect(html).toContain('canary-user-code');
      expect(html).toContain('action="/');
      const unknown = await fetch(`${address}-unknown`);
      expect(unknown.status).toBe(404);
      expect(await unknown.text()).not.toContain('canary-user-code');
      const cancelled = await fetch(`${address}/cancel`, { method: 'POST' });
      expect(cancelled.status).toBe(204);
      await expect(challenge.cancel).resolves.toBeUndefined();
    } finally {
      await challenge.close();
    }
  });
});
