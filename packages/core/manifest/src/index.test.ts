import { describe, expect, it } from 'vitest';
import { manifestCorePackage } from './index.js';
describe('manifest core package', () => {
  it('exports its package marker', () => {
    expect(manifestCorePackage).toBe('@music-downloader/core-manifest');
  });
});
