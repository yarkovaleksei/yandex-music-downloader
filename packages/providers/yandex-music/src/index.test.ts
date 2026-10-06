import { describe, expect, it } from 'vitest';
import { yandexMusicProviderPackage } from './index.js';

describe('yandex music provider package', () => {
  it('exports its package marker', () => {
    expect(yandexMusicProviderPackage).toBe(
      '@music-downloader/provider-yandex-music',
    );
  });
});
