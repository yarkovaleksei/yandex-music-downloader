import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FileCacheStore } from './file-cache-store.js';

const key = {
  providerId: 'provider',
  accountId: 'account',
  schemaVersion: '1.0.0',
  method: 'getTrack',
  arguments: ['track'],
} as const;

describe('FileCacheStore', () => {
  it('переживает перезапуск и считает границу TTL истёкшей', async () => {
    const stateDir = await mkdtemp(path.join(os.tmpdir(), 'file-cache-'));
    let now = 100;
    try {
      const store = new FileCacheStore({
        stateDir,
        ttlMs: 50,
        now: () => now,
      });
      await store.write(key, JSON.stringify({ id: 'track' }));
      await expect(store.read(key)).resolves.toBe('{"id":"track"}');
      now = 149;
      await expect(store.read(key)).resolves.toBe('{"id":"track"}');
      now = 150;
      await expect(
        new FileCacheStore({ stateDir, ttlMs: 50, now: () => now }).read(key),
      ).resolves.toBeUndefined();
    } finally {
      await rm(stateDir, { recursive: true, force: true });
    }
  });

  it('считает отсутствующую и повреждённую запись промахом', async () => {
    const stateDir = await mkdtemp(path.join(os.tmpdir(), 'file-cache-'));
    try {
      const store = new FileCacheStore({ stateDir, ttlMs: 50, now: () => 0 });
      await expect(store.read(key)).resolves.toBeUndefined();
      await store.write(key, JSON.stringify({ id: 'track' }));
      const [entry] = await readdir(path.join(stateDir, 'cache'));
      await writeFile(path.join(stateDir, 'cache', entry!), '{broken');
      await expect(store.read(key)).resolves.toBeUndefined();
    } finally {
      await rm(stateDir, { recursive: true, force: true });
    }
  });

  it('изолирует account/schema и очищает только собственный каталог', async () => {
    const stateDir = await mkdtemp(path.join(os.tmpdir(), 'file-cache-'));
    const manifest = path.join(stateDir, 'manifest.json');
    const output = path.join(stateDir, 'download.mp3');
    const artwork = path.join(stateDir, 'artwork', 'job-snapshot.json');
    try {
      const store = new FileCacheStore({ stateDir, ttlMs: 50, now: () => 0 });
      await store.write(key, JSON.stringify({ id: 'track' }));
      await writeFile(manifest, 'manifest');
      await writeFile(output, 'audio');
      await mkdir(path.dirname(artwork), { recursive: true });
      await writeFile(artwork, 'artwork');
      await expect(
        store.read({ ...key, accountId: 'another-account' }),
      ).resolves.toBeUndefined();
      await expect(
        store.read({ ...key, schemaVersion: '2.0.0' }),
      ).resolves.toBeUndefined();
      await store.clear();
      await expect(store.read(key)).resolves.toBeUndefined();
      await expect(
        Promise.all([
          readFile(manifest, 'utf8'),
          readFile(output, 'utf8'),
          readFile(artwork, 'utf8'),
        ]),
      ).resolves.toEqual(['manifest', 'audio', 'artwork']);
    } finally {
      await rm(stateDir, { recursive: true, force: true });
    }
  });
});
