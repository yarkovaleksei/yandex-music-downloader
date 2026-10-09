import { describe, expect, it } from 'vitest';
import { DownloadError, PermissionError } from '@music-downloader/shared';
import {
  CLI_CREDENTIAL_ACCOUNT,
  CLI_CREDENTIAL_SERVICE,
  CliCredentialStore,
  cliCredentialEntryOptions,
  type NativeCredentialEntry,
} from './cli-credential-store.js';

function entry(
  initial: string | null = null,
): NativeCredentialEntry & { value: string | null } {
  return {
    value: initial,
    getPassword() {
      return this.value;
    },
    setPassword(value) {
      this.value = value;
    },
    deleteCredential() {
      const existed = this.value !== null;
      this.value = null;
      return existed;
    },
  };
}

describe('CliCredentialStore', () => {
  it('заменяет запись и очищает отсутствующую запись без fallback', async () => {
    const native = entry('старое');
    const store = new CliCredentialStore(() => native);
    await store.write('новое');
    expect(await store.read()).toBe('новое');
    await store.clear();
    await store.clear();
    expect(await store.read()).toBeNull();
  });

  it('преобразует отказ доступа и недоступный backend в безопасные ошибки', async () => {
    const denied = new CliCredentialStore(() => ({
      getPassword: () => {
        throw Object.assign(new Error('hidden'), { code: 'EACCES' });
      },
      setPassword: () => undefined,
      deleteCredential: () => false,
    }));
    const unavailable = new CliCredentialStore(() => ({
      getPassword: () => {
        throw new Error('locked');
      },
      setPassword: () => undefined,
      deleteCredential: () => false,
    }));
    await expect(denied.read()).rejects.toBeInstanceOf(PermissionError);
    await expect(unavailable.read()).rejects.toBeInstanceOf(DownloadError);
  });

  it('фиксирует namespace и Secret Service без keyutils fallback', () => {
    expect(CLI_CREDENTIAL_SERVICE).toBe('music-downloader.cli.yandex-music');
    expect(CLI_CREDENTIAL_ACCOUNT).toBe('current-user');
    expect(cliCredentialEntryOptions).toEqual({
      linux: { store: 'secret-service' },
    });
  });
});
