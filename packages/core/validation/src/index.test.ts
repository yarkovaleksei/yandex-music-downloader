import { describe, expect, it } from 'vitest';
import { validationCorePackage } from './index.js';
describe('validation core package', () => {
  it('exports its package marker', () => {
    expect(validationCorePackage).toBe('@music-downloader/core-validation');
  });
});
