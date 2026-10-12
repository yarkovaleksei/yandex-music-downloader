import type {
  ApplicationApi,
  ApplicationResult,
  JobEvent,
  JobSnapshot,
} from '@music-downloader/application/contracts';
import { localError } from './output.js';

export interface SignalSource {
  on(event: 'SIGINT', listener: () => void): void;
  off(event: 'SIGINT', listener: () => void): void;
}
export interface PauseSignalController {
  readonly dispose: () => void;
  readonly finish: () => void;
  readonly notifyStarted: () => void;
  readonly wasRequested: () => boolean;
  readonly pauseResult: () => Promise<
    ApplicationResult<JobSnapshot> | undefined
  >;
}

/** job.created предшествует аренде: запрос SIGINT ждёт running или активного трека.
 * Единственная pause и её результат проверяются до shutdown. @link planning/tasks/STEP-019.md */
export function installPauseOnSigint(
  source: SignalSource,
  api: ApplicationApi,
  getJobId: () => string | undefined,
  wasStarted: () => boolean,
  wasInvoked: () => boolean = () => true,
): PauseSignalController {
  let requested = false;
  let finished = false;
  let watching: Promise<void> | undefined;
  let result: ApplicationResult<JobSnapshot> | undefined;
  const watch = async () => {
    try {
      while (!finished && wasInvoked()) {
        const id = getJobId();
        if (id !== undefined) {
          const snapshot = await api.getJob(id);
          if (finished) return;
          if (snapshot.kind === 'error') {
            result = snapshot;
            return;
          }
          if (snapshot.data === null) {
            result = {
              schemaVersion: 1,
              kind: 'error',
              command: 'pause',
              error: {
                code: 'VALIDATION_ERROR',
                message: 'Задание не найдено.',
                retryable: false,
                details: { reason: 'JOB_NOT_FOUND' },
              },
            };
            return;
          }
          if (
            [
              'completed',
              'completed_with_errors',
              'failed',
              'cancelled',
              'paused',
            ].includes(snapshot.data.status)
          )
            return;
          if (
            wasStarted() ||
            snapshot.data.status === 'running' ||
            snapshot.data.tracks.some((track) =>
              [
                'resolving',
                'ready',
                'downloading',
                'processing',
                'retry_wait',
              ].includes(track.status),
            )
          ) {
            result = await api.pause(id);
            return;
          }
        }
        await new Promise<void>((resolve) => setTimeout(resolve, 20));
      }
    } catch {
      result = localError(
        'pause',
        'DOWNLOAD_ERROR',
        'Не удалось подтвердить приостановку задания.',
      );
    }
  };
  const apply = () => {
    if (requested && !finished && watching === undefined && wasInvoked())
      watching = watch();
  };
  const listener = () => {
    requested = true;
    apply();
  };
  source.on('SIGINT', listener);
  return {
    dispose: () => {
      finished = true;
      source.off('SIGINT', listener);
    },
    finish: () => {
      finished = true;
    },
    notifyStarted: apply,
    wasRequested: () => requested,
    pauseResult: async () => {
      await watching;
      return result;
    },
  };
}
export function eventStartsWork(event: JobEvent): boolean {
  return event.event === 'track.started';
}
