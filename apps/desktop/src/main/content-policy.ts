import path from 'node:path';
export const appScheme = 'music-downloader';
export const appUrl = `${appScheme}://app/index.html`;
export function isAppUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === `${appScheme}:` &&
      url.hostname === 'app' &&
      !url.username &&
      !url.password &&
      !url.port
    );
  } catch {
    return false;
  }
}
/** Привилегированная схема не превращается в доступ к произвольным локальным файлам. */
export function bundlePath(
  root: string,
  requestUrl: string,
): string | undefined {
  if (!isAppUrl(requestUrl)) return undefined;
  try {
    const url = new URL(requestUrl);
    const relative =
      decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
    if (relative.includes('\\') || relative.includes('\0')) return undefined;
    const file = path.resolve(root, relative);
    return file.startsWith(`${path.resolve(root)}${path.sep}`)
      ? file
      : undefined;
  } catch {
    return undefined;
  }
}
export function contentSecurityPolicy(nonce: string): string {
  return [
    "default-src 'none'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "script-src 'self'",
    `style-src 'self' 'nonce-${nonce}'`,
    `style-src-elem 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "worker-src 'none'",
  ].join('; ');
}
