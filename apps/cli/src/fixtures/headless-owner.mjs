import fsPromises, { readFile } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';

const root = process.env.STEP_026_ROOT;
const stateDir = process.env.STEP_026_STATE_DIR;
if (root === undefined || stateDir === undefined)
  throw new Error('Нет test directories.');

const sample = new Uint8Array(
  await readFile(
    new URL(
      '../../../../packages/core/validation/src/fixtures/sample.mp3',
      import.meta.url,
    ),
  ),
);
const snapshots = [];
const token = 'step-026-token-marker';
const signedUrl =
  'https://cdn.example.test/audio?signature=step-026-signature-marker';
let networkRequests = 0;
const originalFetch = globalThis.fetch;
const originalHttpRequest = http.request;
const originalHttpsRequest = https.request;
const rejectNetwork = () => {
  networkRequests++;
  throw new Error('Сеть запрещена в STEP-026.');
};
globalThis.fetch = rejectNetwork;
http.request = rejectNetwork;
https.request = rejectNetwork;
const originalRename = fsPromises.rename;
// PRN-002: наблюдение после настоящего rename захватывает и отложенные progress snapshots.
// Установка до import сохраняет штатное хранилище без запрещённой зависимости CLI → persistence.
fsPromises.rename = async (temporary, target) => {
  await originalRename(temporary, target);
  if (path.basename(target) === 'manifest.json') {
    snapshots.push(await readFile(target, 'utf8'));
    process.send?.({ type: 'manifest', text: snapshots.at(-1) });
  }
};
syncBuiltinESMExports();

try {
  const { createApplication } = await import('@music-downloader/application');
  const { runCli } = await import('../../dist/runner.js');
  let prefixSent = false;
  const provider = {
    authenticate: async () => ({ id: 'offline', displayName: 'Offline' }),
    getAccount: async () => {
      process.send?.({ type: 'fault-reached' });
      throw new Error(`Authorization: Bearer ${token} ${signedUrl}`);
    },
    logout: async () => undefined,
    resolveUrl: async () => ({
      provider: 'offline',
      kind: 'playlist',
      id: 'list',
    }),
    getTrack: async (id) => ({
      id,
      availability: 'available',
      title: `Трек ${id}`,
      artists: [],
    }),
    getAlbum: async () => ({
      id: 'album',
      title: 'Альбом',
      artists: [],
      tracks: [],
    }),
    getPlaylist: async () => ({
      id: 'list',
      title: 'Плейлист',
      tracks: [1, 2].map((position) => ({
        position,
        track: {
          id: String(position),
          availability: 'available',
          title: `Трек ${position}`,
          artists: [],
        },
      })),
    }),
    getAudioVariants: async () => [
      { key: 'mp3', codec: 'mp3', container: 'mp3', lossless: false },
    ],
    openAudioStream: async (id, _variant, options) => {
      const offset = options.offset ?? 0;
      process.send?.({ type: 'open', id, offset });
      return {
        stream: new ReadableStream({
          async start(controller) {
            if (
              id === '2' &&
              !prefixSent &&
              process.env.STEP_026_CRASH === '1'
            ) {
              prefixSent = true;
              controller.enqueue(sample.subarray(offset, offset + 32));
              // Поток открыт раньше записи: сигнал crash разрешён только после completed первого и prefix на диске.
              const deadline = Date.now() + 10_000;
              while (Date.now() < deadline) {
                const manifest = JSON.parse(snapshots.at(-1) ?? '{}');
                const entry = manifest.tracks?.find(
                  (item) => item.trackKey === '2',
                );
                if (
                  manifest.tracks?.[0]?.status === 'completed' &&
                  entry?.partPath !== undefined
                ) {
                  try {
                    const bytes = await readFile(entry.partPath);
                    if (bytes.length === 32) {
                      process.send?.({
                        type: 'prefix',
                        id,
                        offset,
                        bytes: bytes.length,
                        partPath: entry.partPath,
                      });
                      return;
                    }
                  } catch (error) {
                    if (error.code !== 'ENOENT') throw error;
                  }
                }
                await new Promise((resolve) => setTimeout(resolve, 20));
              }
              throw new Error('Prefix второго трека не записан на диск.');
            }
            controller.enqueue(sample.subarray(offset));
            controller.close();
          },
        }),
        contentLength: sample.byteLength,
        container: 'mp3',
        acceptsRanges: true,
        startOffset: offset,
      };
    },
    fetchArtwork: async () => ({
      bytes: new Uint8Array(),
      mimeType: 'image/jpeg',
    }),
  };
  const stdout = [];
  const stderr = [];
  const host = {
    argv: process.argv.slice(2),
    env: process.env,
    homedir: () => root,
    stdout: (line) => {
      stdout.push(line);
      process.stdout.write(`${line}\n`);
      process.send?.({ type: 'stdout', line });
    },
    stderr: (line) => {
      stderr.push(line);
      process.stderr.write(`${line}\n`);
      process.send?.({ type: 'stderr', line });
    },
    signals: { on: () => undefined, off: () => undefined },
    createApplication: (adapters) =>
      createApplication({
        ...adapters,
        stateDir,
        providerOverride: provider,
        concurrency: 1,
      }),
  };
  // Реальный account fault обеспечивает непустые DTO и diagnostics для проверки секретов в каждом процессе.
  const faultCode = await runCli({
    ...host,
    argv: [
      'account',
      '--json',
      '--log-file',
      path.join(root, 'diagnostics.jsonl'),
    ],
  });
  if (faultCode !== 3)
    throw new Error('Тестовый provider fault не дошёл до CLI.');
  const code = await runCli(host);
  process.send?.({
    type: 'done',
    code,
    stdout,
    stderr,
    snapshots,
    networkRequests,
  });
  process.exitCode = code;
} finally {
  fsPromises.rename = originalRename;
  globalThis.fetch = originalFetch;
  http.request = originalHttpRequest;
  https.request = originalHttpsRequest;
  syncBuiltinESMExports();
}
