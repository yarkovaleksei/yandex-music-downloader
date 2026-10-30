import { isJobEvent, type JobEvent } from '@music-downloader/shared';
import { serializeCliRecord, type Logger } from '@music-downloader/logging';

/** DTO проходит сериализацию до подписки; каждый listener получает свой снимок. */
function publicEvent(event: JobEvent): JobEvent | undefined {
  const snapshot = JSON.parse(serializeCliRecord(event)) as unknown;
  return isJobEvent(snapshot) ? snapshot : undefined;
}

/** Изолированный publisher продолжает seq application-событий в manager lifecycle. */
export class ApplicationEvents {
  private readonly listeners = new Set<(event: JobEvent) => void>();
  private readonly sequences = new Map<string, number>();

  public constructor(private readonly logger: Logger) {}

  public nextSequence = (jobId: string): number => {
    const next = (this.sequences.get(jobId) ?? 0) + 1;
    this.sequences.set(jobId, next);
    return next;
  };

  public publish = (event: JobEvent): void => {
    if (!isJobEvent(event)) return;
    const safeEvent = publicEvent(event);
    if (safeEvent === undefined) return;
    this.sequences.set(
      safeEvent.jobId,
      Math.max(this.sequences.get(safeEvent.jobId) ?? 0, safeEvent.seq),
    );
    for (const listener of this.listeners) {
      try {
        // Один listener не может изменить DTO, который увидит следующий.
        listener(JSON.parse(JSON.stringify(safeEvent)) as JobEvent);
      } catch (error) {
        this.logger.warn('Подписчик события завершился ошибкой.', error);
      }
    }
  };

  public subscribe(listener: (event: JobEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Shutdown экземпляра прекращает delivery и освобождает ссылки на клиентов. */
  public close(): void {
    this.listeners.clear();
  }
}
