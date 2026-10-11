import { ValidationError } from '@music-downloader/shared';

export const defaultConcurrency = 4;
export const minimumConcurrency = 1;
export const maximumConcurrency = 8;

/**
 * Очередь принадлежит экземпляру manager, поэтому jobs делят один бюджет.
 * Слот удерживается вызывающей операцией до terminal/retry/pause результата.
 */
export class ConcurrencyScheduler {
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  public constructor(public readonly concurrency = defaultConcurrency) {
    if (
      !Number.isInteger(concurrency) ||
      concurrency < minimumConcurrency ||
      concurrency > maximumConcurrency
    ) {
      throw new ValidationError();
    }
  }

  public get activeCount(): number {
    return this.active;
  }

  public async run<T>(operation: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await operation();
    } finally {
      this.release();
    }
  }

  private async acquire(): Promise<void> {
    if (this.active < this.concurrency) {
      this.active += 1;
      return;
    }
    // release резервирует переданный слот до пробуждения waiter: новый entrant
    // не может занять его между resolve и продолжением microtask.
    await new Promise<void>((resolve) => this.waiting.push(resolve));
  }

  private release(): void {
    const next = this.waiting.shift();
    if (next !== undefined) next();
    else this.active -= 1;
  }
}
