import { describe, expect, it } from 'vitest';
import { persistencePackage } from './index.js';
describe('persistence package', () => {
  it('exports its package marker', () => {
    expect(persistencePackage).toBe('@music-downloader/persistence');
  });
});
