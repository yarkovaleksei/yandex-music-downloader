import os from 'node:os';
import {
  ValidationError,
  type JobManifestV1,
  type LeaseIdentity,
  type LeaseRecord,
  type LeaseState,
} from '@music-downloader/shared';
import { probeLease } from './process-identity.js';

/** Общая политика аренды ADR-004 для файлового и SQLite store (STEP-029). */
export const leaseTimeoutMs = 30_000;
export const heartbeatIntervalMs = 5_000;
export const progressFlushIntervalMs = 250;

/** Проверка только для наблюдения: повреждение не означает отсутствие аренды (STEP-043). */
export function validateLeaseRecord(record: unknown): LeaseRecord {
  if (typeof record !== 'object' || record === null || Array.isArray(record))
    throw new ValidationError();
  const lease = record as Record<string, unknown>;
  const text = (key: string) =>
    typeof lease[key] === 'string' && lease[key].length > 0;
  const timestamp = (key: string) =>
    text(key) && Number.isFinite(Date.parse(lease[key] as string));
  if (
    !Number.isInteger(lease.pid) ||
    (lease.pid as number) <= 0 ||
    !Number.isInteger(lease.generation) ||
    (lease.generation as number) <= 0 ||
    !text('hostname') ||
    !text('processStartedAt') ||
    !text('ownerToken') ||
    !timestamp('acquiredAt') ||
    !timestamp('heartbeatAt') ||
    (lease.releasedAt !== undefined && !timestamp('releasedAt'))
  )
    throw new ValidationError();
  return record as LeaseRecord;
}

/** Разбирает JSON-запись файловой аренды с той же проверкой наблюдения. */
export function observedLeaseFrom(value: string): LeaseRecord {
  let record: unknown;
  try {
    record = JSON.parse(value);
  } catch {
    throw new ValidationError();
  }
  return validateLeaseRecord(record);
}

export interface LeaseClock {
  readonly now: number;
  readonly timeoutMs: number;
}

/**
 * Снимок состояния аренды без захвата: unknown не превращается в inactive.
 * @link planning/tasks/STEP-043.md; docs/adr/ADR-004-atomic-finalization-and-manifest.md
 */
export async function observeLeaseState(
  lease: LeaseRecord | undefined,
  clock: LeaseClock,
): Promise<LeaseState> {
  if (lease === undefined || lease.releasedAt !== undefined) return 'inactive';
  if (lease.hostname !== os.hostname()) return 'unknown';
  if (clock.now - Date.parse(lease.heartbeatAt) <= clock.timeoutMs)
    return 'active';
  const probe = await probeLease(lease);
  if (probe === 'same') return 'active';
  return probe === 'unknown' ? 'unknown' : 'inactive';
}

/** Правила reclaim ADR-004: чужой хост — только явной командой для наблюдавшегося generation. */
export async function assertReclaimable(
  lease: LeaseRecord,
  identity: LeaseIdentity,
  forceForeign: boolean,
  expectedGeneration: number | undefined,
  clock: LeaseClock,
): Promise<void> {
  if (lease.releasedAt !== undefined) return;
  if (lease.hostname !== identity.hostname) {
    if (forceForeign && expectedGeneration === lease.generation) return;
    throw new ValidationError(
      new Error('Аренда другого хоста снимается только явной командой.'),
    );
  }
  if (clock.now - Date.parse(lease.heartbeatAt) <= clock.timeoutMs)
    throw new ValidationError(new Error('Аренда задания ещё активна.'));
  const probe = await probeLease(lease);
  if (probe === 'same' || probe === 'unknown')
    throw new ValidationError(
      new Error('Невозможно безопасно снять аренду задания.'),
    );
}

/** Изменение только partial.bytes объединяется по времени (ADR-004). */
export function isProgressOnly(
  current: JobManifestV1,
  next: JobManifestV1,
): boolean {
  const withoutBytes = (manifest: JobManifestV1) =>
    JSON.stringify({
      ...manifest,
      tracks: manifest.tracks.map((track) => ({
        ...track,
        partial:
          track.partial === undefined
            ? undefined
            : { ...track.partial, bytes: 0 },
      })),
    });
  return (
    withoutBytes(current) === withoutBytes(next) &&
    JSON.stringify(current.tracks.map((track) => track.partial?.bytes)) !==
      JSON.stringify(next.tracks.map((track) => track.partial?.bytes))
  );
}
