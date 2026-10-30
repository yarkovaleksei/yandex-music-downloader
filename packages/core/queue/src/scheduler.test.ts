import { describe, expect, it } from 'vitest';
import { ValidationError } from '@music-downloader/shared';
import { ConcurrencyScheduler, defaultConcurrency } from './scheduler.js';

describe('ConcurrencyScheduler', () => {
  it('ограничивает общий budget и запускает ожидающий flow после освобождения слота', async () => {
    const scheduler = new ConcurrencyScheduler(3);
    let active = 0;
    let peak = 0;
    const release: Array<() => void> = [];
    const tasks = Array.from({ length: 20 }, () =>
      scheduler.run(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise<void>((resolve) => release.push(resolve));
        active -= 1;
      }),
    );
    await new Promise((resolve) => setTimeout(resolve));
    expect(peak).toBe(3);
    while (release.length > 0 || scheduler.activeCount > 0) {
      const item = release.shift();
      item?.();
      await new Promise((resolve) => setTimeout(resolve));
    }
    await Promise.all(tasks);
  });

  it('использует default=4 и отвергает недопустимую concurrency', () => {
    expect(new ConcurrencyScheduler().concurrency).toBe(defaultConcurrency);
    // F-007: обе разрешённые границы являются explicit Acceptance REQ-017.
    expect(new ConcurrencyScheduler(1).concurrency).toBe(1);
    expect(new ConcurrencyScheduler(8).concurrency).toBe(8);
    expect(() => new ConcurrencyScheduler(0)).toThrow(ValidationError);
    expect(() => new ConcurrencyScheduler(9)).toThrow(ValidationError);
    expect(() => new ConcurrencyScheduler(1.5)).toThrow(ValidationError);
    expect(() => new ConcurrencyScheduler(Number.NaN)).toThrow(ValidationError);
  });
});
