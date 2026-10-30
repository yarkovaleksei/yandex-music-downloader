import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  DomainError,
  isCommandResult,
  type CredentialStore,
  type ManifestStore,
  type MusicProvider,
} from '@music-downloader/shared';
import { YandexMusicProvider } from '@music-downloader/provider-yandex-music';
import { createApplication } from './index.js';
import { collectDiagnostics } from './diagnostics.js';

const variant = {
  key: 'probe',
  codec: 'mp3',
  container: 'mp3',
  lossless: false,
};
function controlled() {
  const provider: MusicProvider = {
    authenticate: vi.fn(),
    getAccount: vi.fn(async () => ({
      id: 'private-account-id',
      displayName: 'Тест',
    })),
    logout: vi.fn(),
    resolveUrl: vi.fn(),
    getTrack: vi.fn(async () => ({
      id: '2224197',
      availability: 'available' as const,
      title: 'Тест',
      artists: [],
    })),
    getAlbum: vi.fn(),
    getPlaylist: vi.fn(),
    getAudioVariants: vi.fn(async () => [variant]),
    openAudioStream: vi.fn(),
    fetchArtwork: vi.fn(),
  };
  const manifestStore = {
    list: vi.fn(async () => []),
  } as unknown as ManifestStore;
  return {
    provider,
    manifestStore,
    providerHealth: async () => 'available' as const,
    providerSchemaVersion: '1.1.0',
    canaryTrackId: '2224197',
    runtime: {
      outputDirectory: os.tmpdir(),
      nodeVersion: '22.14.0',
      filesystemProbe: async () => {},
      runFfmpeg: async () => {},
    },
  };
}

/** Стадии REQ-034 проверяются отдельно от transport; H-001/H-002 используют настоящий facade ниже.
 * */
describe('doctor: обязательные стадии', () => {
  it.each([
    'runtime',
    'credentialStore',
    'provider',
    'auth',
    'account',
    'metadata',
    'audioVariants',
    'manifestStore',
    'filesystem',
  ] as const)('обязательный отказ %s не скрывается', async (stage) => {
    const input = controlled();
    const error = new DomainError('NETWORK_ERROR', true);
    if (stage === 'runtime') input.runtime.nodeVersion = '25.0.0';
    if (stage === 'credentialStore')
      input.providerHealth = async () => {
        throw new Error('private-native-message');
      };
    if (stage === 'provider')
      vi.mocked(input.provider.getAccount).mockRejectedValue(error);
    if (stage === 'auth' || stage === 'account')
      vi.mocked(input.provider.getAccount).mockResolvedValue(null);
    if (stage === 'metadata')
      vi.mocked(input.provider.getTrack).mockRejectedValue(error);
    if (stage === 'audioVariants')
      vi.mocked(input.provider.getAudioVariants).mockRejectedValue(error);
    if (stage === 'manifestStore')
      vi.mocked(input.manifestStore.list).mockRejectedValue(
        new DomainError('VALIDATION_ERROR', false),
      );
    if (stage === 'filesystem')
      input.runtime.filesystemProbe = async () => {
        throw { code: 'EACCES', message: 'private-native-message' };
      };
    const report = await collectDiagnostics(input);
    expect(report.available).toBe(false);
    expect(report.configuration?.checks).toMatchObject({
      [stage]: { status: 'failed' },
    });
    expect(JSON.stringify(report)).not.toMatch(
      /private-account-id|private-native-message/,
    );
    expect(input.provider.authenticate).not.toHaveBeenCalled();
    expect(input.provider.logout).not.toHaveBeenCalled();
    expect(input.provider.openAudioStream).not.toHaveBeenCalled();
  });
  it('проверяет реальный output и убирает временные файлы', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'doctor-fs-'));
    try {
      const input = controlled();
      const report = await collectDiagnostics({
        ...input,
        runtime: {
          outputDirectory: path.join(root, 'music'),
          runFfmpeg: async () => {},
        },
      });
      expect(report.available).toBe(true);
      expect(await readdir(path.join(root, 'music'))).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('doctor: настоящий provider transport и безопасный CommandResult', () => {
  it.each(['malformed', 'network', 'additive', 'corrupt', 'absent'] as const)(
    'изолирует %s без credentials в DTO',
    async (scenario) => {
      const serialized = JSON.stringify({
        schemaVersion: 1,
        accessToken: 'synthetic-token-canary',
        accountId: 'private-account-id',
        issuedAt: 1,
      });
      const credentials: CredentialStore = {
        read: vi.fn(async () =>
          scenario === 'corrupt'
            ? '{'
            : scenario === 'absent'
              ? null
              : serialized,
        ),
        write: vi.fn(),
        clear: vi.fn(),
      };
      const fetch = vi.fn(async (url: string) => {
        if (url.includes('/tracks') && scenario === 'network')
          throw {
            code: 'ECONNRESET',
            message: 'https://cdn.example/secret?token=synthetic-token-canary',
          };
        const body = url.includes('/account/status')
          ? {
              result: {
                account: { uid: 'private-account-id', displayName: 'Аккаунт' },
              },
            }
          : {
              result: [
                {
                  id: '2224197',
                  available: true,
                  title: scenario === 'malformed' ? 123 : 'Тест',
                  artists: [],
                  additiveField: 'ignored',
                },
              ],
            };
        return {
          status: 200,
          arrayBuffer: async () =>
            new TextEncoder().encode(JSON.stringify(body)).buffer,
        };
      });
      const provider = new YandexMusicProvider({
        credentialStore: credentials,
        authInteraction: { notify: vi.fn() },
        fetch,
      });
      const authenticate = vi.spyOn(provider, 'authenticate');
      const openStream = vi.spyOn(provider, 'openAudioStream');
      const variants = vi
        .spyOn(provider, 'getAudioVariants')
        .mockResolvedValue([variant]);
      const root = await mkdtemp(path.join(os.tmpdir(), 'doctor-raw-'));
      const api = createApplication({
        stateDir: path.join(root, 'state'),
        credentialStore: credentials,
        providerOverride: provider,
        diagnosticsRuntime: {
          outputDirectory: root,
          runFfmpeg: async () => {
            throw { code: 'ENOENT' };
          },
        },
      });
      const events: unknown[] = [];
      api.subscribe((event) => events.push(event));
      try {
        const result = await api.diagnostics();
        expect(isCommandResult(result)).toBe(true);
        expect(result.kind).toBe('result');
        if (result.kind !== 'result') throw new Error('Отчёт не получен');
        expect(result.data.available).toBe(scenario === 'additive');
        const checks = result.data.configuration?.checks;
        if (scenario === 'malformed')
          expect(checks).toMatchObject({
            metadata: {
              status: 'api-changed',
              code: 'PROVIDER_RESPONSE_INVALID',
            },
            audioVariants: { status: 'skipped' },
          });
        if (scenario === 'network')
          expect(checks).toMatchObject({
            metadata: { status: 'failed', code: 'NETWORK_ERROR' },
          });
        if (scenario === 'corrupt' || scenario === 'absent') {
          expect(checks).toMatchObject({
            credentialStore: { status: 'failed', code: scenario.toUpperCase() },
            metadata: { status: 'skipped' },
            provider: { status: 'skipped' },
          });
          expect(fetch).not.toHaveBeenCalled();
          expect(JSON.stringify(result)).not.toContain('api-changed');
        }
        expect(JSON.stringify(result)).not.toMatch(
          /synthetic-token-canary|private-account-id|cdn.example|additiveField/,
        );
        expect(credentials.write).not.toHaveBeenCalled();
        expect(credentials.clear).not.toHaveBeenCalled();
        expect(authenticate).not.toHaveBeenCalled();
        expect(openStream).not.toHaveBeenCalled();
        expect(events).toEqual([]);
        if (scenario !== 'additive') expect(variants).not.toHaveBeenCalled();
        expect(await readdir(root)).toEqual([]);
      } finally {
        await api.shutdown();
        await rm(root, { recursive: true, force: true });
      }
    },
  );
});
