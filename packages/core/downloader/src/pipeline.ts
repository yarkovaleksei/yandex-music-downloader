import {
  DomainError,
  DownloadError,
  TrackUnavailableError,
  ValidationError,
  safeDomainError,
  type ArtworkData,
  type AudioStream,
  type AudioVariant,
  type ManifestTrack,
  type QualityPreference,
} from '@music-downloader/shared';
import { createAudioValidator } from '@music-downloader/core-validation';
import type {
  DownloadManagerDependencies,
  DownloadManagerOptions,
  RangeResponse,
} from './ports.js';
import type { JobOwner } from './job-owner.js';
import type { ProgressReporter } from './progress.js';

export interface PipelineContext {
  readonly owner: JobOwner;
  readonly progress: ProgressReporter;
  readonly artwork: Map<string, Promise<ArtworkData>>;
  readonly trackArtwork: Map<string, ArtworkData>;
  readonly control: () => 'running' | 'paused' | 'cancelled';
  readonly emit: (
    event: string,
    trackKey?: string,
    payload?: Record<string, number>,
  ) => Promise<void>;
  readonly fatal: (
    trackKey: string,
    reason:
      'AUTH_REQUIRED' | 'DISK_FULL' | 'PERMISSION_DENIED' | 'CHECKPOINT_FAILED',
  ) => Promise<boolean>;
}

/** Поздний skip — отдельный outcome; void rename checkpoint не превращает его в completed. */
class SkippedFinalization extends Error {}

/** Один slot выполняет одну попытку; ожидание backoff находится вне scheduler. */
export class TrackPipeline {
  public constructor(
    private readonly deps: DownloadManagerDependencies,
    private readonly options: DownloadManagerOptions,
  ) {}

  public async attempt(
    context: PipelineContext,
    key: string,
    signal: AbortSignal,
  ): Promise<number | undefined> {
    const { owner } = context;
    let committed = false;
    let existing: 'absent' | 'valid' | 'invalid' | undefined;
    let onExisting: 'skip' | 'replace' =
      this.options.overwrite === true ? 'replace' : 'skip';
    try {
      let track = this.track(owner, key);
      let artwork: ArtworkData | undefined;
      if (track.status === 'queued' || track.status === 'resolving') {
        if (track.status === 'queued') {
          await owner.transition(key, 'start_resolving');
          await context.emit('track.started', key);
        }
        const planned = owner.current.plan.tracks.find(
          (item) => item.trackKey === key,
        )!;
        const metadata = await this.deps.provider.getTrack(planned.track.id);
        if (metadata.availability !== 'available')
          throw new TrackUnavailableError();
        const variants = await this.deps.provider.getAudioVariants(metadata.id);
        const selected = this.deps.selectVariant(
          variants,
          owner.current.quality as QualityPreference,
        );
        if (!selected.ok) throw selected.error;
        // @link planning/tasks/STEP-048.md
        // Размер 500 воспроизводимо возвращает HTTP 404 для контрольной обложки, поэтому по умолчанию используется подтверждённый 400.
        const artworkSize = this.options.artworkSize ?? 400;
        const reference = metadata.artwork ?? metadata.album?.artwork;
        if (reference !== undefined) {
          const cacheKey = `${reference.key}:${String(artworkSize)}`;
          const persisted = await this.deps.artworkCache.read(
            owner.current.jobId,
            key,
          );
          let pending = context.artwork.get(cacheKey);
          if (pending === undefined && persisted?.artwork !== undefined) {
            pending = Promise.resolve(persisted.artwork);
            context.artwork.set(cacheKey, pending);
          }
          if (pending === undefined) {
            pending = this.deps.provider.fetchArtwork(reference, artworkSize);
            context.artwork.set(cacheKey, pending);
            void pending.catch(() => {
              if (context.artwork.get(cacheKey) === pending)
                context.artwork.delete(cacheKey);
            });
          }
          artwork = await pending;
          context.trackArtwork.set(key, artwork);
        }
        const paths = this.deps.files.paths(
          owner.current,
          key,
          selected.variant,
        );
        // F-001: cache завершается до ready, поэтому paused stream восстанавливает готовые bytes.
        await this.deps.artworkCache.write(owner.current.jobId, key, {
          artwork,
        });
        // F-004: inspection относится к resolving; его ошибки имеют разрешённый fatal transition.
        await this.deps.files.inspect(paths.resultPath);
        await owner.transition(key, 'variant_selected', {
          variant: selected.variant,
          variantKey: selected.variant.key,
          ...paths,
        });
        await context.emit('variant.selected', key);
        track = this.track(owner, key);
      }
      if (context.control() !== 'running') return undefined;
      const variant = track.variant;
      if (
        variant === undefined ||
        track.partPath === undefined ||
        track.resultPath === undefined
      )
        throw new DownloadError();
      const inspectExistingAudio = async (): Promise<
        'absent' | 'valid' | 'invalid'
      > => {
        const state = await this.deps.files.inspect(track.resultPath!);
        if (state !== 'valid' || this.options.overwrite === true) return state;
        const planned = owner.current.plan.tracks.find(
          (item) => item.trackKey === key,
        )!;
        try {
          await (this.deps.validator ?? createAudioValidator()).validate({
            path: track.resultPath!,
            variant,
            expectedDurationMs: planned.track.durationMs,
          });
          return 'valid';
        } catch (error) {
          // @link ../../../../planning/reviews/STEP-023/REVIEW-20261011T141250Z.md F-003
          if (error instanceof ValidationError) return 'invalid';
          throw error;
        }
      };
      if (track.status === 'ready') {
        existing ??= await inspectExistingAudio();
        if (existing === 'valid' && this.options.overwrite !== true) {
          await owner.transition(key, 'skip_existing');
          await this.complete(context, key, 0);
          return undefined;
        }
        if (existing === 'invalid') onExisting = 'replace';
        await owner.transition(key, 'start_download');
      } else if (track.status === 'paused') {
        // @link ../../../../planning/reviews/STEP-023/REVIEW-20261011T143332Z.md F-001
        // PermissionError допустимо обрабатывается только после paused→downloading.
        await owner.transition(key, 'resume');
      }
      if (context.control() !== 'running') return undefined;
      track = this.track(owner, key);
      if (existing === undefined) {
        existing = await inspectExistingAudio();
        if (existing === 'invalid') onExisting = 'replace';
      }
      const cached = await this.deps.artworkCache.read(
        owner.current.jobId,
        key,
      );
      if (cached === undefined) throw new DownloadError();
      artwork = cached.artwork;
      await context.emit('download.started', key);
      const downloaded = await this.download(context, track, variant, signal);
      if (context.control() !== 'running')
        throw new DOMException('Операция остановлена.', 'AbortError');
      await owner.transition(key, 'stream_complete', {
        partial: {
          bytes: downloaded.bytes,
          expectedSize: downloaded.expectedSize,
          variantKey: variant.key,
          tagged: false,
        },
      });
      await context.emit('download.completed', key);
      // Готовые bytes берутся из безопасного cache; processing не выполняет сетевых вызовов.
      artwork ??= context.trackArtwork.get(key);
      try {
        await owner.exclusive(() =>
          this.deps.checkpoint(owner.session, key, {
            mutateAndValidate: async () => {
              const planned = owner.current.plan.tracks.find(
                (item) => item.trackKey === key,
              )!;
              const validator = this.deps.validator ?? createAudioValidator();
              const initial = await validator.validate({
                path: track.partPath!,
                variant,
                expectedDurationMs: planned.track.durationMs,
                stream: {
                  completed: true,
                  bytes: downloaded.bytes,
                  expectedSize: downloaded.expectedSize,
                },
              });
              await this.deps.processing?.validate?.(
                track.partPath!,
                variant,
                'initial',
              );
              if (this.deps.processing?.metadata !== undefined) {
                await this.deps.processing.metadata(
                  track.partPath!,
                  variant,
                  artwork,
                  {
                    plannedTrack: planned,
                    sourceKind: owner.current.plan.source.kind,
                    resultPath: track.resultPath!,
                    embedArtwork: true,
                    saveCoverFile: true,
                  },
                );
                await context.emit('metadata.written', key);
              }
              if (this.deps.processing?.validate !== undefined) {
                await this.deps.processing.validate(
                  track.partPath!,
                  variant,
                  'final',
                );
              }
              const final = await validator.validate({
                path: track.partPath!,
                variant,
                expectedDurationMs: planned.track.durationMs,
              });
              // @link ../../../../docs/requirements/REQ-036-diag-observability.md
              await context.emit('validation.completed', key, {
                durationMs: final.durationMs || initial.durationMs,
              });
            },
            size: async () => {
              const size = await this.deps.files.stat(track.partPath!);
              if (size === undefined) throw new DownloadError();
              return size;
            },
            rename: async () => {
              if (context.control() === 'cancelled')
                throw new DOMException('Операция отменена.', 'AbortError');
              // Late finalization rechecks the replace target after pause/resume or external mutation.
              if (
                onExisting === 'skip' &&
                (await inspectExistingAudio()) === 'invalid'
              )
                onExisting = 'replace';
              const result = await this.deps.files.finalize(
                track.partPath!,
                track.resultPath!,
                variant,
                onExisting,
              );
              if (result.status === 'skipped') throw new SkippedFinalization();
              committed = true;
            },
          }),
        );
      } catch (error) {
        if (!(error instanceof SkippedFinalization)) throw error;
        await owner.transition(key, 'skip_existing', { partial: undefined });
      }
      await this.complete(context, key, downloaded.bytes);
      return undefined;
    } catch (error) {
      const track = this.track(owner, key);
      if (track.status === 'completed' || track.status === 'skipped')
        return undefined;
      if (context.control() === 'cancelled') {
        await this.cleanup(track);
        await owner.transition(key, 'cancel', { partial: undefined });
        return undefined;
      }
      if (
        signal.aborted &&
        context.control() === 'paused' &&
        track.status === 'downloading'
      ) {
        await this.persistPartial(owner, track);
        await owner.transition(key, 'pause');
        context.progress.resetWindow(
          key,
          (await this.deps.files.stat(track.partPath!)) ?? 0,
        );
        return undefined;
      }
      const attempts = track.attempts + 1;
      const decision = this.deps.retry(error, attempts);
      // F-003: rename уже состоялся. Сохраняем processing+marker для genuine recovery;
      // ошибку save(completed) нельзя преобразовать в failed и отменить commit.
      if (committed) {
        if (decision.action === 'pause_job' && decision.reason !== undefined)
          await context.fatal(key, decision.reason);
        else await context.fatal(key, 'CHECKPOINT_FAILED');
        return undefined;
      }
      // F-002: первый callback резервирует глобальную паузу ДО любых awaits mutations.
      // Побочные resolving failures остаются unfinished и нормализуются recovery при acquire.
      if (decision.action === 'pause_job' && decision.reason !== undefined) {
        if (!(await context.fatal(key, decision.reason))) return undefined;
      }
      const normalized =
        error instanceof DomainError ? error.toJSON() : safeDomainError(error);
      await owner.mutate((manifest) => ({
        ...manifest,
        tracks: manifest.tracks.map((item) =>
          item.trackKey === key
            ? { ...item, attempts, error: normalized }
            : item,
        ),
      }));
      if (track.status === 'downloading')
        await this.persistPartial(owner, this.track(owner, key));
      if (
        (decision.action === 'retry' || decision.action === 'reopen_stream') &&
        (track.status === 'resolving' || track.status === 'downloading')
      ) {
        await owner.transition(key, 'transient_error', { error: normalized });
        context.progress.resetWindow(key);
        return decision.delayMs ?? 0;
      }
      await owner.transition(key, 'fatal_error', { error: normalized });
      return undefined;
    }
  }

  private async download(
    context: PipelineContext,
    track: ManifestTrack,
    variant: AudioVariant,
    signal: AbortSignal,
  ): Promise<{ bytes: number; expectedSize?: number }> {
    const files = this.deps.files;
    const path = track.partPath!;
    const partial = track.partial;
    const actual = (await files.stat(path)) ?? 0;
    const offset =
      partial !== undefined &&
      !partial.tagged &&
      partial.variantKey === variant.key &&
      partial.expectedSize !== undefined
        ? actual
        : 0;
    context.progress.resetWindow(track.trackKey, offset);
    const open = (start: number) =>
      this.deps.provider.openAudioStream(
        context.owner.current.plan.tracks.find(
          (item) => item.trackKey === track.trackKey,
        )!.track.id,
        variant.key,
        { signal, offset: start },
      );
    let response = await open(offset);
    let expected = response.contentLength;
    await context.owner.mutate((manifest) => ({
      ...manifest,
      tracks: manifest.tracks.map((item) =>
        item.trackKey === track.trackKey
          ? {
              ...item,
              partial: {
                bytes: actual,
                expectedSize: expected,
                variantKey: variant.key,
                tagged: false,
              },
            }
          : item,
      ),
    }));
    const responseOf = (value: AudioStream): RangeResponse => {
      if (value.contentLength === undefined) throw new DownloadError();
      return { ...value, contentLength: value.contentLength };
    };
    const candidate = `${path}.candidate`;
    let lastFlush = 0;
    const write = async (
      stream: ReadableStream<Uint8Array>,
      target: string,
      size?: number,
    ) => {
      let bytes = 0;
      const observed = stream.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
          transform: async (chunk, controller) => {
            bytes += chunk.byteLength;
            const snapshot = context.progress.report(
              track.trackKey,
              bytes,
              size,
            );
            await context.emit('track.progress', track.trackKey, {
              bytes,
              fraction: snapshot.fraction,
              ...(snapshot.speedBytesPerSecond === undefined
                ? {}
                : { speed: snapshot.speedBytesPerSecond }),
              ...(snapshot.etaMs === undefined ? {} : { eta: snapshot.etaMs }),
            });
            const now = this.deps.now?.() ?? Date.now();
            if (now - lastFlush >= (this.options.progressFlushMs ?? 200)) {
              lastFlush = now;
              await context.owner.mutate((manifest) => ({
                ...manifest,
                tracks: manifest.tracks.map((item) =>
                  item.trackKey === track.trackKey && item.partial !== undefined
                    ? { ...item, partial: { ...item.partial, bytes } }
                    : item,
                ),
              }));
            }
            controller.enqueue(chunk);
          },
        }),
      );
      await files.write(observed, target, { signal, expectedSize: size });
    };
    try {
      if (offset > 0 && expected !== undefined) {
        const range = await this.deps.prepareRange(
          {
            stat: files.stat.bind(files),
            read: files.read.bind(files),
            candidatePath: () => candidate,
            writeStreamToPart: (stream, target, size) =>
              write(stream, target, size),
            promote: files.promote.bind(files),
            reopenAtZero: async () => {
              await response.stream.cancel().catch(() => undefined);
              response = await open(0);
              expected = response.contentLength;
              return responseOf(response);
            },
          },
          path,
          partial,
          variant.key,
          responseOf(response),
        );
        // Range определяет total prefix+suffix; stream_complete не заменяет его partial bytes.
        expected = range.expectedSize;
      } else {
        if (response.startOffset !== 0) {
          await response.stream.cancel().catch(() => undefined);
          response = await open(0);
          expected = response.contentLength;
        }
        await write(response.stream, path, response.contentLength);
      }
    } catch (error) {
      // Candidate содержит prefix+полученный suffix: pause сохраняет actual bytes, cancel уберёт оба.
      if (
        context.control() !== 'cancelled' &&
        (await files.stat(candidate)) !== undefined
      )
        await files.promote(candidate, path);
      throw error;
    }
    return { bytes: (await files.stat(path)) ?? 0, expectedSize: expected };
  }

  private async persistPartial(
    owner: JobOwner,
    track: ManifestTrack,
  ): Promise<void> {
    if (track.partPath === undefined || track.partial === undefined) return;
    const bytes = (await this.deps.files.stat(track.partPath)) ?? 0;
    await owner.mutate((manifest) => ({
      ...manifest,
      tracks: manifest.tracks.map((item) =>
        item.trackKey === track.trackKey && item.partial !== undefined
          ? { ...item, partial: { ...item.partial, bytes } }
          : item,
      ),
    }));
  }
  public async cleanup(track: ManifestTrack): Promise<void> {
    if (track.partPath === undefined) return;
    await this.deps.files.discard(track.partPath);
    await this.deps.files.discard(`${track.partPath}.candidate`);
  }
  private track(owner: JobOwner, key: string): ManifestTrack {
    const track = owner.current.tracks.find((item) => item.trackKey === key);
    if (track === undefined) throw new DownloadError();
    return track;
  }
  private async complete(
    context: PipelineContext,
    key: string,
    bytes: number,
  ): Promise<void> {
    const snapshot = context.progress.complete(key, bytes, bytes);
    await context.emit('track.progress', key, {
      bytes,
      fraction: snapshot.fraction,
    });
    const tracks = context.owner.current.tracks;
    const completed = tracks.filter(
      (item) => item.status === 'completed' || item.status === 'skipped',
    ).length;
    await context.emit('job.progress', undefined, {
      completed,
      total: tracks.length,
      fraction: tracks.length === 0 ? 1 : completed / tracks.length,
    });
  }
}
