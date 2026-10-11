import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import type * as ChildProcess from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it, vi } from 'vitest';
import { processStartedAt } from '@music-downloader/persistence';
import type { MusicProvider } from '@music-downloader/shared';

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof ChildProcess>();
  const guard = (file: string, args: readonly string[] | null | undefined) => {
    const processId = args?.at(-1);
    const isProcessIdentityProbe =
      (file === 'ps' &&
        args?.length === 4 &&
        args[0] === '-o' &&
        args[1] === 'lstart=' &&
        args[2] === '-p' &&
        typeof processId === 'string' &&
        /^\d+$/.test(processId)) ||
      (file === 'powershell.exe' &&
        args?.length === 3 &&
        args[0] === '-NoProfile' &&
        args[1] === '-Command' &&
        typeof processId === 'string' &&
        /^\(Get-Process -Id \d+ -ErrorAction Stop\)\.StartTime\.ToUniversalTime\(\)\.ToString\('O'\)$/.test(
          processId,
        ));
    if (!isProcessIdentityProbe)
      throw new Error('subprocess запрещён в baseline download test');
  };
  const execFile = Object.assign(
    ((...parameters: Parameters<typeof actual.execFile>) => {
      const [file, args] = parameters;
      guard(file, args);
      return actual.execFile(...parameters);
    }) as typeof actual.execFile,
    {
      [promisify.custom]: async (
        file: string,
        args: readonly string[],
        options?: ChildProcess.ExecFileOptions,
      ) => {
        guard(file, args);
        return promisify(actual.execFile)(file, args, options);
      },
    },
  );
  // Persistence законно запускает только системный probe identity, внешний decoder остаётся запрещён.
  return { execFile };
});

import { createApplication } from './index.js';

const validMp3 = new Uint8Array(
  await readFile(
    new URL('../../core/validation/src/fixtures/sample.mp3', import.meta.url),
  ),
);

function provider(): MusicProvider {
  return {
    authenticate: async () => ({ id: 'account', displayName: 'Тест' }),
    getAccount: async () => null,
    logout: async () => undefined,
    resolveUrl: async () => ({ provider: 'mock', kind: 'track', id: 'track' }),
    getTrack: async (id) => ({
      id,
      availability: 'available',
      title: 'Трек',
      artists: [],
    }),
    getAlbum: async () => ({
      id: 'album',
      title: 'Альбом',
      artists: [],
      tracks: [],
    }),
    getPlaylist: async () => ({ id: 'playlist', title: 'Список', tracks: [] }),
    getAudioVariants: async () => [
      { key: 'mp3', codec: 'mp3', container: 'mp3', lossless: false },
    ],
    openAudioStream: async () => ({
      stream: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(validMp3);
          controller.close();
        },
      }),
      contentLength: validMp3.byteLength,
      container: 'mp3',
      acceptsRanges: true,
      startOffset: 0,
    }),
    fetchArtwork: async () => ({
      bytes: new Uint8Array(),
      mimeType: 'image/png',
    }),
  };
}

describe('baseline download без внешнего decoder', () => {
  it('сохраняет guarded promise probe identity и запрещает decoder', async () => {
    // На Linux ps проверяет macOS-ветку; Windows использует свой реальный PowerShell probe.
    const platform = process.platform === 'linux' ? 'darwin' : process.platform;
    await expect(processStartedAt(process.pid, platform)).resolves.toMatch(
      new RegExp(`^${platform}:`),
    );
    const { execFile } = await import('node:child_process');
    await expect(promisify(execFile)('ffmpeg', ['-version'])).rejects.toThrow(
      'subprocess запрещён в baseline download test',
    );
  }, 15_000);

  it('завершает реальную загрузку с default production validator без внешнего decoder', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'baseline-download-'));
    const api = createApplication({
      stateDir: path.join(root, 'state'),
      providerOverride: provider(),
    });
    try {
      await expect(
        api.createDownload({
          source: { provider: 'mock', kind: 'track', id: 'baseline' },
          quality: 'best',
          destination: path.join(root, 'music'),
        }),
      ).resolves.toMatchObject({
        kind: 'result',
        data: { status: 'completed', tracks: [{ status: 'completed' }] },
      });
      expect(
        await readdir(path.join(root, 'music'), { recursive: true }),
      ).toEqual(expect.arrayContaining([expect.stringMatching(/\.mp3$/)]));
    } finally {
      await api.shutdown();
      await rm(root, { recursive: true, force: true });
    }
  }, 15_000);
});
