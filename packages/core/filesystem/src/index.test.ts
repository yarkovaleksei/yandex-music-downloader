import { describe, expect, it } from 'vitest';
import { filesystemCorePackage } from './index.js';
describe('filesystem core package', () => {
  it('exports its package marker', () => {
    expect(filesystemCorePackage).toBe('@music-downloader/core-filesystem');
  });
});
