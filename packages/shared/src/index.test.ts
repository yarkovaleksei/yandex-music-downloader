import { describe, expect, it } from 'vitest';
import { sharedPackage } from './index.js';

describe('shared package', () => {
  it('exports its package marker', () => {
    expect(sharedPackage).toBe('@music-downloader/shared');
  });
});
