import type {
  ApplicationApi,
  ApplicationResult,
  JobSnapshot,
} from '@music-downloader/application/contracts';

export function isFinalJobStatus(status: string): boolean {
  return [
    'completed',
    'completed_with_errors',
    'failed',
    'cancelled',
    'paused',
    'interrupted',
  ].includes(status);
}

/** События локальны для экземпляра, поэтому результат resume/retry подтверждается снимками.
 * queued/running не дают успешного завершения CLI. @link planning/tasks/STEP-019.md */
export async function observeJob(
  api: ApplicationApi,
  jobId: string,
): Promise<ApplicationResult<JobSnapshot>> {
  for (;;) {
    const latest = await api.getJob(jobId);
    if (latest.kind === 'error') return latest;
    if (latest.data === null)
      return {
        schemaVersion: 1,
        kind: 'error',
        command: 'getJob',
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Задание не найдено.',
          retryable: false,
          details: { reason: 'JOB_NOT_FOUND' },
        },
      };
    if (isFinalJobStatus(latest.data.status))
      return {
        schemaVersion: latest.schemaVersion,
        kind: 'result',
        command: latest.command,
        data: latest.data,
      };
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
  }
}
