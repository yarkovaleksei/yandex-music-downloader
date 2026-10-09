import { Entry } from '@napi-rs/keyring';
import {
  DownloadError,
  PermissionError,
  type CredentialStore,
} from '@music-downloader/shared';

export const CLI_CREDENTIAL_SERVICE = 'music-downloader.cli.yandex-music';
export const CLI_CREDENTIAL_ACCOUNT = 'current-user';

export const cliCredentialEntryOptions = {
  linux: { store: 'secret-service' },
} as const;

export interface NativeCredentialEntry {
  getPassword(): string | null;
  setPassword(value: string): void;
  deleteCredential(): boolean;
}

export type NativeCredentialEntryFactory = () => NativeCredentialEntry;

/**
 * Хранит единственную CLI-запись в системном keyring текущего пользователя.
 * @link ../../../docs/adr/ADR-010-cli-auth-and-secure-storage.md
 */
export class CliCredentialStore implements CredentialStore {
  private readonly entry?: NativeCredentialEntry;
  private readonly initializationError?: DownloadError | PermissionError;

  public constructor(factory: NativeCredentialEntryFactory = defaultEntry) {
    try {
      this.entry = factory();
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

function defaultEntry(): NativeCredentialEntry {
  return new Entry(
    CLI_CREDENTIAL_SERVICE,
    CLI_CREDENTIAL_ACCOUNT,
    cliCredentialEntryOptions,
  );
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
