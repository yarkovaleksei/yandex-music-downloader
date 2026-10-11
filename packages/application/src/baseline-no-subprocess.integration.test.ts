import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { MusicProvider } from '@music-downloader/shared';

vi.mock('node:child_process', () => ({
  // @link ../../../../planning/reviews/STEP-023/REVIEW-20261011T141250Z.md F-005
  // Реальная download-пайплайн baseline не должен обращаться к subprocess или FFmpeg.
  execFile: () => {
    throw new Error('subprocess запрещён в baseline download test');
  },
}));

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

describe('baseline download без subprocess', () => {
  it('завершает реальную загрузку с default production validator', async () => {
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
  });
});
