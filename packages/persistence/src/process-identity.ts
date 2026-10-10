import os from 'node:os';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { LeaseIdentity } from '@music-downloader/shared';

const execFileAsync = promisify(execFile);
export type ProcessProbe = 'same' | 'missing' | 'different' | 'unknown';

/** Время старта отличает повторно использованный PID; неизвестная probe запрещает reclaim. */
export async function processStartedAt(
  pid: number,
  platform = process.platform,
): Promise<string | undefined> {
  try {
    if (platform === 'linux') {
      const stat = await readFile(`/proc/${pid}/stat`, 'utf8');
      const close = stat.lastIndexOf(')');
      const fields = stat
        .slice(close + 2)
        .trim()
        .split(/\s+/);
      const startTicks = fields[19];
      return startTicks === undefined ? undefined : `linux:${startTicks}`;
    }
    if (platform === 'darwin') {
      const { stdout } = await execFileAsync(
        'ps',
        ['-o', 'lstart=', '-p', String(pid)],
        { timeout: 1000, shell: false },
      );
      const value = stdout.trim();
      return value === '' ? undefined : `darwin:${value}`;
    }
    if (platform === 'win32') {
      const { stdout } = await execFileAsync(
        'powershell.exe',
        [
          '-NoProfile',
          '-Command',
          `(Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToUniversalTime().ToString('O')`,
        ],
        { timeout: 1000, shell: false },
      );
      const value = stdout.trim();
      return value === '' ? undefined : `win32:${value}`;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
  }
  return undefined;
}

export async function currentLeaseIdentity(): Promise<LeaseIdentity> {
  const started = await processStartedAt(process.pid);
  if (started === undefined)
    throw new Error('Не удалось определить время старта текущего процесса.');
  return {
    pid: process.pid,
    hostname: os.hostname(),
    processStartedAt: started,
  };
}

export async function probeLease(
  identity: LeaseIdentity,
): Promise<ProcessProbe> {
  if (identity.hostname !== os.hostname()) return 'unknown';
  const started = await processStartedAt(identity.pid);
  if (started === undefined) return 'missing';
  return started === identity.processStartedAt ? 'same' : 'different';
}
