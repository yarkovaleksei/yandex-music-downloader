import { createDownloadFiles } from './adapters/download-files.js';
import { createArtworkCache } from './adapters/artwork-cache.js';
import { createRecovery } from './adapters/recovery.js';
import { ApplicationFacade } from './application.js';
import { ApplicationEvents } from './events.js';
import { Jobs } from './jobs.js';
import type { ApplicationApi } from '@music-downloader/shared';
import { ConcurrencyScheduler } from '@music-downloader/core-queue';
import { decideRetry } from '@music-downloader/core-retry';
import { resolveVariant } from '@music-downloader/core-planner';
import {
  finalizeWithManifestCheckpoint,
  prepareRangeCandidate,
} from '@music-downloader/core-manifest';
import {
  createFileSink,
  createLogger,
  type LogLevel,
} from '@music-downloader/logging';
import { ValidationError } from '@music-downloader/shared';
import {
  CliCredentialStore,
  FileManifestStore,
  resolveStateDirectory,
} from '@music-downloader/persistence';
import { YandexMusicProvider } from '@music-downloader/provider-yandex-music';
import type { RuntimeAdapters } from './runtime-adapters.js';

/** Единственное место регистрации Yandex adapter; @link docs/adr/ADR-001-layered-architecture-monorepo.md */
export function createApplication(
  adapters: RuntimeAdapters = {},
): ApplicationApi {
  const logging = adapters.logging;
  if (
    adapters.logger !== undefined &&
    (logging?.level !== undefined || logging?.filePath !== undefined)
  ) {
    throw new ValidationError();
  }
  if (logging?.level !== undefined && !isLogLevel(logging.level)) {
    throw new ValidationError();
  }
  const stateDir = resolveStateDirectory({ stateDir: adapters.stateDir });
  const logger =
    adapters.logger ??
    createLogger({
      ...(logging?.level === undefined ? {} : { level: logging.level }),
      ...(logging?.filePath === undefined
        ? {}
        : { sink: createFileSink(logging.filePath) }),
    });
  const store = adapters.manifestStore ?? new FileManifestStore({ stateDir });
  // providerOverride полностью исключает native keyring и browser/device-auth bootstrap.
  const provider =
    adapters.providerOverride ??
    new YandexMusicProvider({
      credentialStore: adapters.credentialStore ?? new CliCredentialStore(),
      authInteraction: adapters.authInteraction ?? {
        notify: (message) =>
          logger.info('Авторизация ожидает действия пользователя.', {
            message,
          }),
      },
    });
  const scheduler = new ConcurrencyScheduler(adapters.concurrency);
  const events = new ApplicationEvents(logger);
  const files = createDownloadFiles();
  const jobs = new Jobs(
    provider,
    store,
    {
      scheduler,
      files,
      artworkCache: createArtworkCache(stateDir),
      recover: createRecovery(files),
      selectVariant: resolveVariant,
      retry: (error, failedAttempts) =>
        decideRetry({
          error,
          failedAttempts,
          now: Date.now,
          random: Math.random,
        }),
      prepareRange: prepareRangeCandidate,
      checkpoint: finalizeWithManifestCheckpoint,
      ...(adapters.processing === undefined
        ? {}
        : { processing: adapters.processing }),
    },
    events,
  );
  const diagnostics =
    adapters.diagnostics ??
    (async () => ({ available: false, backend: 'file-manifest-store' }));
  return new ApplicationFacade({
    provider,
    jobs,
    events,
    logger,
    diagnostics,
    debug: logging?.debug === true,
  });
}

function isLogLevel(value: string): value is LogLevel {
  return ['error', 'warn', 'info', 'debug', 'trace'].includes(value);
}
