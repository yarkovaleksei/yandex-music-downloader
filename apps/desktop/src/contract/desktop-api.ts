import { z } from 'zod';
import type { UpdateView } from './update.js';
import type {
  Account,
  ArtworkDto,
  DesktopSettings,
  HistoryEntry,
  SavedDiagnostics,
  ApplicationResult,
  DiagnosticsDto,
  JobEvent,
  JobSnapshot,
  MediaReference,
  PreviewDto,
} from '@music-downloader/shared';

const empty = z.undefined();
const id = z.string().min(1).max(512);
export const referenceSchema = z.strictObject({
  provider: id,
  kind: z.enum(['track', 'album', 'playlist']),
  id,
});
export const variantSelectionSchema = z.strictObject({
  codec: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
  container: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
  lossless: z.boolean(),
  bitrate: z.number().finite().positive().optional(),
});
const jobInput = z.strictObject({ jobId: id });
const referenceInput = z.strictObject({ source: referenceSchema });
const directoryRef = z.union([
  z.literal('default-output'),
  z.string().regex(/^dir:[a-f0-9-]{36}$/),
]);
const executableRef = z.string().regex(/^exe:[a-f0-9-]{36}$/);

/** Единственная таблица методов/каналов ADR-016; схемы закрыты для лишних полей. */
export const methods = {
  appInfo: { input: empty, executor: 'main' },
  jobFolderAvailability: {
    input: z.strictObject({ jobId: id, trackKey: id.optional() }),
    executor: 'main',
  },
  accountAvatar: { input: empty, executor: 'host' },
  checkUpdate: { input: empty, executor: 'main' },
  downloadUpdate: { input: empty, executor: 'main' },
  openUpdateFolder: { input: empty, executor: 'main' },
  authenticate: { input: empty, executor: 'host' },
  account: { input: empty, executor: 'host' },
  logout: { input: empty, executor: 'host' },
  resolve: {
    input: z.strictObject({ url: z.string().url().max(4096) }),
    executor: 'host',
  },
  preview: { input: referenceInput, executor: 'host' },
  createDownload: {
    input: z.strictObject({
      source: referenceSchema,
      quality: z.enum(['best', 'lossless', 'high', 'normal']),
      directoryRef,
      variantSelection: variantSelectionSchema.optional(),
      overwrite: z.boolean().optional(),
    }),
    executor: 'host',
  },
  pause: { input: jobInput, executor: 'host' },
  resume: { input: jobInput, executor: 'host' },
  retry: { input: jobInput, executor: 'host' },
  cancel: { input: jobInput, executor: 'host' },
  clearDownloads: { input: empty, executor: 'host' },
  listJobs: { input: empty, executor: 'host' },
  getJob: { input: jobInput, executor: 'host' },
  getDownload: { input: jobInput, executor: 'host' },
  diagnostics: { input: empty, executor: 'host' },
  getSettings: { input: empty, executor: 'host' },
  saveSettings: {
    input: z.strictObject({
      quality: z.enum(['best', 'lossless', 'high', 'normal']),
      concurrency: z.number().int().min(1).max(8),
      naming: z.enum(['collection', 'album']),
      overwrite: z.boolean(),
      logging: z.enum(['error', 'warn', 'info', 'debug', 'trace']),
      writeTags: z.boolean().optional(),
      saveCoverFile: z.boolean().optional(),
      writeM3u8: z.boolean().optional(),
      openFolderOnComplete: z.boolean().optional(),
      theme: z.enum(['light', 'dark']).optional(),
      directoryRef: directoryRef.optional(),
      ffmpegRef: executableRef.nullable().optional(),
    }),
    executor: 'host',
  },
  history: { input: empty, executor: 'host' },
  historyArtwork: { input: jobInput, executor: 'host' },
  downloadArtwork: { input: jobInput, executor: 'host' },
  hideHistory: { input: jobInput, executor: 'host' },
  replay: { input: jobInput, executor: 'host' },
  lastDiagnostics: { input: empty, executor: 'host' },
  refreshDiagnostics: { input: empty, executor: 'host' },
  openDownloadsFolder: { input: empty, executor: 'main' },
  checkFfmpeg: {
    input: z.strictObject({ ffmpegRef: executableRef.nullable().optional() }),
    executor: 'host',
  },
  ffmpegHelp: { input: empty, executor: 'main' },
  selectFfmpeg: { input: empty, executor: 'main' },
  selectDirectory: { input: empty, executor: 'main' },
  showItemInFolder: {
    input: z.strictObject({ jobId: id, trackKey: id.optional() }),
    executor: 'main',
  },
  openExternal: {
    input: z.strictObject({ url: z.string().url().max(4096) }),
    executor: 'main',
  },
} as const;

export type Method = keyof typeof methods;
export type Input<M extends Method> = z.infer<(typeof methods)[M]['input']>;
export interface DirectorySelection {
  readonly directoryRef: string;
  readonly displayPath: string;
}
export interface JobFolderAvailability {
  readonly available: boolean;
  readonly reason?: string;
}
export interface Results {
  appInfo: { readonly version: string; readonly dev: boolean };
  jobFolderAvailability: JobFolderAvailability;
  accountAvatar: ArtworkDto | null;
  checkUpdate: UpdateView;
  downloadUpdate: UpdateView;
  openUpdateFolder: UpdateView;
  authenticate: Account;
  account: Account | null;
  logout: null;
  resolve: MediaReference;
  preview: PreviewDto;
  createDownload: JobSnapshot;
  pause: JobSnapshot;
  resume: JobSnapshot;
  retry: JobSnapshot;
  cancel: JobSnapshot;
  clearDownloads: number;
  listJobs: readonly JobSnapshot[];
  getJob: JobSnapshot | null;
  getDownload: JobSnapshot | null;
  diagnostics: DiagnosticsDto;
  getSettings: DesktopSettings;
  saveSettings: DesktopSettings;
  history: readonly HistoryEntry[];
  historyArtwork: ArtworkDto | null;
  downloadArtwork: ArtworkDto | null;
  hideHistory: null;
  replay: JobSnapshot;
  lastDiagnostics: SavedDiagnostics | null;
  refreshDiagnostics: SavedDiagnostics;
  selectFfmpeg: {
    readonly executableRef: string;
    readonly displayPath: string;
  } | null;
  checkFfmpeg: { readonly available: boolean };
  ffmpegHelp: {
    readonly platform: string;
    readonly url: string;
    readonly instruction: string;
  };
  openDownloadsFolder: null;
  selectDirectory: DirectorySelection | null;
  showItemInFolder: null;
  openExternal: null;
}
export type DesktopEvent =
  | JobEvent
  | { readonly event: 'auth.notice'; readonly message: string }
  | { readonly event: 'host.status'; readonly connected: boolean };
export type DesktopApi = {
  readonly [M in Method]: (
    ...args: undefined extends Input<M> ? [input?: Input<M>] : [input: Input<M>]
  ) => Promise<ApplicationResult<Results[M]>>;
} & {
  subscribe(listener: (event: DesktopEvent) => void): () => void;
};
export const eventChannel = 'desktop-api:v1:events';
export function channel(method: Method): string {
  return `desktop-api:v1:${method}`;
}
export function isMethod(value: unknown): value is Method {
  return typeof value === 'string' && Object.hasOwn(methods, value);
}
export function parseInput<M extends Method>(
  method: M,
  input: unknown,
): Input<M> {
  return methods[method].input.parse(input) as Input<M>;
}
