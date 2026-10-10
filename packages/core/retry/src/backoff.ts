import { ValidationError } from '@music-downloader/shared';

export interface RetryConfig {
  /** Число попыток всего; после maxAttempts-й неудачи трек переходит в failed. */
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  readonly factor: number;
  readonly maxDelayMs: number;
}

/**
 * Provisional: OQ-009 отложен, реальные лимиты API/CDN не измерены.
 * Значения настраиваются и не являются измеренным rate limit.
 */
export const defaultRetryConfig: RetryConfig = Object.freeze({
  maxAttempts: 5,
  baseDelayMs: 1000,
  factor: 2,
  maxDelayMs: 30_000,
});

function invalid(reason: string): ValidationError {
  return new ValidationError(new Error(reason));
}

function positiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/** Возвращает полную конфигурацию: недостающие поля берутся из defaultRetryConfig. */
export function resolveRetryConfig(
  overrides: Partial<RetryConfig> = {},
): RetryConfig {
  const config = { ...defaultRetryConfig, ...overrides };
  if (!Number.isSafeInteger(config.maxAttempts) || config.maxAttempts < 1) {
    throw invalid('maxAttempts must be an integer >= 1');
  }
  if (
    !positiveFinite(config.baseDelayMs) ||
    !positiveFinite(config.maxDelayMs)
  ) {
    throw invalid('delays must be finite positive numbers');
  }
  if (!Number.isFinite(config.factor) || config.factor <= 1) {
    throw invalid('factor must be a finite number > 1');
  }
  if (config.maxDelayMs < config.baseDelayMs) {
    throw invalid('maxDelayMs must be >= baseDelayMs');
  }
  return Object.freeze(config);
}

/**
 * Exponential backoff с equal jitter: потолок min(maxDelayMs, base × factor^(n-1)),
 * задержка — от половины потолка до потолка. `random` возвращает значение в [0, 1).
 */
export function computeBackoffMs(
  attempt: number,
  config: RetryConfig,
  random: () => number,
): number {
  if (!Number.isSafeInteger(attempt) || attempt < 1) {
    throw invalid('attempt must be an integer >= 1');
  }
  const ceiling = Math.min(
    config.maxDelayMs,
    config.baseDelayMs * config.factor ** (attempt - 1),
  );
  const sample = Math.min(1, Math.max(0, random()));
  return Math.round(ceiling * (0.5 + 0.5 * sample));
}
