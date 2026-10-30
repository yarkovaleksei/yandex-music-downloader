import { sharedPackage } from '@music-downloader/shared';
import { describe, expect, it } from 'vitest';
import { applicationPackage } from './index.js';

describe('application package', () => {
  it('exports its package marker', () => {
    expect(applicationPackage).toBe('@music-downloader/application');
  });

  it('резолвит workspace-зависимость из src без предварительной сборки dist', () => {
    expect(sharedPackage).toBe('@music-downloader/shared');
  });
});
