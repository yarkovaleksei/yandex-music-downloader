import { defineConfig } from 'vitest/config';
import {
  testFileSuffixes,
  workspacePackages,
} from './eslint/boundaries.config.mjs';

/** Условие экспорта, при котором workspace-пакеты резолвятся из src без dist. */
const sourceCondition = '@music-downloader/source';

const shared = {
  resolve: { conditions: [sourceCondition] },
  ssr: { resolve: { conditions: [sourceCondition] } },
};

export default defineConfig({
  test: {
    projects: [
      ...workspacePackages.map((workspace) => ({
        ...shared,
        test: {
          name: workspace.name,
          root: workspace.dir,
          include: testFileSuffixes.map((suffix) => `src/**/*.${suffix}.ts`),
        },
      })),
      {
        ...shared,
        test: {
          name: 'tooling',
          root: 'eslint',
          include: ['**/*.test.ts'],
        },
      },
    ],
  },
});
