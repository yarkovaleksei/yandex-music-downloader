import type {
  ApplicationApi,
  ApplicationResult,
  JobSnapshot,
} from '@music-downloader/application/contracts';
import type { ParsedArguments } from './arguments.js';
import type { Configuration } from './configuration.js';
import { isFinalJobStatus, observeJob } from './job-observer.js';
import { localError } from './output.js';

export function isStreamingCommand(command: string): boolean {
  return ['download', 'track', 'album', 'playlist', 'resume', 'retry'].includes(
    command,
  );
}

/** Проверка сигнала стоит непосредственно перед запуском, включая await resolve.
 * Источник и persisted параметры resume/retry остаются во владении application. */
export async function executeCommand(
  api: ApplicationApi,
  args: ParsedArguments,
  config: Configuration,
  beforeInvocation: () => boolean = () => true,
): Promise<ApplicationResult<unknown>> {
  const command = args.command!;
  if (command === 'doctor') return api.diagnostics();
  if (command === 'auth') return api.authenticate();
  if (command === 'account') return api.account();
  if (command === 'logout') return api.logout();
  if (command === 'jobs') return api.listJobs();
  if (command === 'cancel') return api.cancel(args.value!);
  let result: ApplicationResult<JobSnapshot>;
  if (command === 'resume' || command === 'retry') {
    if (!beforeInvocation())
      return localError(
        command,
        'DOWNLOAD_ERROR',
        'Операция прервана до запуска.',
      );
    result = await api[command](args.value!);
  } else {
    const resolved = await api.resolve(args.value!);
    if (resolved.kind === 'error') return resolved;
    if (command !== 'download' && resolved.data.kind !== command)
      return localError(
        'resolve',
        'VALIDATION_ERROR',
        'Тип ссылки не соответствует команде.',
      );
    if (!beforeInvocation())
      return localError(
        command,
        'DOWNLOAD_ERROR',
        'Операция прервана до запуска.',
      );
    result = await api.createDownload({
      source: resolved.data,
      quality: config.quality,
      destination: config.output,
      overwrite: config.overwrite,
    });
  }
  if (result.kind === 'error' || isFinalJobStatus(result.data.status))
    return result;
  return observeJob(api, result.data.jobId);
}
