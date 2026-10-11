import type {
  ApplicationApi,
  ApplicationResult,
  JobEvent,
  PreviewDto,
} from '@music-downloader/application/contracts';

declare const api: ApplicationApi;
declare const result: ApplicationResult<PreviewDto>;
declare const event: JobEvent;

void api;
void result;
void event;
