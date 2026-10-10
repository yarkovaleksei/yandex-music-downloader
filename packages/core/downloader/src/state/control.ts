import type { DownloadJobControl } from '@music-downloader/shared';
import type { TransitionResult } from './transitions.js';

/** Причина глобальной паузы job, записываемая в manifest (ADR-003/ADR-006). */
export type JobPauseReason =
  'AUTH_REQUIRED' | 'DISK_FULL' | 'PERMISSION_DENIED';

export interface JobControlState {
  readonly control: DownloadJobControl;
  /** Только для глобальной паузы; пауза пользователя причины не имеет. */
  readonly pauseReason?: JobPauseReason;
  /** Трек, остановивший job; нужен для AUTH_REQUIRED-resume. */
  readonly pauseTrackKey?: string;
}

export type JobControlCommand = 'pause' | 'resume' | 'cancel' | 'retry';

function reject(reason: string): TransitionResult<never> {
  return { ok: false, reason };
}

/**
 * Переходы control: running ⇄ paused, running|paused → cancelled (терминально).
 * retry допустим при running|paused и control не меняет; для cancelled job — ошибка.
 */
export function transitionJobControl(
  state: JobControlState,
  command: JobControlCommand,
): TransitionResult<JobControlState> {
  if (state.control === 'cancelled') {
    return reject(`job is cancelled; ${command} is not allowed`);
  }
  if (command === 'cancel')
    return { ok: true, state: { control: 'cancelled' } };
  if (command === 'pause') {
    return state.control === 'running'
      ? { ok: true, state: { control: 'paused' } }
      : reject('job is already paused');
  }
  if (command === 'retry') return { ok: true, state };
  return state.control === 'paused'
    ? { ok: true, state: { control: 'running' } }
    : reject('job is not paused');
}

/**
 * Глобальная ошибка (AUTH_ERROR, DiskFull, Permission) ставит job на паузу вместо
 * каскада failed-треков. Повтор на уже остановленном job отвергается, чтобы сохранить
 * первый остановивший трек.
 */
export function pauseJobOnFatalError(
  state: JobControlState,
  reason: JobPauseReason,
  trackKey: string,
): TransitionResult<JobControlState> {
  if (state.control !== 'running') {
    return reject('only a running job can be paused by a fatal error');
  }
  return {
    ok: true,
    state: { control: 'paused', pauseReason: reason, pauseTrackKey: trackKey },
  };
}

export interface ResumeResult {
  readonly state: JobControlState;
  /** Единственный трек для события auth_resume (только после AUTH_REQUIRED). */
  readonly requeueTrackKey?: string;
}

/** Resume снимает причину паузы; другие failed-треки он не затрагивает (ADR-006). */
export function resumeJob(
  state: JobControlState,
): TransitionResult<ResumeResult> {
  const next = transitionJobControl(state, 'resume');
  if (!next.ok) return next;
  const requeue =
    state.pauseReason === 'AUTH_REQUIRED' ? state.pauseTrackKey : undefined;
  return {
    ok: true,
    state:
      requeue === undefined
        ? { state: next.state }
        : { state: next.state, requeueTrackKey: requeue },
  };
}
