import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ArtworkDto,
  JobSnapshot,
  JsonObject,
} from '@music-downloader/shared';
import type { DesktopApi } from '../contract/desktop-api.js';

export interface Notice {
  severity: 'success' | 'error' | 'info';
  message: string;
}
export const statusLabels: Record<string, string> = {
  queued: 'В очереди',
  running: 'Загрузка',
  paused: 'Приостановлено',
  interrupted: 'Прервано',
  completed: 'Завершено',
  completed_with_errors: 'Завершено с ошибками',
  failed: 'Ошибка',
  cancelled: 'Отменено',
  resolving: 'Получение данных',
  ready: 'Готов к загрузке',
  downloading: 'Загрузка',
  processing: 'Обработка',
  retry_wait: 'Ожидание повтора',
  skipped: 'Уже загружено',
};
export function allowed(
  job: JobSnapshot,
  action: 'pause' | 'resume' | 'cancel' | 'retry',
) {
  if (action === 'pause') return ['queued', 'running'].includes(job.status);
  if (action === 'resume')
    return ['paused', 'interrupted'].includes(job.status);
  if (action === 'cancel')
    return ['queued', 'running', 'paused', 'interrupted'].includes(job.status);
  return (
    !['completed', 'cancelled'].includes(job.status) &&
    job.tracks.some((track) => track.status === 'failed')
  );
}
export function numberField(payload: JsonObject | undefined, key: string) {
  const value = payload?.[key];
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

/** События дают прогресс, но команды и исход определяет свежий snapshot (ADR-016). */
export function useDownloads(api: DesktopApi) {
  const [jobs, setJobs] = useState<readonly JobSnapshot[]>([]);
  const [artwork, setArtwork] = useState<Record<string, ArtworkDto>>({});
  const artworkRequested = useRef(new Set<string>());
  const [progress, setProgress] = useState<Record<string, JsonObject>>({});
  const [trackProgress, setTrackProgress] = useState<
    Record<string, JsonObject>
  >({});
  const [connected, setConnected] = useState(true);
  const [notice, setNotice] = useState<Notice>();
  const [pending, setPending] = useState<Record<string, boolean>>({});
  useEffect(() => {
    for (const job of jobs) {
      if (artworkRequested.current.has(job.jobId)) continue;
      artworkRequested.current.add(job.jobId);
      // Обложка не задерживает управление очередью; ошибка оставляет музыкальный fallback.
      if (typeof api.downloadArtwork !== 'function') continue;
      void api
        .downloadArtwork({ jobId: job.jobId })
        .then((result) => {
          if (result.kind === 'result' && result.data)
            setArtwork((previous) => ({
              ...previous,
              [job.jobId]: result.data!,
            }));
        })
        .catch(() => {});
    }
  }, [api, jobs]);
  const notified = useRef(new Set<string>());
  const errorPauses = useRef(new Map<string, string>());
  const observePause = useCallback((job: JobSnapshot) => {
    if (job.status !== 'paused' || !job.pauseReason) {
      errorPauses.current.delete(job.jobId);
      return;
    }
    if (errorPauses.current.get(job.jobId) === job.pauseReason) return;
    errorPauses.current.set(job.jobId, job.pauseReason);
    // F-001: глобальная ошибка core останавливает run без job.completed.
    setNotice({
      severity: 'error',
      message:
        job.pauseReason === 'AUTH_REQUIRED'
          ? 'Загрузка приостановлена: требуется повторный вход в аккаунт.'
          : job.pauseReason === 'DISK_FULL'
            ? 'Загрузка приостановлена: освободите место на диске.'
            : 'Загрузка приостановлена из-за ошибки. Проверьте состояние задания.',
    });
  }, []);
  const completionPending = useRef(new Map<string, number>());
  const revisions = useRef(new Map<string, number>());
  const refreshSequence = useRef(0);
  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    const observed = new Map(revisions.current);
    const result = await api.listJobs();
    if (sequence !== refreshSequence.current) return;
    if (result.kind === 'result') {
      for (const job of result.data)
        if (revisions.current.get(job.jobId) === observed.get(job.jobId))
          observePause(job);
      setJobs((previous) => {
        const merged = new Map(result.data.map((job) => [job.jobId, job]));
        // Поздний ответ начального списка не стирает уже полученный snapshot события.
        for (const job of previous)
          if (revisions.current.get(job.jobId) !== observed.get(job.jobId))
            merged.set(job.jobId, job);
        return [...merged.values()];
      });
    } else setNotice({ severity: 'error', message: result.error.message });
  }, [api, observePause]);
  const readJob = useCallback(
    async (jobId: string, completionSequence?: number) => {
      if (completionSequence !== undefined)
        completionPending.current.set(jobId, completionSequence);
      const revision = (revisions.current.get(jobId) ?? 0) + 1;
      revisions.current.set(jobId, revision);
      const result = await api.getDownload({ jobId });
      if (revisions.current.get(jobId) !== revision) return;
      if (result.kind === 'error') {
        setNotice({ severity: 'error', message: result.error.message });
        return;
      }
      const job = result.data;
      if (!job) {
        setJobs((previous) => previous.filter((item) => item.jobId !== jobId));
        return;
      }
      observePause(job);
      setJobs((previous) => [
        ...previous.filter((item) => item.jobId !== jobId),
        job,
      ]);
      const terminal = [
        'completed',
        'completed_with_errors',
        'failed',
        'cancelled',
      ].includes(job.status);
      const key =
        job.status === 'cancelled'
          ? `${jobId}:cancelled`
          : `${jobId}:${completionPending.current.get(jobId)}:${job.status}`;
      if (
        completionPending.current.has(jobId) &&
        terminal &&
        !notified.current.has(key)
      ) {
        notified.current.add(key);
        completionPending.current.delete(jobId);
        setNotice({
          severity:
            job.status === 'completed'
              ? 'success'
              : job.status === 'cancelled'
                ? 'info'
                : 'error',
          message: `${statusLabels[job.status]}: ${job.title || `${job.source.kind === 'track' ? 'трек' : 'коллекция'} ${job.source.id}`}`,
        });
      }
    },
    [api, observePause],
  );
  useEffect(() => {
    void refresh();
    return api.subscribe((event) => {
      if (event.event === 'host.status') {
        setConnected(event.connected);
        if (event.connected) void refresh();
      } else if ('jobId' in event) {
        if (event.event === 'job.progress' && event.payload)
          setProgress((previous) => ({
            ...previous,
            [event.jobId]: event.payload!,
          }));
        if (event.event === 'track.progress' && event.payload)
          setTrackProgress((previous) => ({
            ...previous,
            [`${event.jobId}:${event.trackKey}`]: event.payload!,
          }));
        // createDownload ждёт manager.run: job виден по событиям до завершения Promise.
        void readJob(
          event.jobId,
          event.event === 'job.completed' ? event.seq : undefined,
        );
      }
    });
  }, [api, refresh, readJob]);
  async function command(
    job: JobSnapshot,
    action: 'pause' | 'resume' | 'cancel' | 'retry' | 'showItemInFolder',
  ) {
    setPending((previous) => ({ ...previous, [job.jobId]: true }));
    try {
      if (action === 'resume') errorPauses.current.delete(job.jobId);
      const result = await api[action]({ jobId: job.jobId });
      if (result.kind === 'error')
        setNotice({
          severity: 'error',
          message:
            result.error.code === 'OUTCOME_UNKNOWN'
              ? 'Исход операции неизвестен. Состояние обновлено; проверьте задание перед новым действием.'
              : result.error.message,
        });
      // F-002: core не публикует job.completed при cancel; уведомляет подтверждённый ответ.
      // @link planning/reviews/STEP-058/REVIEW-20261029T193045Z.md
      if (
        action === 'cancel' &&
        result.kind === 'result' &&
        result.data?.status === 'cancelled'
      ) {
        const key = `${job.jobId}:cancelled`;
        if (!notified.current.has(key)) {
          notified.current.add(key);
          setNotice({
            severity: 'info',
            message: `${statusLabels.cancelled}: ${result.data.title || `${job.source.kind === 'track' ? 'трек' : 'коллекция'} ${job.source.id}`}`,
          });
        }
      }
      await readJob(job.jobId);
    } finally {
      setPending((previous) => ({ ...previous, [job.jobId]: false }));
    }
  }
  async function batch(action: 'pause' | 'resume') {
    const eligible = jobs.filter(
      (job) => allowed(job, action) && !pending[job.jobId],
    );
    setPending((previous) => ({
      ...previous,
      ...Object.fromEntries(eligible.map((job) => [job.jobId, true])),
    }));
    let failed = 0;
    let unknown = false;
    const failures: string[] = [];
    try {
      // Каждую mutation отправляем ровно один раз; итог перечитывается даже при частичном отказе.
      for (const job of eligible) {
        try {
          const result = await api[action]({ jobId: job.jobId });
          if (result.kind === 'error') {
            failed++;
            failures.push(`${job.source.id}: ${result.error.message}`);
            unknown ||= result.error.code === 'OUTCOME_UNKNOWN';
          }
        } catch {
          failed++;
          failures.push(`${job.source.id}: нет ответа приложения.`);
        }
      }
      await refresh();
      setNotice({
        severity: failed ? 'error' : 'success',
        message: `${action === 'pause' ? 'Приостановлено' : 'Продолжено'}: ${eligible.length - failed} из ${eligible.length}.${failed ? ` Не выполнено: ${failed}. ${failures.join(' ')}` : ''}${unknown ? ' Исход части операций неизвестен. Проверьте обновлённое состояние перед новым действием.' : ''}`,
      });
    } finally {
      setPending((previous) => ({
        ...previous,
        ...Object.fromEntries(eligible.map((job) => [job.jobId, false])),
      }));
    }
  }
  async function clearCompleted() {
    // Ответы, начатые до очистки, не должны возвращать скрытые terminal строки.
    refreshSequence.current++;
    for (const job of jobs)
      revisions.current.set(
        job.jobId,
        (revisions.current.get(job.jobId) ?? 0) + 1,
      );
    setPending((previous) => ({ ...previous, queue: true }));
    try {
      const result = await api.clearDownloads();
      await refresh();
      setNotice(
        result.kind === 'result'
          ? {
              severity: 'info',
              message: `Убрано из списка: ${result.data}. История и файлы сохранены.`,
            }
          : { severity: 'error', message: result.error.message },
      );
    } finally {
      setPending((previous) => ({ ...previous, queue: false }));
    }
  }
  async function openFolder() {
    const result = await api.openDownloadsFolder();
    if (result.kind === 'error')
      setNotice({
        severity: 'error',
        message:
          'Не удалось открыть папку. Выберите доступную папку загрузок в Настройках.',
      });
  }
  async function openSource(url: string) {
    const result = await api.openExternal({ url });
    if (result.kind === 'error')
      setNotice({ severity: 'error', message: result.error.message });
  }
  return {
    batch,
    clearCompleted,
    openFolder,
    openSource,
    jobs,
    artwork,
    progress,
    trackProgress,
    connected,
    notice,
    setNotice,
    pending,
    refresh,
    command,
  };
}
