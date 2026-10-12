import type {
  ApplicationApi,
  Account,
  DiagnosticsDto,
  DownloadRequest,
  JobEvent,
  MediaReference,
  MusicProvider,
} from '@music-downloader/shared';
import type { Logger } from '@music-downloader/logging';
import type { ApplicationEvents } from './events.js';
import type { Jobs } from './jobs.js';
import { preview } from './preview.js';
import { command } from './results.js';

/** Account provider-а приводится к публичному переносимому DTO. */
function accountDto(account: Account): Account {
  return { id: account.id, displayName: account.displayName };
}

/** Reference не переносит случайные provider-поля за границу фасада. */
function referenceDto(reference: MediaReference): MediaReference {
  return {
    provider: reference.provider,
    kind: reference.kind,
    id: reference.id,
  };
}

/** Transport-neutral facade не раскрывает provider, store или runtime adapters. */
export class ApplicationFacade implements ApplicationApi {
  public constructor(
    private readonly deps: {
      provider: MusicProvider;
      jobs: Jobs;
      events: ApplicationEvents;
      logger: Logger;
      diagnostics: () => Promise<DiagnosticsDto>;
      debug: boolean;
    },
  ) {}

  public authenticate() {
    return command(
      'authenticate',
      this.deps.logger,
      () => this.deps.provider.authenticate().then(accountDto),
      this.deps.debug,
    );
  }
  public account() {
    return command(
      'account',
      this.deps.logger,
      () =>
        this.deps.provider
          .getAccount()
          .then((account) => (account === null ? null : accountDto(account))),
      this.deps.debug,
    );
  }
  public logout() {
    return command(
      'logout',
      this.deps.logger,
      async () => {
        await this.deps.provider.logout();
        return null;
      },
      this.deps.debug,
    );
  }
  public resolve(url: string) {
    return command(
      'resolve',
      this.deps.logger,
      () => this.deps.provider.resolveUrl(url).then(referenceDto),
      this.deps.debug,
    );
  }
  public preview(source: MediaReference) {
    return command(
      'preview',
      this.deps.logger,
      () => preview(this.deps.provider, source),
      this.deps.debug,
    );
  }
  public createDownload(request: DownloadRequest) {
    return command(
      'createDownload',
      this.deps.logger,
      () => this.deps.jobs.create(request),
      this.deps.debug,
    );
  }
  public pause(jobId: string) {
    return command(
      'pause',
      this.deps.logger,
      () => this.deps.jobs.command(jobId, 'pause'),
      this.deps.debug,
    );
  }
  public resume(jobId: string) {
    return command(
      'resume',
      this.deps.logger,
      () => this.deps.jobs.command(jobId, 'resume'),
      this.deps.debug,
    );
  }
  public retry(jobId: string) {
    return command(
      'retry',
      this.deps.logger,
      () => this.deps.jobs.command(jobId, 'retry'),
      this.deps.debug,
    );
  }
  public cancel(jobId: string) {
    return command(
      'cancel',
      this.deps.logger,
      () => this.deps.jobs.command(jobId, 'cancel'),
      this.deps.debug,
    );
  }
  public listJobs() {
    return command(
      'listJobs',
      this.deps.logger,
      () => this.deps.jobs.list(),
      this.deps.debug,
    );
  }
  public getJob(jobId: string) {
    return command(
      'getJob',
      this.deps.logger,
      () => this.deps.jobs.get(jobId),
      this.deps.debug,
    );
  }
  public subscribe(listener: (event: JobEvent) => void) {
    return this.deps.events.subscribe(listener);
  }
  public diagnostics() {
    return command(
      'diagnostics',
      this.deps.logger,
      this.deps.diagnostics,
      this.deps.debug,
    );
  }
  public shutdown() {
    return command(
      'shutdown',
      this.deps.logger,
      async () => {
        await this.deps.jobs.shutdown();
        this.deps.events.close();
        return null;
      },
      this.deps.debug,
    );
  }
}
