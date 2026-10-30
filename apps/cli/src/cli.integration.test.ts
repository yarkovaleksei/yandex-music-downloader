import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it } from 'vitest';
import { createApplication } from '@music-downloader/application';
import {
  DownloadError,
  isCommandResult,
  isJobEvent,
  type MusicProvider,
} from '@music-downloader/application/contracts';
import { runCli } from './runner.js';

const sample = new Uint8Array(
  await readFile(
    new URL(
      '../../../packages/core/validation/src/fixtures/sample.mp3',
      import.meta.url,
    ),
  ),
);

/** реальный facade показывает job.created до lease/active work; pause разрешён только после running. */
describe('H-002: Ctrl+C через публичный ApplicationApi', () => {
  let root: string | undefined;
  let api: ReturnType<typeof createApplication> | undefined;
  afterEach(async () => {
    await api?.shutdown();
    if (root !== undefined) await rm(root, { recursive: true, force: true });
  });
  it('безопасно откладывает pause от job.created до running и сохраняет paused', async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'cli-h002-'));
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    api = createApplication({
      stateDir: path.join(root, 'state'),
      providerOverride: provider(gate),
    });
    let created = '';
    let atCreated: string | undefined;
    api.subscribe((event) => {
      if (event.event === 'job.created') {
        created = event.jobId;
        void api!.getJob(created).then((result) => {
          if (result.kind === 'result') atCreated = result.data?.status;
        });
      }
    });
    const operation = api.createDownload({
      source: { provider: 'mock', kind: 'track', id: 'track' },
      quality: 'best',
      destination: path.join(root, 'music'),
    });
    await expect.poll(() => created, { timeout: 3000 }).not.toBe('');
    await expect
      .poll(() => atCreated, { timeout: 3000 })
      .toSatisfy((status) => status === 'queued' || status === 'interrupted');
    // Readiness подтверждает работающий manager по aggregate и состоянию реального track.
    await expect
      .poll(
        async () => {
          const snapshot = await api!.getJob(created);
          return (
            snapshot.kind === 'result' &&
            snapshot.data?.status === 'running' &&
            snapshot.data.tracks[0]?.status === 'downloading'
          );
        },
        { timeout: 3000 },
      )
      .toBe(true);
    await expect(api.pause(created)).resolves.toMatchObject({
      kind: 'result',
      data: { status: 'paused' },
    });
    release!();
    await expect(operation).resolves.toMatchObject({
      kind: 'result',
      data: { status: 'paused' },
    });
  }, 10_000);
});

describe('H-001: реальный CLI NDJSON', () => {
  let root: string | undefined;
  afterEach(async () => {
    if (root !== undefined) await rm(root, { recursive: true, force: true });
    root = undefined;
  });
  it('передаёт исходные события от job.created до completed без fixture-секретов', async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'cli-h001-'));
    const stdout: string[] = [];
    const code = await runCli({
      argv: [
        'download',
        'https://music.yandex.ru/track/fixture',
        '--json',
        '--output',
        path.join(root, 'music'),
      ],
      env: {},
      homedir: () => root!,
      stdout: (line) => stdout.push(line),
      stderr: () => undefined,
      signals: { on: () => undefined, off: () => undefined },
      createApplication: (adapters) =>
        createApplication({
          ...adapters,
          stateDir: path.join(root!, 'state'),
          providerOverride: provider(Promise.resolve()),
        }),
    });
    expect(code).toBe(0);
    const records = stdout.map((line) => JSON.parse(line));
    expect(
      records.every((record) => isJobEvent(record) || isCommandResult(record)),
    ).toBe(true);
    const seq = records.filter(isJobEvent).map((record) => record.seq);
    expect(
      seq.every((value, index) => index === 0 || value > seq[index - 1]!),
    ).toBe(true);
    expect(records.map((record) => record.event)).toContain('job.created');
    expect(records.map((record) => record.event)).toContain('job.completed');
    expect(stdout.join('\n')).not.toMatch(
      /Authorization|cookie|secret|signed/i,
    );
  }, 10_000);
  it('передаёт logging host config без утечки provider текста в stdout и файл', async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'cli-log-'));
    const logFile = path.join(root, 'events.jsonl');
    const stdout: string[] = [];
    const stderr: string[] = [];
    const code = await runCli({
      argv: [
        'download',
        'u',
        '--json',
        '--output',
        path.join(root, 'music'),
        '--log-file',
        logFile,
      ],
      env: {},
      homedir: () => root!,
      stdout: (line) => stdout.push(line),
      stderr: (line) => stderr.push(line),
      signals: new EventEmitter(),
      createApplication: (adapters) =>
        createApplication({
          ...adapters,
          stateDir: path.join(root!, 'state'),
          providerOverride: {
            ...provider(Promise.resolve()),
            openAudioStream: async () => {
              throw new Error('Authorization Cookie signedURL fixture');
            },
          },
        }),
    });
    expect(code).toBe(3);
    expect(
      stdout.every(
        (line) =>
          isJobEvent(JSON.parse(line)) || isCommandResult(JSON.parse(line)),
      ),
    ).toBe(true);
    const text = `${stdout.join('\n')}\n${stderr.join('\n')}\n${await readFile(logFile, 'utf8')}`;
    expect(text).not.toMatch(/Authorization|Cookie|signedURL/);
  }, 10_000);
});

describe('реальный lifecycle CLI', () => {
  let root: string | undefined;
  afterEach(async () => {
    if (root !== undefined) await rm(root, { recursive: true, force: true });
    root = undefined;
  });
  it('сохраняет SIGINT pause и продолжает job новым application', async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'cli-resume-'));
    const signals = new EventEmitter();
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let interrupted = false;
    const paused = await runCli({
      argv: ['download', 'u', '--output', path.join(root, 'music')],
      env: {},
      homedir: () => root!,
      stdout: () => undefined,
      stderr: () => undefined,
      signals,
      createApplication: (adapters) => {
        const application = createApplication({
          ...adapters,
          stateDir: path.join(root!, 'state'),
          providerOverride: lifecycleProvider(gate, () => {
            if (!interrupted) {
              interrupted = true;
              signals.emit('SIGINT');
            }
          }),
        });
        const pause = application.pause.bind(application);
        application.pause = async (jobId) => {
          release!();
          return pause(jobId);
        };
        return application;
      },
    });
    expect(paused).toBe(4);
    const state = createApplication({
      stateDir: path.join(root, 'state'),
      providerOverride: provider(Promise.resolve()),
    });
    const jobs = await state.listJobs();
    await state.shutdown();
    expect(jobs).toMatchObject({
      kind: 'result',
      data: [{ status: 'paused' }],
    });
    const jobId = jobs.kind === 'result' ? jobs.data[0]!.jobId : '';
    const resumed = await runCli({
      argv: ['resume', jobId],
      env: {},
      homedir: () => root!,
      stdout: () => undefined,
      stderr: () => undefined,
      signals: new EventEmitter(),
      createApplication: (adapters) =>
        createApplication({
          ...adapters,
          stateDir: path.join(root!, 'state'),
          providerOverride: provider(Promise.resolve()),
        }),
    });
    expect(resumed).toBe(0);
  }, 15_000);
  it('повторяет failed job новым application после nonretryable stream ошибки', async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'cli-retry-'));
    const destination = path.join(root, 'music');
    const failed = await runCli({
      argv: ['download', 'u', '--output', destination],
      env: {},
      homedir: () => root!,
      stdout: () => undefined,
      stderr: () => undefined,
      signals: new EventEmitter(),
      createApplication: (adapters) =>
        createApplication({
          ...adapters,
          stateDir: path.join(root!, 'state'),
          providerOverride: {
            ...provider(Promise.resolve()),
            openAudioStream: async () => {
              throw new DownloadError(false);
            },
          },
        }),
    });
    expect(failed).toBe(3);
    const probe = createApplication({
      stateDir: path.join(root, 'state'),
      providerOverride: provider(Promise.resolve()),
    });
    const jobs = await probe.listJobs();
    await probe.shutdown();
    expect(jobs).toMatchObject({
      kind: 'result',
      data: [{ status: 'failed' }],
    });
    const jobId = jobs.kind === 'result' ? jobs.data[0]!.jobId : '';
    const retried = await runCli({
      argv: ['retry', jobId],
      env: {},
      homedir: () => root!,
      stdout: () => undefined,
      stderr: () => undefined,
      signals: new EventEmitter(),
      createApplication: (adapters) =>
        createApplication({
          ...adapters,
          stateDir: path.join(root!, 'state'),
          providerOverride: provider(Promise.resolve()),
        }),
    });
    expect(retried).toBe(0);
  }, 15_000);
});

function provider(gate: Promise<void>): MusicProvider {
  return {
    authenticate: async () => ({ id: 'test', displayName: 'Тест' }),
    getAccount: async () => null,
    logout: async () => undefined,
    resolveUrl: async () => ({ provider: 'mock', kind: 'track', id: 'track' }),
    getTrack: async () => ({
      id: 'track',
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
        async pull(controller) {
          await gate;
          controller.enqueue(sample);
          controller.close();
        },
      }),
      contentLength: sample.byteLength,
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

function lifecycleProvider(
  gate: Promise<void>,
  onTrack: () => void,
): MusicProvider {
  return {
    ...provider(gate),
    getTrack: async () => {
      onTrack();
      return {
        id: 'track',
        availability: 'available',
        title: 'Трек',
        artists: [],
      };
    },
  };
}
