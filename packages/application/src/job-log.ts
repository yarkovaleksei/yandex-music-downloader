import type { Logger } from '@music-downloader/logging';
import type { JobEvent, ManifestStore } from '@music-downloader/shared';

/**
 * Desktop-журнал для сообщений об ошибках: события уже прошли публичную проекцию,
 * а ошибки треков берутся из manifest, потому что отдельного события у них нет.
 */
export function logJobEvent(
  logger: Logger,
  store: ManifestStore,
  event: JobEvent,
): void {
  const log = logger.child({
    jobId: event.jobId,
    ...(event.trackId === undefined ? {} : { trackId: event.trackId }),
  });
  const data = {
    event: event.event,
    ...(event.trackKey === undefined ? {} : { trackKey: event.trackKey }),
    ...(event.payload === undefined ? {} : { payload: event.payload }),
  };
  switch (event.event) {
    case 'job.created':
      log.info('Задание создано.', data);
      return;
    case 'job.completed':
      void logOutcome(log, store, event.jobId);
      return;
    case 'job.progress':
    case 'track.progress':
      log.trace('Ход загрузки.', data);
      return;
    default:
      log.debug('Этап загрузки трека.', data);
  }
}

async function logOutcome(
  log: Logger,
  store: ManifestStore,
  jobId: string,
): Promise<void> {
  try {
    const manifest = await store.read(jobId);
    if (manifest === undefined) return;
    const counts: Record<string, number> = {};
    for (const track of manifest.tracks) {
      counts[track.status] = (counts[track.status] ?? 0) + 1;
      const trackId = manifest.plan.tracks.find(
        (item) => item.trackKey === track.trackKey,
      )?.track.id;
      const details = {
        trackKey: track.trackKey,
        ...(trackId === undefined ? {} : { trackId }),
        attempts: track.attempts,
      };
      // Повторы с ошибкой тоже важны: по ним видно нестабильную сеть или источник.
      const errors = track.history.flatMap((item) =>
        item.error === undefined ? [] : [item.error.code],
      );
      if (track.status === 'failed')
        log.error('Трек не загружен.', {
          ...details,
          code: track.error?.code,
          errors,
        });
      else if (errors.length > 0)
        log.warn('Трек загружен после повторов.', { ...details, errors });
    }
    log.info('Задание завершено.', {
      source: manifest.source.kind,
      tracks: counts,
    });
  } catch (error) {
    // Журнал не должен влиять на загрузку; причину оставляем для диагностики.
    log.warn('Не удалось записать итог задания.', error);
  }
}
