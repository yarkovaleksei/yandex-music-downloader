import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import type Database from 'better-sqlite3';
import {
  decodeControlReceipt,
  decodeControlRequest,
  decodeManifest,
  encodeManifest,
  type DomainError,
  ValidationError,
  type AcquireOptions,
  type ControlReceipt,
  type ControlRequest,
  type JobManifestV1,
  type LeaseIdentity,
  type LeaseRecord,
  type LeaseSession,
  type LeaseState,
  type ManifestStore,
} from '@music-downloader/shared';
import {
  assertReclaimable,
  heartbeatIntervalMs,
  isProgressOnly,
  leaseTimeoutMs,
  observeLeaseState,
  progressFlushIntervalMs,
  validateLeaseRecord,
} from './lease-policy.js';
import { currentLeaseIdentity } from './process-identity.js';
import { resolveStateDirectory } from './state-directory.js';
import {
  assertSchemaVersion,
  inspectStateDatabase,
  openStateDatabase,
} from './sqlite-database.js';
import {
  isPermanentOpenRefusal,
  safeStoreError,
  schemaUnsupportedError,
} from './sqlite-errors.js';
import { importFileManifests } from './sqlite-file-import.js';
import {
  readUserVersion,
  sqliteMigrations,
  supportedSchemaVersion,
  type SqliteMigration,
} from './sqlite-migrations.js';

export interface SqliteManifestStoreOptions {
  readonly stateDir?: string;
  /** Только для тестов: часы аренды (heartbeat, устаревание). */
  readonly now?: () => number;
  /** Только для тестов: таймаут устаревания аренды. */
  readonly leaseTimeoutMs?: number;
  /** Только для тестов: барьер перед BEGIN IMMEDIATE захвата аренды. */
  readonly beforeLeaseCas?: () => Promise<void>;
  /** Только для тестов: подмена упорядоченного списка миграций. */
  readonly migrations?: readonly SqliteMigration[];
}

interface LeaseRow {
  readonly pid: number;
  readonly hostname: string;
  readonly process_started_at: string;
  readonly generation: number;
  readonly owner_token: string;
  readonly acquired_at: string;
  readonly heartbeat_at: string;
  readonly released_at: string | null;
}

interface LeaseOwner {
  readonly jobId: string;
  readonly generation: number;
  readonly ownerToken: string;
}

function closedError(): ValidationError {
  return new ValidationError(new Error('Хранилище состояния закрыто.'));
}

function leaseFromRow(row: LeaseRow): LeaseRecord {
  return validateLeaseRecord({
    pid: row.pid,
    hostname: row.hostname,
    processStartedAt: row.process_started_at,
    generation: row.generation,
    ownerToken: row.owner_token,
    acquiredAt: row.acquired_at,
    heartbeatAt: row.heartbeat_at,
    ...(row.released_at === null ? {} : { releasedAt: row.released_at }),
  });
}

function sameLease(
  left: LeaseRow | undefined,
  right: LeaseRow | undefined,
): boolean {
  if (left === undefined || right === undefined) return left === right;
  return (
    left.generation === right.generation &&
    left.owner_token === right.owner_token &&
    left.heartbeat_at === right.heartbeat_at &&
    left.released_at === right.released_at
  );
}

function leaseRow(db: Database.Database, jobId: string): LeaseRow | undefined {
  return db.prepare('SELECT * FROM leases WHERE job_id = ?').get(jobId) as
    LeaseRow | undefined;
}

function assertOwner(db: Database.Database, owner: LeaseOwner): void {
  const row = leaseRow(db, owner.jobId);
  if (
    row === undefined ||
    row.generation !== owner.generation ||
    row.owner_token !== owner.ownerToken
  )
    throw new ValidationError(new Error('Аренда задания утрачена.'));
}

/**
 * SQLite-реализация порта ManifestStore (ADR-014): одна база на пользователя ОС,
 * семантика manifest и аренды ADR-004 сохраняется. База открывается лениво при
 * первом вызове; явные open()/close() принадлежат composition root, не shared-порту.
 */
export class SqliteManifestStore implements ManifestStore {
  private readonly stateDir: string;
  private readonly migrations: readonly SqliteMigration[];
  private readonly supported: number;
  private readonly now: () => number;
  private readonly timeoutMs: number;
  private db: Database.Database | undefined;
  private opening: Promise<Database.Database> | undefined;
  private refusal: DomainError | undefined;
  private closed = false;

  public constructor(
    private readonly options: SqliteManifestStoreOptions = {},
  ) {
    this.stateDir = resolveStateDirectory({ stateDir: options.stateDir });
    this.migrations = options.migrations ?? sqliteMigrations;
    this.supported = supportedSchemaVersion(this.migrations);
    this.now = options.now ?? Date.now;
    this.timeoutMs = options.leaseTimeoutMs ?? leaseTimeoutMs;
  }

  /** Явное открытие: миграции, резервная копия и импорт файловых manifest. */
  public async open(): Promise<void> {
    await this.database();
  }

  /** После close() store отказывает безопасной ошибкой и не переоткрывает базу. */
  public async close(): Promise<void> {
    this.closed = true;
    await this.opening?.catch(() => undefined);
    const db = this.db;
    this.db = undefined;
    try {
      if (db?.open === true) db.close();
    } catch {
      // Ошибка закрытия не должна заменить результат завершения приложения.
    }
  }

  /** Read-only проверка doctor: отсутствующая база не создаётся. */
  public inspect(): 'absent' | 'ok' {
    return inspectStateDatabase({
      stateDir: this.stateDir,
      migrations: this.migrations,
    });
  }

  public async read(jobId: string): Promise<JobManifestV1 | undefined> {
    return this.reading((db) => {
      const row = db
        .prepare('SELECT manifest FROM jobs WHERE job_id = ?')
        .get(jobId) as { manifest: string } | undefined;
      return row === undefined ? undefined : decodeManifest(row.manifest);
    });
  }

  /**
   * Порядок jobId совпадает с файловым store: сортировка JS по UTF-16 code units,
   * а не BINARY collation SQLite по UTF-8. @link planning/tasks/STEP-042.md
   */
  public async list(): Promise<readonly JobManifestV1[]> {
    const manifests = await this.reading((db) =>
      (
        db.prepare('SELECT manifest FROM jobs').all() as {
          manifest: string;
        }[]
      ).map((row) => decodeManifest(row.manifest)),
    );
    return manifests.sort((a, b) =>
      a.jobId < b.jobId ? -1 : a.jobId > b.jobId ? 1 : 0,
    );
  }

  /** Снимок без захвата и записи; unknown не превращается в inactive (STEP-043). */
  public async readLeaseState(jobId: string): Promise<LeaseState> {
    try {
      const row = await this.reading((db) => leaseRow(db, jobId));
      return await observeLeaseState(
        row === undefined ? undefined : leaseFromRow(row),
        this.clock(),
      );
    } catch (error) {
      throw safeStoreError(error);
    }
  }

  public async create(manifest: JobManifestV1): Promise<void> {
    const encoded = encodeManifest(manifest);
    await this.writing((db) => {
      if (
        db
          .prepare('SELECT 1 FROM jobs WHERE job_id = ?')
          .get(manifest.jobId) !== undefined
      )
        throw new ValidationError(
          new Error('Manifest задания уже существует.'),
        );
      db.prepare(
        'INSERT INTO jobs (job_id, manifest, control_state, updated_at) VALUES (?, ?, ?, ?)',
      ).run(
        manifest.jobId,
        encoded,
        manifest.control.state,
        manifest.updatedAt,
      );
    });
  }

  /**
   * Захват: наблюдение и probe вне транзакции → CAS в BEGIN IMMEDIATE → recovery вне
   * транзакции → save. Ошибка recovery или save освобождает аренду (ADR-004, ADR-014).
   */
  public async acquire(
    jobId: string,
    options: AcquireOptions,
  ): Promise<LeaseSession> {
    const identity = options.identity ?? (await currentLeaseIdentity());
    const prior = await this.reading((db) => leaseRow(db, jobId));
    if (prior !== undefined)
      await assertReclaimable(
        leaseFromRow(prior),
        identity,
        options.forceForeignLease === true,
        options.expectedGeneration,
        this.clock(),
      );
    await this.options.beforeLeaseCas?.();
    const acquiredAt = this.isoNow();
    const ownerToken = randomUUID();
    const generation = await this.writing((db) => {
      if (
        db.prepare('SELECT 1 FROM jobs WHERE job_id = ?').get(jobId) ===
        undefined
      )
        throw new ValidationError(new Error('Manifest задания не найден.'));
      const current = leaseRow(db, jobId);
      // CAS: аренда не изменилась с момента наблюдения, иначе победил другой процесс.
      if (!sameLease(prior, current))
        throw new ValidationError(
          new Error('Задание уже выполняется другим процессом.'),
        );
      const next = (current?.generation ?? 0) + 1;
      db.prepare(
        `INSERT INTO leases (job_id, pid, hostname, process_started_at, generation,
           owner_token, acquired_at, heartbeat_at, released_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
         ON CONFLICT (job_id) DO UPDATE SET
           pid = excluded.pid, hostname = excluded.hostname,
           process_started_at = excluded.process_started_at,
           generation = excluded.generation, owner_token = excluded.owner_token,
           acquired_at = excluded.acquired_at, heartbeat_at = excluded.heartbeat_at,
           released_at = NULL`,
      ).run(
        jobId,
        identity.pid,
        identity.hostname,
        identity.processStartedAt,
        next,
        ownerToken,
        acquiredAt,
        acquiredAt,
      );
      return next;
    });
    const owner: LeaseOwner = { jobId, generation, ownerToken };
    try {
      const manifest = await this.read(jobId);
      if (manifest === undefined)
        throw new ValidationError(new Error('Manifest задания не найден.'));
      const recovered = await options.recover(manifest);
      await this.saveOwned(owner, recovered);
      return new SqliteLeaseSession(this, owner, identity, recovered);
    } catch (error) {
      await this.releaseOwned(owner).catch(() => undefined);
      throw error;
    }
  }

  public async sendControl(
    jobId: string,
    request: Omit<ControlRequest, 'requestId' | 'createdAt'>,
  ): Promise<ControlRequest> {
    const item = decodeControlRequest({
      command: request.command,
      requestId: randomUUID(),
      createdAt: new Date().toISOString(),
    });
    await this.writing((db) => {
      db.prepare(
        'INSERT INTO control_requests (request_id, job_id, command, created_at) VALUES (?, ?, ?, ?)',
      ).run(item.requestId, jobId, item.command, item.createdAt);
    });
    return item;
  }

  public async waitControlAck(
    jobId: string,
    requestId: string,
    timeoutMs = 10_000,
  ): Promise<ControlReceipt | undefined> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() <= deadline) {
      const receipt = await this.reading((db) => {
        const row = db
          .prepare(
            'SELECT receipt FROM control_receipts WHERE request_id = ? AND job_id = ?',
          )
          .get(requestId, jobId) as { receipt: string } | undefined;
        return row === undefined
          ? undefined
          : decodeControlReceipt(JSON.parse(row.receipt));
      });
      if (receipt !== undefined) return receipt;
      await new Promise<void>((resolve) => setTimeout(resolve, 25));
    }
    return undefined;
  }

  /** @internal Сохранение владельцем: owner и user_version сверяются в той же транзакции. */
  public async saveOwned(
    owner: LeaseOwner,
    manifest: JobManifestV1,
    complete?: { readonly requestId: string; readonly receipt: ControlReceipt },
  ): Promise<void> {
    const encoded = encodeManifest(manifest);
    if (manifest.jobId !== owner.jobId) throw new ValidationError();
    await this.writing((db) => {
      assertOwner(db, owner);
      const row = db
        .prepare('SELECT manifest FROM jobs WHERE job_id = ?')
        .get(owner.jobId) as { manifest: string } | undefined;
      if (row !== undefined) {
        // Manifest неизвестной более новой версии не перезаписывается (ADR-004).
        const current = decodeManifest(row.manifest);
        if (JSON.stringify(current.plan) !== JSON.stringify(manifest.plan))
          throw new ValidationError(
            new Error('План задания нельзя изменять после создания manifest.'),
          );
      }
      db.prepare(
        'UPDATE jobs SET manifest = ?, control_state = ?, updated_at = ? WHERE job_id = ?',
      ).run(encoded, manifest.control.state, manifest.updatedAt, owner.jobId);
      if (complete !== undefined) {
        writeReceipt(db, owner.jobId, complete.receipt);
        removeRequest(db, complete.requestId);
      }
    });
  }

  /** @internal */
  public async heartbeatOwned(owner: LeaseOwner): Promise<void> {
    const now = this.isoNow();
    await this.writing((db) => {
      assertOwner(db, owner);
      db.prepare('UPDATE leases SET heartbeat_at = ? WHERE job_id = ?').run(
        now,
        owner.jobId,
      );
    });
  }

  /** @internal */
  public async releaseOwned(owner: LeaseOwner): Promise<void> {
    const now = this.isoNow();
    await this.writing((db) => {
      assertOwner(db, owner);
      db.prepare(
        'UPDATE leases SET heartbeat_at = ?, released_at = ? WHERE job_id = ?',
      ).run(now, now, owner.jobId);
    });
  }

  /** @internal */
  public async assertOwned(owner: LeaseOwner): Promise<void> {
    await this.reading((db) => assertOwner(db, owner));
  }

  /** @internal */
  public async pendingControls(jobId: string): Promise<ControlRequest[]> {
    return this.reading((db) =>
      (
        db
          .prepare(
            'SELECT request_id, command, created_at FROM control_requests WHERE job_id = ? ORDER BY created_at, request_id',
          )
          .all(jobId) as {
          request_id: string;
          command: string;
          created_at: string;
        }[]
      ).map((row) =>
        decodeControlRequest({
          requestId: row.request_id,
          command: row.command,
          createdAt: row.created_at,
        }),
      ),
    );
  }

  /** @internal Подтверждение и удаление запроса одной транзакцией владельца. */
  public async acknowledgeOwned(
    owner: LeaseOwner,
    receipt: ControlReceipt,
    requestId?: string,
  ): Promise<void> {
    const checked = decodeControlReceipt(receipt);
    await this.writing((db) => {
      assertOwner(db, owner);
      writeReceipt(db, owner.jobId, checked);
      if (requestId !== undefined) removeRequest(db, requestId);
    });
  }

  private clock() {
    return { now: this.now(), timeoutMs: this.timeoutMs };
  }

  private isoNow(): string {
    return new Date(this.now()).toISOString();
  }

  private database(): Promise<Database.Database> {
    if (this.closed) return Promise.reject(closedError());
    if (this.refusal !== undefined) return Promise.reject(this.refusal);
    if (this.db !== undefined) return Promise.resolve(this.db);
    if (this.opening === undefined) {
      const opening = (async () => {
        const db = openStateDatabase({
          stateDir: this.stateDir,
          migrations: this.migrations,
        });
        try {
          await importFileManifests(
            {
              db,
              supported: this.supported,
              now: () => new Date().toISOString(),
            },
            this.stateDir,
          );
          if (this.closed) throw closedError();
        } catch (error) {
          db.close();
          throw error;
        }
        this.db = db;
        return db;
      })().catch((error: unknown) => {
        const safe = safeStoreError(error);
        // Кэшируются только отказы, которые не исправит повтор; BUSY/IO повторяются.
        if (isPermanentOpenRefusal(safe)) this.refusal = safe;
        throw safe;
      });
      this.opening = opening;
      void opening.then(
        () => (this.opening = undefined),
        () => (this.opening = undefined),
      );
    }
    return this.opening;
  }

  /** Чтение: при SQL-ошибке перепроверяем user_version — схема могла стать новее. */
  private async reading<T>(
    operation: (db: Database.Database) => T,
  ): Promise<T> {
    const db = await this.database();
    try {
      return operation(db);
    } catch (error) {
      if (this.closed) throw closedError();
      let newer = false;
      try {
        newer = readUserVersion(db) > this.supported;
      } catch {
        // Версию прочитать не удалось: сообщаем исходную безопасную ошибку.
      }
      if (newer) throw schemaUnsupportedError();
      throw safeStoreError(error);
    }
  }

  /** Каждая транзакция записи сначала сверяет user_version с версией процесса (ADR-014). */
  private async writing<T>(
    operation: (db: Database.Database) => T,
  ): Promise<T> {
    const db = await this.database();
    try {
      return db
        .transaction(() => {
          assertSchemaVersion(db, this.supported);
          return operation(db);
        })
        .immediate();
    } catch (error) {
      if (this.closed) throw closedError();
      throw safeStoreError(error);
    }
  }
}

function writeReceipt(
  db: Database.Database,
  jobId: string,
  receipt: ControlReceipt,
): void {
  db.prepare(
    `INSERT INTO control_receipts (request_id, job_id, receipt) VALUES (?, ?, ?)
     ON CONFLICT (request_id) DO UPDATE SET receipt = excluded.receipt`,
  ).run(receipt.requestId, jobId, JSON.stringify(receipt));
}

function removeRequest(db: Database.Database, requestId: string): void {
  db.prepare('DELETE FROM control_requests WHERE request_id = ?').run(
    requestId,
  );
}

/** Повторяет FileLeaseSession: serial-очередь, progress-only save, heartbeat, runOwned/closing. */
class SqliteLeaseSession implements LeaseSession {
  public readonly jobId: string;
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
    private readonly store: SqliteManifestStore,
    private readonly owner: LeaseOwner,
    public readonly identity: LeaseIdentity,
    public manifest: JobManifestV1,
  ) {
    this.jobId = owner.jobId;
    // Heartbeat поддерживает lease во время долгого owned I/O (ADR-004).
    this.heartbeatTimer = setInterval(() => {
      void this.heartbeat().catch(() => undefined);
    }, heartbeatIntervalMs);
    this.heartbeatTimer.unref();
  }
  public async save(manifest: JobManifestV1): Promise<void> {
    this.assertAccepting();
    if (isProgressOnly(this.manifest, manifest)) {
      return this.serial(async () => {
        await this.store.assertOwned(this.owner);
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
    return this.serial(() => this.store.heartbeatOwned(this.owner));
  }
  public consumeControls(
    handler: (request: ControlRequest) => Promise<ControlReceipt>,
  ): Promise<readonly ControlReceipt[]> {
    return this.runOwned(() => {
      const operation = this.controlQueue.then(async () => {
        const receipts: ControlReceipt[] = [];
        for (const request of await this.store.pendingControls(this.jobId)) {
          const last = this.manifest.lastControl;
          if (last?.requestId === request.requestId) {
            await this.serial(async () => {
              await this.flushProgress();
              await this.store.acknowledgeOwned(
                this.owner,
                last,
                request.requestId,
              );
            });
            receipts.push(last);
            continue;
          }
          const receipt = await handler(request);
          await this.serial(async () => {
            await this.flushProgress();
            const next = {
              ...this.manifest,
              lastControl: receipt,
              updatedAt: receipt.completedAt,
            };
            this.assertOpen();
            // Manifest, receipt и удаление запроса фиксируются одной транзакцией.
            await this.store.saveOwned(this.owner, next, {
              requestId: request.requestId,
              receipt,
            });
            this.manifest = next;
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
      await this.store.acknowledgeOwned(this.owner, receipt);
    });
  }
  public async runOwned<T>(operation: () => Promise<T>): Promise<T> {
    this.assertOpen();
    // После начала release допустим только checkpoint уже принятого effect (F-002).
    if (this.closing)
      throw new ValidationError(new Error('Аренда закрывается.'));
    const active = this.store
      .assertOwned(this.owner)
      .then(() => this.ownedContext.run(true, operation));
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
      // Active callbacks могут сохранить свой checkpoint через serial queue (ADR-004).
      await Promise.allSettled(this.activeOperations);
      await this.serial(async () => {
        await this.flushProgress();
        this.released = true;
        await this.store.releaseOwned(this.owner);
      });
    })();
    return this.releasePromise;
  }
  private async persist(manifest: JobManifestV1): Promise<void> {
    this.assertOpen();
    await this.store.saveOwned(this.owner, manifest);
    this.manifest = manifest;
  }
  private async flushProgress(): Promise<void> {
    if (this.pendingProgress === undefined) return;
    const pending = this.pendingProgress;
    this.pendingProgress = undefined;
    await this.persist(pending);
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
    if (this.closing && this.ownedContext.getStore() !== true)
      throw new ValidationError(new Error('Аренда закрывается.'));
  }
}
