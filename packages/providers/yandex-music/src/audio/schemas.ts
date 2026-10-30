import { z } from 'zod';
import { invalidProviderResponse } from '../auth-errors.js';

const positiveBitrate = z.number().finite().positive();

export const rawAudioTrackSchema = z.object({
  id: z.union([z.string(), z.number()]),
  available: z.boolean().optional(),
});

export const rawLegacyDownloadInfoSchema = z.array(
  z.object({
    codec: z.string().min(1),
    bitrateInKbps: positiveBitrate,
    preview: z.boolean().optional(),
    downloadInfoUrl: z.string().url(),
    direct: z.boolean().optional(),
  }),
);

export const rawModernDownloadInfoSchema = z
  .object({
    codec: z.string().min(1),
    transport: z.string().min(1),
    urls: z.array(z.string().url()).optional(),
    url: z.string().url().optional(),
    key: z.string().optional(),
    bitrate: z.number().finite().nonnegative().optional(),
    isLossless: z.boolean().optional(),
    preview: z.boolean().optional(),
  })
  .superRefine((value, context) => {
    if (!value.urls?.length && !value.url)
      context.addIssue({ code: 'custom', message: 'missing-url' });
    if (value.transport === 'encraw' && !value.key)
      context.addIssue({ code: 'custom', message: 'missing-key' });
    if (
      (value.codec === 'flac' || value.codec === 'flac-mp4') &&
      value.isLossless === false
    )
      context.addIssue({ code: 'custom', message: 'inconsistent-lossless' });
  });

export type RawLegacyDownloadInfo = z.infer<
  typeof rawLegacyDownloadInfoSchema
>[number];
export type RawModernDownloadInfo = z.infer<typeof rawModernDownloadInfoSchema>;

/** Raw audio responses проверяются до deJson SDK согласно ADR-009. */
export function parseAudioResult<T>(schema: z.ZodType<T>, payload: unknown): T {
  const parsed = z.object({ result: schema }).safeParse(payload);
  if (!parsed.success) throw invalidProviderResponse();
  return parsed.data.result;
}

export function parseModernResult(
  payload: unknown,
): RawModernDownloadInfo | null {
  const parsed = z
    .object({
      result: z.object({
        downloadInfo: rawModernDownloadInfoSchema.optional(),
      }),
    })
    .safeParse(payload);
  if (!parsed.success) throw invalidProviderResponse();
  return parsed.data.result.downloadInfo ?? null;
}
