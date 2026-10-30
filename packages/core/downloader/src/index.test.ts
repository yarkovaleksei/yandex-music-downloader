import { describe, expect, it } from 'vitest';
import { downloaderCorePackage } from './index.js';
describe('downloader core package', () => {
  it('exports its package marker', () => {
    expect(downloaderCorePackage).toBe('@music-downloader/core-downloader');
  });
});
