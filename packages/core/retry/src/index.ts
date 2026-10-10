/** Классификация ошибок, backoff и решения о повторе (REQ-014); без сети и таймеров. */
export const retryCorePackage = '@music-downloader/core-retry';

export {
  computeBackoffMs,
  defaultRetryConfig,
  resolveRetryConfig,
  type RetryConfig,
} from './backoff.js';
export {
  classifyError,
  type ErrorClassification,
  type ErrorScope,
  type PauseReason,
  type RetryAction,
} from './classify.js';
export {
  decideRetry,
  type AttemptRecord,
  type DecideRetryInput,
  type RetryDecision,
} from './decide.js';
