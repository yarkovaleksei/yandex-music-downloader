import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { describe, expect, it } from 'vitest';
import {
  currentLeaseIdentity,
  processStartedAt,
  probeLease,
} from './process-identity.js';

describe('process identity', () => {
  it('читает birth текущего и child процесса, затем распознаёт завершённый child', async () => {
    const own = await currentLeaseIdentity();
    expect(await probeLease(own)).toBe('same');
    const child = spawn(
      process.execPath,
      ['-e', 'setTimeout(() => {}, 10000)'],
      { stdio: 'ignore' },
    );
    try {
      expect(child.pid).toBeTypeOf('number');
      expect(await processStartedAt(child.pid!)).toBeDefined();
    } finally {
      child.kill('SIGKILL');
      await once(child, 'exit');
    }
    expect(await processStartedAt(child.pid!)).toBeUndefined();
  }, 30_000);
});
