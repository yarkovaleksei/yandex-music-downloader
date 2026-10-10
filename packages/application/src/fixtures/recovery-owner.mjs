import { appendFile, readFile, rename, stat } from 'node:fs/promises';
import { FileManifestStore } from '@music-downloader/persistence';
import {
  finalizeWithManifestCheckpoint,
  openRecoveredJob,
  prepareRangeCandidate,
} from '@music-downloader/core-manifest';
import { writeStreamToPart } from '@music-downloader/core-filesystem';

const { stateDir, jobId, counterPath, mode } = process.env;
const size = async (target) => {
  try {
    return (await stat(target)).size;
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
};
const stream = (data) =>
  new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(data));
      controller.close();
    },
  });
const report = (value) =>
  new Promise((resolve, reject) => {
    process.send(value, (error) => (error ? reject(error) : resolve()));
  });

// Fixture связывает реальные exports в разрешённом composition root ADR-001.
// Второй read начинается после записи первого chunk: IPC задаёт точную точку SIGKILL.
try {
  const store = new FileManifestStore({ stateDir });
  const { session } = await openRecoveredJob(store, jobId, {
    exists: async (target) => (await size(target)) !== undefined,
    size,
    validateFinal: async () => true,
  });
  await report({
    status: 'recovered',
    statuses: session.manifest.tracks.map((track) => track.status),
  });
  for (const track of session.manifest.tracks) {
    if (track.status === 'completed' || track.status === 'skipped') continue;
    const data = track.trackKey === '1' ? [9, 8, 7] : [1, 2, 3, 4];
    await appendFile(counterPath, `${track.trackKey}:${mode}\n`);
    const partial = track.partial;
    await session.save({
      ...session.manifest,
      tracks: session.manifest.tracks.map((value) =>
        value.trackKey === track.trackKey
          ? {
              ...value,
              status: 'downloading',
              partial: {
                bytes: partial?.bytes ?? 0,
                expectedSize: data.length,
                variantKey: 'v',
                tagged: false,
              },
            }
          : value,
      ),
    });
    if (mode === 'first' && track.trackKey === '2') {
      await session.runOwned(() =>
        writeStreamToPart(
          {
            getReader() {
              let first = true;
              return {
                async read() {
                  if (first) {
                    first = false;
                    return { done: false, value: new Uint8Array([1, 2]) };
                  }
                  await report({ status: 'midpoint' });
                  return new Promise(() => undefined);
                },
                async cancel() {},
                releaseLock() {},
              };
            },
          },
          track.partPath,
          { expectedSize: data.length },
        ),
      );
    }
    const offset = partial ? ((await size(track.partPath)) ?? 0) : 0;
    await session.runOwned(() =>
      prepareRangeCandidate(
        {
          stat: size,
          read: async (target) => new Uint8Array(await readFile(target)),
          candidatePath: (target) => `${target}.candidate`,
          writeStreamToPart: async (value, target, expected) => {
            await writeStreamToPart(value, target, { expectedSize: expected });
          },
          promote: rename,
        },
        track.partPath,
        partial,
        'v',
        {
          acceptsRanges: true,
          startOffset: offset,
          contentLength: data.length,
          stream: stream(data.slice(offset)),
        },
      ),
    );
    await session.runOwned(() =>
      finalizeWithManifestCheckpoint(session, track.trackKey, {
        mutateAndValidate: async () => {
          if ((await size(track.partPath)) !== data.length)
            throw new Error('Некорректный размер результата.');
        },
        size: () => size(track.partPath),
        rename: async () => {
          await rename(track.partPath, track.resultPath);
          if (mode === 'rename-gap') {
            await report({ status: 'renamed' });
            await new Promise(() => undefined);
          }
        },
      }),
    );
  }
  await session.release();
  await report({ status: 'completed' });
  process.disconnect();
} catch (error) {
  await report({ status: 'error', message: String(error) });
  process.exitCode = 2;
  process.disconnect();
}
