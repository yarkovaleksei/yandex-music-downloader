import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename } from 'node:fs/promises';
import path from 'node:path';

const renameRetryDelaysMs = [50, 100, 200, 400] as const;

async function renameWithRetry(
  temporary: string,
  target: string,
): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(temporary, target);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (
        process.platform !== 'win32' ||
        (code !== 'EPERM' && code !== 'EBUSY') ||
        attempt === renameRetryDelaysMs.length
      )
        throw error;
      await new Promise<void>((resolve) =>
        setTimeout(resolve, renameRetryDelaysMs[attempt]),
      );
    }
  }
}

/** Полный snapshot публикуется только после fsync временного файла в том же каталоге. */
export async function writeAtomicJson(
  target: string,
  value: string,
): Promise<void> {
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = path.join(
    path.dirname(target),
    `.${path.basename(target)}.${randomUUID()}.tmp`,
  );
  const handle = await open(temporary, 'wx', 0o600);
  try {
    await handle.writeFile(value, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  // Повторяется только публикация уже подготовленного snapshot: @link planning/tasks/STEP-044.md.
  await renameWithRetry(temporary, target);
}

export async function readJsonIfPresent(
  target: string,
): Promise<string | undefined> {
  try {
    return await readFile(target, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}
