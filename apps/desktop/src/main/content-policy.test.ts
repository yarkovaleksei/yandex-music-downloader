import path from 'node:path';
import { expect, it } from 'vitest';
import {
  appUrl,
  bundlePath,
  contentSecurityPolicy,
  isAppUrl,
} from './content-policy.js';
it('ограничивает custom protocol bundle-каталогом', () => {
  const root = path.resolve('renderer');
  expect(bundlePath(root, appUrl)).toBe(path.join(root, 'index.html'));
  for (const url of [
    'file:///etc/passwd',
    'music-downloader://evil/index.html',
    'music-downloader://app/%2e%2e%2foutside',
    'music-downloader://app/%5c..%5coutside',
  ])
    expect(bundlePath(root, url)).toBeUndefined();
  expect(isAppUrl('https://example.test')).toBe(false);
});
it('CSP запрещает внешние effective fetch directives и разрешает только необходимый Emotion nonce', () => {
  const csp = contentSecurityPolicy('test-nonce');
  const directives = new Map(
    csp.split('; ').map((part) => {
      const [name, ...values] = part.split(' ');
      return [name, values.join(' ')];
    }),
  );
  for (const name of ['connect-src', 'frame-src', 'object-src', 'worker-src'])
    expect(directives.get(name) ?? directives.get('default-src')).toBe(
      "'none'",
    );
  expect(directives.get('script-src')).toBe("'self'");
  expect(directives.get('style-src-elem')).toContain("'nonce-test-nonce'");
  expect(csp).not.toMatch(/https?:|unsafe-eval/);
  expect(directives.get('frame-ancestors')).toBe("'none'");
});
