import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import type { JobSnapshot } from '@music-downloader/shared';
import { success } from '../contract/result.js';
import { invokeBroker } from './broker.js';
import { DirectoryRegistry } from './directory-registry.js';
import { jobFolders } from './job-folders.js';

it('STEP-059 / H-001: job-owned файл существует, исчезает после availability и больше не попадает в shell', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'job-folder-'));
  try {
    const file = path.join(directory, 'result.mp3');
    await writeFile(file, 'synthetic');
    const job: JobSnapshot = {
      jobId: 'saved',
      source: { provider: 'mock', kind: 'track', id: '1' },
      status: 'completed',
      tracks: [{ trackKey: '1', status: 'completed', resultPath: file }],
    };
    const read = vi.fn(async () => success('getJob', job));
    const shell = vi.fn();
    const folders = jobFolders(read, shell);
    expect(await folders.availability('saved')).toEqual({ available: true });
    expect(await folders.open('saved')).toBe(true);
    expect(shell).toHaveBeenCalledExactlyOnceWith(file);
    await rm(file);
    expect(await folders.open('saved')).toBe(false);
    expect(await folders.availability('saved')).toMatchObject({
      available: false,
      reason: expect.any(String),
    });
    expect(shell).toHaveBeenCalledTimes(1);
    expect(await folders.availability('saved', 'unknown')).toMatchObject({
      available: false,
    });
    const actions = {
      jobFolderAvailability: folders.availability,
      selectDirectory: async () => undefined,
      showItemInFolder: folders.open,
      openExternal: async () => {},
    };
    read.mockClear();
    for (const method of [
      'jobFolderAvailability',
      'showItemInFolder',
    ] as const) {
      expect(
        await invokeBroker(
          method,
          { jobId: 'saved', path: file },
          true,
          new DirectoryRegistry(),
          actions,
          vi.fn(),
        ),
      ).toMatchObject({ kind: 'error' });
    }
    expect(read).not.toHaveBeenCalled();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
