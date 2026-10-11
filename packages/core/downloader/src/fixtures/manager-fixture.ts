import { ConcurrencyScheduler } from '@music-downloader/core-queue';
import { decideRetry } from '@music-downloader/core-retry';
import { resolveVariant } from '@music-downloader/core-planner';
import {
  finalizeWithManifestCheckpoint,
  prepareRangeCandidate,
  recoverJob,
} from '@music-downloader/core-manifest';
import type {
  ArtworkData,
  AudioStream,
  JobEvent,
  JobManifestV1,
  LeaseSession,
  ManifestStore,
  MusicProvider,
} from '@music-downloader/shared';
import type { DownloadManagerDependencies } from '../ports.js';

/** Память заменяет только adapters; core state/retry/checkpoint остаются настоящими. */
export function managerFixture(count = 20, concurrency = 3) {
  const manifests = new Map<string, JobManifestV1>();
  const files = new Map<string, Uint8Array>();
  const events: JobEvent[] = [];
  const artworkCache = new Map<string, { artwork?: ArtworkData }>();
  let opened = 0;
  let peak = 0;
  let active = 0;
  let artworkRequests = 0;
  let fail: (() => unknown) | undefined;
  let delay = 1;
  const releases: string[] = [];
  const owners = new Set<string>();
  const at = new Date().toISOString();
  function manifest(jobId: string): JobManifestV1 {
    const source = {
      provider: 'mock',
      kind: 'playlist' as const,
      id: 'список',
    };
    return {
      version: 1,
      jobId,
      provider: 'mock',
      source,
      quality: 'best',
      destination: '/music',
      control: { state: 'running' },
      createdAt: at,
      updatedAt: at,
      plan: {
        source,
        title: 'План',
        tracks: Array.from({ length: count }, (_, i) => ({
          position: i + 1,
          trackKey: String(i + 1),
          track: {
            id: String(i + 1),
            availability: 'available',
            title: 'Трек',
            artists: [],
            artwork: { key: 'cover' },
          },
        })),
      },
      tracks: Array.from({ length: count }, (_, i) => ({
        position: i + 1,
        trackKey: String(i + 1),
        status: 'queued',
        attempts: 0,
        history: [],
        updatedAt: at,
      })),
    };
  }
  const store: ManifestStore = {
    read: async (id) => manifests.get(id),
    // Fixture наблюдает существующий acquire/release без изменения production core (STEP-043).
    readLeaseState: async (id) => (owners.has(id) ? 'active' : 'inactive'),
    // Fixture соблюдает порядок публичной истории, не меняя production core (STEP-042).
    list: async () =>
      [...manifests.values()].sort((a, b) =>
        a.jobId < b.jobId ? -1 : a.jobId > b.jobId ? 1 : 0,
      ),
    create: async (value) => {
      manifests.set(value.jobId, value);
    },
    acquire: async (id, options) => {
      let current = await options.recover(manifests.get(id)!);
      manifests.set(id, current);
      owners.add(id);
      const session: LeaseSession = {
        jobId: id,
        identity: { pid: 1, hostname: 'mock', processStartedAt: at },
        get manifest() {
          return current;
        },
        save: async (value) => {
          current = value;
          manifests.set(id, value);
        },
        heartbeat: async () => {},
        consumeControls: async () => [],
        acknowledge: async () => {},
        runOwned: (operation) => operation(),
        release: async () => {
          owners.delete(id);
          releases.push(id);
        },
      };
      return session;
    },
    sendControl: async () => {
      throw new Error('Используется local control.');
    },
    waitControlAck: async () => undefined,
  };
  const provider: MusicProvider = {
    getAccount: async () => ({ id: 'mock', displayName: 'Аккаунт' }),
    authenticate: async () => ({ id: 'mock', displayName: 'Аккаунт' }),
    logout: async () => {},
    resolveUrl: async () => ({
      provider: 'mock',
      kind: 'playlist',
      id: 'план',
    }),
    getTrack: async (id) => ({
      id,
      availability: 'available',
      title: 'Трек',
      artists: [],
      artwork: { key: 'cover' },
    }),
    getAlbum: async () => {
      throw new Error('Не используется.');
    },
    getPlaylist: async () => {
      throw new Error('Не используется.');
    },
    getAudioVariants: async () => [
      { key: 'variant', codec: 'mp3', container: 'mp3', lossless: false },
    ],
    fetchArtwork: async () => {
      artworkRequests += 1;
      return { bytes: new Uint8Array([1]), mimeType: 'image/jpeg' };
    },
    openAudioStream: async (_id, _variant, options): Promise<AudioStream> => {
      opened += 1;
      const error = fail?.();
      if (error !== undefined) throw error;
      active += 1;
      peak = Math.max(peak, active);
      let sent = false;
      let ended = false;
      const end = () => {
        if (!ended) {
          ended = true;
          active -= 1;
        }
      };
      return {
        contentLength: 4,
        container: 'mp3',
        acceptsRanges: true,
        startOffset: options.offset ?? 0,
        stream: new ReadableStream<Uint8Array>({
          async pull(controller) {
            await new Promise((resolve) => setTimeout(resolve, delay));
            if (ended) return;
            if (options.signal?.aborted) {
              end();
              controller.error(new DOMException('Пауза.', 'AbortError'));
            } else if (sent) {
              end();
              controller.close();
            } else {
              sent = true;
              controller.enqueue(
                new Uint8Array(4 - (options.offset ?? 0)).fill(1),
              );
            }
          },
          cancel() {
            end();
          },
        }),
      };
    },
  };
  const deps: DownloadManagerDependencies = {
    store,
    artworkCache: {
      read: async (job, key) => artworkCache.get(`${job}:${key}`),
      write: async (job, key, entry) => {
        artworkCache.set(`${job}:${key}`, entry);
      },
    },
    provider,
    scheduler: new ConcurrencyScheduler(concurrency),
    files: {
      paths: (value, key) => ({
        partPath: `${value.jobId}-${key}.part`,
        resultPath: `${value.jobId}-${key}.mp3`,
      }),
      stat: async (target) => files.get(target)?.length,
      read: async (target) => files.get(target)!,
      promote: async (from, to) => {
        files.set(to, files.get(from)!);
        files.delete(from);
      },
      discard: async (target) => {
        files.delete(target);
      },
      inspect: async (target) => (files.has(target) ? 'valid' : 'absent'),
      write: async (stream, target, options) => {
        files.set(target, new Uint8Array());
        const reader = stream.getReader();
        try {
          for (;;) {
            if (options.signal.aborted)
              throw new DOMException('Пауза.', 'AbortError');
            const result = await reader.read();
            if (result.done) break;
            const previous = files.get(target)!;
            const next = new Uint8Array(previous.length + result.value.length);
            next.set(previous);
            next.set(result.value, previous.length);
            files.set(target, next);
          }
        } catch (error) {
          await reader.cancel();
          throw error;
        } finally {
          reader.releaseLock();
        }
      },
      finalize: async (part, final, _variant, onExisting) => {
        if (files.has(final) && onExisting === 'skip') {
          files.delete(part);
          return { status: 'skipped', path: final };
        }
        files.set(final, files.get(part)!);
        files.delete(part);
        return { status: 'completed', path: final };
      },
    },
    recover: (value) =>
      recoverJob(value, {
        exists: async (target) => files.has(target),
        size: async (target) => files.get(target)?.length,
        validateFinal: async (target) => files.has(target),
      }),
    selectVariant: resolveVariant,
    retry: (error, failedAttempts) =>
      decideRetry({
        error,
        failedAttempts,
        config: { baseDelayMs: 1, maxDelayMs: 2 },
        random: () => 0.5,
        now: Date.now,
      }),
    prepareRange: prepareRangeCandidate,
    checkpoint: finalizeWithManifestCheckpoint,
    // Unit fixture изолирует orchestration; production adapter обязан использовать реальный parser.
    validator: { validate: async () => ({ durationMs: 1 }) },
    processing: { validate: async () => {}, metadata: async () => {} },
    events: {
      publish: (event) => {
        events.push(event);
      },
    },
  };
  return {
    deps: { ...deps },
    events,
    files,
    releases,
    create: async (id: string) => store.create(manifest(id)),
    opened: () => opened,
    peak: () => peak,
    artworkRequests: () => artworkRequests,
    fail: (value: () => unknown) => {
      fail = value;
    },
    slow: (value: number) => {
      delay = value;
    },
  };
}
