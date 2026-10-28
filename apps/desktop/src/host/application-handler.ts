import type {
  ApplicationApi,
  DesktopApplicationApi,
  DesktopSettings,
} from '@music-downloader/shared';
import { parseInput } from '../contract/desktop-api.js';
import type { Method } from '../contract/desktop-api.js';
import { failure, safeResult } from '../contract/result.js';

/** Host повторяет проверку DTO; пути принимаются только от доверенного main broker. */
export async function executeApplication(
  api: ApplicationApi,
  method: Method | 'shutdown',
  payload: unknown,
): Promise<unknown> {
  try {
    let result: unknown;
    const desktop = api as DesktopApplicationApi;
    switch (method) {
      case 'authenticate':
        result = await api.authenticate();
        break;
      case 'account':
        result = await api.account();
        break;
      case 'logout':
        result = await api.logout();
        break;
      case 'resolve':
        result = await api.resolve(parseInput(method, payload).url);
        break;
      case 'preview':
        result = await api.preview(parseInput(method, payload).source);
        break;
      case 'createDownload': {
        const input = payload as {
          source: Parameters<ApplicationApi['createDownload']>[0]['source'];
          quality: Parameters<ApplicationApi['createDownload']>[0]['quality'];
          destination: string;
          overwrite?: boolean;
        };
        if (typeof input.destination !== 'string' || !input.destination)
          return failure(method, 'VALIDATION_ERROR');
        result = await api.createDownload(input);
        break;
      }
      case 'pause':
      case 'resume':
      case 'retry':
      case 'cancel':
        result = await api[method](parseInput(method, payload).jobId);
        break;
      case 'listJobs':
        result = await api.listJobs();
        break;
      case 'getJob':
        result = await api.getJob(parseInput(method, payload).jobId);
        break;
      case 'diagnostics':
        result = await api.diagnostics();
        break;
      case 'getSettings':
        result = await desktop.getSettings();
        break;
      case 'saveSettings':
        result = await desktop.saveSettings(payload as DesktopSettings);
        break;
      case 'history':
        result = await desktop.history();
        break;
      case 'hideHistory':
        result = await desktop.hideHistory(parseInput(method, payload).jobId);
        break;
      case 'replay':
        result = await desktop.replay(parseInput(method, payload).jobId);
        break;
      case 'lastDiagnostics':
        result = await desktop.lastDiagnostics();
        break;
      case 'refreshDiagnostics':
        result = await desktop.refreshDiagnostics();
        break;
      case 'shutdown':
        result = await api.shutdown();
        break;
      default:
        return failure(method, 'VALIDATION_ERROR');
    }
    return safeResult(result, method);
  } catch {
    return failure(method);
  }
}
