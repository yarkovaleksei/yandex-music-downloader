import { createLogger } from '@music-downloader/logging';
import {
  FileCacheStore,
  resolveStateDirectory,
} from '@music-downloader/persistence';
import type { ApplicationResult } from '@music-downloader/shared';
import { command } from './results.js';

/** Очищает только stateDir/cache и возвращает обычный безопасный application envelope. */
export function clearApplicationCache(
  input: {
    readonly stateDir?: string;
  } = {},
): Promise<ApplicationResult<null>> {
  const stateDir = resolveStateDirectory({ stateDir: input.stateDir });
  return command('clearApplicationCache', createLogger(), async () => {
    await new FileCacheStore({ stateDir, ttlMs: 0 }).clear();
    return null;
  });
}
