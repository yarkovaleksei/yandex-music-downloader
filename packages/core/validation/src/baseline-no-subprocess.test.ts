import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

vi.mock('node:child_process', () => ({
  // Базовый parser не имеет права запускать subprocess до opt-in FFmpeg проверки.
  execFile: () => {
    throw new Error('subprocess запрещён в baseline test');
  },
}));

import { validateLocalAudio } from './index.js';

// fileURLToPath сохраняет корректный абсолютный путь fixture на Windows.
describe('baseline validateLocalAudio без subprocess', () => {
  it('принимает настоящий MP3 при запрещённом child_process', async () => {
    const fixture = new URL('./fixtures/sample.mp3', import.meta.url);
    expect((await readFile(fixture)).byteLength).toBeGreaterThan(0);
    await expect(
      validateLocalAudio({
        path: fileURLToPath(fixture),
        variant: {
          key: 'mp3',
          container: 'mp3',
          codec: 'mp3',
          lossless: false,
        },
      }),
    ).resolves.toMatchObject({ durationMs: expect.any(Number) });
  });
});
