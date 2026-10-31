import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';

const maximumSize = 5 * 1024 * 1024;
const keptArchives = 3;
// Время в имени архива в UTC, как и в записях; «:» заменено ради Windows.
const archivedLog = /^desktop-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.log$/;

/** Файлы журнала desktop: путь знает только main, renderer получает лишь действие «открыть». */
export function logFiles(directory: string) {
  const file = path.join(directory, 'desktop.log');
  return {
    file,
    /** Перед запуском host журнал больше 5 МБ уходит в архив с датой; хранятся три последних архива. */
    async prepare(now = new Date()): Promise<void> {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const size = await stat(file).then(
        (item) => item.size,
        () => 0,
      );
      if (size <= maximumSize) return;
      const time = now.toISOString().slice(0, 19).replaceAll(':', '-');
      await rename(file, path.join(directory, `desktop-${time}.log`));
      // Имена сортируются по времени, поэтому лишние — первые в списке.
      const archives = (await readdir(directory))
        .filter((name) => archivedLog.test(name))
        .sort();
      for (const name of archives.slice(0, -keptArchives))
        await rm(path.join(directory, name), { force: true });
    },
    /** Как «Показать в папке» у треков: файловый менеджер выделяет desktop.log. */
    async open(shell: {
      showItemInFolder(file: string): void;
      openPath(directory: string): Promise<string>;
    }): Promise<boolean> {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const exists = await stat(file).then(
        () => true,
        () => false,
      );
      if (exists) shell.showItemInFolder(file);
      else return (await shell.openPath(directory)) === '';
      return true;
    },
  };
}
