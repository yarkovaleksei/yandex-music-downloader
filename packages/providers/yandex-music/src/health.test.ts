import { describe, expect, it, vi } from 'vitest';
import { DomainError, type CredentialStore } from '@music-downloader/shared';
import { probeCredentials } from './health.js';

function store(read: () => Promise<string | null>): CredentialStore {
  return { read, write: vi.fn(), clear: vi.fn() };
}

describe('health credentials', () => {
  const cases: readonly [string, () => Promise<string | null>, string][] = [
    ['absent', async () => null, 'absent'],
    ['corrupt', async () => '{', 'corrupt'],
    [
      'expired',
      async () =>
        JSON.stringify({
          schemaVersion: 1,
          accessToken: 'secret',
          issuedAt: 1,
          accountId: 'account-secret',
          expiresAt: 2,
        }),
      'expired',
    ],
  ];
  it.each(cases)(
    'возвращает безопасный статус %s',
    async (_name, read, expected) =>
      expect(await probeCredentials(store(read), () => 3)).toBe(expected),
  );
  it('нормализует доступ keyring без текста native ошибки', async () => {
    const credentialStore = store(async () => {
      throw new DomainError('PERMISSION_DENIED', false);
    });
    await expect(probeCredentials(credentialStore)).resolves.toBe(
      'access_denied',
    );
    expect(credentialStore.write).not.toHaveBeenCalled();
    expect(credentialStore.clear).not.toHaveBeenCalled();
  });
});
