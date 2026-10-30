import { describe, expect, it } from 'vitest';
import { cliPackage } from './index.js';

describe('cli package', () => {
  it('exports its package marker', () => {
    expect(cliPackage).toBe('@music-downloader/cli');
  });
});
