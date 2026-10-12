import type { CommandRefusalReason, DomainErrorJson } from './errors.js';

/** Переносимые JSON-значения для DTO из ADR-007 без Node-зависимостей. */
export type JsonValue =
  null | boolean | number | string | readonly JsonValue[] | JsonObject;

export interface JsonObject {
  readonly [key: string]: JsonValue;
}

interface JobEventEnvelope {
  readonly schemaVersion: 1;
  readonly seq: number;
  readonly jobId: string;
  readonly trackKey?: string;
  readonly trackId?: string;
  readonly payload?: JsonObject;
}

interface ObservabilityEvent extends JobEventEnvelope {
  readonly durationMs: number;
}

interface TrackObservabilityEvent extends ObservabilityEvent {
  /** @link docs/requirements/REQ-036-diag-observability.md Позиция трека в плане job. */
  readonly trackKey: string;
}

/**
 * DTO событий из ADR-007. Будущий producer отвечает за монотонность seq в
 * рамках job; типы не проверяют порядок публикации или изоляцию экземпляров.
 */
export type JobEvent =
  | (ObservabilityEvent & {
      readonly event:
        'job.created' | 'entity.resolved' | 'plan.created' | 'job.completed';
    })
  | (TrackObservabilityEvent & {
      readonly event:
        | 'track.started'
        | 'variant.selected'
        | 'download.started'
        | 'download.completed'
        | 'metadata.written'
        | 'validation.completed';
    })
  | (JobEventEnvelope & {
      readonly event: 'job.progress';
      readonly durationMs?: number;
    })
  | (JobEventEnvelope & {
      readonly event: 'track.progress';
      readonly trackKey: string;
      readonly durationMs?: number;
    });

export interface CommandErrorDto extends DomainErrorJson {
  /** Независимые необязательные ключи расширяют DTO без смены версии ADR-007. */
  readonly details?: {
    readonly reason?: CommandRefusalReason;
    readonly debug?: { readonly stack: string };
  };
}

/** Однократный результат команды исключает одновременную передачу data и error. */
export type CommandResult =
  | {
      readonly schemaVersion: 1;
      readonly kind: 'result';
      readonly command: string;
      readonly data: JsonValue;
      readonly error?: never;
    }
  | {
      readonly schemaVersion: 1;
      readonly kind: 'error';
      readonly command: string;
      readonly error: CommandErrorDto;
      readonly data?: never;
    };

/** Строка будущего CLI stdout: job-событие или отдельный результат команды. */
export type CliRecord = JobEvent | CommandResult;

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Проверяет минимальный versioned envelope до передачи события transport-клиенту. */
export function isJobEvent(value: unknown): value is JobEvent {
  const item = record(value);
  if (
    item?.schemaVersion !== 1 ||
    typeof item.event !== 'string' ||
    !Number.isSafeInteger(item.seq) ||
    (item.seq as number) < 1 ||
    typeof item.jobId !== 'string' ||
    item.jobId.length === 0
  )
    return false;
  const event = item.event;
  const trackEvents = new Set([
    'track.started',
    'variant.selected',
    'download.started',
    'download.completed',
    'metadata.written',
    'validation.completed',
  ]);
  const jobEvents = new Set([
    'job.created',
    'entity.resolved',
    'plan.created',
    'job.completed',
  ]);
  if (trackEvents.has(event))
    return (
      typeof item.trackKey === 'string' && typeof item.durationMs === 'number'
    );
  if (jobEvents.has(event)) return typeof item.durationMs === 'number';
  if (event === 'job.progress')
    return item.durationMs === undefined || typeof item.durationMs === 'number';
  if (event === 'track.progress')
    return (
      typeof item.trackKey === 'string' &&
      (item.durationMs === undefined || typeof item.durationMs === 'number')
    );
  return false;
}

/** Проверяет обе ветви CommandResult и обязательные поля публичной ошибки. */
export function isCommandResult(value: unknown): value is CommandResult {
  const item = record(value);
  if (
    item?.schemaVersion !== 1 ||
    typeof item.command !== 'string' ||
    item.command.length === 0
  )
    return false;
  if (item.kind === 'result') return 'data' in item && !('error' in item);
  const error = record(item.error);
  return (
    item.kind === 'error' &&
    !('data' in item) &&
    typeof error?.code === 'string' &&
    typeof error.message === 'string' &&
    typeof error.retryable === 'boolean'
  );
}
