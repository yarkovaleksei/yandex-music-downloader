/** Очередь ограничивает общий budget активных track flow одного manager. */
export const queueCorePackage = '@music-downloader/core-queue';
export {
  ConcurrencyScheduler,
  defaultConcurrency,
  maximumConcurrency,
  minimumConcurrency,
} from './scheduler.js';
