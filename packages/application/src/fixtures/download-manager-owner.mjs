import path from 'node:path';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { createDownloadManager } from '@music-downloader/core-downloader';
import { ConcurrencyScheduler } from '@music-downloader/core-queue';
import { decideRetry } from '@music-downloader/core-retry';
import { resolveVariant } from '@music-downloader/core-planner';
import {
  buildPartPath,
  discardPart,
  finalizePart,
  inspectExisting,
  writeStreamToPart,
} from '@music-downloader/core-filesystem';
import {
  finalizeWithManifestCheckpoint,
  prepareRangeCandidate,
  recoverJob,
} from '@music-downloader/core-manifest';
import { FileManifestStore } from '@music-downloader/persistence';

const { stateDir, jobId, DOWNLOADER_TEST_MODE: mode } = process.env;
// F-001: безопасный cache содержит только готовые image bytes и MIME, без provider refs/URL.
const cachePath = (job, key) =>
  path.join(stateDir, 'artwork', `${job}-${key}.json`);
const artworkCache = {
  async read(job, key) {
    try {
      const entry = JSON.parse(await readFile(cachePath(job, key), 'utf8'));
      return {
        artwork:
          entry.artwork === undefined
            ? undefined
            : {
                mimeType: entry.artwork.mimeType,
                bytes: new Uint8Array(entry.artwork.bytes),
              },
      };
    } catch (error) {
      if (error.code === 'ENOENT') return undefined;
      throw error;
    }
  },
  async write(job, key, entry) {
    await mkdir(path.join(stateDir, 'artwork'), { recursive: true });
    const target = cachePath(job, key);
    await writeFile(
      `${target}.tmp`,
      JSON.stringify({
        artwork:
          entry.artwork === undefined
            ? undefined
            : {
                mimeType: entry.artwork.mimeType,
                bytes: [...entry.artwork.bytes],
              },
      }),
    );
    await rename(`${target}.tmp`, target);
  },
};
const files = {
  paths: (manifest, key, variant) => {
    const resultPath = path.join(stateDir, `${key}.${variant.container}`);
    return {
      resultPath,
      partPath: buildPartPath(resultPath, {
        jobId: manifest.jobId,
        position: Number(key),
        platform: process.platform,
      }),
    };
  },
  stat: async (target) => {
    try {
      return (await stat(target)).size;
    } catch (error) {
      if (error.code === 'ENOENT') return undefined;
      throw error;
    }
  },
  read: async (target) => new Uint8Array(await readFile(target)),
  promote: rename,
  discard: discardPart,
  inspect: (target) =>
    inspectExisting(target, {
      validate: async (file) => (await stat(file)).size > 0,
    }),
  write: writeStreamToPart,
  finalize: (partPath, finalPath, variant, onExisting) =>
    finalizePart({
      partPath,
      finalPath,
      container: variant.container,
      onExisting,
      platform: process.platform,
    }),
};
let opened = 0;
const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));
const provider = {
  getAccount: async () => ({ id: 'mock', displayName: 'Тестовый аккаунт' }),
  authenticate: async () => ({ id: 'mock', displayName: 'Тестовый аккаунт' }),
  logout: async () => {},
  resolveUrl: async () => ({
    provider: 'mock',
    kind: 'playlist',
    id: 'список',
  }),
  getAlbum: async () => {
    throw new Error('Не используется fixture.');
  },
  getPlaylist: async () => {
    throw new Error('Не используется fixture.');
  },
  getTrack: async (id) => ({
    id,
    availability: 'available',
    title: `Трек ${id}`,
    artists: [],
    artwork: { key: 'cover' },
  }),
  getAudioVariants: async () => [
    { key: 'variant', codec: 'mp3', container: 'mp3', lossless: false },
  ],
  fetchArtwork: async () => ({
    bytes: new Uint8Array([1]),
    mimeType: 'image/jpeg',
  }),
  openAudioStream: async (id, _variant, options) => {
    opened += 1;
    process.send?.({
      event: 'opened',
      trackKey: id,
      offset: options.offset ?? 0,
    });
    const total = id === '1' && mode !== 'single' ? 4096 : 262144;
    let cursor = options.offset ?? 0;
    let cancelled = false;
    return {
      contentLength: total,
      container: 'mp3',
      acceptsRanges: true,
      startOffset: cursor,
      stream: new ReadableStream({
        async pull(controller) {
          await delay(10);
          if (cancelled) return;
          if (options.signal?.aborted) {
            controller.error(new DOMException('Пауза.', 'AbortError'));
            return;
          }
          if (cursor >= total) {
            controller.close();
            return;
          }
          const size = Math.min(1024, total - cursor);
          cursor += size;
          controller.enqueue(new Uint8Array(size).fill(Number(id)));
        },
        cancel() {
          cancelled = true;
        },
      }),
    };
  },
};
const store = new FileManifestStore({ stateDir });
const manager = createDownloadManager(
  {
    store,
    provider,
    scheduler: new ConcurrencyScheduler(1),
    files,
    artworkCache,
    recover: (manifest) =>
      recoverJob(manifest, {
        exists: async (target) => (await files.stat(target)) !== undefined,
        size: files.stat,
        validateFinal: async (target) =>
          (await files.stat(target)) !== undefined,
      }),
    selectVariant: resolveVariant,
    retry: (error, failedAttempts) =>
      decideRetry({ error, failedAttempts, now: Date.now, random: () => 0.5 }),
    prepareRange: prepareRangeCandidate,
    checkpoint: finalizeWithManifestCheckpoint,
    processing: {
      validate: async () => {},
      metadata: async (_part, _variant, artwork) => {
        process.send?.({
          event: 'processing-artwork',
          bytes: artwork === undefined ? undefined : [...artwork.bytes],
        });
        if (mode === 'hang') {
          process.send?.({ event: 'processing' });
          await new Promise(() => {});
        }
      },
    },
    events: {
      publish: (event) => {
        process.send?.({ ...event, event: event.event });
      },
    },
  },
  { controlPollMs: 10, progressFlushMs: 10, stopTimeoutMs: 150 },
);

// Host-only SIGINT handler вызывает core seam; CLI production сюда не включён.
process.on('SIGINT', () => {
  void manager.shutdown(jobId).then(
    () => {
      process.send?.({ event: 'stopped' });
      process.disconnect();
    },
    () => process.send?.({ event: 'stop-timeout' }),
  );
});
process.on('message', (message) => {
  if (message === 'release')
    void manager.shutdown(jobId).then(() => process.disconnect());
});
try {
  if (mode === 'resume') await manager.command(jobId, 'resume');
  else {
    const result = await manager.run(jobId);
    process.send?.({ event: 'idle', control: result.control.state, opened });
    if (result.control.state === 'running') process.disconnect();
  }
} catch {
  process.send?.({ event: 'error' });
  process.exitCode = 2;
  process.disconnect();
}
