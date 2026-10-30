import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ArtworkCache } from '@music-downloader/core-downloader';

function name(jobId: string, trackKey: string): string {
  return createHash('sha256').update(`${jobId}\0${trackKey}`).digest('hex');
}

/** Cache хранит только готовые bytes/MIME по хешированному ключу, без provider URL. */
export function createArtworkCache(stateDir: string): ArtworkCache {
  const directory = path.join(stateDir, 'artwork');
  return {
    async read(jobId, trackKey) {
      try {
        const value = JSON.parse(
          await readFile(
            path.join(directory, `${name(jobId, trackKey)}.json`),
            'utf8',
          ),
        ) as { artwork?: { mimeType: string; base64: string } };
        return value.artwork === undefined
          ? {}
          : {
              artwork: {
                mimeType: value.artwork.mimeType,
                bytes: new Uint8Array(
                  Buffer.from(value.artwork.base64, 'base64'),
                ),
              },
            };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT')
          return undefined;
        throw error;
      }
    },
    async write(jobId, trackKey, entry) {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const target = path.join(directory, `${name(jobId, trackKey)}.json`);
      const temporary = `${target}.tmp`;
      await writeFile(
        temporary,
        JSON.stringify({
          artwork:
            entry.artwork === undefined
              ? undefined
              : {
                  mimeType: entry.artwork.mimeType,
                  base64: Buffer.from(entry.artwork.bytes).toString('base64'),
                },
        }),
        { mode: 0o600 },
      );
      await rename(temporary, target);
    },
  };
}
