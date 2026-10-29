#!/usr/bin/env node
/**
 * Самодостаточная платформенная проверка SQLite store (STEP-029, ADR-014, ADR-017).
 *
 * Запускается без Vitest, Yarn и сети: на built dist persistence/shared и зависимостях
 * набора. Базы создаются только во временном каталоге локального диска (os.tmpdir()).
 * Отчёт report-<platform>-<arch>[-rosetta].json содержит только разрешённые поля:
 * без hostname, имени пользователя, путей и raw-сообщений ошибок.
 */
import { execFileSync, fork, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { manifestFixture } from '@music-downloader/shared';
import { SqliteManifestStore } from '../dist/sqlite-manifest-store.js';
import {
  readUserVersion,
  sqliteMigrations,
  supportedSchemaVersion,
} from '../dist/sqlite-migrations.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// STEP-056: проверяется переход v1 к текущей production-схеме; исходная fixture закреплена на v1.
const additiveV2 = sqliteMigrations;
const marker = 'platform-check-secret-marker';

class CheckFailure extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function expect(condition, code) {
  if (!condition) throw new CheckFailure(code);
}

/** Безопасный код ошибки: только код/причина/имя класса, без сообщения. */
function safeCode(error) {
  if (error instanceof CheckFailure) return error.code;
  if (typeof error?.reason === 'string') return error.reason;
  if (typeof error?.code === 'string' && /^[A-Z0-9_]+$/.test(error.code))
    return error.code;
  return typeof error?.name === 'string' ? error.name : 'UNKNOWN';
}

async function rejection(promise) {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return error;
  }
}

function deadPid() {
  return spawnSync(process.execPath, ['-e', '']).pid;
}

function databaseFiles(stateDir) {
  return readdirSync(stateDir)
    .filter((name) => name.startsWith('state.sqlite3'))
    .sort();
}

function inspect(stateDir, operation) {
  const db = new Database(path.join(stateDir, 'state.sqlite3'), {
    readonly: true,
    fileMustExist: true,
  });
  try {
    return operation(db);
  } finally {
    db.close();
  }
}

/** Каждая проверка получает свой каталог; базы закрываются до удаления (Windows). */
async function withStateDir(operation) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'md-platform-check-'));
  const stores = [];
  const open = (options = {}) => {
    const store = new SqliteManifestStore({ ...options, stateDir: root });
    stores.push(store);
    return store;
  };
  try {
    await operation(root, open);
  } finally {
    for (const store of stores) await store.close();
    rmSync(root, { recursive: true, force: true, maxRetries: 5 });
  }
}

function bindingId() {
  // lib/index.js → корень пакета; неэкспортированный lib/binding не используется.
  const packageJson = path.join(
    path.dirname(fileURLToPath(import.meta.resolve('better-sqlite3'))),
    '..',
    'package.json',
  );
  const musl =
    process.platform === 'linux' &&
    !process.report.getReport().header.glibcVersionRuntime;
  const target = `${musl ? 'linuxmusl' : process.platform}-${process.arch}`;
  const file = path.join(
    path.dirname(packageJson),
    'prebuilds',
    `${target}.node`,
  );
  return {
    id: existsSync(file) ? `prebuilds/${target}` : 'none',
    version: JSON.parse(readFileSync(packageJson, 'utf8')).version,
  };
}

function procTranslated() {
  if (process.platform !== 'darwin') return false;
  try {
    return (
      execFileSync('sysctl', ['-n', 'sysctl.proc_translated'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim() === '1'
    );
  } catch {
    return false;
  }
}

function child(stateDir, mode) {
  const processChild = fork(fileURLToPath(import.meta.url), [
    '--child',
    mode,
    stateDir,
  ]);
  const messages = [];
  const waiters = [];
  processChild.on('message', (message) => {
    messages.push(message);
    for (const waiter of waiters.splice(0)) waiter();
  });
  const exited = new Promise((resolve) => processChild.once('exit', resolve));
  const next = async (index) => {
    const deadline = Date.now() + 60_000;
    while (messages.length <= index) {
      if (processChild.exitCode !== null || Date.now() > deadline)
        throw new CheckFailure('CHILD_NO_REPORT');
      await new Promise((resolve) => {
        waiters.push(resolve);
        setTimeout(resolve, 50);
      });
    }
    return messages[index];
  };
  return { processChild, next, exited };
}

async function stopChildren(children) {
  for (const item of children) {
    if (item.processChild.exitCode === null) item.processChild.kill();
    await item.exited;
  }
}

function seedStaleLease(stateDir) {
  const db = new Database(path.join(stateDir, 'state.sqlite3'));
  try {
    db.prepare(
      `INSERT INTO leases (job_id, pid, hostname, process_started_at, generation,
         owner_token, acquired_at, heartbeat_at, released_at)
       VALUES ('job', ?, ?, 'dead-birth', 1, 'dead-owner', ?, ?, NULL)`,
    ).run(
      deadPid(),
      os.hostname(),
      '2000-01-01T00:00:00.000Z',
      '2000-01-01T00:00:00.000Z',
    );
  } finally {
    db.close();
  }
}

const checks = {
  async binding() {
    const db = new Database(':memory:');
    try {
      expect(db.prepare('SELECT 1 AS value').get().value === 1, 'MEMORY_QUERY');
    } finally {
      db.close();
    }
  },

  async crud() {
    await withStateDir(async (stateDir, open) => {
      const store = open();
      await store.create(manifestFixture('b'));
      await store.create(manifestFixture('a'));
      const listed = (await store.list()).map((item) => item.jobId).join(',');
      expect(listed === 'a,b', 'LIST_ORDER');
      const session = await store.acquire('a', {
        recover: async (item) => item,
      });
      expect((await store.readLeaseState('a')) === 'active', 'LEASE_ACTIVE');
      await session.save({
        ...session.manifest,
        updatedAt: '2026-02-02T00:00:00.000Z',
      });
      await session.release();
      expect(
        (await store.read('a'))?.updatedAt === '2026-02-02T00:00:00.000Z',
        'SAVE',
      );
      expect(
        (await store.readLeaseState('a')) === 'inactive',
        'LEASE_RELEASED',
      );
    });
  },

  async migrations() {
    await withStateDir(async (stateDir, open) => {
      const v1 = open({ migrations: sqliteMigrations.slice(0, 1) });
      await v1.create(manifestFixture('job'));
      await v1.close();
      const before = inspect(stateDir, (db) =>
        JSON.stringify(db.prepare('SELECT * FROM jobs').all()),
      );
      const v2 = open({ migrations: additiveV2 });
      expect((await v2.read('job'))?.jobId === 'job', 'READ_AFTER_MIGRATION');
      await v2.close();
      const after = inspect(stateDir, (db) => ({
        version: readUserVersion(db),
        jobs: JSON.stringify(
          db
            .prepare(
              'SELECT job_id, manifest, control_state, updated_at FROM jobs',
            )
            .all(),
        ),
        applied: db
          .prepare('SELECT version FROM schema_migrations ORDER BY version')
          .all()
          .map((row) => row.version)
          .join(','),
      }));
      expect(
        after.version === supportedSchemaVersion(sqliteMigrations),
        'USER_VERSION',
      );
      expect(
        after.applied ===
          sqliteMigrations.map((migration) => migration.version).join(','),
        'APPLIED',
      );
      expect(after.jobs === before, 'DATA_PRESERVED');
      expect(
        databaseFiles(stateDir).some((name) => name.includes('.bak-v1-')),
        'BACKUP',
      );
    });
  },

  async lease_two_process() {
    await withStateDir(async (stateDir, open) => {
      const store = open();
      await store.create(manifestFixture('job'));
      await store.close();
      const children = [];
      try {
        const owner = child(stateDir, 'hold');
        children.push(owner);
        expect((await owner.next(0)).status === 'acquired', 'OWNER');
        const contender = open();
        const refused = await rejection(
          contender.acquire('job', { recover: async (item) => item }),
        );
        expect(refused?.code === 'VALIDATION_ERROR', 'SECOND_OWNER');
        await contender.close();
        owner.processChild.send('release');
        expect((await owner.next(1)).status === 'released', 'RELEASE');
      } finally {
        await stopChildren(children);
      }
    });
  },

  async concurrent_reclaim() {
    await withStateDir(async (stateDir, open) => {
      const store = open();
      await store.create(manifestFixture('job'));
      await store.close();
      seedStaleLease(stateDir);
      const children = [child(stateDir, 'barrier'), child(stateDir, 'barrier')];
      try {
        for (const item of children)
          expect((await item.next(0)).status === 'barrier', 'BARRIER');
        for (const item of children) item.processChild.send('go');
        const results = [];
        for (const item of children) results.push((await item.next(1)).status);
        expect(
          results.sort().join(',') === 'acquired,rejected',
          'SINGLE_WINNER',
        );
      } finally {
        await stopChildren(children);
      }
    });
  },

  async stale_connection() {
    await withStateDir(async (stateDir, open) => {
      const old = open({ migrations: sqliteMigrations.slice(0, 1) });
      await old.create(manifestFixture('job'));
      const newer = open({ migrations: additiveV2 });
      await newer.open();
      const refused = await rejection(old.create(manifestFixture('other')));
      expect(refused?.reason === 'STATE_SCHEMA_UNSUPPORTED', 'OLD_WRITER');
    });
  },

  async newer_schema() {
    await withStateDir(async (stateDir, open) => {
      const file = path.join(stateDir, 'state.sqlite3');
      // F-001: новый клиент завершается без close(), сохраняя committed-схему
      // в WAL; отказ старого клиента не должен выполнить checkpoint (STEP-029).
      const seed = spawnSync(
        process.execPath,
        [
          '-e',
          `const Database = require('better-sqlite3');
           const db = new Database(process.argv[1]);
           db.pragma('journal_mode = WAL');
           db.pragma('wal_autocheckpoint = 0');
           db.exec('CREATE TABLE future (value TEXT); PRAGMA user_version = 99;');
           db.prepare('INSERT INTO future VALUES (?)').run('saved');
           process.exit(0);`,
          file,
        ],
        { cwd: here, encoding: 'utf8' },
      );
      expect(seed.status === 0, 'SEED_PROCESS');
      expect(statSync(`${file}-wal`).size > 0, 'SEED_WAL');
      const before = readFileSync(file);
      const filesBefore = databaseFiles(stateDir);
      const store = open();
      const refused = await rejection(store.list());
      await store.close();
      expect(refused?.reason === 'STATE_SCHEMA_UNSUPPORTED', 'REFUSAL');
      expect(readFileSync(file).equals(before), 'FILE_CHANGED');
      expect(
        databaseFiles(stateDir).join(',') === filesBefore.join(','),
        'SIDECARS_CHANGED',
      );
      expect(
        !databaseFiles(stateDir).some((name) => name.includes('.bak')),
        'BACKUP_CREATED',
      );
    });
  },

  async corrupt_database() {
    await withStateDir(async (stateDir, open) => {
      const file = path.join(stateDir, 'state.sqlite3');
      const garbage = Buffer.from('not a sqlite database '.repeat(64));
      writeFileSync(file, garbage);
      const refused = await rejection(open().list());
      expect(refused?.code === 'VALIDATION_ERROR', 'REFUSAL');
      expect(readFileSync(file).equals(garbage), 'FILE_CHANGED');
    });
  },

  async posix_permissions() {
    if (process.platform === 'win32') return 'SKIP';
    await withStateDir(async (stateDir) => {
      const nested = path.join(stateDir, 'state');
      const store = new SqliteManifestStore({
        stateDir: nested,
        migrations: sqliteMigrations.slice(0, 1),
      });
      try {
        await store.create(manifestFixture('job'));
        const mode = (name) => statSync(path.join(nested, name)).mode & 0o777;
        expect((statSync(nested).mode & 0o777) === 0o700, 'STATE_DIR');
        const files = databaseFiles(nested);
        expect(files.length === 3, 'WAL_SHM');
        for (const name of files) expect(mode(name) === 0o600, 'FILE_MODE');
        await store.close();
        const migrated = new SqliteManifestStore({
          stateDir: nested,
          migrations: additiveV2,
        });
        try {
          await migrated.open();
        } finally {
          await migrated.close();
        }
        const backup = databaseFiles(nested).find((name) =>
          name.includes('.bak-v1-'),
        );
        expect(backup !== undefined && mode(backup) === 0o600, 'BACKUP_MODE');
      } finally {
        await store.close();
      }
    });
  },

  async secret_marker() {
    await withStateDir(async (stateDir, open) => {
      const store = open();
      await store.create({ ...manifestFixture('job'), token: marker });
      const session = await store.acquire('job', {
        recover: async (item) => item,
      });
      await session.save({
        ...session.manifest,
        authorization: `Bearer ${marker}`,
        updatedAt: '2026-03-03T00:00:00.000Z',
      });
      const leaked = () =>
        databaseFiles(stateDir).some((name) =>
          readFileSync(path.join(stateDir, name)).includes(marker),
        );
      expect(!leaked(), 'MARKER_IN_WAL');
      await session.release();
      await store.close();
      const migrated = open({ migrations: additiveV2 });
      await migrated.open();
      expect(!leaked(), 'MARKER_IN_BACKUP');
    });
  },
};

async function runChild(mode, stateDir) {
  const send = (message) =>
    new Promise((resolve) => process.send(message, resolve));
  const waitFor = (expected) =>
    new Promise((resolve) => {
      const listener = (message) => {
        if (message !== expected) return;
        process.off('message', listener);
        resolve();
      };
      process.on('message', listener);
    });
  const store = new SqliteManifestStore({
    stateDir,
    ...(mode === 'barrier'
      ? {
          beforeLeaseCas: async () => {
            const go = waitFor('go');
            await send({ status: 'barrier' });
            await go;
          },
        }
      : {}),
  });
  try {
    const session = await store.acquire('job', {
      recover: async (item) => item,
    });
    if (mode === 'hold') {
      const release = waitFor('release');
      await send({ status: 'acquired' });
      await release;
      await session.release();
      await send({ status: 'released' });
    } else {
      await session.release();
      await send({ status: 'acquired' });
    }
  } catch (error) {
    await send({ status: 'rejected', code: safeCode(error) });
  } finally {
    await store.close();
    process.disconnect();
  }
}

function kitManifest() {
  const file = path.join(here, 'kit-manifest.json');
  if (!existsSync(file)) return null;
  const value = JSON.parse(readFileSync(file, 'utf8'));
  // Allowlist: в отчёт переносятся только известные поля сборки набора.
  return {
    buildId: String(value.buildId),
    gitHead: String(value.gitHead),
    treeClean: value.treeClean === true,
    node: String(value.node),
    sha256: {
      dist: String(value.sha256?.dist),
      yarnLock: String(value.sha256?.yarnLock),
    },
  };
}

function reportDirectory(argv) {
  const index = argv.indexOf('--report-dir');
  return index === -1 ? process.cwd() : path.resolve(argv[index + 1]);
}

async function main(argv) {
  if (argv[0] === '--child') return runChild(argv[1], argv[2]);
  const translated = procTranslated();
  const binding = bindingId();
  const results = {};
  let sqliteVersion = 'unknown';
  for (const [name, check] of Object.entries(checks)) {
    try {
      const outcome = await check();
      results[name] = { status: outcome === 'SKIP' ? 'SKIP' : 'PASS' };
    } catch (error) {
      results[name] = { status: 'FAIL', code: safeCode(error) };
    }
    if (name === 'binding' && results.binding.status === 'PASS') {
      const db = new Database(':memory:');
      sqliteVersion = db.prepare('SELECT sqlite_version() AS v').get().v;
      db.close();
    }
  }
  const failed = Object.values(results).some((item) => item.status === 'FAIL');
  const report = {
    schema: 1,
    status: failed ? 'FAIL' : 'PASS',
    platform: process.platform,
    arch: process.arch,
    proc_translated: translated,
    binding: binding.id,
    versions: {
      node: process.versions.node,
      napi: String(process.versions.napi),
      sqlite: sqliteVersion,
      betterSqlite3: binding.version,
    },
    checks: results,
    kitManifest: kitManifest(),
  };
  const name = `report-${process.platform}-${process.arch}${translated ? '-rosetta' : ''}.json`;
  const target = path.join(reportDirectory(argv), name);
  // LF и перевод строки в конце: файл совпадает с выводом Prettier побайтно.
  writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`);
  const digest = createHash('sha256')
    .update(readFileSync(target))
    .digest('hex');
  process.stdout.write(
    `${report.status}: ${report.platform}-${report.arch}${translated ? ' (Rosetta)' : ''}, ${name}, sha256 ${digest}\n`,
  );
  for (const [checkName, item] of Object.entries(results))
    process.stdout.write(
      `  ${checkName}: ${item.status}${item.code === undefined ? '' : ` (${item.code})`}\n`,
    );
  process.exitCode = failed ? 1 : 0;
}

await main(process.argv.slice(2));
