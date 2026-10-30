import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { manifestFixture, type JobManifestV1 } from '@music-downloader/shared';
import { FileManifestStore } from './file-manifest-store.js';
import { SqliteManifestStore } from './sqlite-manifest-store.js';
import {
  inspectDatabase,
  removeDirectory,
  temporaryStateDir,
} from './fixtures/sqlite-test-support.js';

const namespace = (jobId: string) =>
  createHash('sha256').update(jobId).digest('hex');

/** Побайтный снимок файлового store: импорт не меняет и не удаляет исходники. */
async function sourceTree(stateDir: string): Promise<Record<string, string>> {
  const tree: Record<string, string> = {};
  for (const entry of await readdir(stateDir, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (!entry.isFile() || entry.name.startsWith('state.sqlite3')) continue;
    const file = path.join(entry.parentPath, entry.name);
    tree[path.relative(stateDir, file)] = (await readFile(file)).toString(
      'base64',
    );
  }
  return tree;
}

async function openAndClose(stateDir: string): Promise<JobManifestV1[]> {
  const store = new SqliteManifestStore({ stateDir });
  try {
    return [...(await store.list())];
  } finally {
    await store.close();
  }
}

function skips(stateDir: string) {
  return inspectDatabase(stateDir, (db) =>
    db
      .prepare(
        'SELECT source_key, reason, count FROM import_skips ORDER BY source_key',
      )
      .all(),
  );
}

function imports(stateDir: string) {
  return inspectDatabase(stateDir, (db) =>
    db.prepare('SELECT job_id, sha256, source_key FROM file_imports').all(),
  );
}

describe('импорт файловых manifest в SQLite', () => {
  it('импортирует inactive manifest один раз, не меняя исходники', async () => {
    const stateDir = await temporaryStateDir('sqlite-import-');
    try {
      const files = new FileManifestStore({ stateDir });
      await files.create(manifestFixture('done'));
      const session = await files.acquire('done', {
        recover: async (item) => item,
      });
      await session.release();
      const before = await sourceTree(stateDir);
      const listed = await openAndClose(stateDir);
      expect(listed).toEqual([await files.read('done')]);
      await openAndClose(stateDir);
      const text = await readFile(
        path.join(stateDir, namespace('done'), 'manifest.json'),
        'utf8',
      );
      expect(imports(stateDir)).toEqual([
        {
          job_id: 'done',
          sha256: createHash('sha256').update(text).digest('hex'),
          source_key: namespace('done'),
        },
      ]);
      expect(skips(stateDir)).toEqual([]);
      expect(await sourceTree(stateDir)).toEqual(before);
    } finally {
      await removeDirectory(stateDir);
    }
  });

  it('пропускает active и unknown аренду до следующего открытия без роста import_skips', async () => {
    const stateDir = await temporaryStateDir('sqlite-import-active-');
    try {
      const files = new FileManifestStore({ stateDir });
      await files.create(manifestFixture('active'));
      await files.create(manifestFixture('foreign'));
      await writeFile(
        path.join(stateDir, namespace('foreign'), 'lease.json'),
        JSON.stringify({
          pid: 1,
          hostname: 'foreign.example',
          processStartedAt: 'foreign',
          generation: 1,
          ownerToken: 'foreign-owner',
          acquiredAt: '2000-01-01T00:00:00.000Z',
          heartbeatAt: '2000-01-01T00:00:00.000Z',
        }),
      );
      const owner = await files.acquire('active', {
        recover: async (item) => item,
      });
      const before = await sourceTree(stateDir);
      expect(await openAndClose(stateDir)).toEqual([]);
      const expected = [
        { source_key: namespace('active'), reason: 'active', count: 1 },
        { source_key: namespace('foreign'), reason: 'unknown', count: 1 },
      ].sort((a, b) => (a.source_key < b.source_key ? -1 : 1));
      expect(skips(stateDir)).toEqual(expected);
      await openAndClose(stateDir);
      expect(skips(stateDir)).toEqual(expected);
      expect(await sourceTree(stateDir)).toEqual(before);
      await owner.release();
      expect((await openAndClose(stateDir)).map((item) => item.jobId)).toEqual([
        'active',
      ]);
      expect(skips(stateDir)).toEqual([
        { source_key: namespace('foreign'), reason: 'unknown', count: 1 },
      ]);
      expect(JSON.stringify(skips(stateDir))).not.toContain(stateDir);
    } finally {
      await removeDirectory(stateDir);
    }
  });

  it('пропускает повреждённый manifest и не перезаписывает job изменённым исходником', async () => {
    const stateDir = await temporaryStateDir('sqlite-import-conflict-');
    try {
      const files = new FileManifestStore({ stateDir });
      await files.create(manifestFixture('job'));
      await mkdir(path.join(stateDir, namespace('broken')), { mode: 0o700 });
      await writeFile(
        path.join(stateDir, namespace('broken'), 'manifest.json'),
        '{"version": 99',
      );
      const [imported] = await openAndClose(stateDir);
      expect(imported?.updatedAt).toBe('2026-01-01T00:00:00.000Z');
      const target = path.join(stateDir, namespace('job'), 'manifest.json');
      const changed = {
        ...JSON.parse(await readFile(target, 'utf8')),
        updatedAt: '2026-05-05T00:00:00.000Z',
      };
      await writeFile(target, JSON.stringify(changed));
      const [after] = await openAndClose(stateDir);
      expect(after?.updatedAt).toBe('2026-01-01T00:00:00.000Z');
      expect(skips(stateDir)).toEqual(
        [
          { source_key: namespace('broken'), reason: 'corrupt', count: 1 },
          { source_key: namespace('job'), reason: 'conflict', count: 1 },
        ].sort((a, b) => (a.source_key < b.source_key ? -1 : 1)),
      );
      expect(JSON.parse(await readFile(target, 'utf8'))).toEqual(changed);
    } finally {
      await removeDirectory(stateDir);
    }
  });

  it('конкурентный импорт двумя соединениями идемпотентен', async () => {
    const stateDir = await temporaryStateDir('sqlite-import-race-');
    try {
      const files = new FileManifestStore({ stateDir });
      for (const jobId of ['a', 'b', 'c'])
        await files.create(manifestFixture(jobId));
      const results = await Promise.all([
        openAndClose(stateDir),
        openAndClose(stateDir),
      ]);
      for (const listed of results)
        expect(listed.map((item) => item.jobId)).toEqual(['a', 'b', 'c']);
      expect(imports(stateDir)).toHaveLength(3);
      expect(skips(stateDir)).toEqual([]);
    } finally {
      await removeDirectory(stateDir);
    }
  });
});
