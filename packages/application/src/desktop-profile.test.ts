import type * as Persistence from '@music-downloader/persistence';
import { afterEach, expect, it, vi } from 'vitest';
const profiles = vi.hoisted(() => [] as unknown[]);
vi.mock('@music-downloader/persistence', async (original) => {
  const actual = await original<typeof Persistence>();
  return {
    ...actual,
    CliCredentialStore: class extends actual.CliCredentialStore {
      public constructor(
        factory: ConstructorParameters<typeof actual.CliCredentialStore>[0],
        profile: ConstructorParameters<typeof actual.CliCredentialStore>[1],
      ) {
        super(factory, profile);
        profiles.push(profile);
      }
    },
  };
});
import { createApplication } from './index.js';
afterEach(() => {
  profiles.length = 0;
});
it('ADR-015 application по умолчанию остаётся CLI, desktop передаёт только нейтральный профиль', async () => {
  const cli = createApplication();
  const desktop = createApplication({ clientProfile: 'desktop' });
  expect(profiles).toEqual([undefined, 'desktop']);
  await cli.shutdown();
  await desktop.shutdown();
});
