import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { openPrivateChallenge } from './auth-browser.js';

describe('приватная browser-страница', () => {
  it('слушает loopback, не кешируется и не раскрывается по неизвестному пути', async () => {
    let address = '';
    const challenge = await openPrivateChallenge(
      'canary-user-code',
      'https://ya.ru/device',
      { deadline: Date.now() + 60_000, duration: 60_000 },
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
      const icon = await fetch(`${address}/icon.png`);
      expect(icon.headers.get('content-type')).toBe('image/png');
      expect(icon.headers.get('cache-control')).toBe('no-store');
      expect(icon.headers.get('referrer-policy')).toBe('no-referrer');
      // Исходный знак не перерисован: compiled asset совпадает с PNG побайтно.
      expect(Buffer.from(await icon.arrayBuffer())).toEqual(
        await readFile(
          new URL('../../../../docs/brand/icon.png', import.meta.url),
        ),
      );
      expect(html).toContain(`href="${new URL(address).pathname}/icon.png"`);
      expect(html).toContain(`src="${new URL(address).pathname}/icon.png"`);
      const unknown = await fetch(`${address}-unknown`);
      expect(unknown.status).toBe(404);
      expect(await unknown.text()).not.toContain('canary-user-code');
      expect((await fetch(new URL('/icon.png', address))).status).toBe(404);
      expect((await fetch(`${address}-unknown/icon.png`)).status).toBe(404);
      const cancelled = await fetch(`${address}/cancel`, { method: 'POST' });
      expect(cancelled.status).toBe(204);
      await expect(challenge.cancel).resolves.toBeUndefined();
    } finally {
      await challenge.close();
    }
  }, 15_000);

  it('экранирует динамические данные и сохраняет исходный deadline при повторном GET', async () => {
    let address = '';
    const deadline = Date.now() + 60_000;
    const challenge = await openPrivateChallenge(
      '</strong><script>alert("код")</script>&\'`',
      'https://ya.ru/device?code=%22&next=%3Cscript%3E',
      { deadline, duration: 60_000 },
      {
        async open(url) {
          address = url;
        },
      },
    );
    try {
      const first = await (await fetch(address)).text();
      const reload = await (await fetch(address)).text();
      expect(first).toBe(reload);
      expect(first).toContain(`data-deadline="${deadline}"`);
      expect(first).toContain('data-duration="60000"');
      expect(first).toContain(
        '&lt;/strong&gt;&lt;script&gt;alert(&quot;код&quot;)&lt;/script&gt;&amp;&#39;`',
      );
      expect(first).not.toContain('<script>alert');
      expect(first).toContain(
        'href="https://ya.ru/device?code=%22&amp;next=%3Cscript%3E"',
      );
      expect(first).toContain(
        'Официальная страница входа: <strong>ya.ru</strong>',
      );
      expect(first).toContain('rel="noopener noreferrer"');
      expect(first).toContain('referrerpolicy="no-referrer"');
      const script = first.match(/<script>([\s\S]*?)<\/script>/)?.[1];
      expect(script).toContain('code.textContent');
      expect(script).not.toContain('alert');
      expect(script).not.toContain('https://ya.ru');
    } finally {
      await challenge.close();
    }
  });
});
