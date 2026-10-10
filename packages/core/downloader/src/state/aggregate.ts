import type {
  DownloadJobControl,
  DownloadJobStatus,
  DownloadTrackStatus,
} from '@music-downloader/shared';

export interface AggregateInput {
  readonly control: DownloadJobControl;
  /** Жива ли аренда job (ADR-004); вычисляет вызывающий слой. */
  readonly leaseAlive: boolean;
  readonly tracks: readonly DownloadTrackStatus[];
}

/** Активные и ожидающие треки: job ещё не закончил работу. */
const pendingStatuses: ReadonlySet<DownloadTrackStatus> = new Set([
  'queued',
  'resolving',
  'ready',
  'downloading',
  'processing',
  'retry_wait',
  'paused',
]);

/**
 * Детерминированный статус job (ADR-003/ADR-006): cancelled → paused → interrupted →
 * completed → completed_with_errors → failed → running | queued.
 */
export function aggregateJobStatus(input: AggregateInput): DownloadJobStatus {
  if (input.control === 'cancelled') return 'cancelled';
  if (input.control === 'paused') return 'paused';
  const { tracks } = input;
  const pending = tracks.some((status) => pendingStatuses.has(status));
  if (pending && !input.leaseAlive) return 'interrupted';
  if (
    tracks.every((status) => status === 'completed' || status === 'skipped')
  ) {
    return 'completed';
  }
  if (!pending) {
    const succeeded = tracks.some(
      (status) => status === 'completed' || status === 'skipped',
    );
    const failed = tracks.some((status) => status === 'failed');
    if (succeeded && failed) return 'completed_with_errors';
    if (failed) return 'failed';
    // Пробел ADR: cancelled-треки при control=running. Защитное правило —
    // cancelled считается неуспешным терминальным статусом.
    return succeeded ? 'completed_with_errors' : 'cancelled';
  }
  return tracks.every((status) => status === 'queued') ? 'queued' : 'running';
}
