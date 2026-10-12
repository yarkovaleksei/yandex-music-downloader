import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createApplication } from '@music-downloader/application';
import {
  DomainError,
  isCommandResult,
  type MusicProvider,
} from '@music-downloader/application/contracts';
import { runCli } from './runner.js';

/** Проверяет REQ-031 через настоящий facade/runner, без собственного JSON-контракта CLI.
 * @link planning/tasks/STEP-025.md */
describe('doctor CLI', () => {
  it.each(['ok', 'schema', 'network'] as const)(
    'выводит один CommandResult и правильный exit для %s',
    async (scenario) => {
      const root = await mkdtemp(path.join(os.tmpdir(), 'cli-doctor-'));
      const stdout: string[] = [];
      const stderr: string[] = [];
      const provider: MusicProvider = {
        authenticate: vi.fn(),
        getAccount: async () => ({
          id: 'private-account',
          displayName: 'Тест',
        }),
        logout: vi.fn(),
        resolveUrl: vi.fn(),
        getTrack: async () => {
          if (scenario !== 'ok')
            throw new DomainError(
              scenario === 'schema'
                ? 'PROVIDER_RESPONSE_INVALID'
                : 'NETWORK_ERROR',
              false,
              { cause: new Error('signed-secret-url') },
            );
          return {
            id: '2224197',
            availability: 'available',
            title: 'Тест',
            artists: [],
          };
        },
        getAlbum: vi.fn(),
        getPlaylist: vi.fn(),
        getAudioVariants: async () => [
          { key: 'probe', codec: 'mp3', container: 'mp3', lossless: false },
        ],
        openAudioStream: vi.fn(),
        fetchArtwork: vi.fn(),
      };
      try {
        const code = await runCli({
          argv: ['doctor', '--json', '--output', path.join(root, 'music')],
          env: {},
          homedir: () => root,
          stdout: (line) => stdout.push(line),
          stderr: (line) => stderr.push(line),
          signals: { on: () => undefined, off: () => undefined },
          createApplication: (adapters) =>
            createApplication({
              ...adapters,
              stateDir: path.join(root, 'state'),
              providerOverride: provider,
              diagnosticsRuntime: {
                ...adapters.diagnosticsRuntime,
                runFfmpeg: async () => {
                  throw { code: 'ENOENT' };
                },
              },
            }),
        });
        expect(code).toBe(scenario === 'ok' ? 0 : 3);
        expect(stdout).toHaveLength(1);
        const record: unknown = JSON.parse(stdout[0]!);
        expect(isCommandResult(record)).toBe(true);
        expect(record).toMatchObject({
          command: 'diagnostics',
          kind: 'result',
          data: { available: scenario === 'ok' },
        });
        if (scenario !== 'ok')
          expect(record).toMatchObject({
            data: {
              configuration: {
                checks: {
                  metadata: {
                    status: scenario === 'schema' ? 'api-changed' : 'failed',
                    code:
                      scenario === 'schema'
                        ? 'PROVIDER_RESPONSE_INVALID'
                        : 'NETWORK_ERROR',
                  },
                },
              },
            },
          });
        expect(stdout.join('\n') + stderr.join('\n')).not.toMatch(
          /private-account|signed-secret-url/,
        );
        expect(provider.authenticate).not.toHaveBeenCalled();
        expect(provider.openAudioStream).not.toHaveBeenCalled();
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );
});
