import { describe, expect, it } from 'vitest';
import { testingPackage } from './index.js';
describe('testing package', () => {
  it('exports its package marker', () => {
    expect(testingPackage).toBe('@music-downloader/testing');
  });
});
