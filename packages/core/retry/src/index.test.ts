import { describe, expect, it } from 'vitest';
import { retryCorePackage } from './index.js';
describe('retry core package', () => {
  it('exports its package marker', () => {
    expect(retryCorePackage).toBe('@music-downloader/core-retry');
  });
});
