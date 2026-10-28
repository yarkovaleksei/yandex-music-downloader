import { z } from 'zod';
import type {
  Account,
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
const jobInput = z.strictObject({ jobId: id });
const referenceInput = z.strictObject({ source: referenceSchema });
const directoryRef = z.string().regex(/^dir:[a-f0-9-]{36}$/);

/** Единственная таблица методов/каналов ADR-016; схемы закрыты для лишних полей. */
export const methods = {
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
      overwrite: z.boolean().optional(),
    }),
    executor: 'host',
  },
  pause: { input: jobInput, executor: 'host' },
  resume: { input: jobInput, executor: 'host' },
  retry: { input: jobInput, executor: 'host' },
  cancel: { input: jobInput, executor: 'host' },
  listJobs: { input: empty, executor: 'host' },
  getJob: { input: jobInput, executor: 'host' },
  diagnostics: { input: empty, executor: 'host' },
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
export interface Results {
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
  listJobs: readonly JobSnapshot[];
  getJob: JobSnapshot | null;
  diagnostics: DiagnosticsDto;
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
