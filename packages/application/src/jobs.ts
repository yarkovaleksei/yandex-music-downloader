import { randomUUID } from 'node:crypto';
import {
  aggregateJobStatus,
  createDownloadManager,
} from '@music-downloader/core-downloader';
import type { DownloadManagerDependencies } from '@music-downloader/core-downloader';
import {
  buildAlbumPlan,
  buildPlaylistPlan,
  buildTrackPlan,
  createTrackJobs,
} from '@music-downloader/core-planner';
import {
  DownloadError,
  CommandRefusalError,
  type DownloadRequest,
  type DesktopStateStore,
  type EffectiveDownload,
  type HistoryEntry,
  ValidationError,
  type JobManifestV1,
  type JobSnapshot,
  type ManifestStore,
  type MusicProvider,
} from '@music-downloader/shared';
import type { ApplicationEvents } from './events.js';

async function planFor(
  provider: MusicProvider,
  source: DownloadRequest['source'],
) {
  if (source.kind === 'track')
    return buildTrackPlan(source, await provider.getTrack(source.id));
  if (source.kind === 'album')
    return buildAlbumPlan(source, await provider.getAlbum(source.id));
  return buildPlaylistPlan(source, await provider.getPlaylist(source.id));
}

async function snapshot(
  store: ManifestStore,
  manifest: JobManifestV1,
): Promise<JobSnapshot> {
  const lease = await store.readLeaseState(manifest.jobId);
  const statuses = manifest.tracks.map((track) => track.status);
  const active = aggregateJobStatus({
    control: manifest.control.state,
    leaseAlive: true,
    tracks: statuses,
  });
  const inactive = aggregateJobStatus({
    control: manifest.control.state,
    leaseAlive: false,
    tracks: statuses,
  });
  if (lease === 'unknown' && active !== inactive)
    throw new DownloadError(false);
  const status =
    lease === 'active' ? active : lease === 'inactive' ? inactive : active;
  return {
    jobId: manifest.jobId,
    source: manifest.source,
    status,
    ...(manifest.control.pauseReason === undefined
      ? {}
      : { pauseReason: manifest.control.pauseReason }),
    tracks: manifest.tracks.map((track) => ({
      trackKey: track.trackKey,
      status: track.status,
      ...(track.resultPath === undefined
        ? {}
        : { resultPath: track.resultPath }),
    })),
  };
}

/** Facade создаёт manifest до manager.run и оставляет lifecycle/state transitions core. */
export class Jobs {
  private readonly managers = new Map<
    string,
    ReturnType<typeof createDownloadManager>
  >();

  public constructor(
    private readonly provider: MusicProvider,
    private readonly store: ManifestStore,
    private readonly dependencies: Omit<
      DownloadManagerDependencies,
      'store' | 'provider' | 'events'
    >,
    private readonly events: ApplicationEvents,
    private readonly desktopState?: DesktopStateStore,
  ) {}

  public async create(
    request: DownloadRequest,
    effective?: EffectiveDownload,
  ): Promise<JobSnapshot> {
    const plan = await planFor(this.provider, request.source);
    const now = new Date().toISOString();
    const manifest: JobManifestV1 = {
      version: 1,
      jobId: randomUUID(),
      provider: request.source.provider,
      source: request.source,
      plan,
      quality: request.quality,
      destination: request.destination,
      control: { state: 'running' },
      tracks: createTrackJobs(plan).map((track) => ({
        position: Number(track.trackKey),
        trackKey: track.trackKey,
        status: 'queued',
        attempts: 0,
        history: [],
        updatedAt: now,
      })),
      createdAt: now,
      updatedAt: now,
    };
    await this.store.create(manifest);
    // REQ-051: отказ снимка запрещает запуск manager; defaults не заменяют исходные параметры.
    if (effective !== undefined)
      this.desktopState!.saveSnapshot(manifest.jobId, effective);
    for (const event of [
      'job.created',
      'entity.resolved',
      'plan.created',
    ] as const) {
      this.events.publish({
        schemaVersion: 1,
        event,
        seq: this.events.nextSequence(manifest.jobId),
        jobId: manifest.jobId,
        durationMs: 0,
      });
    }
    await this.manager(manifest.jobId, request.overwrite).run(manifest.jobId);
    return this.get(manifest.jobId).then((value) => {
      if (value === null) throw new DownloadError(false);
      return value;
    });
  }

  public async command(
    jobId: string,
    value: 'pause' | 'resume' | 'retry' | 'cancel',
  ): Promise<JobSnapshot> {
    // Проверка до manager.acquire не создаёт каталог отсутствующего job (STEP-045).
    if ((await this.store.read(jobId)) === undefined)
      throw new CommandRefusalError('JOB_NOT_FOUND');
    const ownedManager = this.managers.get(jobId);
    // Только собственный active manager останавливается shutdown; чужой owner
    // получает control через core inbox/receipt в manager.command.
    if (value === 'pause' && ownedManager !== undefined)
      await ownedManager.shutdown(jobId);
    else await this.manager(jobId).command(jobId, value);
    const valueAfter = await this.get(jobId);
    if (valueAfter === null) throw new DownloadError(false);
    return valueAfter;
  }

  public async get(jobId: string): Promise<JobSnapshot | null> {
    const manifest = await this.store.read(jobId);
    return manifest === undefined ? null : snapshot(this.store, manifest);
  }

  public async list(): Promise<readonly JobSnapshot[]> {
    const manifests = await this.store.list();
    return Promise.all(
      manifests.map((manifest) => snapshot(this.store, manifest)),
    );
  }

  public async history(): Promise<readonly HistoryEntry[]> {
    const hidden = new Set(this.desktopState?.hidden() ?? []);
    const entries: HistoryEntry[] = [];
    for (const manifest of await this.store.list()) {
      if (hidden.has(manifest.jobId)) continue;
      const status = (await snapshot(this.store, manifest)).status;
      if (
        !['completed', 'completed_with_errors', 'failed', 'cancelled'].includes(
          status,
        )
      )
        continue;
      const effective = this.effective(manifest);
      const sizes = manifest.tracks.map((track) =>
        ['completed', 'skipped'].includes(track.status)
          ? track.postProcessing?.size
          : undefined,
      );
      entries.push({
        jobId: manifest.jobId,
        source: manifest.source,
        title: manifest.plan.title,
        artists: [
          ...new Set(
            manifest.plan.tracks.flatMap(
              (track) =>
                track.track.artists?.map((artist) => artist.name) ?? [],
            ),
          ),
        ],
        count: manifest.tracks.length,
        bytes:
          sizes.length > 0 && sizes.every((size) => size !== undefined)
            ? sizes.reduce<number>((sum, size) => sum + (size ?? 0), 0)
            : null,
        completedAt: manifest.updatedAt,
        replayAvailable: effective !== null,
        replayReason:
          effective === null
            ? 'Исходные настройки старого задания неизвестны. Повторная загрузка недоступна.'
            : null,
      });
    }
    return entries.sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  }
  public async hideHistory(jobId: string): Promise<null> {
    if (!(await this.history()).some((entry) => entry.jobId === jobId))
      throw new ValidationError();
    this.desktopState!.hide(jobId);
    return null;
  }
  public async replay(jobId: string): Promise<JobSnapshot> {
    const manifest = await this.store.read(jobId);
    const effective = manifest === undefined ? null : this.effective(manifest);
    if (effective === null) throw new ValidationError();
    return this.create(effective, effective);
  }
  private effective(manifest: JobManifestV1): EffectiveDownload | null {
    const value = this.desktopState?.snapshot(manifest.jobId);
    // Исходные source/quality/destination не берутся из renderer или текущих defaults.
    if (
      !value ||
      value.source.provider !== manifest.source.provider ||
      value.source.kind !== manifest.source.kind ||
      value.source.id !== manifest.source.id ||
      value.destination !== manifest.destination ||
      value.quality !== manifest.quality
    )
      return null;
    return value;
  }

  public async shutdown(): Promise<void> {
    await Promise.all(
      [...this.managers.entries()].map(async ([jobId, manager]) =>
        manager.shutdown(jobId),
      ),
    );
    this.managers.clear();
  }

  private manager(jobId: string, overwrite?: boolean) {
    const current = this.managers.get(jobId);
    if (current !== undefined) return current;
    const effective = this.desktopState?.snapshot(jobId);
    const manager = createDownloadManager(
      {
        ...this.dependencies,
        store: this.store,
        provider: this.provider,
        events: {
          nextSequence: this.events.nextSequence,
          publish: this.events.publish,
        },
      },
      (effective?.overwrite ?? overwrite) === undefined
        ? {}
        : { overwrite: effective?.overwrite ?? overwrite },
    );
    this.managers.set(jobId, manager);
    return manager;
  }
}
