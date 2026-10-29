import { spawnSync } from 'node:child_process';
import path from 'node:path';

// Зависимости устанавливаются явно через npm ci, без скрытого скачивания при тесте.
const result = spawnSync(
  process.execPath,
  [
    path.join(import.meta.dirname, 'node_modules/@playwright/test/cli.js'),
    'test',
    '--config',
    path.join(import.meta.dirname, 'playwright.config.mjs'),
  ],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      MUSIC_E2E_ARTIFACTS:
        process.env.MUSIC_E2E_ARTIFACTS ??
        path.resolve(
          import.meta.dirname,
          '../../../.harness/local/e2e-artifacts',
        ),
    },
  },
);
if (result.error)
  console.error('Не удалось запустить Electron E2E:', result.error.message);
process.exit(result.status ?? 1);
