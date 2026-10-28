import type { ProcessingHooks } from '@music-downloader/core-downloader';
import type { Logger } from '@music-downloader/logging';
import type {
  AuthInteraction,
  CredentialStore,
  DiagnosticsDto,
  ManifestStore,
  MusicProvider,
} from '@music-downloader/shared';
import type { RuntimeLoggingOptions } from './contracts.js';
import type { DiagnosticRuntimeOptions } from './diagnostics.js';

export interface RuntimeCacheOptions {
  /** Ноль отключает cache; provider override требует обе части namespace. */
  readonly ttlMs?: number;
  readonly now?: () => number;
  readonly providerId?: string;
  readonly schemaVersion?: string;
}

/** Host передаёт только порты; Electron/CLI не попадают в переносимые DTO. */
export interface RuntimeAdapters {
  /** ADR-015: профиль выбирает отдельную запись keyring, сохраняя общий stateDir. */
  readonly clientProfile?: 'cli' | 'desktop';
  readonly stateDir?: string;
  readonly manifestStore?: ManifestStore;
  readonly credentialStore?: CredentialStore;
  readonly authInteraction?: AuthInteraction;
  readonly providerOverride?: MusicProvider;
  readonly logger?: Logger;
  readonly logging?: RuntimeLoggingOptions;
  readonly concurrency?: number;
  readonly diagnostics?: () => Promise<DiagnosticsDto>;
  readonly diagnosticsRuntime?: Partial<DiagnosticRuntimeOptions>;
  readonly processing?: ProcessingHooks;
  readonly cache?: RuntimeCacheOptions;
}
