import { expect, it } from 'vitest';
import {
  publicYandexMusicUrl,
  resolveYandexMusicUrl,
} from './resolve-yandex-music-url.js';
it.each([
  ['track', '123'],
  ['album', '456'],
  ['playlist', 'users/Owner/playlists/7'],
  ['playlist', 'users/%D0%90%D0%B2%D1%82%D0%BE%D1%80/playlists/7'],
  ['playlist', '01234567-89ab-cdef-0123-456789abcdef'],
  ['playlist', 'lk.01234567-89ab-cdef-0123-456789abcdef'],
] as const)('REQ-057: публичная ссылка сохраняет %s %s', async (kind, id) => {
  const source = { provider: 'yandex-music', kind, id };
  const url = publicYandexMusicUrl(source);
  expect(url).toBeDefined();
  expect(await resolveYandexMusicUrl(url!)).toEqual(source);
  expect(url).not.toContain('?');
});
