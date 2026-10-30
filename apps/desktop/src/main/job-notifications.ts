import type { ApplicationResult, JobSnapshot } from '@music-downloader/shared';
import type { DesktopEvent, Method } from '../contract/desktop-api.js';

/** ADR-015: main учитывает и terminal-событие, и ошибочную паузу F-001 без job.completed. */
export function jobNotifications(
  read: (jobId: string) => Promise<ApplicationResult<JobSnapshot | null>>,
  show: (title: string, body: string) => void,
) {
  const notified = new Set<string>();
  const errorPauses = new Map<string, string>();
  function display(title: string, body: string) {
    try {
      show(title, body);
    } catch {
      /* Интерфейсное уведомление остаётся доступным без системного сервиса. */
    }
  }
  function observe(job: JobSnapshot) {
    if (job.status !== 'paused' || !job.pauseReason) {
      errorPauses.delete(job.jobId);
      return;
    }
    if (errorPauses.get(job.jobId) === job.pauseReason) return;
    errorPauses.set(job.jobId, job.pauseReason);
    display(
      'Ошибка загрузки',
      job.pauseReason === 'AUTH_REQUIRED'
        ? 'Загрузка приостановлена: требуется повторный вход в аккаунт.'
        : job.pauseReason === 'DISK_FULL'
          ? 'Загрузка приостановлена: освободите место на диске.'
          : 'Загрузка приостановлена из-за ошибки. Проверьте состояние задания.',
    );
  }
  const notify = async (event: DesktopEvent): Promise<void> => {
    if (event.event !== 'job.completed') return;
    const result = await read(event.jobId);
    if (result.kind !== 'result' || !result.data) return;
    observe(result.data);
    const status = result.data.status;
    if (
      !['completed', 'completed_with_errors', 'failed', 'cancelled'].includes(
        status,
      )
    )
      return;
    const key = `${event.jobId}:${event.seq}:${status}`;
    if (notified.has(key)) return;
    notified.add(key);
    display(
      status === 'completed'
        ? 'Загрузка завершена'
        : status === 'cancelled'
          ? 'Загрузка отменена'
          : 'Ошибка загрузки',
      status === 'completed'
        ? 'Музыка сохранена в выбранной папке.'
        : status === 'cancelled'
          ? 'Загрузка остановлена пользователем.'
          : 'Некоторые треки не загружены. Подробности — на экране загрузок.',
    );
    // STEP-059: завершение сообщает исход, папку открывает только явное действие.
  };
  return Object.assign(notify, {
    beginResume(jobId: string) {
      errorPauses.delete(jobId);
    },
    // Ответы уже проходят через main; дополнительный IPC на каждый байтовый progress не нужен.
    observeResult(method: Method, value: unknown) {
      if (
        ![
          'createDownload',
          'resume',
          'retry',
          'pause',
          'cancel',
          'getJob',
          'listJobs',
        ].includes(method)
      )
        return;
      const result = value as ApplicationResult<
        JobSnapshot | readonly JobSnapshot[] | null
      >;
      if (result.kind !== 'result' || !result.data) return;
      if (method === 'listJobs')
        for (const job of result.data as readonly JobSnapshot[]) observe(job);
      else {
        const job = result.data as JobSnapshot;
        observe(job);
        // Cancel не создаёт job.completed в core; подтверждённый ответ уже доступен main.
        if (method === 'cancel' && job.status === 'cancelled') {
          const key = `${job.jobId}:cancelled`;
          if (!notified.has(key)) {
            notified.add(key);
            display('Загрузка отменена', 'Загрузка остановлена пользователем.');
          }
        }
      }
    },
  });
}
