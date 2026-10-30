import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultFsOps, type FsOps } from './fs-ops.js';
import { buildPlaylistLayout } from './layout.js';
import { writeM3u8 } from './m3u8.js';

describe('writeM3u8', () => {
  let directory: string | undefined;

  afterEach(async () => {
    if (directory !== undefined)
      await rm(directory, { recursive: true, force: true });
    directory = undefined;
  });

  it('сохраняет UTF-8 относительные пути в переданном порядке', async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'm3u8-'));
    const playlist = path.join(directory, 'Любимое.m3u8');
    await writeM3u8(playlist, [
      path.join(directory, '02 - Автор - Второй.mp3'),
      path.join(directory, '01 - Автор - Первый.mp3'),
    ]);

    await expect(readFile(playlist, 'utf8')).resolves.toBe(
      '02 - Автор - Второй.mp3\n01 - Автор - Первый.mp3\n',
    );
  });

  it.each(['win32', 'linux', 'darwin'] as const)(
    'сохраняет explicit platform %s независимо от host OS',
    async (platform) => {
      const paths = platform === 'win32' ? path.win32 : path.posix;
      const root = platform === 'win32' ? 'C:\\Music\\Список' : '/music/Список';
      const playlist = paths.join(root, 'Список.m3u8');
      const renamed: { from?: string; to?: string } = {};
      const writes: Uint8Array[] = [];
      const ops: FsOps = {
        ...defaultFsOps,
        mkdir: async () => undefined,
        open: async () => ({
          write: async (data, offset, length) => {
            writes.push(data.slice(offset, offset + length));
            return { bytesWritten: length };
          },
          sync: async () => undefined,
          close: async () => undefined,
        }),
        rename: async (from, to) => {
          renamed.from = from;
          renamed.to = to;
        },
      };
      await writeM3u8(playlist, [paths.join(root, '01 - Автор - Трек.mp3')], {
        ops,
        platform,
      });

      expect(new TextDecoder().decode(writes[0])).toBe(
        '01 - Автор - Трек.mp3\n',
      );
      expect(paths.dirname(renamed.from!)).toBe(root);
      expect(paths.basename(renamed.from!)).toMatch(/^\.m3u8-[\da-f-]+\.tmp$/);
      expect(renamed.to).toBe(playlist);
    },
  );

  it('на Windows повторяет EPERM того же temporary файла и публикует без новой записи', async () => {
    const operations: string[] = [];
    let attempts = 0;
    const ops: FsOps = {
      ...defaultFsOps,
      mkdir: async () => undefined,
      open: async () => ({
        write: async (_data, _offset, length) => {
          operations.push('write');
          return { bytesWritten: length };
        },
        sync: async () => {
          operations.push('sync');
        },
        close: async () => {
          operations.push('close');
        },
      }),
      rename: async () => {
        operations.push('rename');
        attempts += 1;
        if (attempts < 3)
          throw Object.assign(new Error('busy'), { code: 'EPERM' });
      },
      unlink: async () => {
        operations.push('unlink');
      },
    };
    vi.useFakeTimers();
    try {
      const writing = writeM3u8('C:\\Music\\list.m3u8', ['C:\\Music\\01.mp3'], {
        ops,
        platform: 'win32',
      });
      await vi.runAllTimersAsync();
      await expect(writing).resolves.toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
    expect(operations).toEqual([
      'write',
      'sync',
      'close',
      'rename',
      'rename',
      'rename',
    ]);
  });

  it('без explicit platform повторяет Windows EPERM на native host API', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(process, 'platform');
    let attempts = 0;
    const ops: FsOps = {
      ...defaultFsOps,
      mkdir: async () => undefined,
      open: async () => ({
        write: async (_data, _offset, length) => ({ bytesWritten: length }),
        sync: async () => undefined,
        close: async () => undefined,
      }),
      rename: async () => {
        attempts += 1;
        if (attempts === 1)
          throw Object.assign(new Error('busy'), { code: 'EBUSY' });
      },
      unlink: async () => undefined,
    };
    Object.defineProperty(process, 'platform', { value: 'win32' });
    vi.useFakeTimers();
    try {
      const writing = writeM3u8('C:\\Music\\list.m3u8', [], { ops });
      await vi.runAllTimersAsync();
      await expect(writing).resolves.toBeUndefined();
    } finally {
      vi.useRealTimers();
      if (descriptor !== undefined)
        Object.defineProperty(process, 'platform', descriptor);
    }
    expect(attempts).toBe(2);
  });

  it('после пяти Windows EPERM очищает temporary и сохраняет PermissionError', async () => {
    let renameAttempts = 0;
    const unlinked: string[] = [];
    const ops: FsOps = {
      ...defaultFsOps,
      mkdir: async () => undefined,
      open: async () => ({
        write: async (_data, _offset, length) => ({ bytesWritten: length }),
        sync: async () => undefined,
        close: async () => undefined,
      }),
      rename: async () => {
        renameAttempts += 1;
        throw Object.assign(new Error('busy'), { code: 'EPERM' });
      },
      unlink: async (target) => {
        unlinked.push(target);
      },
    };
    vi.useFakeTimers();
    try {
      const writing = writeM3u8('C:\\Music\\list.m3u8', [], {
        ops,
        platform: 'win32',
      });
      const assertion = expect(writing).rejects.toMatchObject({
        code: 'PERMISSION_DENIED',
      });
      await vi.runAllTimersAsync();
      await assertion;
    } finally {
      vi.useRealTimers();
    }
    expect(renameAttempts).toBe(5);
    expect(unlinked).toHaveLength(1);
  });

  it.each([
    ['linux', 'EPERM'],
    ['win32', 'EACCES'],
  ] as const)(
    'не повторяет %s/%s вне разрешённого Windows случая',
    async (platform, code) => {
      let renameAttempts = 0;
      const ops: FsOps = {
        ...defaultFsOps,
        mkdir: async () => undefined,
        open: async () => ({
          write: async (_data, _offset, length) => ({ bytesWritten: length }),
          sync: async () => undefined,
          close: async () => undefined,
        }),
        rename: async () => {
          renameAttempts += 1;
          throw Object.assign(new Error('failure'), { code });
        },
        unlink: async () => undefined,
      };
      await expect(
        writeM3u8(
          platform === 'win32' ? 'C:\\Music\\list.m3u8' : '/music/list.m3u8',
          [],
          {
            ops,
            platform,
          },
        ),
      ).rejects.toMatchObject({
        code: code === 'EACCES' ? 'PERMISSION_DENIED' : 'PERMISSION_DENIED',
      });
      expect(renameAttempts).toBe(1);
    },
  );

  it('заменяет существующий playlist только после записи временного файла', async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'm3u8-'));
    const playlist = path.join(directory, 'Список.m3u8');
    await writeFile(playlist, 'старое\n');
    let previous: string | undefined;
    const ops: FsOps = {
      ...defaultFsOps,
      rename: async (from, to) => {
        previous = await readFile(to, 'utf8');
        await defaultFsOps.rename(from, to);
      },
    };

    await writeM3u8(playlist, [path.join(directory, '01 - Трек.mp3')], {
      ops,
    });

    expect(previous).toBe('старое\n');
    await expect(readFile(playlist, 'utf8')).resolves.toBe('01 - Трек.mp3\n');
    await expect(readdir(directory)).resolves.toEqual(['Список.m3u8']);
  });

  //  barrier воспроизводит одновременный rename.
  it('публикует два параллельных writer без общего temporary файла', async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'm3u8-race-'));
    const playlist = path.join(directory, 'Список.m3u8');
    let arrivals = 0;
    const temporaryPaths: string[] = [];
    let openBarrier: (() => void) | undefined;
    const barrier = new Promise<void>((resolve) => {
      openBarrier = resolve;
    });
    const ops: FsOps = {
      ...defaultFsOps,
      rename: async (from, to) => {
        temporaryPaths.push(from);
        arrivals += 1;
        if (arrivals === 2) openBarrier?.();
        await barrier;
        await defaultFsOps.rename(from, to);
      },
    };

    await expect(
      Promise.all([
        writeM3u8(playlist, [path.join(directory, '01 - Трек.mp3')], { ops }),
        writeM3u8(playlist, [path.join(directory, '01 - Трек.mp3')], { ops }),
      ]),
    ).resolves.toEqual([undefined, undefined]);
    await expect(readFile(playlist, 'utf8')).resolves.toBe('01 - Трек.mp3\n');
    expect(new Set(temporaryPaths).size).toBe(2);
    for (const temporary of temporaryPaths) {
      expect(path.dirname(temporary)).toBe(directory);
      expect(path.basename(temporary)).toMatch(/^\.m3u8-[\da-f-]+\.tmp$/);
    }
    await expect(readdir(directory)).resolves.toEqual(['Список.m3u8']);
  });

  //  native root и layout используют одну платформу.
  // Windows ограничивает полный путь; точная Linux-граница проверяется отдельно без native IO.
  it('публикует playlist с длинным допустимым basename на текущей ОС', async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'm3u8-long-'));
    const platform =
      process.platform === 'win32' || process.platform === 'darwin'
        ? process.platform
        : 'linux';
    const titleLength =
      platform === 'win32'
        ? Math.min(130, Math.floor((259 - directory.length - 7) / 2))
        : 130;
    // Два имени в полном пути, два разделителя и пять символов расширения .m3u8.
    expect(titleLength).toBeGreaterThan(0);
    const layout = buildPlaylistLayout(
      {
        id: 'playlist',
        title: 'Я'.repeat(titleLength),
        tracks: [
          {
            position: 1,
            track: {
              id: 'track',
              availability: 'available',
              title: 'Трек',
              artists: [],
            },
          },
        ],
      },
      {
        root: directory,
        platform,
        extensionOf: () => 'mp3',
      },
    );

    await writeM3u8(layout.playlistFile.path, [layout.tracks[0]!.path]);

    if (platform === 'win32') {
      expect(layout.playlistFile.path.length).toBeLessThanOrEqual(259);
      expect(path.basename(layout.playlistFile.path)).toBe(
        'Я'.repeat(titleLength) + '.m3u8',
      );
    } else {
      expect(Buffer.byteLength(path.basename(layout.playlistFile.path))).toBe(
        255,
      );
    }
    await expect(readFile(layout.playlistFile.path, 'utf8')).resolves.toBe(
      path.basename(layout.tracks[0]!.path) + '\n',
    );
    await expect(readdir(layout.directory.path)).resolves.toEqual([
      path.basename(layout.playlistFile.path),
    ]);
  });

  //  точная граница сохраняется на каждой host OS.
  it('публикует Linux basename в 255 UTF-8 байт через короткий temporary файл', async () => {
    const layout = buildPlaylistLayout(
      { id: 'playlist', title: 'Я'.repeat(130), tracks: [] },
      { root: '/music', platform: 'linux', extensionOf: () => 'mp3' },
    );
    const resultPath = path.posix.join(
      layout.directory.path,
      '01 - Автор - Трек.mp3',
    );
    const writes: Uint8Array[] = [];
    const operations: string[] = [];
    let temporaryPath: string | undefined;
    const ops: FsOps = {
      ...defaultFsOps,
      mkdir: async () => undefined,
      open: async (target) => {
        temporaryPath = target;
        return {
          write: async (data, offset, length) => {
            operations.push('write');
            writes.push(data.slice(offset, offset + length));
            return { bytesWritten: length };
          },
          sync: async () => {
            operations.push('sync');
          },
          close: async () => {
            operations.push('close');
          },
        };
      },
      rename: async (from, to) => {
        operations.push('rename');
        expect(from).toBe(temporaryPath);
        expect(to).toBe(layout.playlistFile.path);
      },
    };

    await writeM3u8(layout.playlistFile.path, [resultPath], {
      ops,
      platform: 'linux',
    });

    expect(
      Buffer.byteLength(path.posix.basename(layout.playlistFile.path)),
    ).toBe(255);
    expect(path.posix.dirname(temporaryPath!)).toBe(layout.directory.path);
    expect(path.posix.basename(temporaryPath!)).toMatch(
      /^\.m3u8-[\da-f-]+\.tmp$/,
    );
    expect(Buffer.byteLength(path.posix.basename(temporaryPath!))).toBeLessThan(
      255,
    );
    expect(new TextDecoder().decode(writes[0])).toBe('01 - Автор - Трек.mp3\n');
    expect(operations).toEqual(['write', 'sync', 'close', 'rename']);
  });
});
