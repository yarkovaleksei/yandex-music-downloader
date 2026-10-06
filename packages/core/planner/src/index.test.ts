import { describe, expect, it } from 'vitest';
import { plannerCorePackage } from './index.js';
describe('planner core package', () => {
  it('exports its package marker', () => {
    expect(plannerCorePackage).toBe('@music-downloader/core-planner');
  });
});
