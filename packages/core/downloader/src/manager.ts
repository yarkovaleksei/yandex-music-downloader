import {
  AuthenticationError,
  CommandRefusalError,
  DomainError,
  ValidationError,
  type ArtworkData,
  type ControlRequest,
  type JobEvent,
  type JobManifestV1,
} from '@music-downloader/shared';
import { JobOwner, requestJobControl } from './job-owner.js';
import { TrackPipeline } from './pipeline.js';
import { ProgressReporter } from './progress.js';
import { aggregateJobStatus } from './state/aggregate.js';
import type {
  DownloadManagerDependencies,
  DownloadManagerOptions,
} from './ports.js';

interface LiveJob {
  readonly owner: JobOwner;
  readonly progress: ProgressReporter;
  readonly artwork: Map<string, Promise<ArtworkData>>;
  readonly trackArtwork: Map<string, ArtworkData>;
  eventTail: Promise<unknown>;
  readonly controllers: Map<string, AbortController>;
  readonly effects: Set<Promise<unknown>>;
  readonly startedAt: number;
  intent: 'running' | 'paused' | 'cancelled';
  generation: number;
  seq: number;
  closed: boolean;
  closePromise?: Promise<void>;
  polling: boolean;
  poll?: ReturnType<typeof setInterval>;
  heartbeat?: ReturnType<typeof setInterval>;
  loop?: Promise<JobManifestV1>;
}

/** Manager владеет lifecycle; host подключает adapters и SIGINT к pause/shutdown (ADR-007). */
export class DownloadManager {
  private readonly jobs = new Map<string, LiveJob>();
  private readonly pipeline: TrackPipeline;
  private readonly now: () => number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  public constructor(
    private readonly deps: DownloadManagerDependencies,
    private readonly options: DownloadManagerOptions = {},
  ) {
    if (
      !Number.isInteger(deps.scheduler.concurrency) ||
      deps.scheduler.concurrency < 1 ||
      deps.scheduler.concurrency > 8
    )
      throw new ValidationError();
    this.now = deps.now ?? Date.now;
    this.sleep =
      deps.sleep ??
      ((milliseconds) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.pipeline = new TrackPipeline(deps, options);
  }
  public get activeCount(): number {
    return this.deps.scheduler.activeCount;
  }

  /** Manifest создаёт application; acquire всегда выполняет recovery до первых side effects. */
  public async run(jobId: string): Promise<JobManifestV1> {
    if (this.jobs.has(jobId)) throw new ValidationError();
    const live = await this.acquire(jobId);
    if (live.intent !== 'running') return live.owner.current;
    return this.launch(jobId, live);
  }

  public async command(
    jobId: string,
    command: ControlRequest['command'],
  ): Promise<JobManifestV1> {
    const existing = this.jobs.get(jobId);
    if (existing !== undefined) {
      await this.apply(existing, command);
      if (
        existing.intent === 'running' &&
        (command === 'resume' || command === 'retry')
      )
        void this.launch(jobId, existing).catch(() => undefined);
      if (existing.intent === 'cancelled') await this.close(jobId, existing);
      return existing.owner.current;
    }
    let live: LiveJob;
    try {
      live = await this.acquire(jobId);
    } catch (error) {
      // Занятая lease не даёт writer capability; только её owner применяет inbox.
      const manifest = await this.deps.store.read(jobId);
      if (manifest === undefined) throw error;
      // Только наблюдаемая active lease подтверждает чужого живого владельца (STEP-045).
      // При недоступном наблюдении сохраняем прежний отказ без дополнительной причины.
      const lease = await this.deps.store
        .readLeaseState(jobId)
        .catch(() => 'unknown');
      if (
        command === 'resume' &&
        manifest.control.state === 'running' &&
        lease === 'active'
      )
        throw new CommandRefusalError('LEASE_HELD_BY_OTHER_OWNER');
      const receipt = await requestJobControl(
        this.deps.store,
        jobId,
        command,
        this.options.stopTimeoutMs ?? 5000,
        lease === 'active',
      );
      if (!receipt.accepted)
        throw new DomainError(receipt.error?.code ?? 'DOWNLOAD_ERROR', false);
      const updated = await this.deps.store.read(jobId);
      if (updated === undefined) throw new ValidationError();
      return updated;
    }
    try {
      // Успешный acquire доказывает отсутствие живого owner. Interrupted running job
      // после recovery продолжает работу; правило already-running относится к живой lease.
      if (!(command === 'resume' && live.intent === 'running'))
        await this.apply(live, command);
    } catch (error) {
      if (live.effects.size === 0) await this.close(jobId, live);
      throw error;
    }
    if (live.intent === 'running')
      void this.launch(jobId, live).catch(() => undefined);
    else if (live.intent === 'cancelled') await this.close(jobId, live);
    return live.owner.current;
  }

  /** SIGINT host использует тот же путь, что pause; timeout никогда не заявляет release. */
  public async shutdown(jobId: string): Promise<void> {
    const live = this.jobs.get(jobId);
    if (live === undefined) return;
    // @link planning/tasks/STEP-049.md: закрывающаяся session уже освобождает lease.
    // Новый pause в это окно нарушает порядок lane и маскирует исход release.
    if (live.closed) {
      await this.close(jobId, live);
      return;
    }
    if (live.intent === 'running') await this.apply(live, 'pause');
    else await this.bounded(Promise.allSettled([...live.effects]));
    await this.bounded(live.owner.exclusive(async () => undefined));
    await this.close(jobId, live);
  }

  private async acquire(jobId: string): Promise<LiveJob> {
    const session = await this.deps.store.acquire(jobId, {
      recover: this.deps.recover,
    });
    const live: LiveJob = {
      owner: new JobOwner(session),
      progress: new ProgressReporter({ now: this.now }),
      artwork: new Map(),
      trackArtwork: new Map(),
      eventTail: Promise.resolve(),
      controllers: new Map(),
      effects: new Set(),
      startedAt: this.now(),
      intent: session.manifest.control.state,
      generation: 0,
      seq: 0,
      closed: false,
      polling: false,
    };
    this.jobs.set(jobId, live);
    live.poll = setInterval(() => {
      void this.poll(jobId, live);
    }, this.options.controlPollMs ?? 100);
    live.heartbeat = setInterval(() => {
      void session.heartbeat().catch(() => this.halt(live, 'paused'));
    }, 5000);
    return live;
  }

  private async launch(jobId: string, live: LiveJob): Promise<JobManifestV1> {
    const generation = live.generation;
    const work = Promise.all(
      live.owner.current.tracks
        .filter((track) =>
          [
            'queued',
            'resolving',
            'ready',
            'downloading',
            'retry_wait',
            'paused',
          ].includes(track.status),
        )
        .map(async (track) => {
          while (
            !live.closed &&
            live.intent === 'running' &&
            generation === live.generation
          ) {
            const outcome = await this.deps.scheduler.run(async () => {
              if (
                live.closed ||
                live.intent !== 'running' ||
                generation !== live.generation
              )
                return undefined;
              const current = live.owner.current.tracks.find(
                (item) => item.trackKey === track.trackKey,
              )!;
              if (current.status === 'retry_wait')
                await live.owner.transition(track.trackKey, 'backoff_elapsed');
              if (
                ['completed', 'skipped', 'failed', 'cancelled'].includes(
                  current.status,
                ) ||
                live.controllers.has(track.trackKey)
              )
                return undefined;
              const controller = new AbortController();
              live.controllers.set(track.trackKey, controller);
              const effect = live.owner.session.runOwned(() =>
                this.pipeline.attempt(
                  {
                    owner: live.owner,
                    progress: live.progress,
                    artwork: live.artwork,
                    trackArtwork: live.trackArtwork,
                    control: () => live.intent,
                    emit: (event, key, payload) =>
                      this.emit(live, event, key, payload),
                    fatal: (key, reason) => this.fatal(live, key, reason),
                  },
                  track.trackKey,
                  controller.signal,
                ),
              );
              live.effects.add(effect);
              try {
                return await effect;
              } finally {
                live.effects.delete(effect);
                live.controllers.delete(track.trackKey);
              }
            });
            if (outcome === undefined) return;
            // Backoff не удерживает slot и проверяет control после ожидания.
            await new Promise<void>((resolve) => {
              const timer = setInterval(() => {
                if (
                  live.closed ||
                  live.intent !== 'running' ||
                  generation !== live.generation
                ) {
                  clearInterval(timer);
                  resolve();
                }
              }, this.options.controlPollMs ?? 100);
              void this.sleep(outcome).then(() => {
                clearInterval(timer);
                resolve();
              });
            });
          }
        }),
    );
    const loop = work.then(async () => {
      if (
        !live.closed &&
        generation === live.generation &&
        live.intent === 'running'
      ) {
        const status = aggregateJobStatus({
          control: live.owner.current.control.state,
          leaseAlive: true,
          tracks: live.owner.current.tracks.map((track) => track.status),
        });
        if (['completed', 'completed_with_errors', 'failed'].includes(status)) {
          await this.emit(live, 'job.completed');
          await this.close(jobId, live);
        }
      }
      // Глобальная остановка освобождает lease только после полного drain.
      // Следующий resume делает настоящий acquire/recovery незавершённых побочных фаз.
      if (
        !live.closed &&
        live.intent === 'paused' &&
        live.owner.current.control.pauseReason !== undefined &&
        live.effects.size === 0
      )
        await this.close(jobId, live);
      return live.owner.current;
    });
    live.loop = loop;
    return loop;
  }

  private halt(live: LiveJob, intent: 'paused' | 'cancelled'): void {
    if (live.intent === 'cancelled') return;
    live.intent = intent;
    live.generation += 1;
    for (const controller of live.controllers.values()) controller.abort();
  }

  private async apply(
    live: LiveJob,
    command: ControlRequest['command'],
  ): Promise<void> {
    if (
      command === 'resume' &&
      live.owner.current.control.pauseReason === 'AUTH_REQUIRED'
    ) {
      if ((await this.deps.provider.getAccount()) === null)
        throw new AuthenticationError();
    }
    if (command === 'pause' || command === 'cancel') {
      this.halt(live, command === 'cancel' ? 'cancelled' : 'paused');
      // Intent доступен до serialized save: processing может drain, stream отменяется сразу.
      await this.bounded(
        (async () => {
          await live.owner.control(command);
          await Promise.allSettled([...live.effects]);
          if (command === 'cancel') {
            for (const track of live.owner.current.tracks) {
              if (['completed', 'skipped', 'cancelled'].includes(track.status))
                continue;
              if (track.status === 'failed') continue;
              await this.pipeline.cleanup(track);
              await live.owner.transition(track.trackKey, 'cancel', {
                partial: undefined,
              });
            }
          }
        })(),
      );
      return;
    }
    await live.owner.control(command);
    live.intent = live.owner.current.control.state;
  }

  private async fatal(
    live: LiveJob,
    trackKey: string,
    reason:
      'AUTH_REQUIRED' | 'DISK_FULL' | 'PERMISSION_DENIED' | 'CHECKPOINT_FAILED',
  ): Promise<boolean> {
    if (live.intent !== 'running') return false;
    this.halt(live, 'paused');
    await live.owner.mutate((manifest) => ({
      ...manifest,
      control: {
        state: 'paused',
        pauseReason: reason,
        pauseTrackKey: trackKey,
      },
    }));
    return true;
  }

  private async poll(jobId: string, live: LiveJob): Promise<void> {
    if (live.closed || live.polling) return;
    live.polling = true;
    try {
      await live.owner.session.consumeControls((request) =>
        live.owner.receipt(request, async () => {
          await this.apply(live, request.command);
          if (
            live.intent === 'running' &&
            (request.command === 'resume' || request.command === 'retry')
          )
            void this.launch(jobId, live).catch(() => undefined);
        }),
      );
      if (live.intent === 'cancelled') await this.close(jobId, live);
    } catch {
      this.halt(live, 'paused');
    } finally {
      live.polling = false;
    }
  }

  private async emit(
    live: LiveJob,
    event: string,
    trackKey?: string,
    payload?: Record<string, number>,
  ): Promise<void> {
    const track = live.owner.current.plan.tracks.find(
      (item) => item.trackKey === trackKey,
    );
    const value = {
      schemaVersion: 1 as const,
      event,
      seq:
        this.deps.events?.nextSequence?.(live.owner.current.jobId) ??
        ++live.seq,
      jobId: live.owner.current.jobId,
      ...(trackKey === undefined ? {} : { trackKey, trackId: track?.track.id }),
      durationMs: Math.max(0, this.now() - live.startedAt),
      ...(payload === undefined ? {} : { payload }),
    } as JobEvent;
    const publication = live.eventTail.then(() =>
      this.deps.events?.publish(value),
    );
    live.eventTail = publication.catch(() => undefined);
    await publication;
  }

  private async close(jobId: string, live: LiveJob): Promise<void> {
    if (live.closePromise === undefined) {
      live.closed = true;
      clearInterval(live.poll);
      clearInterval(live.heartbeat);
      // @link planning/tasks/STEP-049.md: все close/shutdown ждут один release.
      // Job исчезает только после успешного release, чтобы не объявить lease свободной раньше времени.
      live.closePromise = live.owner.session.release().then(() => {
        this.jobs.delete(jobId);
      });
    }
    await this.bounded(live.closePromise);
  }
  private async bounded<T>(operation: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new DomainError('DOWNLOAD_ERROR', false)),
            this.options.stopTimeoutMs ?? 5000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
}

export function createDownloadManager(
  dependencies: DownloadManagerDependencies,
  options: DownloadManagerOptions = {},
): DownloadManager {
  return new DownloadManager(dependencies, options);
}
