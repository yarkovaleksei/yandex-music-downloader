import { defineConfig } from 'vitest/config';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import {
  testFileSuffixes,
  workspacePackages,
} from './eslint/boundaries.config.mjs';

/** Условие экспорта, при котором workspace-пакеты резолвятся из src без dist. */
const sourceCondition = '@music-downloader/source';
const checksDirectory = path.resolve(import.meta.dirname, '.cache/checks');

// @link planning/tasks/STEP-052.md Каждый project и его child process получают
// workspace scratch, не системный temporary-каталог.
mkdirSync(checksDirectory, { recursive: true });
const testEnvironment = {
  TMP: checksDirectory,
  TEMP: checksDirectory,
  TMPDIR: checksDirectory,
};

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
          include: testFileSuffixes.flatMap((suffix) =>
            workspace.dir === 'apps/desktop'
              ? [`src/**/*.${suffix}.ts`, `src/**/*.${suffix}.tsx`]
              : [`src/**/*.${suffix}.ts`],
          ),
          env: testEnvironment,
        },
      })),
      {
        ...shared,
        test: {
          name: 'tooling',
          root: 'eslint',
          include: ['**/*.test.ts'],
          env: testEnvironment,
        },
      },
    ],
  },
});
