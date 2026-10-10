import { promisify } from 'node:util';
import type * as ChildProcess from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FileManifestStore } from './file-manifest-store.js';
import { ValidationError } from '@music-downloader/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let observedTimeout: number | undefined;
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof ChildProcess>();
  const execFile = Object.assign(() => undefined, {
    [promisify.custom]: async (
      _file: string,
      _args: string[],
      options: { timeout?: number },
    ) => {
      observedTimeout = options.timeout;
      throw Object.assign(new Error('probe timeout'), { code: 'ETIMEDOUT' });
    },
  });
  return { ...actual, execFile };
});

afterEach(() => vi.restoreAllMocks());
beforeEach(() => {
  observedTimeout = undefined;
});

describe('process identity fault boundary', () => {
  it('сохраняет живой PID unknown после Windows timeout и использует bounded 10s (F-001, F-004)', async () => {
    const original = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', {
      value: 'win32',
      configurable: true,
    });
    try {
      const { probeLease } = await import('./process-identity.js');
      const result = await probeLease({
        pid: process.pid,
        hostname: os.hostname(),
        processStartedAt: 'win32:old',
      });
      expect(result).toBe('unknown');
      expect(observedTimeout).toBe(10_000);
    } finally {
      Object.defineProperty(process, 'platform', original!);
    }
  });

  it('не reclaim-ит expired lease живого PID при timeout birth probe (F-004)', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'probe-acquire-'));
    const jobId = 'job';
    const jobDirectory = path.join(
      directory,
      createHash('sha256').update(jobId).digest('hex'),
    );
    const original = Object.getOwnPropertyDescriptor(process, 'platform');
    try {
      // Native binding загружен до подмены platform: lock остаётся реальным для F-004.
      const store = new FileManifestStore({ stateDir: directory });
      const manifest = {
        version: 1 as const,
        jobId,
        provider: 'test',
        source: { provider: 'test', kind: 'track' as const, id: 's' },
        quality: 'best',
        destination: directory,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        control: { state: 'paused' as const },
        plan: {
          source: { provider: 'test', kind: 'track' as const, id: 's' },
          title: 't',
          tracks: [
            {
              position: 1,
              trackKey: '1',
              track: { id: '1', availability: 'unknown' as const },
            },
          ],
        },
        tracks: [
          {
            position: 1,
            trackKey: '1',
            status: 'paused' as const,
            attempts: 0,
            history: [],
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      };
      await store.create(manifest);
      const leasePath = path.join(jobDirectory, 'lease.json');
      await writeFile(
        leasePath,
        JSON.stringify({
          pid: process.pid,
          hostname: os.hostname(),
          processStartedAt: 'win32:old',
          generation: 41,
          ownerToken: 'old',
          acquiredAt: '2000-01-01T00:00:00.000Z',
          heartbeatAt: '2000-01-01T00:00:00.000Z',
        }),
      );
      const beforeLease = await readFile(leasePath, 'utf8');
      const beforeManifest = await readFile(
        path.join(jobDirectory, 'manifest.json'),
        'utf8',
      );
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        configurable: true,
      });
      let recovered = false;
      await expect(
        store.acquire(jobId, {
          identity: {
            pid: process.pid,
            hostname: os.hostname(),
            processStartedAt: 'win32:new',
          },
          recover: async (item) => {
            recovered = true;
            return item;
          },
        }),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(recovered).toBe(false);
      expect(await readFile(leasePath, 'utf8')).toBe(beforeLease);
      expect(
        await readFile(path.join(jobDirectory, 'manifest.json'), 'utf8'),
      ).toBe(beforeManifest);
      expect(observedTimeout).toBe(10_000);
    } finally {
      Object.defineProperty(process, 'platform', original!);
      await rm(directory, { recursive: true, force: true });
    }
  });
});
