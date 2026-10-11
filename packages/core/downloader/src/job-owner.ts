import {
  DomainError,
  ValidationError,
  safeDomainError,
  type ControlReceipt,
  type ControlRequest,
  type JobManifestV1,
  type LeaseSession,
  type ManifestStore,
} from '@music-downloader/shared';
import { resumeJob, transitionJobControl } from './state/control.js';
import {
  transitionTrack,
  type TrackEvent,
  type TrackState,
} from './state/transitions.js';

/** Один writer на job: lane сериализует transitions, progress и checkpoint snapshots ADR-004. */
export class JobOwner {
  private tail: Promise<unknown> = Promise.resolve();
  public constructor(public readonly session: LeaseSession) {}
  public get current(): JobManifestV1 {
    return this.session.manifest;
  }

  public async mutate(
    change: (manifest: JobManifestV1) => JobManifestV1,
  ): Promise<void> {
    return this.exclusive(async () => {
      await this.session.save(change(this.current));
    });
  }

  /** Checkpoint держит lane только во время processing, никогда во время network/backoff. */
  public exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.tail.then(operation);
    this.tail = next.catch(() => undefined);
    return next;
  }

  public async transition(
    trackKey: string,
    event: TrackEvent,
    patch: Partial<JobManifestV1['tracks'][number]> = {},
  ): Promise<void> {
    await this.mutate((manifest) => ({
      ...manifest,
      updatedAt: new Date().toISOString(),
      tracks: manifest.tracks.map((track) => {
        if (track.trackKey !== trackKey) return track;
        const state: TrackState = {
          status: track.status,
          retryPhase:
            track.retryPhase === 'processing' ? undefined : track.retryPhase,
        };
        const next = transitionTrack(state, event);
        if (!next.ok) throw new ValidationError();
        return {
          ...track,
          ...patch,
          ...next.state,
          retryPhase: next.state.retryPhase,
          updatedAt: new Date().toISOString(),
          history: [
            ...track.history,
            {
              at: new Date().toISOString(),
              status: next.state.status,
              error: patch.error,
            },
          ],
        };
      }),
    }));
  }

  public async control(command: ControlRequest['command']): Promise<void> {
    await this.mutate((manifest) => {
      const state = {
        control: manifest.control.state,
        pauseReason: manifest.control.pauseReason as
          'AUTH_REQUIRED' | 'DISK_FULL' | 'PERMISSION_DENIED' | undefined,
        pauseTrackKey: manifest.control.pauseTrackKey,
      };
      const resumed = command === 'resume' ? resumeJob(state) : undefined;
      const next =
        resumed === undefined
          ? transitionJobControl(state, command)
          : resumed.ok
            ? { ok: true as const, state: resumed.state.state }
            : resumed;
      if (!next.ok) throw new ValidationError();
      const authKey = resumed?.ok ? resumed.state.requeueTrackKey : undefined;
      return {
        ...manifest,
        control: {
          state: next.state.control,
          pauseReason: next.state.pauseReason,
          pauseTrackKey: next.state.pauseTrackKey,
        },
        tracks: manifest.tracks.map((track) => {
          const event =
            command === 'retry' && track.status === 'failed'
              ? 'retry'
              : authKey === track.trackKey && track.status === 'failed'
                ? 'auth_resume'
                : undefined;
          if (event === undefined) return track;
          const transitioned = transitionTrack({ status: track.status }, event);
          return transitioned.ok
            ? {
                ...track,
                ...transitioned.state,
                error: undefined,
                attempts: 0,
                retryPhase: undefined,
                updatedAt: new Date().toISOString(),
              }
            : track;
        }),
        updatedAt: new Date().toISOString(),
      };
    });
  }

  public async receipt(
    request: ControlRequest,
    apply: () => Promise<void>,
  ): Promise<ControlReceipt> {
    try {
      await apply();
      return {
        requestId: request.requestId,
        accepted: true,
        completedAt: new Date().toISOString(),
      };
    } catch (error) {
      return {
        requestId: request.requestId,
        accepted: false,
        completedAt: new Date().toISOString(),
        error: safeDomainError(error),
      };
    }
  }
}

/** Не-владелец пишет только inbox; никакие manifest snapshots не уходят из этого процесса. */
export async function requestJobControl(
  store: ManifestStore,
  jobId: string,
  command: ControlRequest['command'],
  timeoutMs = 5000,
): Promise<ControlReceipt> {
  const request = await store.sendControl(jobId, { command });
  const receipt = await store.waitControlAck(
    jobId,
    request.requestId,
    timeoutMs,
  );
  if (receipt === undefined) throw new DomainError('DOWNLOAD_ERROR', false);
  return receipt;
}
