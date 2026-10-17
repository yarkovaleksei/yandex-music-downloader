import { createHash } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import type Database from 'better-sqlite3';
import {
  decodeManifest,
  encodeManifest,
  type JobManifestV1,
  type LeaseState,
} from '@music-downloader/shared';
import { readJsonIfPresent } from './atomic-json.js';
import { FileManifestStore } from './file-manifest-store.js';
import { assertSchemaVersion } from './sqlite-database.js';

type SkipReason = 'corrupt' | 'unreadable' | 'conflict' | 'active' | 'unknown';

interface ImportContext {
  readonly db: Database.Database;
  readonly supported: number;
  readonly now: () => string;
}

function exists(
  db: Database.Database,
  sql: string,
  ...params: unknown[]
): boolean {
  return db.prepare(sql).get(...params) !== undefined;
}

function isImported(
  db: Database.Database,
  jobId: string,
  sha256: string,
): boolean {
  return exists(
    db,
    'SELECT 1 FROM file_imports WHERE job_id = ? AND sha256 = ?',
    jobId,
    sha256,
  );
}

/** Job уже есть в базе или импортирован из другой версии исходного файла. */
function isConflict(db: Database.Database, jobId: string): boolean {
  return (
    exists(db, 'SELECT 1 FROM jobs WHERE job_id = ?', jobId) ||
    exists(db, 'SELECT 1 FROM file_imports WHERE job_id = ?', jobId)
  );
}

function writeSkip(
  context: ImportContext,
  sourceKey: string,
  reason: SkipReason,
): void {
  context.db
    .prepare(
      `INSERT INTO import_skips (source_key, reason, count, observed_at)
       VALUES (?, ?, 1, ?)
       ON CONFLICT (source_key) DO UPDATE SET
         reason = excluded.reason,
         count = import_skips.count + 1,
         observed_at = excluded.observed_at
       WHERE import_skips.reason <> excluded.reason`,
    )
    .run(sourceKey, reason, context.now());
}

/** Безопасная диагностика пропуска пишется только при изменении причины. */
function recordSkip(
  context: ImportContext,
  sourceKey: string,
  reason: SkipReason,
): void {
  const row = context.db
    .prepare('SELECT reason FROM import_skips WHERE source_key = ?')
    .get(sourceKey) as { reason: string } | undefined;
  if (row?.reason === reason) return;
  context.db
    .transaction(() => {
      assertSchemaVersion(context.db, context.supported);
      writeSkip(context, sourceKey, reason);
    })
    .immediate();
}

function clearSkip(context: ImportContext, sourceKey: string): void {
  if (
    !exists(
      context.db,
      'SELECT 1 FROM import_skips WHERE source_key = ?',
      sourceKey,
    )
  )
    return;
  context.db
    .transaction(() => {
      assertSchemaVersion(context.db, context.supported);
      context.db
        .prepare('DELETE FROM import_skips WHERE source_key = ?')
        .run(sourceKey);
    })
    .immediate();
}

function insertImported(
  context: ImportContext,
  manifest: JobManifestV1,
  sha256: string,
  sourceKey: string,
): void {
  const { db } = context;
  db.transaction(() => {
    assertSchemaVersion(db, context.supported);
    // Конкурентный процесс мог импортировать тот же файл между проверками.
    if (isImported(db, manifest.jobId, sha256)) return;
    if (isConflict(db, manifest.jobId)) {
      writeSkip(context, sourceKey, 'conflict');
      return;
    }
    const now = context.now();
    db.prepare(
      `INSERT INTO jobs (job_id, manifest, control_state, updated_at)
       VALUES (?, ?, ?, ?) ON CONFLICT (job_id) DO NOTHING`,
    ).run(
      manifest.jobId,
      encodeManifest(manifest),
      manifest.control.state,
      manifest.updatedAt,
    );
    db.prepare(
      `INSERT INTO file_imports (job_id, sha256, source_key, imported_at)
       VALUES (?, ?, ?, ?) ON CONFLICT (job_id, sha256) DO NOTHING`,
    ).run(manifest.jobId, sha256, sourceKey, now);
    db.prepare('DELETE FROM import_skips WHERE source_key = ?').run(sourceKey);
  }).immediate();
}

/**
 * Идемпотентный импорт файловых manifest headless MVP (ADR-014): ключ — jobId + sha256
 * исходного файла. Исходные файлы не изменяются и не удаляются; job с живой,
 * неизвестной или чужой арендой пропускается до следующего открытия.
 */
export async function importFileManifests(
  context: ImportContext,
  stateDir: string,
): Promise<void> {
  let entries;
  try {
    entries = await readdir(stateDir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  const namespaces = entries
    .filter((entry) => entry.isDirectory() && /^[a-f0-9]{64}$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  if (namespaces.length === 0) return;
  const files = new FileManifestStore({ stateDir });
  for (const sourceKey of namespaces) {
    let text: string | undefined;
    try {
      text = await readJsonIfPresent(
        path.join(stateDir, sourceKey, 'manifest.json'),
      );
    } catch {
      recordSkip(context, sourceKey, 'unreadable');
      continue;
    }
    if (text === undefined) continue;
    const sha256 = createHash('sha256').update(text).digest('hex');
    let manifest: JobManifestV1;
    try {
      manifest = decodeManifest(text);
    } catch {
      recordSkip(context, sourceKey, 'corrupt');
      continue;
    }
    // Дешёвые проверки по базе выполняются до наблюдения файловой аренды.
    if (isImported(context.db, manifest.jobId, sha256)) {
      clearSkip(context, sourceKey);
      continue;
    }
    if (isConflict(context.db, manifest.jobId)) {
      recordSkip(context, sourceKey, 'conflict');
      continue;
    }
    const lease: LeaseState = await files
      .readLeaseState(manifest.jobId)
      .catch(() => 'unknown' as const);
    if (lease !== 'inactive') {
      recordSkip(context, sourceKey, lease);
      continue;
    }
    insertImported(context, manifest, sha256, sourceKey);
  }
}
