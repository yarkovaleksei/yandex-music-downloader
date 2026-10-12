import type {
  ApplicationApi,
  ApplicationResult,
  JobEvent,
  PreviewDto,
  RuntimeLoggingOptions,
} from '@music-downloader/application/contracts';

declare const api: ApplicationApi;
declare const result: ApplicationResult<PreviewDto>;
declare const event: JobEvent;
const host: RuntimeLoggingOptions = { level: 'debug', debug: true };

void api;
void result;
void event;
void host;
