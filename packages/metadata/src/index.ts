import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { TagLib, type AudioFile } from 'taglib-wasm';
import {
  MetadataError,
  normalizeDomainError,
  type ArtworkData,
} from '@music-downloader/shared';

export interface MetadataTags {
  readonly title?: string;
  readonly artists?: readonly string[];
  readonly album?: string;
  readonly albumArtist?: string;
  readonly trackNumber?: number;
  readonly discNumber?: number;
  readonly year?: number;
  readonly genre?: string;
}

export interface MetadataWriteRequest {
  readonly partPath: string;
  readonly resultPath: string;
  readonly container: 'mp3' | 'mp4';
  readonly tags: MetadataTags;
  readonly artwork?: ArtworkData;
  readonly sourceKind: 'track' | 'album' | 'playlist';
  readonly embedArtwork: boolean;
  readonly saveCoverFile: boolean;
}

/**
 * Writer использует buffer API: TagLib не интерпретирует суффикс `.part`.
 * @link ../../../docs/adr/ADR-012-audio-metadata-library.md
 */
export interface MetadataWriter {
  write(request: MetadataWriteRequest): Promise<void>;
}

const taglib = TagLib.initialize({ forceWasmType: 'emscripten' });

/** Создаёт writer без provider-зависимостей, сети и subprocess. */
export function createMetadataWriter(): MetadataWriter {
  return { write: writeMetadata };
}

async function writeMetadata(request: MetadataWriteRequest): Promise<void> {
  const input = await filesystem(() => readFile(request.partPath));
  const file = await open(input);
  try {
    const output = tag(request, file);
    await filesystem(() => writeFile(request.partPath, output));
  } finally {
    file.dispose();
  }
  if (
    request.saveCoverFile &&
    request.artwork !== undefined &&
    (request.sourceKind === 'album' || request.sourceKind === 'playlist')
  ) {
    await filesystem(() =>
      writeFile(
        join(dirname(request.resultPath), 'cover.jpg'),
        request.artwork!.bytes,
      ),
    );
  }
}

function tag(request: MetadataWriteRequest, file: AudioFile): Uint8Array {
  try {
    // Явный container защищает от записи MP4-тегов в bytes MP3 и наоборот.
    if (file.getFormat() !== expectedFormat(request.container))
      throw new MetadataError();
    file.setProperties(properties(request.tags));
    if (request.embedArtwork && request.artwork !== undefined) {
      file.setPictures([
        {
          mimeType: request.artwork.mimeType,
          data: request.artwork.bytes,
          type: 'FrontCover',
          description: 'Обложка',
        },
      ]);
    } else if (!request.embedArtwork) {
      file.setPictures([]);
    }
    if (!file.save()) throw new MetadataError();
    return file.getFileBuffer();
  } catch (error) {
    if (error instanceof MetadataError) throw error;
    throw new MetadataError(error);
  }
}

/** I/O сохраняет классифицируемый безопасный код, TagLib ошибки остаются METADATA_ERROR. */
async function filesystem<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw normalizeDomainError(error);
  }
}

async function open(input: Uint8Array) {
  try {
    return await (await taglib).open(input);
  } catch (error) {
    throw new MetadataError(error);
  }
}

function expectedFormat(container: MetadataWriteRequest['container']) {
  return container === 'mp3' ? 'MP3' : 'MP4';
}

function properties(tags: MetadataTags): Record<string, string[]> {
  const artist = tags.artists?.filter((value) => value.length > 0).join('; ');
  return {
    ...field('TITLE', tags.title),
    ...field('ARTIST', artist),
    ...field('ALBUM', tags.album),
    ...field('ALBUMARTIST', tags.albumArtist),
    ...numberField('TRACKNUMBER', tags.trackNumber),
    ...numberField('DISCNUMBER', tags.discNumber),
    ...numberField('DATE', tags.year),
    ...field('GENRE', tags.genre),
  };
}

function field(
  name: string,
  value: string | undefined,
): Record<string, string[]> {
  return value === undefined || value.length === 0 ? {} : { [name]: [value] };
}

function numberField(
  name: string,
  value: number | undefined,
): Record<string, string[]> {
  return value === undefined ? {} : { [name]: [String(value)] };
}
