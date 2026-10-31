import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { logFiles } from './log-files.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
async function directory() {
  const root = await mkdtemp(path.join(tmpdir(), 'desktop-logs-'));
  roots.push(root);
  return path.join(root, 'logs');
}

it('журнал до 5 МБ остаётся на месте, больший уходит в архив с датой UTC; хранятся три архива', async () => {
  const logs = await directory();
  const files = logFiles(logs);
  await files.prepare();
  expect(await readdir(logs)).toEqual([]);
  await writeFile(files.file, 'small');
  await files.prepare();
  expect(await readdir(logs)).toEqual(['desktop.log']);
  // Посторонний файл с похожим именем не удаляется вместе с архивами.
  await writeFile(path.join(logs, 'desktop-notes.log'), 'keep');
  const big = Buffer.alloc(5 * 1024 * 1024 + 1, 'x');
  for (const [index, time] of [
    '2026-10-01T10:00:00.000Z',
    '2026-10-02T10:00:00.000Z',
    '2026-10-03T10:00:00.000Z',
    '2026-10-04T10:00:00.000Z',
  ].entries()) {
    await writeFile(files.file, big);
    await files.prepare(new Date(time));
    expect(await readdir(logs)).not.toContain('desktop.log');
    expect(
      (await readdir(logs)).filter((name) => name.startsWith('desktop-2026')),
    ).toHaveLength(Math.min(index + 1, 3));
  }
  expect((await readdir(logs)).sort()).toEqual([
    'desktop-2026-10-02T10-00-00.log',
    'desktop-2026-10-03T10-00-00.log',
    'desktop-2026-10-04T10-00-00.log',
    'desktop-notes.log',
  ]);
  expect(
    (await readFile(path.join(logs, 'desktop-2026-10-04T10-00-00.log'))).length,
  ).toBe(big.length);
});

it('открытие выделяет desktop.log, а без файла открывает папку и сообщает об отказе', async () => {
  const logs = await directory();
  const files = logFiles(logs);
  const shell = {
    showItemInFolder: vi.fn(),
    openPath: vi.fn(async () => ''),
  };
  expect(await files.open(shell)).toBe(true);
  expect(shell.openPath).toHaveBeenCalledWith(logs);
  shell.openPath.mockResolvedValueOnce('Не удалось открыть');
  expect(await files.open(shell)).toBe(false);
  await writeFile(files.file, '');
  expect(await files.open(shell)).toBe(true);
  expect(shell.showItemInFolder).toHaveBeenCalledWith(files.file);
  expect(shell.openPath).toHaveBeenCalledTimes(2);
});
