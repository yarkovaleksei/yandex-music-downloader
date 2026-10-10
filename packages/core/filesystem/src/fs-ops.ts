import { lstat, mkdir, open, rename, unlink } from 'node:fs/promises';

/** Открытый на запись файл; узкий срез FileHandle для подмены в тестах. */
export interface FsFile {
  write(
    data: Uint8Array,
    offset: number,
    length: number,
  ): Promise<{ readonly bytesWritten: number }>;
  sync(): Promise<void>;
  close(): Promise<void>;
}

/** Результат lstat: нужна только классификация записи. */
export interface FsStat {
  isFile(): boolean;
}

/**
 * Файловые операции writer/finalize. Реализация по умолчанию использует
 * node:fs/promises; тесты подменяют отдельные операции для воспроизведения
 * EPERM/EBUSY/ENOSPC/EACCES на любой ОС.
 */
export interface FsOps {
  mkdir(directory: string): Promise<void>;
  /** Открывает файл на запись с созданием и усечением. */
  open(file: string): Promise<FsFile>;
  lstat(target: string): Promise<FsStat>;
  rename(from: string, to: string): Promise<void>;
  unlink(target: string): Promise<void>;
}

export const defaultFsOps: FsOps = {
  async mkdir(directory) {
    await mkdir(directory, { recursive: true });
  },
  async open(file) {
    const handle = await open(file, 'w');
    return {
      write: (data, offset, length) => handle.write(data, offset, length),
      sync: () => handle.sync(),
      close: () => handle.close(),
    };
  },
  lstat: (target) => lstat(target),
  rename: (from, to) => rename(from, to),
  unlink: (target) => unlink(target),
};
