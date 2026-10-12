import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseBuffer } from 'music-metadata';
import { afterEach, describe, expect, it } from 'vitest';
import { MetadataError } from '@music-downloader/shared';
import { createMetadataWriter } from './index.js';

const cover = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL9LwAAAABJRU5ErkJggg==',
  'base64',
);
const root = new URL('../../core/validation/src/fixtures/', import.meta.url);
let temporary: string | undefined;

afterEach(async () => {
  if (temporary !== undefined)
    await rm(temporary, { recursive: true, force: true });
  temporary = undefined;
});

describe('MetadataWriter', () => {
  it.each([
    ['sample.mp3', 'mp3' as const],
    ['sample-aac.m4a', 'mp4' as const],
    ['sample-flac.m4a', 'mp4' as const],
  ])(
    'читает Unicode-теги и artwork обратно для %s',
    async (fixture, container) => {
      const paths = await prepare(fixture);
      await createMetadataWriter().write({
        partPath: paths.part,
        resultPath: paths.result,
        container,
        tags: tags(),
        artwork: { bytes: cover, mimeType: 'image/png' },
        sourceKind: 'album',
        embedArtwork: true,
        saveCoverFile: true,
      });

      const parsed = await parseBuffer(await readFile(paths.part));
      expect(parsed.common).toMatchObject({
        title: 'Песня — Ёж и море',
        artist: 'Первый артист; Второй артист',
        album: 'Исходный альбом',
        albumartist: 'Автор альбома',
        year: 2024,
      });
      expect(parsed.common.track.no).toBe(3);
      expect(parsed.common.disk.no).toBe(2);
      expect(parsed.common.genre).toEqual(['Электроника']);
      const picture = parsed.common.picture?.[0];
      expect(picture).toBeDefined();
      expect(hash(picture!.data)).toBe(hash(cover));
      expect(
        await readFile(path.join(path.dirname(paths.result), 'cover.jpg')),
      ).toEqual(cover);
    },
  );

  it('отклоняет другой explicit container до изменения bytes', async () => {
    const paths = await prepare('sample.mp3');
    const initial = await readFile(paths.part);
    await expect(
      createMetadataWriter().write({
        partPath: paths.part,
        resultPath: paths.result,
        container: 'mp4',
        tags: tags(),
        sourceKind: 'track',
        embedArtwork: false,
        saveCoverFile: false,
      }),
    ).rejects.toBeInstanceOf(MetadataError);
    expect(await readFile(paths.part)).toEqual(initial);
  });

  it('не записывает пустые необязательные теги', async () => {
    const paths = await prepare('sample.mp3');
    await createMetadataWriter().write({
      partPath: paths.part,
      resultPath: paths.result,
      container: 'mp3',
      tags: {
        title: 'Только обязательные',
        artists: ['Артист'],
        album: 'Альбом',
      },
      sourceKind: 'track',
      embedArtwork: false,
      saveCoverFile: false,
    });

    const parsed = (await parseBuffer(await readFile(paths.part))).common;
    expect(parsed).toMatchObject({
      title: 'Только обязательные',
      artist: 'Артист',
      album: 'Альбом',
    });
    expect(parsed.albumartist).toBeUndefined();
    expect(parsed.track.no).toBeNull();
    expect(parsed.disk.no).toBeNull();
    expect(parsed.year).toBeUndefined();
    expect(parsed.genre ?? []).toEqual([]);
  });

  it('независимо управляет artwork и sidecar для playlist и album', async () => {
    const playlist = await prepare('sample.mp3');
    await createMetadataWriter().write({
      partPath: playlist.part,
      resultPath: playlist.result,
      container: 'mp3',
      tags: tags(),
      artwork: { bytes: cover, mimeType: 'image/png' },
      sourceKind: 'playlist',
      embedArtwork: false,
      saveCoverFile: true,
    });
    expect(
      await readFile(path.join(path.dirname(playlist.result), 'cover.jpg')),
    ).toEqual(cover);
    expect(
      (await parseBuffer(await readFile(playlist.part))).common.picture ?? [],
    ).toEqual([]);

    const album = await prepare('sample.mp3');
    await createMetadataWriter().write({
      partPath: album.part,
      resultPath: album.result,
      container: 'mp3',
      tags: tags(),
      artwork: { bytes: cover, mimeType: 'image/png' },
      sourceKind: 'album',
      embedArtwork: true,
      saveCoverFile: false,
    });
    const picture = (await parseBuffer(await readFile(album.part))).common
      .picture?.[0];
    expect(picture).toBeDefined();
    expect(hash(picture!.data)).toBe(hash(cover));
    await expect(
      readFile(path.join(path.dirname(album.result), 'cover.jpg')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('пишет два файла через общий WASM instance', async () => {
    const first = await prepare('sample.mp3');
    const second = await prepare('sample-aac.m4a');
    const writer = createMetadataWriter();

    await Promise.all([
      writer.write({
        partPath: first.part,
        resultPath: first.result,
        container: 'mp3',
        tags: tags(),
        sourceKind: 'track',
        embedArtwork: false,
        saveCoverFile: false,
      }),
      writer.write({
        partPath: second.part,
        resultPath: second.result,
        container: 'mp4',
        tags: tags(),
        sourceKind: 'track',
        embedArtwork: false,
        saveCoverFile: false,
      }),
    ]);

    expect((await parseBuffer(await readFile(first.part))).common.title).toBe(
      'Песня — Ёж и море',
    );
    expect((await parseBuffer(await readFile(second.part))).common.title).toBe(
      'Песня — Ёж и море',
    );
  });
});

async function prepare(fixture: string) {
  temporary ??= await mkdtemp(path.join(os.tmpdir(), 'metadata-writer-'));
  const directory = await mkdtemp(path.join(temporary, 'case-'));
  const part = path.join(directory, 'track.part');
  await writeFile(part, await readFile(new URL(fixture, root)));
  return { part, result: path.join(directory, 'track.mp3') };
}

function tags() {
  return {
    title: 'Песня — Ёж и море',
    artists: ['Первый артист', 'Второй артист'],
    album: 'Исходный альбом',
    albumArtist: 'Автор альбома',
    trackNumber: 3,
    discNumber: 2,
    year: 2024,
    genre: 'Электроника',
  };
}

function hash(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex');
}
