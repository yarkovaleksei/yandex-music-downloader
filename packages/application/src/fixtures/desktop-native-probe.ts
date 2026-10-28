import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  CliCredentialStore,
  createNativeCredentialEntry,
} from '@music-downloader/persistence';
import type { MusicProvider } from '@music-downloader/shared';
import { createApplication } from '../index.js';

/** Test-only Electron host использует отдельный keyring namespace, не запись аккаунта. */
export async function runNativeProbe(options: {
  stateDir: string;
  namespace: string;
  marker: string;
  stage: 'write' | 'read' | 'delete';
}): Promise<{ sqlite: boolean; keyring: boolean; deleted: boolean }> {
  const credentials = new CliCredentialStore(() =>
    createNativeCredentialEntry(options.namespace),
  );
  const api = createApplication({
    stateDir: options.stateDir,
    clientProfile: 'desktop',
    providerOverride: offlineProvider(),
  });
  const note = path.join(options.stateDir, 'probe-job.json');
  try {
    if (options.stage === 'write') {
      await credentials.write(options.marker);
      const result = await api.createDownload({
        source: { provider: 'probe', kind: 'track', id: 'probe' },
        quality: 'best',
        destination: path.join(options.stateDir, 'music'),
      });
      if (result.kind !== 'result')
        throw new Error('Создание test job не выполнено');
      await writeFile(note, JSON.stringify({ jobId: result.data.jobId }));
      return {
        sqlite: (await api.getJob(result.data.jobId)).kind === 'result',
        keyring: (await credentials.read()) === options.marker,
        deleted: false,
      };
    }
    const saved = JSON.parse(await readFile(note, 'utf8')) as { jobId: string };
    const job = await api.getJob(saved.jobId);
    const sqlite = job.kind === 'result' && job.data?.jobId === saved.jobId;
    if (options.stage === 'delete') {
      await credentials.clear();
      return {
        sqlite,
        keyring: true,
        deleted: (await credentials.read()) === null,
      };
    }
    return {
      sqlite,
      keyring: (await credentials.read()) === options.marker,
      deleted: false,
    };
  } finally {
    await api.shutdown();
  }
}
function offlineProvider(): MusicProvider {
  return {
    authenticate: async () => ({ id: 'probe', displayName: 'Проверка' }),
    getAccount: async () => null,
    logout: async () => undefined,
    resolveUrl: async () => ({ provider: 'probe', kind: 'track', id: 'probe' }),
    getTrack: async (id) => ({
      id,
      availability: 'available',
      title: 'Проверка SQLite',
      artists: [],
    }),
    getAlbum: async () => {
      throw new Error('Не используется');
    },
    getPlaylist: async () => {
      throw new Error('Не используется');
    },
    getAudioVariants: async () => [
      { key: 'probe', codec: 'mp3', container: 'mp3', lossless: false },
    ],
    openAudioStream: async () => {
      throw new Error('Тест без скачивания аудио');
    },
    fetchArtwork: async () => ({
      bytes: new Uint8Array(),
      mimeType: 'image/png',
    }),
  };
}
