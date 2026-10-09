import type { DomainErrorJson } from './errors.js';

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
  readonly details?: JsonValue;
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
