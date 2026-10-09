import path from 'node:path';
import {
  ValidationError,
  type Album,
  type Artist,
  type Playlist,
  type Track,
} from '@music-downloader/shared';
import {
  cleanNamePart,
  maxSegmentLength,
  nameLength,
  normalizeExtension,
  sanitizeFileName,
  sanitizePathSegment,
  unknownName,
  type TargetPlatform,
} from './sanitize.js';

export interface LayoutOptions {
  /** Абсолютный каталог `--output` для выбранной платформы. */
  readonly root: string;
  readonly platform: TargetPlatform;
}

export interface CollectionLayoutOptions extends LayoutOptions {
  /** Расширение выбранного варианта трека; undefined — трек не загружается. */
  readonly extensionOf: (index: number) => string | undefined;
}

export interface LayoutFile {
  /** Сегменты относительно root. */
  readonly segments: readonly string[];
  readonly path: string;
}

export interface LayoutTrackFile extends LayoutFile {
  /** Индекс в album.tracks / playlist.tracks. */
  readonly index: number;
}

export interface AlbumLayout {
  readonly directory: LayoutFile;
  readonly cover: LayoutFile;
  readonly tracks: readonly LayoutTrackFile[];
}

export interface PlaylistLayout extends AlbumLayout {
  readonly playlistFile: LayoutFile;
}

export const unknownArtistName = 'Unknown Artist';
export const coverFileName = 'cover.jpg';

/** win32 MAX_PATH без завершающего NUL; posix PATH_MAX без NUL в байтах. */
const maxPathLength: Readonly<Record<TargetPlatform, number>> = {
  win32: 259,
  darwin: 4095,
  linux: 4095,
};
const minStemLength = 16;

function pathApi(platform: TargetPlatform): path.PlatformPath {
  return platform === 'win32' ? path.win32 : path.posix;
}

function invalid(reason: string): ValidationError {
  return new ValidationError(new Error(reason));
}

function part(value: string | undefined, fallback: string): string {
  return cleanNamePart(value ?? '') || fallback;
}

function artistsPart(artists: readonly Artist[] | undefined): string {
  const names = (artists ?? [])
    .map((artist) => cleanNamePart(artist.name))
    .filter((name) => name !== '');
  return names.length > 0 ? names.join(', ') : unknownArtistName;
}

function positiveInteger(value: number | undefined): value is number {
  return value !== undefined && Number.isSafeInteger(value) && value > 0;
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

function numberWidth(numbers: readonly number[]): number {
  return Math.max(2, ...numbers.map((value) => String(value).length));
}

/** Каталог layout: проверяет root, containment и оставляет бюджет длины для файлов. */
class LayoutDirectory {
  private readonly api: path.PlatformPath;
  private readonly root: string;
  private readonly taken = new Set<string>();
  public readonly segments: readonly string[];
  public readonly path: string;
  private readonly fileLimit: number;

  public constructor(
    private readonly options: LayoutOptions,
    segments: readonly string[],
  ) {
    this.api = pathApi(options.platform);
    if (!this.api.isAbsolute(options.root)) {
      throw invalid('Output root must be absolute');
    }
    this.root = this.api.normalize(options.root);
    this.segments = segments;
    this.path = this.api.join(this.root, ...segments);
    if (segments.length > 0) this.assertInside(this.path);
    const used =
      nameLength(this.path, options.platform) +
      nameLength(this.api.sep, options.platform);
    this.fileLimit = Math.min(
      maxSegmentLength,
      maxPathLength[options.platform] - used,
    );
  }

  /** Резервирует имя, не прошедшее через шаблон (cover.jpg). */
  public reserve(name: string): LayoutFile {
    this.taken.add(collisionKey(name));
    return this.file(name);
  }

  /** Добавляет файл; коллизия в каталоге получает суффикс ' (n)' (REQ-023). */
  public add(stem: string, extension: string): LayoutFile {
    for (let attempt = 1; ; attempt += 1) {
      const suffix = attempt === 1 ? '' : ` (${String(attempt)})`;
      const name = this.fileName(stem, extension, suffix);
      const key = collisionKey(name);
      if (!this.taken.has(key)) {
        this.taken.add(key);
        return this.file(name);
      }
    }
  }

  /** Усекает stem только если полное имя не помещается в бюджет пути. */
  private fileName(stem: string, extension: string, suffix: string): string {
    const { platform } = this.options;
    const name = sanitizeFileName(stem, extension, { platform, suffix });
    if (nameLength(name, platform) <= this.fileLimit) return name;
    const tail = `${suffix}.${normalizeExtension(extension)}`;
    if (this.fileLimit - nameLength(tail, platform) < minStemLength) {
      throw invalid('Output path is too long');
    }
    return sanitizeFileName(stem, extension, {
      platform,
      suffix,
      maxLength: this.fileLimit,
    });
  }

  public layout(): LayoutFile {
    return { segments: this.segments, path: this.path };
  }

  private file(name: string): LayoutFile {
    if (nameLength(name, this.options.platform) > this.fileLimit) {
      throw invalid('Output path is too long');
    }
    const filePath = this.api.join(this.path, name);
    this.assertInside(filePath);
    return { segments: [...this.segments, name], path: filePath };
  }

  /** Посегментная проверка: имена с ведущими точками допустимы, '..' — нет. */
  private assertInside(target: string): void {
    const relative = this.api.relative(this.root, target);
    const first = relative.split(this.api.sep)[0];
    if (relative === '' || this.api.isAbsolute(relative) || first === '..') {
      throw invalid('Path escapes output root');
    }
  }
}

function collisionKey(name: string): string {
  return name.normalize('NFC').toLowerCase();
}

function segment(
  value: string,
  fallback: string,
  platform: TargetPlatform,
): string {
  return sanitizePathSegment(value, { platform, fallback });
}

/** Одиночный трек: `<root>/Artist - Track.ext`. */
export function buildTrackLayout(
  track: Track,
  extension: string,
  options: LayoutOptions,
): LayoutFile {
  const directory = new LayoutDirectory(options, []);
  return directory.add(
    `${artistsPart(track.artists)} - ${part(track.title, unknownName)}`,
    extension,
  );
}

/** Альбом: `<root>/Artist/Album (Year)/NN - Track.ext` или `D-NN - Track.ext`. */
export function buildAlbumLayout(
  album: Album,
  options: CollectionLayoutOptions,
): AlbumLayout {
  const { platform } = options;
  const title = part(album.title, unknownName);
  const directory = new LayoutDirectory(options, [
    segment(artistsPart(album.artists), unknownArtistName, platform),
    segment(
      positiveInteger(album.year) ? `${title} (${String(album.year)})` : title,
      unknownName,
      platform,
    ),
  ]);
  const cover = directory.reserve(coverFileName);
  const numbers = album.tracks.map((track, index) =>
    positiveInteger(track.trackNumber) ? track.trackNumber : index + 1,
  );
  const width = numberWidth(numbers);
  const discs = new Set(
    album.tracks.map((track) => track.discNumber).filter(positiveInteger),
  );
  const tracks: LayoutTrackFile[] = [];
  album.tracks.forEach((track, index) => {
    const extension = options.extensionOf(index);
    if (extension === undefined) return;
    const disc = positiveInteger(track.discNumber) ? track.discNumber : 1;
    const prefix = discs.size > 1 ? `${String(disc)}-` : '';
    const number = pad(numbers[index] ?? index + 1, width);
    const stem = `${prefix}${number} - ${part(track.title, unknownName)}`;
    tracks.push({ ...directory.add(stem, extension), index });
  });
  return { directory: directory.layout(), cover, tracks };
}

/** Плейлист: `<root>/Playlist/NN - Artist - Track.ext` + cover.jpg + `Playlist.m3u8`. */
export function buildPlaylistLayout(
  playlist: Playlist,
  options: CollectionLayoutOptions,
): PlaylistLayout {
  const name = segment(playlist.title, unknownName, options.platform);
  const directory = new LayoutDirectory(options, [name]);
  const cover = directory.reserve(coverFileName);
  const playlistFile = directory.add(name, 'm3u8');
  const numbers = playlist.tracks.map((entry, index) =>
    positiveInteger(entry.position) ? entry.position : index + 1,
  );
  const width = numberWidth(numbers);
  const tracks: LayoutTrackFile[] = [];
  playlist.tracks.forEach((entry, index) => {
    const extension = options.extensionOf(index);
    if (extension === undefined) return;
    const number = pad(numbers[index] ?? index + 1, width);
    const stem = `${number} - ${artistsPart(entry.track.artists)} - ${part(entry.track.title, unknownName)}`;
    tracks.push({ ...directory.add(stem, extension), index });
  });
  return { directory: directory.layout(), cover, playlistFile, tracks };
}
