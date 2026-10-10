import type { MediaReference, Track } from './domain.js';

/** Трек в плане: позиция 1..N, а не trackId, поэтому повторы в playlist не конфликтуют. */
export interface PlannedTrack {
  readonly position: number;
  /** Позиционный ключ DownloadTrackJob (строка от position). */
  readonly trackKey: string;
  readonly track: Track;
}

/** Неизменяемый план операции (REQ-011); сериализуется в JSON без потерь для manifest. */
export interface DownloadPlan {
  readonly source: MediaReference;
  readonly title: string;
  readonly tracks: readonly PlannedTrack[];
}
