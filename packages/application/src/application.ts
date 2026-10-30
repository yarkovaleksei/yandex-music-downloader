import { desktopDiagnostics } from '@music-downloader/shared';
import type {
  DesktopApplicationApi,
  DesktopSettings,
  DesktopStateStore,
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
  return {
    id: account.id,
    displayName: account.displayName,
    ...(account.email === undefined ? {} : { email: account.email }),
    ...(account.region === undefined ? {} : { region: account.region }),
    ...(account.subscription === undefined
      ? {}
      : { subscription: account.subscription }),
    ...(account.subscriptionReason === undefined
      ? {}
      : { subscriptionReason: account.subscriptionReason }),
    ...(account.formats === undefined ? {} : { formats: [...account.formats] }),
  };
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
export class ApplicationFacade implements DesktopApplicationApi {
  private avatarGeneration = 0;
  public constructor(
    private readonly deps: {
      provider: MusicProvider;
      jobs: Jobs;
      events: ApplicationEvents;
      logger: Logger;
      diagnostics: () => Promise<DiagnosticsDto>;
      checkFfmpeg: (
        path?: string | null,
      ) => Promise<{ readonly available: boolean }>;
      debug: boolean;
      desktopState: DesktopStateStore;
      desktop: boolean;
      snapshotEnabled: boolean;
      /** Закрывает только default store, созданный composition root. */
      closeStore?: () => Promise<void>;
    },
  ) {}

  public authenticate() {
    this.avatarGeneration++;
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
  /** ADR-016: необязательное фото не задерживает account, DTO содержит только bounded bytes. */
  public accountAvatar() {
    return command(
      'accountAvatar',
      this.deps.logger,
      async () => {
        const generation = this.avatarGeneration;
        try {
          const account = await this.deps.provider.getAccount();
          if (!account || !this.deps.provider.fetchAccountAvatar) return null;
          const image = await this.deps.provider.fetchAccountAvatar();
          const current = await this.deps.provider.getAccount();
          if (
            generation !== this.avatarGeneration ||
            current?.id !== account.id ||
            !image ||
            !['image/jpeg', 'image/png', 'image/webp'].includes(
              image.mimeType,
            ) ||
            !image.bytes.length ||
            image.bytes.length > 2 * 1024 * 1024
          )
            return null;
          return {
            mimeType: image.mimeType,
            base64: Buffer.from(image.bytes).toString('base64'),
          };
        } catch {
          return null;
        }
      },
      this.deps.debug,
    );
  }
  public logout() {
    this.avatarGeneration++;
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
      () => {
        if (!this.deps.snapshotEnabled) return this.deps.jobs.create(request);
        // CLI сохраняет свои прежние значения, не читая desktop defaults (REQ-051).
        const settings = this.deps.desktop
          ? this.deps.desktopState.settings()
          : undefined;
        const effective = {
          ...request,
          overwrite: request.overwrite ?? settings?.overwrite ?? false,
          writeTags: settings?.writeTags ?? true,
          saveCoverFile: settings?.saveCoverFile ?? true,
          writeM3u8: settings?.writeM3u8 ?? true,

          naming: settings?.naming ?? ('collection' as const),
        };
        return this.deps.jobs.create(effective, effective);
      },
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
  public getSettings() {
    return command(
      'getSettings',
      this.deps.logger,
      async () => this.deps.desktopState.settings(),
      this.deps.debug,
    );
  }
  public saveSettings(value: DesktopSettings) {
    return command(
      'saveSettings',
      this.deps.logger,
      async () => {
        this.deps.desktopState.saveSettings(value);
        return this.deps.desktopState.settings();
      },
      this.deps.debug,
    );
  }
  public getDownload(jobId: string) {
    return command(
      'getDownload',
      this.deps.logger,
      () => this.deps.jobs.getDownload(jobId),
      this.deps.debug,
    );
  }
  public listDownloads() {
    return command(
      'listDownloads',
      this.deps.logger,
      () => this.deps.jobs.listDownloads(),
      this.deps.debug,
    );
  }
  public clearDownloads() {
    return command(
      'clearDownloads',
      this.deps.logger,
      () => this.deps.jobs.clearDownloads(),
      this.deps.debug,
    );
  }
  public history() {
    return command(
      'history',
      this.deps.logger,
      () => this.deps.jobs.history(),
      this.deps.debug,
    );
  }
  public downloadArtwork(jobId: string) {
    return command(
      'downloadArtwork',
      this.deps.logger,
      () => this.deps.jobs.downloadArtwork(jobId),
      this.deps.debug,
    );
  }
  public historyArtwork(jobId: string) {
    return command(
      'historyArtwork',
      this.deps.logger,
      () => this.deps.jobs.historyArtwork(jobId),
      this.deps.debug,
    );
  }
  public hideHistory(jobId: string) {
    return command(
      'hideHistory',
      this.deps.logger,
      () => this.deps.jobs.hideHistory(jobId),
      this.deps.debug,
    );
  }
  public replay(jobId: string) {
    return command(
      'replay',
      this.deps.logger,
      () => this.deps.jobs.replay(jobId),
      this.deps.debug,
    );
  }
  public checkFfmpeg(ffmpegPath?: string | null) {
    return command(
      'checkFfmpeg',
      this.deps.logger,
      () =>
        this.deps.checkFfmpeg(
          ffmpegPath === undefined
            ? this.deps.desktopState.settings().ffmpegPath
            : ffmpegPath,
        ),
      this.deps.debug,
    );
  }
  public lastDiagnostics() {
    return command(
      'lastDiagnostics',
      this.deps.logger,
      async () => {
        const saved = this.deps.desktopState.diagnostics();
        return saved
          ? { ...saved, diagnostics: desktopDiagnostics(saved.diagnostics) }
          : null;
      },
      this.deps.debug,
    );
  }
  public refreshDiagnostics() {
    return command(
      'refreshDiagnostics',
      this.deps.logger,
      async () => {
        const value = {
          checkedAt: new Date().toISOString(),
          diagnostics: desktopDiagnostics(await this.deps.diagnostics()),
        };
        this.deps.desktopState.saveDiagnostics(value);
        return this.deps.desktopState.diagnostics()!;
      },
      this.deps.debug,
    );
  }
  public shutdown() {
    return command(
      'shutdown',
      this.deps.logger,
      async () => {
        try {
          await this.deps.jobs.shutdown();
          this.deps.events.close();
        } finally {
          // Store закрывается после освобождения аренд; повторное открытие запрещено.
          await this.deps.closeStore?.();
          this.deps.desktopState.close();
        }
        return null;
      },
      this.deps.debug,
    );
  }
}
