import { useCallback, useEffect, useRef, useState } from 'react';
import type { JobSnapshot, JsonObject } from '@music-downloader/shared';
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
  const [progress, setProgress] = useState<Record<string, JsonObject>>({});
  const [trackProgress, setTrackProgress] = useState<
    Record<string, JsonObject>
  >({});
  const [connected, setConnected] = useState(true);
  const [notice, setNotice] = useState<Notice>();
  const [pending, setPending] = useState<Record<string, boolean>>({});
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
  const refresh = useCallback(async () => {
    const observed = new Map(revisions.current);
    const result = await api.listJobs();
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
      const result = await api.getJob({ jobId });
      if (revisions.current.get(jobId) !== revision) return;
      if (result.kind === 'error') {
        setNotice({ severity: 'error', message: result.error.message });
        return;
      }
      const job = result.data;
      if (!job) return;
      observePause(job);
      setJobs((previous) => [
        ...previous.filter((item) => item.jobId !== jobId),
        job,
      ]);
      const terminal = [
        'completed',
        'completed_with_errors',
        'failed',
      ].includes(job.status);
      const key = `${jobId}:${completionPending.current.get(jobId)}:${job.status}`;
      if (
        completionPending.current.has(jobId) &&
        terminal &&
        !notified.current.has(key)
      ) {
        notified.current.add(key);
        completionPending.current.delete(jobId);
        setNotice({
          severity: job.status === 'completed' ? 'success' : 'error',
          message: `${statusLabels[job.status]}: ${job.source.kind === 'track' ? 'трек' : 'коллекция'} ${job.source.id}`,
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
      await readJob(job.jobId);
    } finally {
      setPending((previous) => ({ ...previous, [job.jobId]: false }));
    }
  }
  return {
    jobs,
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
