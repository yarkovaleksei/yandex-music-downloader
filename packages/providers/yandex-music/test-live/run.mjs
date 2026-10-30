/**
 * Проверяет токен до загрузки provider, чтобы обычный запуск оставался offline.
 */
import { runProvider } from './runner.mjs';

const exitCode = await runProvider({ token: process.env.PROVIDER_TEST_TOKEN });
process.exitCode = exitCode;
