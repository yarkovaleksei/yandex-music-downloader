import type { ProcessingHooks } from '@music-downloader/core-downloader';
import type { Logger } from '@music-downloader/logging';
import type {
  AuthInteraction,
  CredentialStore,
  DiagnosticsDto,
  ManifestStore,
  MusicProvider,
} from '@music-downloader/shared';

/** Host передаёт только порты; Electron/CLI не попадают в переносимые DTO. */
export interface RuntimeAdapters {
  readonly stateDir?: string;
  readonly manifestStore?: ManifestStore;
  readonly credentialStore?: CredentialStore;
  readonly authInteraction?: AuthInteraction;
  readonly providerOverride?: MusicProvider;
  readonly logger?: Logger;
  readonly concurrency?: number;
  readonly diagnostics?: () => Promise<DiagnosticsDto>;
  readonly processing?: ProcessingHooks;
}
