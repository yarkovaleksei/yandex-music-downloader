import { mkdtemp, open, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { MusicProvider } from '@music-downloader/shared';
import { createApplication } from './index.js';

const token = 'step-029-token-marker';
const signedUrl =
  'https://cdn.example.test/audio?signature=step-029-signature-marker';

/** Provider-fixture: секреты в ошибках и в лишних полях метаданных. */
function leakyProvider(): MusicProvider {
  return {
    authenticate: async () => ({ id: 'offline', displayName: 'Offline' }),
    getAccount: async () => {
      throw new Error(`Authorization: Bearer ${token}`);
    },
    logout: async () => undefined,
    resolveUrl: async () => ({ provider: 'mock', kind: 'track', id: '1' }),
    getTrack: async (id) =>
      ({
        id,
        availability: 'available',
        title: 'Трек',
        artists: [],
        accessToken: token,
        downloadUrl: signedUrl,
      }) as Awaited<ReturnType<MusicProvider['getTrack']>>,
    getAlbum: async () => {
      throw new Error('не используется');
    },
    getPlaylist: async () => {
      throw new Error('не используется');
    },
    getAudioVariants: async () => [
      { key: 'mp3', codec: 'mp3', container: 'mp3', lossless: false },
    ],
    openAudioStream: async () => {
      throw Object.assign(new Error(`GET ${signedUrl} Bearer ${token}`), {
        status: 403,
      });
    },
    fetchArtwork: async () => ({
      bytes: new Uint8Array(),
      mimeType: 'image/jpeg',
    }),
  };
}

async function stateFiles(stateDir: string): Promise<string[]> {
  return (await readdir(stateDir)).filter((name) =>
    name.startsWith('state.sqlite3'),
  );
}

/** Поднимает user_version в заголовке SQLite (смещение 60, big-endian). */
async function bumpUserVersion(file: string, version: number): Promise<void> {
  const handle = await open(file, 'r+');
  try {
    const header = Buffer.alloc(4);
    header.writeUInt32BE(version);
    await handle.write(header, 0, 4, 60);
  } finally {
    await handle.close();
  }
}

describe('STEP-029: SQLite default store application', () => {
  it('PRN-002: fixture-токены не попадают в базу и WAL до checkpoint', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'sqlite-app-secret-'));
    const stateDir = path.join(root, 'state');
    const api = createApplication({
      stateDir,
      providerOverride: leakyProvider(),
    });
    try {
      await api.account();
      const result = await api.createDownload({
        source: { provider: 'mock', kind: 'track', id: '1' },
        quality: 'best',
        destination: path.join(root, 'music'),
      });
      expect(result).toMatchObject({ kind: 'result' });
      // Соединение открыто: WAL ещё не прошёл checkpoint в основной файл.
      const files = await stateFiles(stateDir);
      expect(files).toContain('state.sqlite3-wal');
      for (const name of files) {
        const bytes = await readFile(path.join(stateDir, name));
        expect(bytes.includes(token)).toBe(false);
        expect(bytes.includes(signedUrl)).toBe(false);
        expect(bytes.includes('step-029-signature-marker')).toBe(false);
      }
    } finally {
      await api.shutdown();
    }
    try {
      for (const name of await stateFiles(stateDir)) {
        const bytes = await readFile(path.join(stateDir, name));
        expect(bytes.includes(token)).toBe(false);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('сообщает STATE_SCHEMA_UNSUPPORTED для базы новее и не изменяет её', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'sqlite-app-newer-'));
    const stateDir = path.join(root, 'state');
    try {
      const seed = createApplication({
        stateDir,
        providerOverride: leakyProvider(),
      });
      await expect(seed.listJobs()).resolves.toMatchObject({ data: [] });
      await seed.shutdown();
      const file = path.join(stateDir, 'state.sqlite3');
      await bumpUserVersion(file, 99);
      const before = await readFile(file);
      const api = createApplication({
        stateDir,
        providerOverride: leakyProvider(),
        diagnosticsRuntime: {
          outputDirectory: root,
          filesystemProbe: async () => undefined,
          runFfmpeg: async () => undefined,
        },
      });
      try {
        for (const result of [
          await api.listJobs(),
          await api.getJob('job'),
          await api.resume('job'),
          await api.createDownload({
            source: { provider: 'mock', kind: 'track', id: '1' },
            quality: 'best',
            destination: path.join(root, 'music'),
          }),
        ]) {
          expect(result).toMatchObject({
            kind: 'error',
            error: {
              code: 'VALIDATION_ERROR',
              details: { reason: 'STATE_SCHEMA_UNSUPPORTED' },
            },
          });
          expect(JSON.stringify(result)).not.toContain(root);
        }
        const doctor = await api.diagnostics();
        expect(doctor).toMatchObject({
          kind: 'result',
          data: {
            available: false,
            backend: 'sqlite',
            configuration: {
              checks: {
                manifestStore: {
                  status: 'failed',
                  code: 'STATE_SCHEMA_UNSUPPORTED',
                },
              },
            },
          },
        });
        expect(JSON.stringify(doctor)).not.toContain(root);
      } finally {
        await api.shutdown();
      }
      expect(await readFile(file)).toEqual(before);
      expect(
        (await stateFiles(stateDir)).filter((name) => name.includes('.bak')),
      ).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('auth/account и doctor без базы не создают state.sqlite3', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'sqlite-app-lazy-'));
    const stateDir = path.join(root, 'state');
    const api = createApplication({
      stateDir,
      providerOverride: leakyProvider(),
      diagnosticsRuntime: {
        outputDirectory: root,
        filesystemProbe: async () => undefined,
        runFfmpeg: async () => undefined,
      },
    });
    try {
      await api.authenticate();
      await api.account();
      const doctor = await api.diagnostics();
      expect(doctor).toMatchObject({
        kind: 'result',
        data: {
          backend: 'sqlite',
          configuration: { checks: { manifestStore: { status: 'ok' } } },
        },
      });
      expect(await readdir(root)).toEqual([]);
    } finally {
      await api.shutdown();
      await rm(root, { recursive: true, force: true });
    }
  });
});
