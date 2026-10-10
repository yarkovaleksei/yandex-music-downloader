import type { DownloadTrackStatus } from '@music-downloader/shared';

/** Фаза, из которой трек вошёл в retry_wait (ADR-003). */
export type RetryPhase = 'resolving' | 'downloading';

export interface TrackState {
  readonly status: DownloadTrackStatus;
  /** Задан тогда и только тогда, когда status === 'retry_wait'. */
  readonly retryPhase?: RetryPhase;
}

export type TrackEvent =
  | 'start_resolving'
  | 'variant_selected'
  | 'skip_existing'
  | 'start_download'
  | 'stream_complete'
  | 'commit'
  | 'transient_error'
  | 'backoff_elapsed'
  | 'pause'
  | 'resume'
  | 'fatal_error'
  | 'attempts_exhausted'
  | 'cancel'
  | 'retry'
  | 'auth_resume'
  | 'recover'
  | 'recover_committed';

export const trackEvents: readonly TrackEvent[] = Object.freeze([
  'start_resolving',
  'variant_selected',
  'skip_existing',
  'start_download',
  'stream_complete',
  'commit',
  'transient_error',
  'backoff_elapsed',
  'pause',
  'resume',
  'fatal_error',
  'attempts_exhausted',
  'cancel',
  'retry',
  'auth_resume',
  'recover',
  'recover_committed',
]);

export interface TransitionContext {
  /** Recovery-события доступны только recovery-логике (ADR-003). */
  readonly actor?: 'recovery';
  /** Итоговый файл подтверждён сверкой идентичности (для recover_committed). */
  readonly resultVerified?: boolean;
}

export type TransitionResult<T> =
  | { readonly ok: true; readonly state: T }
  | { readonly ok: false; readonly reason: string };

export interface TransitionRule {
  readonly from: DownloadTrackStatus;
  readonly event: TrackEvent;
  readonly to: DownloadTrackStatus;
  /** Для переходов в retry_wait: фаза, которая запоминается. */
  readonly entersPhase?: RetryPhase;
  /** Для переходов из retry_wait: допустимая фаза (иначе любая). */
  readonly requiresPhase?: RetryPhase;
  readonly recovery?: true;
}

function rules(
  froms: readonly DownloadTrackStatus[],
  event: TrackEvent,
  to: DownloadTrackStatus,
  extra: Partial<TransitionRule> = {},
): TransitionRule[] {
  return froms.map((from) => ({ from, event, to, ...extra }));
}

/** Таблица переходов ADR-003/ADR-006 как данные. Остальные переходы запрещены. */
export const transitionRules: readonly TransitionRule[] = Object.freeze(
  [
    ...rules(['queued'], 'start_resolving', 'resolving'),
    ...rules(['resolving'], 'variant_selected', 'ready'),
    ...rules(['resolving'], 'transient_error', 'retry_wait', {
      entersPhase: 'resolving',
    }),
    ...rules(['ready', 'processing'], 'skip_existing', 'skipped'),
    ...rules(['ready'], 'start_download', 'downloading'),
    ...rules(['downloading'], 'stream_complete', 'processing'),
    ...rules(['processing'], 'commit', 'completed'),
    ...rules(['downloading'], 'transient_error', 'retry_wait', {
      entersPhase: 'downloading',
    }),
    ...rules(['retry_wait'], 'backoff_elapsed', 'resolving', {
      requiresPhase: 'resolving',
    }),
    ...rules(['retry_wait'], 'backoff_elapsed', 'downloading', {
      requiresPhase: 'downloading',
    }),
    ...rules(['downloading'], 'pause', 'paused'),
    ...rules(['retry_wait'], 'pause', 'paused', {
      requiresPhase: 'downloading',
    }),
    ...rules(['paused'], 'resume', 'downloading'),
    ...rules(
      ['resolving', 'downloading', 'processing'],
      'fatal_error',
      'failed',
    ),
    ...rules(['retry_wait'], 'attempts_exhausted', 'failed'),
    ...rules(
      [
        'queued',
        'resolving',
        'ready',
        'downloading',
        'paused',
        'retry_wait',
        'processing',
      ],
      'cancel',
      'cancelled',
    ),
    ...rules(['failed'], 'retry', 'queued'),
    ...rules(['failed'], 'auth_resume', 'queued'),
    ...rules(
      ['resolving', 'ready', 'downloading', 'retry_wait', 'processing'],
      'recover',
      'queued',
      { recovery: true },
    ),
    ...rules(['processing'], 'recover_committed', 'completed', {
      recovery: true,
    }),
  ].map((rule) => Object.freeze(rule)),
);

function reject<T>(reason: string): TransitionResult<T> {
  return { ok: false, reason };
}

/** Применяет событие к состоянию трека; недопустимое событие отвергается без исключения. */
export function transitionTrack(
  state: TrackState,
  event: TrackEvent,
  context: TransitionContext = {},
): TransitionResult<TrackState> {
  if ((state.status === 'retry_wait') !== (state.retryPhase !== undefined)) {
    return reject('retryPhase must be set only in retry_wait');
  }
  const rule = transitionRules.find(
    (candidate) =>
      candidate.from === state.status &&
      candidate.event === event &&
      (candidate.requiresPhase === undefined ||
        candidate.requiresPhase === state.retryPhase),
  );
  if (rule === undefined) {
    return reject(`transition ${state.status} -> ${event} is not allowed`);
  }
  if (rule.recovery === true && context.actor !== 'recovery') {
    return reject(`${event} is reserved for recovery`);
  }
  if (event === 'recover_committed' && context.resultVerified !== true) {
    return reject('recover_committed requires a verified result');
  }
  return {
    ok: true,
    state:
      rule.entersPhase === undefined
        ? { status: rule.to }
        : { status: rule.to, retryPhase: rule.entersPhase },
  };
}

/**
 * Recovery-нормализация при захвате аренды (ADR-003): незавершённые → queued,
 * processing с подтверждённым файлом → completed; остальные состояния не меняются.
 * Чистая функция для внедрения в core/manifest (ADR-001 п.3).
 */
export function recoverTrack(
  state: TrackState,
  options: { readonly resultVerified?: boolean } = {},
): TrackState {
  const event: TrackEvent =
    state.status === 'processing' && options.resultVerified === true
      ? 'recover_committed'
      : 'recover';
  const result = transitionTrack(state, event, {
    actor: 'recovery',
    resultVerified: options.resultVerified,
  });
  return result.ok ? result.state : state;
}
