import { z } from 'zod';
import { ProviderError } from '@music-downloader/shared';

const nonEmpty = z.string().min(1);
const positiveFinite = z.number().finite().positive();

export const deviceCodeSchema = z
  .object({
    device_code: nonEmpty,
    user_code: nonEmpty,
    verification_url: z
      .string()
      .url()
      .refine((value) => {
        const url = new URL(value);
        return url.protocol === 'https:' && url.hostname === 'ya.ru';
      }),
    expires_in: positiveFinite,
    interval: positiveFinite,
  })
  .passthrough();

export const oauthTokenSchema = z
  .object({
    access_token: nonEmpty,
    token_type: nonEmpty,
    refresh_token: nonEmpty.optional(),
    expires_in: positiveFinite.optional(),
  })
  .passthrough();

export const accountSchema = z.object({
  id: nonEmpty,
  displayName: nonEmpty,
});
export const rawAccountStatusSchema = z
  .object({
    result: z.object({
      account: z
        .object({
          uid: z.union([z.string().min(1), z.number().finite()]),
          displayName: nonEmpty.optional(),
          login: nonEmpty.optional(),
        })
        .refine(
          (value) =>
            value.displayName !== undefined || value.login !== undefined,
        ),
    }),
  })
  .passthrough();
export const oauthErrorSchema = z.object({ error: nonEmpty }).passthrough();

export interface AuthCredentials {
  readonly accessToken: string;
  readonly refreshToken?: string;
  readonly issuedAt: number;
  readonly expiresAt?: number;
  readonly accountId: string;
}

const credentialEnvelopeSchema = z
  .object({
    schemaVersion: z.literal(1),
    accessToken: nonEmpty,
    refreshToken: nonEmpty.optional(),
    issuedAt: z.number().finite().nonnegative(),
    expiresAt: z.number().finite().positive().optional(),
    accountId: nonEmpty,
  })
  .strict();

/** Проверяет secret envelope до его использования; @link ../../../docs/adr/ADR-010-cli-auth-and-secure-storage.md */
export function parseCredentials(value: string): AuthCredentials {
  try {
    const parsed: unknown = JSON.parse(value);
    const result = credentialEnvelopeSchema.safeParse(parsed);
    if (!result.success) throw new Error('invalid');
    return result.data;
  } catch {
    throw new ProviderError('PROVIDER_RESPONSE_INVALID', false);
  }
}

export function serializeCredentials(credentials: AuthCredentials): string {
  return JSON.stringify({ schemaVersion: 1, ...credentials });
}
