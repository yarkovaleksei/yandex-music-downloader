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
import { ValidationError, type MusicProvider } from '@music-downloader/shared';
import { createMetadataWriter } from '@music-downloader/metadata';
import {
  CliCredentialStore,
  FileCacheStore,
  FileManifestStore,
  resolveStateDirectory,
} from '@music-downloader/persistence';
import {
  DOCTOR_CANARY_TRACK_ID,
  PROVIDER_SCHEMA_VERSION,
  probeCredentials,
  YandexMusicProvider,
} from '@music-downloader/provider-yandex-music';
import type { RuntimeAdapters } from './runtime-adapters.js';
import { collectDiagnostics } from './diagnostics.js';
import { CachedProvider } from './cached-provider.js';

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
  const credentialStore =
    adapters.providerOverride === undefined
      ? (adapters.credentialStore ?? new CliCredentialStore())
      : adapters.credentialStore;
  const provider =
    adapters.providerOverride ??
    new YandexMusicProvider({
      credentialStore: credentialStore!,
      authInteraction: adapters.authInteraction ?? {
        notify: (message) =>
          logger.info('Авторизация ожидает действия пользователя.', {
            message,
          }),
      },
    });
  const cachedProvider = createCachedProvider(provider, stateDir, adapters);
  const scheduler = new ConcurrencyScheduler(adapters.concurrency);
  const events = new ApplicationEvents(logger);
  const files = createDownloadFiles();
  const metadata =
    adapters.processing === undefined ? createMetadataWriter() : undefined;
  const jobs = new Jobs(
    cachedProvider,
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
      // Полный override сохраняет тестовый/host processing; штатный writer использует snapshot core.
      processing: adapters.processing ?? {
        metadata: async (partPath, variant, artwork, context) => {
          if (context === undefined) return;
          const track = context.plannedTrack.track;
          await metadata!.write({
            partPath,
            resultPath: context.resultPath,
            container: variant.container === 'mp3' ? 'mp3' : 'mp4',
            tags: {
              title: track.title,
              artists: track.artists?.map((artist) => artist.name),
              album: track.album?.title,
              trackNumber: track.trackNumber,
              discNumber: track.discNumber,
              year: track.year,
              genre: track.genre ?? track.album?.genre,
            },
            artwork,
            sourceKind: context.sourceKind,
            embedArtwork: context.embedArtwork,
            saveCoverFile: context.saveCoverFile,
          });
        },
      },
    },
    events,
  );
  const diagnostics =
    adapters.diagnostics ??
    (() =>
      collectDiagnostics({
        provider,
        manifestStore: store,
        ...(credentialStore === undefined
          ? {}
          : { providerHealth: () => probeCredentials(credentialStore) }),
        providerSchemaVersion: PROVIDER_SCHEMA_VERSION,
        canaryTrackId: DOCTOR_CANARY_TRACK_ID,
        runtime: {
          outputDirectory:
            adapters.diagnosticsRuntime?.outputDirectory ?? stateDir,
          ...adapters.diagnosticsRuntime,
        },
      }));
  return new ApplicationFacade({
    provider: cachedProvider,
    jobs,
    events,
    logger,
    diagnostics,
    debug: logging?.debug === true,
  });
}

function createCachedProvider(
  provider: MusicProvider,
  stateDir: string,
  adapters: RuntimeAdapters,
) {
  const options = adapters.cache;
  const ttlMs = options?.ttlMs ?? 5 * 60_000;
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 0) throw new ValidationError();
  if (ttlMs === 0) return provider;
  const namespace =
    adapters.providerOverride === undefined
      ? { providerId: 'yandex-music', schemaVersion: PROVIDER_SCHEMA_VERSION }
      : options?.providerId !== undefined && options.schemaVersion !== undefined
        ? {
            providerId: options.providerId,
            schemaVersion: options.schemaVersion,
          }
        : undefined;
  if (
    namespace === undefined ||
    namespace.providerId.length === 0 ||
    namespace.schemaVersion.length === 0
  )
    return provider;
  return new CachedProvider(
    provider,
    new FileCacheStore({ stateDir, ttlMs, now: options?.now }),
    namespace,
  );
}

function isLogLevel(value: string): value is LogLevel {
  return ['error', 'warn', 'info', 'debug', 'trace'].includes(value);
}
