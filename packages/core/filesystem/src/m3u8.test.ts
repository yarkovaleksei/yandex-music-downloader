import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
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

  it('нормализует win32-разделители в строках M3U8', async () => {
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
    await writeM3u8(
      'C:\\Music\\Список\\Список.m3u8',
      ['C:\\Music\\Список\\01 - Автор - Трек.mp3'],
      { ops, platform: 'win32' },
    );

    expect(new TextDecoder().decode(writes[0])).toBe('01 - Автор - Трек.mp3\n');
    expect(renamed.from).toMatch(/^C:\\Music\\Список\\\.m3u8-[\da-f-]+\.tmp$/);
    expect(renamed.to).toBe('C:\\Music\\Список\\Список.m3u8');
  });

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
  });

  // @link planning/reviews/STEP-022/REVIEW-20261013T192045Z.md F-001: barrier воспроизводит одновременный rename.
  it('публикует два параллельных writer без общего temporary файла', async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'm3u8-race-'));
    const playlist = path.join(directory, 'Список.m3u8');
    let arrivals = 0;
    let openBarrier: (() => void) | undefined;
    const barrier = new Promise<void>((resolve) => {
      openBarrier = resolve;
    });
    const ops: FsOps = {
      ...defaultFsOps,
      rename: async (from, to) => {
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
  });

  // @link planning/reviews/STEP-022/REVIEW-20261013T192045Z.md F-002: layout даёт допустимое имя в 255 UTF-8 байт.
  it('публикует playlist с допустимым UTF-8 basename в 255 байт', async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'm3u8-long-'));
    const layout = buildPlaylistLayout(
      {
        id: 'playlist',
        title: 'Я'.repeat(130),
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
        platform: 'linux',
        extensionOf: () => 'mp3',
      },
    );

    await writeM3u8(layout.playlistFile.path, [layout.tracks[0]!.path]);

    expect(Buffer.byteLength(path.basename(layout.playlistFile.path))).toBe(
      255,
    );
    await expect(readFile(layout.playlistFile.path, 'utf8')).resolves.toBe(
      path.basename(layout.tracks[0]!.path) + '\n',
    );
  });
});
