import { describe, expect, it } from 'vitest';
import { queueCorePackage } from './index.js';
describe('queue core package', () => {
  it('exports its package marker', () => {
    expect(queueCorePackage).toBe('@music-downloader/core-queue');
  });
});
