import { defineConfig } from '@playwright/test';

// один настоящий Electron и один владелец временного SQLite.
export default defineConfig({
  testDir: import.meta.dirname,
  testMatch: 'download.spec.mjs',
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: 'list',
  outputDir: process.env.MUSIC_E2E_ARTIFACTS,
});
