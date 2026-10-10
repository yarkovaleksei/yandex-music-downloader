import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  DiskFullError,
  DownloadError,
  PermissionError,
} from '@music-downloader/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { finalizePart, inspectExisting } from './finalize.js';
import { defaultFsOps, type FsOps } from './fs-ops.js';

let directory = '';
let part = '';
let target = '';

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'finalize-'));
  part = path.join(directory, 'a.flac.job-1.part');
  target = path.join(directory, 'a.flac');
  await writeFile(part, 'new');
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

function errno(code: string): Error {
  return Object.assign(new Error(`${code} at /secret`), { code });
}

function failingRename(code: string, failures = Infinity): FsOps {
  let remaining = failures;
  return {
    ...defaultFsOps,
    rename: (from, to) => {
      if (remaining > 0) {
        remaining -= 1;
        return Promise.reject(errno(code));
      }
      return defaultFsOps.rename(from, to);
    },
  };
}

const base = () => ({
  get partPath() {
    return part;
  },
  get finalPath() {
    return target;
  },
  container: 'flac',
  platform: 'linux' as const,
});

describe('finalizePart', () => {
  it('runs hooks in order with an explicit container and renames', async () => {
    const calls: string[] = [];
    const result = await finalizePart({
      ...base(),
      onExisting: 'skip',
      hooks: {
        validate: ({ stage, container, partPath }) => {
          calls.push(`validate:${stage}:${container}`);
          expect(partPath).toBe(part);
        },
        writeMetadata: ({ container }) => {
          calls.push(`metadata:${container}`);
        },
      },
    });
    expect(calls).toEqual([
      'validate:initial:flac',
      'metadata:flac',
      'validate:final:flac',
    ]);
    expect(result).toEqual({ status: 'completed', path: target });
    expect(await readFile(target, 'utf8')).toBe('new');
    expect(await readdir(directory)).toEqual(['a.flac']);
  });

  it.each(['initial', 'final'] as const)(
    'rethrows a validate(%s) error, keeps the part and creates no file',
    async (failing) => {
      const failure = new Error('invalid container');
      await expect(
        finalizePart({
          ...base(),
          onExisting: 'replace',
          hooks: {
            validate: ({ stage }) => {
              if (stage === failing) throw failure;
            },
          },
        }),
      ).rejects.toBe(failure);
      expect(await readdir(directory)).toEqual(['a.flac.job-1.part']);
    },
  );

  it('rethrows a writeMetadata error and keeps the old file untouched', async () => {
    await writeFile(target, 'old');
    const failure = new Error('tag failure');
    await expect(
      finalizePart({
        ...base(),
        onExisting: 'replace',
        hooks: {
          writeMetadata: () => {
            throw failure;
          },
        },
      }),
    ).rejects.toBe(failure);
    expect(await readFile(target, 'utf8')).toBe('old');
    expect(await readFile(part, 'utf8')).toBe('new');
  });

  it('keeps the old file until rename on overwrite, then replaces it', async () => {
    await writeFile(target, 'old');
    const seen: string[] = [];
    const result = await finalizePart({
      ...base(),
      onExisting: 'replace',
      hooks: {
        validate: async () => {
          seen.push(await readFile(target, 'utf8'));
        },
      },
    });
    expect(seen).toEqual(['old', 'old']);
    expect(result.status).toBe('completed');
    expect(await readFile(target, 'utf8')).toBe('new');
    expect(await readdir(directory)).toEqual(['a.flac']);
  });

  it('skips a file that appeared during download and removes the part', async () => {
    await writeFile(target, 'foreign');
    const result = await finalizePart({ ...base(), onExisting: 'skip' });
    expect(result).toEqual({ status: 'skipped', path: target });
    expect(await readFile(target, 'utf8')).toBe('foreign');
    expect(await readdir(directory)).toEqual(['a.flac']);
  });

  it('checks the existing file after hooks, right before rename', async () => {
    const result = await finalizePart({
      ...base(),
      onExisting: 'skip',
      hooks: {
        writeMetadata: async () => {
          await writeFile(target, 'appeared late');
        },
      },
    });
    expect(result.status).toBe('skipped');
    expect(await readFile(target, 'utf8')).toBe('appeared late');
  });

  it('does not report skipped when a directory occupies the target', async () => {
    await mkdir(target);
    await expect(
      finalizePart({ ...base(), onExisting: 'skip' }),
    ).rejects.toBeInstanceOf(DownloadError);
    expect(await readFile(part, 'utf8')).toBe('new');
  });

  describe('rename failures', () => {
    it.each([
      ['EPERM', PermissionError],
      ['EBUSY', DownloadError],
    ])('retries %s on win32 and then maps it', async (code, errorClass) => {
      const sleeps: number[] = [];
      await expect(
        finalizePart({
          ...base(),
          platform: 'win32',
          onExisting: 'replace',
          ops: failingRename(code),
          sleep: (ms) => {
            sleeps.push(ms);
            return Promise.resolve();
          },
        }),
      ).rejects.toBeInstanceOf(errorClass);
      expect(sleeps).toEqual([50, 100, 200, 400]);
      expect(await readFile(part, 'utf8')).toBe('new');
    });

    it('succeeds on a retry after transient EBUSY on win32', async () => {
      const sleeps: number[] = [];
      const result = await finalizePart({
        ...base(),
        platform: 'win32',
        onExisting: 'replace',
        ops: failingRename('EBUSY', 2),
        sleep: (ms) => {
          sleeps.push(ms);
          return Promise.resolve();
        },
      });
      expect(result.status).toBe('completed');
      expect(sleeps).toEqual([50, 100]);
      expect(await readFile(target, 'utf8')).toBe('new');
    });

    it('does not retry on posix', async () => {
      const sleeps: number[] = [];
      let attempts = 0;
      const ops: FsOps = {
        ...defaultFsOps,
        rename: () => {
          attempts += 1;
          return Promise.reject(errno('EPERM'));
        },
      };
      await expect(
        finalizePart({
          ...base(),
          onExisting: 'replace',
          ops,
          sleep: (ms) => {
            sleeps.push(ms);
            return Promise.resolve();
          },
        }),
      ).rejects.toBeInstanceOf(PermissionError);
      expect(attempts).toBe(1);
      expect(sleeps).toEqual([]);
    });

    it.each([
      ['ENOSPC', DiskFullError],
      ['EACCES', PermissionError],
    ])('maps %s without retries', async (code, errorClass) => {
      let attempts = 0;
      const ops: FsOps = {
        ...defaultFsOps,
        rename: () => {
          attempts += 1;
          return Promise.reject(errno(code));
        },
      };
      await expect(
        finalizePart({
          ...base(),
          platform: 'win32',
          onExisting: 'replace',
          ops,
        }),
      ).rejects.toBeInstanceOf(errorClass);
      expect(attempts).toBe(1);
    });
  });
});

describe('inspectExisting', () => {
  it('distinguishes absent, valid and invalid', async () => {
    expect(await inspectExisting(target)).toBe('absent');
    await writeFile(target, 'x');
    expect(await inspectExisting(target)).toBe('valid');
    expect(await inspectExisting(target, { validate: () => false })).toBe(
      'invalid',
    );
    expect(
      await inspectExisting(target, { validate: () => Promise.resolve(true) }),
    ).toBe('valid');
    const folder = path.join(directory, 'folder');
    await mkdir(folder);
    expect(await inspectExisting(folder)).toBe('invalid');
    expect(await readdir(directory)).toContain('folder');
  });
});

/** Определяет на месте, указывают ли два написания имени на одну запись ФС. */
async function sameEntry(first: string, second: string): Promise<boolean> {
  await writeFile(first, 'probe');
  const visible = await readFile(second, 'utf8').then(
    () => true,
    () => false,
  );
  await rm(first, { force: true });
  return visible;
}

describe('cross-OS name collisions on the real file system', () => {
  async function skipKeepsForeign(
    existingName: string,
    finalName: string,
  ): Promise<void> {
    const existing = path.join(directory, existingName);
    const final = path.join(directory, finalName);
    const aliased = await sameEntry(existing, final);
    await writeFile(existing, 'foreign');
    const result = await finalizePart({
      partPath: part,
      finalPath: final,
      container: 'flac',
      platform: 'linux',
      onExisting: 'skip',
    });
    expect(result.status).toBe(aliased ? 'skipped' : 'completed');
    // Чужой файл не теряется ни при совпадении имён, ни при их различии.
    expect(await readFile(existing, 'utf8')).toBe('foreign');
    if (!aliased) expect(await readFile(final, 'utf8')).toBe('new');
  }

  it('does not lose a file that differs only by case', async () => {
    await skipKeepsForeign('Track.flac', 'track.flac');
  });

  it('does not lose a file that differs only by NFC/NFD', async () => {
    await skipKeepsForeign(
      'é.flac'.normalize('NFC'),
      'é.flac'.normalize('NFD'),
    );
  });
});
