import { describe, expect, it, vi } from 'vitest';
import {
  DomainError,
  type ManifestStore,
  type MusicProvider,
} from '@music-downloader/shared';
import { collectDiagnostics } from './diagnostics.js';

function provider(): MusicProvider {
  return {
    authenticate: vi.fn(),
    getAccount: vi.fn(async () => ({
      id: 'secret-account',
      displayName: 'Тест',
    })),
    logout: vi.fn(),
    resolveUrl: vi.fn(),
    getTrack: vi.fn(async () => ({
      id: '2224197',
      availability: 'available',
      title: 'Тест',
      artists: [],
    })),
    getAlbum: vi.fn(),
    getPlaylist: vi.fn(),
    getAudioVariants: vi.fn(async () => []),
    openAudioStream: vi.fn(),
    fetchArtwork: vi.fn(),
  } as MusicProvider;
}
const manifests = { list: vi.fn(async () => []) } as unknown as ManifestStore;

describe('doctor application', () => {
  it('изолирует API drift от сетевой ошибки и не вызывает загрузку аудио', async () => {
    const api = provider();
    vi.mocked(api.getTrack).mockRejectedValue(
      new DomainError('PROVIDER_RESPONSE_INVALID', false),
    );
    const report = await collectDiagnostics({
      provider: api,
      manifestStore: manifests,
      providerHealth: async () => 'available',
      providerSchemaVersion: '1.1.0',
      canaryTrackId: '2224197',
      runtime: {
        outputDirectory: '/tmp',
        nodeVersion: '22.14.0',
        filesystemProbe: async () => {},
        runFfmpeg: async () => {},
      },
    });
    expect(report.available).toBe(false);
    expect(JSON.stringify(report)).toContain('api-changed');
    expect(JSON.stringify(report)).toContain('PROVIDER_RESPONSE_INVALID');
    expect(api.openAudioStream).not.toHaveBeenCalled();
  });

  it('не считает отсутствующий FFmpeg обязательной ошибкой и пропускает native permissions', async () => {
    const api = provider();
    vi.mocked(api.getAudioVariants).mockResolvedValue([
      { key: 'test', codec: 'mp3', container: 'mp3', lossless: false },
    ]);
    const report = await collectDiagnostics({
      provider: api,
      manifestStore: manifests,
      providerHealth: async () => 'available',
      providerSchemaVersion: '1.1.0',
      canaryTrackId: '2224197',
      runtime: {
        outputDirectory: '/tmp',
        nodeVersion: '22.14.0',
        filesystemProbe: async () => {},
        runFfmpeg: async () => {
          throw new Error('not installed');
        },
      },
    });
    expect(report.available).toBe(true);
    expect(JSON.stringify(report)).toContain('NOT_APPLICABLE');
  });

  it('не раскрывает accountId и secret в report и отмечает пустые variants отказом', async () => {
    const report = await collectDiagnostics({
      provider: provider(),
      manifestStore: manifests,
      providerHealth: async () => 'available',
      providerSchemaVersion: '1.1.0',
      canaryTrackId: '2224197',
      runtime: {
        outputDirectory: '/tmp',
        nodeVersion: '22.14.0',
        filesystemProbe: async () => {},
        runFfmpeg: async () => {},
      },
    });
    expect(report.available).toBe(false);
    expect(JSON.stringify(report)).not.toContain('secret-account');
    expect(JSON.stringify(report)).toContain('QUALITY_UNAVAILABLE');
  });

  // @link planning/tasks/STEP-055.md Граница runtime в doctor по ADR-017.
  it.each([
    ['22.13.1', 'failed'],
    ['22.14.0', 'ok'],
  ] as const)('runtime %s → %s', async (nodeVersion, status) => {
    const report = await collectDiagnostics({
      provider: provider(),
      manifestStore: manifests,
      providerHealth: async () => 'available',
      providerSchemaVersion: '1.1.0',
      canaryTrackId: '2224197',
      runtime: {
        outputDirectory: '/tmp',
        nodeVersion,
        filesystemProbe: async () => {},
        runFfmpeg: async () => {},
      },
    });
    const { checks } = report.configuration as {
      readonly checks: Record<string, { status: string; code?: string }>;
    };
    expect(checks.runtime?.status).toBe(status);
    if (status === 'failed')
      expect(checks.runtime?.code).toBe('UNSUPPORTED_RUNTIME');
  });
});
