import type {
  ApplicationResult,
  DesktopSettings,
} from '@music-downloader/shared';
import { methods, parseInput } from '../contract/desktop-api.js';
import type { Input, Method } from '../contract/desktop-api.js';
import { failure, safeResult, success } from '../contract/result.js';
import type { DirectoryRegistry } from './directory-registry.js';
export interface BrokerActions {
  readonly selectFfmpeg?: () => Promise<string | undefined>;
  readonly selectDirectory: () => Promise<string | undefined>;
  readonly showItemInFolder: (
    jobId: string,
    trackKey?: string,
  ) => Promise<boolean>;
  readonly openExternal: (url: string) => Promise<void>;
}
export const externalHosts = new Set(['music.yandex.ru', 'yandex.ru']);
/** Проверка sender и schema идёт до любого system/host side effect (ADR-016). */
export async function invokeBroker(
  method: Method,
  payload: unknown,
  trusted: boolean,
  directories: DirectoryRegistry,
  actions: BrokerActions,
  host: (method: Method, payload: unknown) => Promise<unknown>,
): Promise<unknown> {
  if (!trusted) return failure(method, 'PERMISSION_DENIED');
  try {
    const input = parseInput(method, payload);
    if (method === 'selectDirectory') {
      const directory = await actions.selectDirectory();
      return success(method, directory ? directories.add(directory) : null);
    }
    if (method === 'selectFfmpeg') {
      const file = await actions.selectFfmpeg?.();
      return success(method, file ? directories.addExecutable(file) : null);
    }
    if (method === 'saveSettings') {
      const request = input as Input<'saveSettings'>;
      if (
        (request.directoryRef !== undefined &&
          request.directoryRef !== 'default-output' &&
          !directories.resolve(request.directoryRef)) ||
        (typeof request.ffmpegRef === 'string' &&
          !directories.resolve(request.ffmpegRef))
      )
        return failure(method, 'VALIDATION_ERROR');
      const previous = (await host(
        'getSettings',
        undefined,
      )) as ApplicationResult<DesktopSettings>;
      if (previous.kind !== 'result') return safeResult(previous, method);
      const outputDirectory =
        request.directoryRef === undefined ||
        request.directoryRef === 'default-output'
          ? previous.data.outputDirectory
          : directories.resolve(request.directoryRef);
      const ffmpegPath =
        request.ffmpegRef === undefined
          ? previous.data.ffmpegPath
          : request.ffmpegRef === null
            ? null
            : directories.resolve(request.ffmpegRef);
      if (outputDirectory === undefined || ffmpegPath === undefined)
        return failure(method, 'VALIDATION_ERROR');
      return safeResult(
        await host(method, {
          quality: request.quality,
          concurrency: request.concurrency,
          naming: request.naming,
          overwrite: request.overwrite,
          logging: request.logging,
          outputDirectory,
          ffmpegPath,
        }),
        method,
      );
    }
    if (method === 'showItemInFolder') {
      const request = input as { jobId: string; trackKey?: string };
      return (await actions.showItemInFolder(request.jobId, request.trackKey))
        ? success(method, null)
        : failure(method, 'VALIDATION_ERROR');
    }
    if (method === 'openExternal') {
      const url = new URL((input as { url: string }).url);
      if (
        url.protocol !== 'https:' ||
        !externalHosts.has(url.hostname) ||
        url.username ||
        url.password ||
        url.port
      )
        return failure(method, 'PERMISSION_DENIED');
      await actions.openExternal(url.href);
      return success(method, null);
    }
    if (methods[method].executor !== 'host')
      return failure(method, 'VALIDATION_ERROR');
    if (method === 'createDownload') {
      const request = input as Input<'createDownload'>;
      // Reserved ref разрешается заново из trusted host settings даже после restart main.
      const settings =
        request.directoryRef === 'default-output'
          ? ((await host(
              'getSettings',
              undefined,
            )) as ApplicationResult<DesktopSettings>)
          : undefined;
      const destination =
        settings?.kind === 'result'
          ? settings.data.outputDirectory
          : directories.resolve(request.directoryRef);
      if (!destination) return failure(method, 'VALIDATION_ERROR');
      const rest = {
        source: request.source,
        quality: request.quality,
        ...(request.overwrite === undefined
          ? {}
          : { overwrite: request.overwrite }),
      };
      return safeResult(await host(method, { ...rest, destination }), method);
    }
    return safeResult(await host(method, input), method);
  } catch {
    return failure(method, 'VALIDATION_ERROR');
  }
}
