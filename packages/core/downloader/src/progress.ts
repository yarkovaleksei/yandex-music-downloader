/** Снимок progress не содержит provider payload, URL или credentials (PRN-002). */
export interface ProgressSnapshot {
  readonly trackKey: string;
  readonly bytes: number;
  readonly totalSize?: number;
  readonly fraction: number;
  readonly speedBytesPerSecond?: number;
  readonly etaMs?: number;
  readonly seq: number;
}

interface TrackWindow {
  highWater: number;
  windowBytes: number;
  windowAt: number;
}
export interface ProgressReporterOptions {
  readonly now?: () => number;
  readonly minimumWindowMs?: number;
}

/** Progress хранит high-water fraction и sequence внутри одного job. */
export class ProgressReporter {
  private readonly tracks = new Map<string, TrackWindow>();
  private sequence = 0;
  private readonly now: () => number;
  private readonly minimumWindowMs: number;
  public constructor(options: ProgressReporterOptions = {}) {
    this.now = options.now ?? Date.now;
    this.minimumWindowMs = options.minimumWindowMs ?? 1000;
  }
  public report(
    trackKey: string,
    bytes: number,
    totalSize?: number,
  ): ProgressSnapshot {
    const at = this.now();
    const current = this.tracks.get(trackKey) ?? {
      highWater: 0,
      windowBytes: bytes,
      windowAt: at,
    };
    const elapsed = at - current.windowAt;
    const speed =
      elapsed >= this.minimumWindowMs && bytes >= current.windowBytes
        ? ((bytes - current.windowBytes) * 1000) / elapsed
        : undefined;
    const observed =
      totalSize !== undefined && totalSize > 0
        ? Math.max(current.highWater, bytes / totalSize)
        : current.highWater;
    // EOF не является фиксацией: 1 публикует только complete после commit/skip.
    const fraction =
      current.highWater === 1 ? 1 : Math.min(0.999_999, observed);
    this.tracks.set(trackKey, {
      highWater: fraction,
      windowBytes: speed === undefined ? current.windowBytes : bytes,
      windowAt: speed === undefined ? current.windowAt : at,
    });
    const etaMs =
      speed !== undefined && speed > 0 && totalSize !== undefined
        ? Math.max(0, ((totalSize - bytes) / speed) * 1000)
        : undefined;
    return {
      trackKey,
      bytes,
      totalSize,
      fraction,
      speedBytesPerSecond: speed,
      etaMs,
      seq: ++this.sequence,
    };
  }
  /** Pause/retry/restart не смешивает измерения разных попыток. */
  public resetWindow(trackKey: string, bytes = 0): void {
    const previous = this.tracks.get(trackKey);
    this.tracks.set(trackKey, {
      highWater: previous?.highWater ?? 0,
      windowBytes: bytes,
      windowAt: this.now(),
    });
  }
  /** Только фактический commit либо late skip подтверждает terminal fraction=1. */
  public complete(
    trackKey: string,
    bytes: number,
    totalSize?: number,
  ): ProgressSnapshot {
    const current = this.tracks.get(trackKey) ?? {
      highWater: 0,
      windowBytes: bytes,
      windowAt: this.now(),
    };
    this.tracks.set(trackKey, { ...current, highWater: 1 });
    return { trackKey, bytes, totalSize, fraction: 1, seq: ++this.sequence };
  }
}
