import { Entry } from '@napi-rs/keyring';
import {
  DownloadError,
  PermissionError,
  type CredentialStore,
} from '@music-downloader/shared';

export const CLI_CREDENTIAL_SERVICE = 'music-downloader.cli.yandex-music';
export const DESKTOP_CREDENTIAL_SERVICE =
  'music-downloader.desktop.yandex-music';
export type CredentialProfile = 'cli' | 'desktop';

/** ADR-015 разделяет авторизацию клиентов, сохраняя прежний namespace CLI. */
export function credentialService(profile: CredentialProfile = 'cli'): string {
  return profile === 'desktop'
    ? DESKTOP_CREDENTIAL_SERVICE
    : CLI_CREDENTIAL_SERVICE;
}

export const CLI_CREDENTIAL_ACCOUNT = 'current-user';

export const cliCredentialEntryOptions = {
  linux: { store: 'secret-service' },
} as const;

export interface NativeCredentialEntry {
  getPassword(): string | null;
  setPassword(value: string): void;
  deleteCredential(): boolean;
}

export type NativeCredentialEntryFactory = (
  service: string,
) => NativeCredentialEntry;

/**
 * Хранит единственную CLI-запись в системном keyring текущего пользователя.
 * @link ../../../docs/architecture-decisions/ADR-010-cli-auth-and-secure-storage.md
 */
export class CliCredentialStore implements CredentialStore {
  private readonly entry?: NativeCredentialEntry;
  private readonly initializationError?: DownloadError | PermissionError;

  public constructor(
    factory: NativeCredentialEntryFactory = createNativeCredentialEntry,
    profile: CredentialProfile = 'cli',
  ) {
    try {
      this.entry = factory(credentialService(profile));
    } catch (error) {
      this.initializationError = nativeStoreError(error);
    }
  }

  public async read(): Promise<string | null> {
    try {
      return this.requireEntry().getPassword();
    } catch (error) {
      throw nativeStoreError(error);
    }
  }

  public async write(credential: string): Promise<void> {
    try {
      this.requireEntry().setPassword(credential);
    } catch (error) {
      throw nativeStoreError(error);
    }
  }

  public async clear(): Promise<void> {
    try {
      // false означает только подтверждённое отсутствие записи, поэтому clear идемпотентен.
      this.requireEntry().deleteCredential();
    } catch (error) {
      throw nativeStoreError(error);
    }
  }

  private requireEntry(): NativeCredentialEntry {
    if (this.initializationError) throw this.initializationError;
    if (!this.entry) throw new DownloadError(false);
    return this.entry;
  }
}

/** Параметризуемая native-запись; platform fixture использует отдельный test namespace. */
export function createNativeCredentialEntry(
  service: string,
): NativeCredentialEntry {
  return new Entry(service, CLI_CREDENTIAL_ACCOUNT, cliCredentialEntryOptions);
}

function nativeStoreError(error: unknown): DownloadError | PermissionError {
  if (error instanceof PermissionError || error instanceof DownloadError)
    return error;
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? (error as { code?: unknown }).code
      : undefined;
  if (code === 'EACCES' || code === 'EPERM') return new PermissionError();
  return new DownloadError(false);
}
