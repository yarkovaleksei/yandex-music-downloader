import type {
  ApplicationResult,
  JobSnapshot,
} from '@music-downloader/application/contracts';
/** Коды процесса зависят от публичного результата, а не от текста исключения. @link docs/requirements/REQ-029-cli-commands.md */
export function exitCode(
  result: ApplicationResult<unknown> | ApplicationResult<JobSnapshot>,
): number {
  if (result.kind === 'error') {
    const reason = result.error.details?.reason;
    return reason === 'LEASE_HELD_BY_OTHER_OWNER' ||
      reason === 'OWNER_ACK_TIMEOUT'
      ? 6
      : 3;
  }
  const data = result.data;
  if (
    result.command === 'diagnostics' &&
    typeof data === 'object' &&
    data !== null &&
    'available' in data
  )
    return (data as { available: boolean }).available ? 0 : 3;
  if (data === null) return result.command === 'account' ? 3 : 0;
  if (typeof data === 'object' && data !== null && 'status' in data) {
    const status = (data as { status: string }).status;
    if (status === 'completed') return 0;
    if (status === 'completed_with_errors') return 1;
    if (status === 'paused') return 4;
    if (status === 'cancelled') return 5;
    return 3;
  }
  return 0;
}
