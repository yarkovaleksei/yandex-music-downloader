import { describe, expect, it } from 'vitest';
import { loggingPackage } from './index.js';
describe('logging package', () => {
  it('exports its package marker', () => {
    expect(loggingPackage).toBe('@music-downloader/logging');
  });
});
