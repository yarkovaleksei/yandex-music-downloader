import type {
  AudioVariant,
  DownloadPlan,
  DownloadTrackJob,
} from '@music-downloader/shared';

/** Начальное состояние треков job: все в `queued`; переходы принадлежат state machine. */
export function createTrackJobs(plan: DownloadPlan): DownloadTrackJob[] {
  return plan.tracks.map((planned) => ({
    trackKey: planned.trackKey,
    trackId: planned.track.id,
    status: 'queued',
  }));
}

/** Записывает выбранный variant в новый объект; исходный job не меняется. */
export function withSelectedVariant(
  job: DownloadTrackJob,
  variant: AudioVariant,
): DownloadTrackJob {
  return { ...job, variant };
}
