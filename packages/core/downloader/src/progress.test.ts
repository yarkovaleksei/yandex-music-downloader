import { describe, expect, it } from 'vitest';
import { ProgressReporter } from './progress.js';

describe('ProgressReporter', () => {
  it('сохраняет fraction при restart и выдаёт монотонный seq job', () => {
    let now = 0;
    const progress = new ProgressReporter({ now: () => now });
    const first = progress.report('1', 50, 100);
    now = 1000;
    const second = progress.complete('1', 100, 100);
    progress.resetWindow('1');
    now = 2000;
    const restarted = progress.report('1', 10, 100);
    expect([first.fraction, second.fraction, restarted.fraction]).toEqual([
      0.5, 1, 1,
    ]);
    expect([first.seq, second.seq, restarted.seq]).toEqual([1, 2, 3]);
  });

  it('не публикует 1 до подтверждённого commit', () => {
    const progress = new ProgressReporter({ now: () => 0 });
    expect(progress.report('1', 100, 100).fraction).toBeLessThan(1);
    expect(progress.complete('1', 100, 100).fraction).toBe(1);
  });

  it('не сообщает speed и ETA до окна или когда размер неизвестен', () => {
    let now = 0;
    const progress = new ProgressReporter({ now: () => now });
    expect(progress.report('1', 0, 100).speedBytesPerSecond).toBeUndefined();
    now = 999;
    expect(progress.report('1', 50, 100).etaMs).toBeUndefined();
    now = 1000;
    const measured = progress.report('1', 100, 200);
    expect(measured.speedBytesPerSecond).toBe(100);
    expect(measured.etaMs).toBe(1000);
    progress.resetWindow('2');
    now = 3000;
    expect(progress.report('2', 100).speedBytesPerSecond).toBe(50);
    expect(progress.report('2', 100).etaMs).toBeUndefined();
  });
});
