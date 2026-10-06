import { describe, expect, it } from 'vitest';
import { metadataPackage } from './index.js';
describe('metadata package', () => {
  it('exports its package marker', () => {
    expect(metadataPackage).toBe('@music-downloader/metadata');
  });
});
