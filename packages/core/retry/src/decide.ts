import {
  computeBackoffMs,
  resolveRetryConfig,
  type RetryConfig,
} from './backoff.js';
import { classifyError, type PauseReason } from './classify.js';

/** Данные о попытке для manifest; запись выполняет менеджер загрузок. */
export interface AttemptRecord {
  readonly attempt: number;
  readonly code: string;
  readonly retryable: boolean;
  readonly delayMs: number;
}

export type RetryDecision =
  | {
      readonly action: 'retry' | 'reopen_stream';
      readonly delayMs: number;
      readonly retryAt: number;
      readonly record: AttemptRecord;
    }
  | { readonly action: 'fail'; readonly record: AttemptRecord }
  | {
      readonly action: 'pause_job';
      readonly reason: PauseReason;
      readonly record: AttemptRecord;
    };

export interface DecideRetryInput {
  readonly error: unknown;
  /** Число неудачных попыток, включая только что завершившуюся. */
  readonly failedAttempts: number;
  readonly config?: Partial<RetryConfig>;
  readonly random: () => number;
  readonly now: () => number;
}

/**
 * Решает, что делать после неудачной попытки. Ничего не ждёт и не вызывает сеть:
 * цикл повторов выполняет менеджер.
 */
export function decideRetry(input: DecideRetryInput): RetryDecision {
  const config = resolveRetryConfig(input.config);
  const classification = classifyError(input.error);
  const attempt = input.failedAttempts;
  const record = (delayMs: number): AttemptRecord => ({
    attempt,
    code: classification.code,
    retryable: classification.retryable,
    delayMs,
  });
  if (classification.action === 'pause_job' && classification.pauseReason) {
    return {
      action: 'pause_job',
      reason: classification.pauseReason,
      record: record(0),
    };
  }
  if (
    classification.action === 'fail' ||
    classification.action === 'pause_job' ||
    attempt >= config.maxAttempts
  ) {
    return { action: 'fail', record: record(0) };
  }
  const delayMs = computeBackoffMs(attempt, config, input.random);
  return {
    action: classification.action,
    delayMs,
    retryAt: input.now() + delayMs,
    record: record(delayMs),
  };
}
