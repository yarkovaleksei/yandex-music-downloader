import type { CredentialStore } from '@music-downloader/shared';
import { DomainError } from '@music-downloader/shared';
import { parseCredentials } from './auth-schemas.js';

export const DOCTOR_CANARY_TRACK_ID = '2224197';

export type CredentialHealthStatus =
  | 'available'
  | 'absent'
  | 'corrupt'
  | 'access_denied'
  | 'unavailable'
  | 'expired';

/** Читает credentials без изменения keyring и не возвращает их содержимое.
 * @link docs/architecture-decisions/ADR-010-cli-auth-and-secure-storage.md */
export async function probeCredentials(
  store: CredentialStore,
  now: () => number = Date.now,
): Promise<CredentialHealthStatus> {
  let serialized: string | null;
  try {
    serialized = await store.read();
  } catch (error) {
    const code = codeOf(error);
    return code === 'EACCES' || code === 'EPERM' || code === 'PERMISSION_DENIED'
      ? 'access_denied'
      : 'unavailable';
  }
  if (serialized === null) return 'absent';
  try {
    const credentials = parseCredentials(serialized);
    return credentials.expiresAt !== undefined && credentials.expiresAt <= now()
      ? 'expired'
      : 'available';
  } catch {
    return 'corrupt';
  }
}

function codeOf(error: unknown): string | undefined {
  if (error instanceof DomainError) return error.code;
  return typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : undefined;
}
