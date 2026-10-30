import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  isDurationWithinTolerance,
  validateLocalAudio,
  validationCorePackage,
  validateWithFfmpeg,
  type FfmpegExecutor,
} from './index.js';

// fileURLToPath сохраняет корректный абсолютный путь fixture на Windows.
describe('validation core package', () => {
  it('exports its package marker', () => {
    expect(validationCorePackage).toBe('@music-downloader/core-validation');
  });
  it('отклоняет пустой, отсутствующий и нераспознаваемый локальный файл', async () => {
    await expect(
      validateLocalAudio({
        path: '/tmp/audio-validation-absent.mp3',
        variant: {
          key: 'mp3',
          container: 'mp3',
          codec: 'mp3',
          lossless: false,
        },
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
  it('принимает границы абсолютного и процентного допуска включительно', () => {
    expect(isDurationWithinTolerance(11_000, 10_000)).toBe(true);
    expect(isDurationWithinTolerance(11_001, 10_000)).toBe(false);
    expect(isDurationWithinTolerance(101_000, 100_000)).toBe(true);
    expect(isDurationWithinTolerance(101_001, 100_000)).toBe(false);
  });
  it('считает отсутствующий явно заданный FFmpeg необязательным', async () => {
    const executor: FfmpegExecutor = {
      execute: async () => {
        throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      },
    };
    await expect(
      validateWithFfmpeg({ executable: 'ffmpeg', path: 'audio' }, executor),
    ).resolves.toEqual({ status: 'unavailable' });
  });
  it('принимает полный corpus и отклоняет его обрезанные MP3 и MP4 копии', async () => {
    const root = await mkdtemp(join(tmpdir(), 'audio-validation-corpus-'));
    const fixtures = new URL('./fixtures/', import.meta.url);
    const cases = [
      [
        'sample.mp3',
        { key: 'mp3', container: 'mp3', codec: 'mp3', lossless: false },
      ],
      [
        'sample-aac.m4a',
        { key: 'aac', container: 'm4a', codec: 'aac', lossless: false },
      ],
      [
        'sample-flac.m4a',
        { key: 'flac', container: 'm4a', codec: 'flac', lossless: true },
      ],
    ] as const;
    try {
      for (const [name, variant] of cases) {
        const bytes = await readFile(new URL(name, fixtures));
        const full = join(root, name);
        const truncated = join(root, `truncated-${name}`);
        await writeFile(full, bytes);
        await writeFile(
          truncated,
          bytes.subarray(0, Math.floor(bytes.length / 2)),
        );
        await expect(
          validateLocalAudio({ path: full, variant }),
        ).resolves.toMatchObject({ durationMs: expect.any(Number) });
        await expect(
          validateLocalAudio({ path: truncated, variant }),
        ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it('F-001: принимает целый MP3 с ID3v1, но отклоняет обрезанный audio frame', async () => {
    const root = await mkdtemp(join(tmpdir(), 'audio-validation-id3v1-'));
    const source = await readFile(
      new URL('./fixtures/sample.mp3', import.meta.url),
    );
    const tagged = join(root, 'tagged.mp3');
    const truncated = join(root, 'truncated.mp3');
    const tag = new Uint8Array(128);
    tag.set([0x54, 0x41, 0x47]);
    try {
      await writeFile(tagged, Buffer.concat([source, tag]));
      await writeFile(truncated, source.subarray(0, source.length - 1));
      const variant = {
        key: 'mp3',
        container: 'mp3',
        codec: 'mp3',
        lossless: false,
      } as const;
      await expect(
        validateLocalAudio({ path: tagged, variant }),
      ).resolves.toMatchObject({ durationMs: expect.any(Number) });
      await expect(
        validateLocalAudio({ path: truncated, variant }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it('F-002: AAC-MP4 с title=fLaC не становится вариантом FLAC', async () => {
    await expect(
      validateLocalAudio({
        path: fileURLToPath(
          new URL('./fixtures/sample-aac-title-flac.m4a', import.meta.url),
        ),
        variant: {
          key: 'flac',
          container: 'm4a',
          codec: 'flac',
          lossless: true,
        },
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
  it('выполняет opt-in decoder с явным executable и нормализует process failures', async () => {
    const execute = vi.fn<FfmpegExecutor['execute']>();
    const success: FfmpegExecutor = { execute };
    await expect(
      validateWithFfmpeg(
        { executable: process.execPath, path: 'audio' },
        success,
      ),
    ).resolves.toEqual({ status: 'passed' });
    expect(execute).toHaveBeenCalledWith(
      process.execPath,
      expect.arrayContaining(['-xerror', '-err_detect', 'explode']),
      expect.objectContaining({ shell: false, windowsHide: true }),
    );
    const fail: FfmpegExecutor = {
      execute: async () => {
        throw new Error('decode');
      },
    };
    await expect(
      validateWithFfmpeg({ executable: process.execPath, path: 'audio' }, fail),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
  it('нормализует timeout и отмену opt-in decoder', async () => {
    const timeout: FfmpegExecutor = {
      execute: async () => {
        throw Object.assign(new Error('timeout'), { killed: true });
      },
    };
    await expect(
      validateWithFfmpeg(
        { executable: process.execPath, path: 'audio', timeoutMs: 1 },
        timeout,
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const controller = new AbortController();
    controller.abort();
    const aborted: FfmpegExecutor = {
      execute: async () => {
        throw new DOMException('Отменено.', 'AbortError');
      },
    };
    await expect(
      validateWithFfmpeg(
        {
          executable: process.execPath,
          path: 'audio',
          signal: controller.signal,
        },
        aborted,
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
  it('требует stream completion и точный transport size только до metadata', async () => {
    const path = fileURLToPath(
      new URL('./fixtures/sample.mp3', import.meta.url),
    );
    const variant = {
      key: 'mp3',
      container: 'mp3',
      codec: 'mp3',
      lossless: false,
    } as const;
    await expect(
      validateLocalAudio({
        path,
        variant,
        expectedDurationMs: 2000,
        stream: { completed: true, bytes: 49_755, expectedSize: 49_754 },
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      validateLocalAudio({ path, variant, expectedDurationMs: 2000 }),
    ).resolves.toMatchObject({ durationMs: expect.any(Number) });
  });
  it('F-004: production validator отвергает пустой, не-аудио и duration mismatch', async () => {
    const root = await mkdtemp(join(tmpdir(), 'audio-validation-negative-'));
    const empty = join(root, 'empty.mp3');
    const text = join(root, 'text.mp3');
    const valid = fileURLToPath(
      new URL('./fixtures/sample.mp3', import.meta.url),
    );
    const variant = {
      key: 'mp3',
      container: 'mp3',
      codec: 'mp3',
      lossless: false,
    } as const;
    try {
      await writeFile(empty, new Uint8Array());
      await writeFile(text, 'не аудио');
      for (const path of [empty, text])
        await expect(
          validateLocalAudio({ path, variant }),
        ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
      await expect(
        validateLocalAudio({
          path: valid,
          variant,
          expectedDurationMs: 10_000,
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
