import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createLogger } from '@music-downloader/logging';
import { DomainError, type MusicProvider } from '@music-downloader/shared';
import { createApplication } from './index.js';

describe('host-конфигурация diagnostics', () => {
  it.each([false, true])(
    'очищает DTO, stderr и файл через реальный application facade при debug=%s',
    async (debug) => {
      const root = await mkdtemp(
        path.join(os.tmpdir(), 'application-logging-'),
      );
      const filePath = path.join(root, 'diagnostics.jsonl');
      const stderr = vi
        .spyOn(process.stderr, 'write')
        .mockImplementation(() => true);
      const stdout = vi
        .spyOn(process.stdout, 'write')
        .mockImplementation(() => true);
      try {
        const api = createApplication({
          providerOverride: failingProvider(),
          logging: { filePath, debug },
        });
        const result = await api.account();
        const file = await readFile(filePath, 'utf8');

        expect(result).toMatchObject({
          kind: 'error',
          error: { code: 'DOWNLOAD_ERROR' },
        });
        expect(JSON.stringify(result)).not.toMatch(
          /known-token-046|known-challenge-046|Authorization|cookie|signature/u,
        );
        expect(file).toBe(stderr.mock.calls.map(([line]) => line).join(''));
        expect(file).not.toMatch(
          /known-token-046|known-challenge-046|Authorization|cookie|signature/u,
        );
        if (debug) {
          expect(JSON.stringify(result)).toContain('stack');
          expect(file).toContain('DOWNLOAD_ERROR');
        } else {
          expect(JSON.stringify(result)).not.toContain('stack');
          expect(file).not.toContain('stack');
        }
        expect(stdout).not.toHaveBeenCalled();
      } finally {
        stderr.mockRestore();
        stdout.mockRestore();
        await rm(root, { recursive: true, force: true });
      }
    },
  );

  it('сохраняет injected logger, а конфликтующую конфигурацию отклоняет', async () => {
    const logger = createLogger({ sink: vi.fn() });
    const warn = vi.spyOn(logger, 'warn');
    const api = createApplication({
      providerOverride: failingProvider(),
      logger,
      logging: { debug: true },
    });

    await expect(api.account()).resolves.toMatchObject({
      kind: 'error',
      error: { details: { debug: { stack: expect.any(String) } } },
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(() =>
      createApplication({
        providerOverride: failingProvider(),
        logger,
        logging: { level: 'debug' },
      }),
    ).toThrow(DomainError);
    expect(() =>
      createApplication({
        providerOverride: failingProvider(),
        logging: { level: 'invalid' as 'info' },
      }),
    ).toThrow(DomainError);
  });

  it('передаёт host level в logger, сохраняя stderr по умолчанию', async () => {
    const stderr = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
    try {
      const defaultApi = createApplication({
        providerOverride: failingProvider(),
      });
      await defaultApi.account();
      expect(stderr).toHaveBeenCalledTimes(1);
      stderr.mockClear();

      const errorOnly = createApplication({
        providerOverride: failingProvider(),
        logging: { level: 'error' },
      });
      await errorOnly.account();
      expect(stderr).not.toHaveBeenCalled();

      const warnEnabled = createApplication({
        providerOverride: failingProvider(),
        logging: { level: 'warn' },
      });
      await warnEnabled.account();
      expect(stderr).toHaveBeenCalledTimes(1);
    } finally {
      stderr.mockRestore();
    }
  });
});

/** Для границы логирования нужен только account; остальные порты этой команды не вызываются. */
function failingProvider(): MusicProvider {
  return {
    authenticate: async () => ({ id: 'account', displayName: 'Тест' }),
    getAccount: async () => {
      throw new Error(
        'Authorization: Bearer known-token-046 cookie=known-token-046 https://cdn.example.test/a?signature=known-token-046 challenge=known-challenge-046',
      );
    },
    logout: async () => undefined,
    resolveUrl: async () => ({ provider: 'mock', kind: 'track', id: '1' }),
    getTrack: async () => ({
      id: '1',
      availability: 'available',
      title: 'Тест',
      artists: [],
    }),
    getAlbum: async () => ({ id: '1', title: 'Тест', artists: [], tracks: [] }),
    getPlaylist: async () => ({ id: '1', title: 'Тест', tracks: [] }),
    getAudioVariants: async () => [],
    openAudioStream: async () => {
      throw new Error('Не используется в тесте logging.');
    },
    fetchArtwork: async () => ({
      bytes: new Uint8Array(),
      mimeType: 'image/jpeg',
    }),
  };
}
