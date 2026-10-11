import { createHash, randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  decodeManifest,
  encodeManifest,
  type AcquireOptions,
  type ControlReceipt,
  type ControlRequest,
  type JobManifestV1,
  type LeaseIdentity,
  type LeaseRecord,
  type LeaseState,
  type LeaseSession,
  type ManifestStore,
  ValidationError,
  DomainError,
  normalizeDomainError,
} from '@music-downloader/shared';
import { readJsonIfPresent, writeAtomicJson } from './atomic-json.js';
import { ControlInbox } from './control-inbox.js';
import { NativeJobLock } from './native-job-lock.js';
import { currentLeaseIdentity, probeLease } from './process-identity.js';
import { resolveStateDirectory } from './state-directory.js';

const leaseTimeoutMs = 30_000;
const heartbeatIntervalMs = 5_000;
const progressFlushIntervalMs = 250;

function jobDirectory(root: string, jobId: string): string {
  return path.join(root, createHash('sha256').update(jobId).digest('hex'));
}

function leaseFrom(value: string): LeaseRecord {
  return JSON.parse(value) as LeaseRecord;
}

/** Проверка только для наблюдения: повреждение не означает отсутствие аренды (STEP-043). */
function observedLeaseFrom(value: string): LeaseRecord {
  let record: unknown;
  try {
    record = JSON.parse(value);
  } catch {
    throw new ValidationError();
  }
  if (typeof record !== 'object' || record === null || Array.isArray(record))
    throw new ValidationError();
  const lease = record as Record<string, unknown>;
  const text = (key: string) =>
    typeof lease[key] === 'string' && lease[key].length > 0;
  const timestamp = (key: string) =>
    text(key) && Number.isFinite(Date.parse(lease[key] as string));
  if (
    !Number.isInteger(lease.pid) ||
    (lease.pid as number) <= 0 ||
    !Number.isInteger(lease.generation) ||
    (lease.generation as number) <= 0 ||
    !text('hostname') ||
    !text('processStartedAt') ||
    !text('ownerToken') ||
    !timestamp('acquiredAt') ||
    !timestamp('heartbeatAt') ||
    (lease.releasedAt !== undefined && !timestamp('releasedAt'))
  )
    throw new ValidationError();
  return record as LeaseRecord;
}

/** Файловый adapter хранит namespace каждого job отдельно и сериализует owner mutations. */
export class FileManifestStore implements ManifestStore {
  private readonly root: string;
  public constructor(options: { readonly stateDir?: string } = {}) {
    this.root = resolveStateDirectory({ stateDir: options.stateDir });
  }

  public async read(jobId: string): Promise<JobManifestV1 | undefined> {
    return this.readDirectory(jobDirectory(this.root, jobId));
  }

  /**
   * Читает отдельный атомарный snapshot без lock, recovery и обновления heartbeat.
   * Решение о следующем захвате остаётся у acquire; unknown не означает inactive.
   * @link planning/tasks/STEP-043.md; docs/adr/ADR-004-atomic-finalization-and-manifest.md
   */
  public async readLeaseState(jobId: string): Promise<LeaseState> {
    try {
      const raw = await readJsonIfPresent(
        path.join(jobDirectory(this.root, jobId), 'lease.json'),
      );
      if (raw === undefined) return 'inactive';
      const lease = observedLeaseFrom(raw);
      if (lease.releasedAt !== undefined) return 'inactive';
      if (lease.hostname !== os.hostname()) return 'unknown';
      if (Date.now() - Date.parse(lease.heartbeatAt) <= leaseTimeoutMs)
        return 'active';
      const probe = await probeLease(lease);
      if (probe === 'same') return 'active';
      return probe === 'unknown' ? 'unknown' : 'inactive';
    } catch (error) {
      // Внутренний cause может содержать OS paths/данные; публичный отказ их не переносит.
      if (error instanceof ValidationError) throw new ValidationError();
      const safe = normalizeDomainError(error);
      throw new DomainError(safe.code, safe.retryable);
    }
  }

  /**
   * История доступна после перезапуска и при живом owner без захвата аренды.
   * Атомарный writer даёт целый snapshot каждой job, но не общую транзакцию списка.
   * @link planning/tasks/STEP-042.md; application интеграция — STEP-018.
   */
  public async list(): Promise<readonly JobManifestV1[]> {
    let entries;
    try {
      entries = await readdir(this.root, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    const manifests = new Map<string, JobManifestV1>();
    // Обходим только существующие SHA-256 namespace, не читая lease или inbox.
    for (const entry of entries.sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    )) {
      if (!entry.isDirectory() || !/^[a-f0-9]{64}$/.test(entry.name)) continue;
      const manifest = await this.readDirectory(
        path.join(this.root, entry.name),
      );
      if (manifest !== undefined) manifests.set(manifest.jobId, manifest);
    }
    return [...manifests.values()].sort((a, b) =>
      a.jobId < b.jobId ? -1 : a.jobId > b.jobId ? 1 : 0,
    );
  }

  private async readDirectory(
    directory: string,
  ): Promise<JobManifestV1 | undefined> {
    const value = await readJsonIfPresent(
      path.join(directory, 'manifest.json'),
    );
    return value === undefined ? undefined : decodeManifest(value);
  }

  public async create(manifest: JobManifestV1): Promise<void> {
    const directory = jobDirectory(this.root, manifest.jobId);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const target = path.join(directory, 'manifest.json');
    if ((await readJsonIfPresent(target)) !== undefined)
      throw new ValidationError(new Error('Manifest задания уже существует.'));
    await writeAtomicJson(target, encodeManifest(manifest));
  }

  public async acquire(
    jobId: string,
    options: AcquireOptions,
  ): Promise<LeaseSession> {
    const directory = jobDirectory(this.root, jobId);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const lock = await NativeJobLock.tryAcquire(
      path.join(directory, 'mutex.lock'),
    );
    if (lock === undefined)
      throw new ValidationError(
        new Error('Задание уже выполняется другим процессом.'),
      );
    try {
      const identity = options.identity ?? (await currentLeaseIdentity());
      const leasePath = path.join(directory, 'lease.json');
      const priorText = await readJsonIfPresent(leasePath);
      if (priorText !== undefined)
        await this.assertReclaimable(
          leaseFrom(priorText),
          identity,
          options.forceForeignLease === true,
          options.expectedGeneration,
        );
      const manifest = await this.read(jobId);
      if (manifest === undefined)
        throw new ValidationError(new Error('Manifest задания не найден.'));
      const recovered = await options.recover(manifest);
      // Callback обязан завершиться до выдачи session; save сверяет version через decoder.
      await this.saveSnapshot(directory, recovered);
      const now = new Date().toISOString();
      const prior = priorText === undefined ? undefined : leaseFrom(priorText);
      const generation = (prior?.generation ?? 0) + 1;
      const ownerToken = randomUUID();
      await writeAtomicJson(
        leasePath,
        JSON.stringify({
          ...identity,
          generation,
          ownerToken,
          acquiredAt: now,
          heartbeatAt: now,
        } satisfies LeaseRecord),
      );
      const inbox = new ControlInbox(directory);
      await inbox.ensure();
      return new FileLeaseSession(
        jobId,
        directory,
        identity,
        recovered,
        now,
        generation,
        ownerToken,
        lock,
        inbox,
        this.saveSnapshot.bind(this),
      );
    } catch (error) {
      await lock.release().catch(() => undefined);
      throw error;
    }
  }

  public async sendControl(
    jobId: string,
    request: Omit<ControlRequest, 'requestId' | 'createdAt'>,
  ): Promise<ControlRequest> {
    const inbox = new ControlInbox(jobDirectory(this.root, jobId));
    await inbox.ensure();
    return inbox.send(request);
  }

  public async waitControlAck(
    jobId: string,
    requestId: string,
    timeoutMs = 10_000,
  ): Promise<ControlReceipt | undefined> {
    const inbox = new ControlInbox(jobDirectory(this.root, jobId));
    const deadline = Date.now() + timeoutMs;
    while (Date.now() <= deadline) {
      const receipt = await inbox.receipt(requestId);
      if (receipt !== undefined) return receipt;
      await new Promise<void>((resolve) => setTimeout(resolve, 25));
    }
    return undefined;
  }

  private async assertReclaimable(
    lease: LeaseRecord,
    identity: LeaseIdentity,
    forceForeign: boolean,
    expectedGeneration: number | undefined,
  ): Promise<void> {
    if (lease.releasedAt !== undefined) return;
    if (lease.hostname !== identity.hostname) {
      if (forceForeign && expectedGeneration === lease.generation) return;
      throw new ValidationError(
        new Error('Аренда другого хоста снимается только явной командой.'),
      );
    }
    if (Date.now() - Date.parse(lease.heartbeatAt) <= leaseTimeoutMs)
      throw new ValidationError(new Error('Аренда задания ещё активна.'));
    const probe = await probeLease(lease);
    if (probe === 'same' || probe === 'unknown')
      throw new ValidationError(
        new Error('Невозможно безопасно снять аренду задания.'),
      );
  }

  private async saveSnapshot(
    directory: string,
    manifest: JobManifestV1,
  ): Promise<void> {
    const target = path.join(directory, 'manifest.json');
    const existing = await readJsonIfPresent(target);
    if (existing !== undefined) {
      const current = decodeManifest(existing);
      if (JSON.stringify(current.plan) !== JSON.stringify(manifest.plan))
        throw new ValidationError(
          new Error('План задания нельзя изменять после создания manifest.'),
        );
    }
    await writeAtomicJson(target, encodeManifest(manifest));
  }
}

class FileLeaseSession implements LeaseSession {
  private released = false;
  private closing = false;
  private releasePromise: Promise<void> | undefined;
  private queue = Promise.resolve();
  private readonly activeOperations = new Set<Promise<unknown>>();
  private readonly ownedContext = new AsyncLocalStorage<boolean>();
  private readonly heartbeatTimer: ReturnType<typeof setInterval>;
  private controlQueue = Promise.resolve();
  private progressTimer: ReturnType<typeof setTimeout> | undefined;
  private pendingProgress: JobManifestV1 | undefined;
  public constructor(
    public readonly jobId: string,
    private readonly directory: string,
    public readonly identity: LeaseIdentity,
    public manifest: JobManifestV1,
    private readonly acquiredAt: string,
    private readonly generation: number,
    private readonly ownerToken: string,
    private readonly lock: NativeJobLock,
    private readonly inbox: ControlInbox,
    private readonly saveSnapshot: (
      directory: string,
      manifest: JobManifestV1,
    ) => Promise<void>,
  ) {
    // Heartbeat поддерживает lease во время долгого owned I/O (ADR-004).
    this.heartbeatTimer = setInterval(() => {
      void this.heartbeat().catch(() => undefined);
    }, heartbeatIntervalMs);
    this.heartbeatTimer.unref();
  }
  public async save(manifest: JobManifestV1): Promise<void> {
    this.assertAccepting();
    if (this.isProgressOnly(manifest)) {
      return this.serial(async () => {
        await this.assertOwner();
        this.manifest = manifest;
        this.pendingProgress = manifest;
        if (this.progressTimer === undefined)
          this.progressTimer = setTimeout(() => {
            this.progressTimer = undefined;
            void this.serial(() => this.flushProgress()).catch(() => undefined);
          }, progressFlushIntervalMs);
      });
    }
    return this.serial(async () => {
      await this.flushProgress();
      await this.persist(manifest);
    });
  }
  public async heartbeat(): Promise<void> {
    this.assertAccepting();
    return this.serial(async () => {
      await this.assertOwner();
      await writeAtomicJson(
        path.join(this.directory, 'lease.json'),
        JSON.stringify({
          ...this.identity,
          generation: this.generation,
          ownerToken: this.ownerToken,
          acquiredAt: this.acquiredAt,
          heartbeatAt: new Date().toISOString(),
        }),
      );
    });
  }
  public consumeControls(
    handler: (request: ControlRequest) => Promise<ControlReceipt>,
  ): Promise<readonly ControlReceipt[]> {
    return this.runOwned(() => {
      const operation = this.controlQueue.then(async () => {
        const receipts: ControlReceipt[] = [];
        for (const request of await this.inbox.list()) {
          if (this.manifest.lastControl?.requestId === request.requestId) {
            await this.serial(async () => {
              await this.flushProgress();
              await this.assertOwner();
              await this.inbox.acknowledge(this.manifest.lastControl!);
              await this.inbox.remove(request.requestId);
            });
            receipts.push(this.manifest.lastControl);
            continue;
          }
          const receipt = await handler(request);
          await this.serial(async () => {
            await this.flushProgress();
            await this.persist({
              ...this.manifest,
              lastControl: receipt,
              updatedAt: receipt.completedAt,
            });
            await this.inbox.acknowledge(receipt);
            await this.inbox.remove(request.requestId);
          });
          receipts.push(receipt);
        }
        return receipts;
      });
      this.controlQueue = operation.then(
        () => undefined,
        () => undefined,
      );
      return operation;
    });
  }
  public async acknowledge(receipt: ControlReceipt): Promise<void> {
    this.assertAccepting();
    return this.serial(async () => {
      await this.flushProgress();
      await this.assertOwner();
      await this.inbox.acknowledge(receipt);
    });
  }
  public async runOwned<T>(operation: () => Promise<T>): Promise<T> {
    this.assertOpen();
    // После начала release допустим только checkpoint уже принятого effect;
    // новый artifact effect нельзя наследовать через AsyncLocalStorage (F-002).
    if (this.closing)
      throw new ValidationError(new Error('Аренда закрывается.'));
    const active = this.assertOwner().then(() =>
      this.ownedContext.run(true, operation),
    );
    this.activeOperations.add(active);
    void active.then(
      () => this.activeOperations.delete(active),
      () => this.activeOperations.delete(active),
    );
    return active;
  }
  public release(): Promise<void> {
    if (this.releasePromise !== undefined) return this.releasePromise;
    clearInterval(this.heartbeatTimer);
    if (this.progressTimer !== undefined) clearTimeout(this.progressTimer);
    this.closing = true;
    this.releasePromise = (async () => {
      // Active callbacks могут сохранить свой checkpoint, поэтому не ждём их
      // внутри serial queue, которую они используют для save (ADR-004).
      await Promise.allSettled(this.activeOperations);
      await this.serial(async () => {
        await this.flushProgress();
        this.released = true;
        const now = new Date().toISOString();
        try {
          await this.assertOwner();
          await writeAtomicJson(
            path.join(this.directory, 'lease.json'),
            JSON.stringify({
              ...this.identity,
              generation: this.generation,
              ownerToken: this.ownerToken,
              acquiredAt: this.acquiredAt,
              heartbeatAt: now,
              releasedAt: now,
            }),
          );
        } finally {
          await this.lock.release();
        }
      });
    })();
    return this.releasePromise;
  }
  private async persist(manifest: JobManifestV1): Promise<void> {
    this.assertOpen();
    await this.assertOwner();
    await this.saveSnapshot(this.directory, manifest);
    this.manifest = manifest;
  }
  private async flushProgress(): Promise<void> {
    if (this.pendingProgress === undefined) return;
    const pending = this.pendingProgress;
    this.pendingProgress = undefined;
    await this.persist(pending);
  }
  private isProgressOnly(next: JobManifestV1): boolean {
    const withoutBytes = (manifest: JobManifestV1) =>
      JSON.stringify({
        ...manifest,
        tracks: manifest.tracks.map((track) => ({
          ...track,
          partial:
            track.partial === undefined
              ? undefined
              : { ...track.partial, bytes: 0 },
        })),
      });
    return (
      withoutBytes(this.manifest) === withoutBytes(next) &&
      JSON.stringify(
        this.manifest.tracks.map((track) => track.partial?.bytes),
      ) !== JSON.stringify(next.tracks.map((track) => track.partial?.bytes))
    );
  }
  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(() => {
      this.assertOpen();
      return operation();
    });
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
  private assertOpen(): void {
    if (this.released)
      throw new ValidationError(new Error('Аренда уже освобождена.'));
  }
  private assertAccepting(): void {
    this.assertOpen();
    // Закрытие допускает checkpoints только уже принятых owner effects.
    // Контекст наследуется их async callbacks, но не новым внешним командам.
    if (this.closing && this.ownedContext.getStore() !== true)
      throw new ValidationError(new Error('Аренда закрывается.'));
  }
  private async assertOwner(): Promise<void> {
    const raw = await readJsonIfPresent(
      path.join(this.directory, 'lease.json'),
    );
    if (raw === undefined)
      throw new ValidationError(new Error('Аренда задания утрачена.'));
    const current = leaseFrom(raw);
    if (
      current.generation !== this.generation ||
      current.ownerToken !== this.ownerToken
    )
      throw new ValidationError(new Error('Аренда задания утрачена.'));
  }
}
