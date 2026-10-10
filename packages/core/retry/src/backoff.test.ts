import { ValidationError } from '@music-downloader/shared';
import { describe, expect, it } from 'vitest';
import {
  computeBackoffMs,
  defaultRetryConfig,
  resolveRetryConfig,
} from './backoff.js';

const config = resolveRetryConfig({
  baseDelayMs: 100,
  factor: 2,
  maxDelayMs: 1000,
});

describe('computeBackoffMs', () => {
  it('grows exponentially for a fixed random value', () => {
    const delays = [1, 2, 3, 4].map((attempt) =>
      computeBackoffMs(attempt, config, () => 1),
    );
    expect(delays).toEqual([100, 200, 400, 800]);
  });

  it('caps the delay at maxDelayMs', () => {
    expect(computeBackoffMs(5, config, () => 1)).toBe(1000);
    expect(computeBackoffMs(50, config, () => 1)).toBe(1000);
    expect(computeBackoffMs(1000, config, () => 0.999)).toBeLessThanOrEqual(
      1000,
    );
  });

  it('applies equal jitter between half and the full ceiling', () => {
    expect(computeBackoffMs(3, config, () => 0)).toBe(200);
    expect(computeBackoffMs(3, config, () => 0.5)).toBe(300);
    expect(computeBackoffMs(3, config, () => 1)).toBe(400);
  });

  it('is deterministic for the same inputs', () => {
    expect(computeBackoffMs(2, config, () => 0.3)).toBe(
      computeBackoffMs(2, config, () => 0.3),
    );
  });

  it('clamps a misbehaving random source into the allowed range', () => {
    expect(computeBackoffMs(2, config, () => 7)).toBe(200);
    expect(computeBackoffMs(2, config, () => -3)).toBe(100);
  });

  it.each([0, -1, 1.5, Number.NaN])('rejects attempt %s', (attempt) => {
    expect(() => computeBackoffMs(attempt, config, () => 0)).toThrow(
      ValidationError,
    );
  });
});

describe('resolveRetryConfig', () => {
  it('uses provisional defaults with maxAttempts 5', () => {
    expect(resolveRetryConfig()).toEqual(defaultRetryConfig);
    expect(defaultRetryConfig.maxAttempts).toBe(5);
  });

  it.each([
    { maxAttempts: 0 },
    { maxAttempts: 2.5 },
    { maxAttempts: Number.NaN },
    { baseDelayMs: 0 },
    { baseDelayMs: -5 },
    { baseDelayMs: Number.NaN },
    { baseDelayMs: Number.POSITIVE_INFINITY },
    { maxDelayMs: Number.POSITIVE_INFINITY },
    { maxDelayMs: 0 },
    { factor: 1 },
    { factor: 0.5 },
    { factor: -2 },
    { factor: Number.NaN },
    { factor: Number.POSITIVE_INFINITY },
    { baseDelayMs: 5000, maxDelayMs: 1000 },
  ])('rejects %j', (overrides) => {
    expect(() => resolveRetryConfig(overrides)).toThrow(ValidationError);
  });

  it('accepts custom maxAttempts', () => {
    expect(resolveRetryConfig({ maxAttempts: 2 }).maxAttempts).toBe(2);
  });
});
