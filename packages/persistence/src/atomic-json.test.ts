import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import type * as FsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const control = vi.hoisted(() => ({
  renameCalls: [] as Array<{ temporary: string; target: string }>,
  failuresLeft: 0,
  failureCode: 'EPERM',
  terminalError: undefined as Error | undefined,
  beforeSuccess: undefined as (() => Promise<void>) | undefined,
  writes: 0,
  syncs: 0,
  closes: 0,
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromises>();
  return {
    ...actual,
    async rename(temporary: string, target: string) {
      control.renameCalls.push({ temporary, target });
      if (control.failuresLeft > 0) {
        control.failuresLeft -= 1;
        const error = Object.assign(
          new Error('Временная блокировка rename в тесте'),
          {
            code: control.failureCode,
          },
        );
        control.terminalError = error;
        throw error;
      }
      await control.beforeSuccess?.();
      return actual.rename(temporary, target);
    },
    async open(...args: Parameters<typeof actual.open>) {
      const handle = await actual.open(...args);
      return new Proxy(handle, {
        get(target, property, receiver) {
          if (property === 'writeFile')
            return async (
              ...writeArgs: Parameters<typeof handle.writeFile>
            ) => {
              control.writes += 1;
              return target.writeFile(...writeArgs);
            };
          if (property === 'sync')
            return async () => {
              control.syncs += 1;
              return target.sync();
            };
          if (property === 'close')
            return async () => {
              control.closes += 1;
              return target.close();
            };
          return Reflect.get(target, property, receiver);
        },
      });
    },
  };
});

import { writeAtomicJson } from './atomic-json.js';

function resetControl(): void {
  control.renameCalls = [];
  control.failuresLeft = 0;
  control.failureCode = 'EPERM';
  control.terminalError = undefined;
  control.beforeSuccess = undefined;
  control.writes = 0;
  control.syncs = 0;
  control.closes = 0;
}

async function withPlatform<T>(
  platform: NodeJS.Platform,
  run: () => Promise<T>,
) {
  const original = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: platform });
  try {
    return await run();
  } finally {
    Object.defineProperty(process, 'platform', original!);
  }
}

afterEach(() => {
  vi.useRealTimers();
  resetControl();
});

describe('writeAtomicJson', () => {
  it.each(['EPERM', 'EBUSY'] as const)(
    'на Windows публикует целый snapshot после четырёх %s',
    async (code) => {
      const directory = await mkdtemp(path.join(os.tmpdir(), 'atomic-json-'));
      const target = path.join(directory, 'state.json');
      const before = JSON.stringify({ version: 'old' });
      const next = JSON.stringify({ version: 'new' });
      const delays: number[] = [];
      await writeFile(target, before);
      control.failuresLeft = 4;
      control.failureCode = code;
      control.beforeSuccess = async () => {
        expect(JSON.parse(await readFile(target, 'utf8'))).toEqual({
          version: 'old',
        });
      };
      const timer = vi.spyOn(globalThis, 'setTimeout');
      try {
        const written = withPlatform('win32', () =>
          writeAtomicJson(target, next),
        );
        await written;
        for (const call of timer.mock.calls) delays.push(Number(call[1]));
        expect(delays).toEqual([50, 100, 200, 400]);
        expect(control.renameCalls).toHaveLength(5);
        expect(
          new Set(control.renameCalls.map(({ temporary }) => temporary)).size,
        ).toBe(1);
        expect(
          new Set(control.renameCalls.map(({ target }) => target)),
        ).toEqual(new Set([target]));
        expect([control.writes, control.syncs, control.closes]).toEqual([
          1, 1, 1,
        ]);
        expect(JSON.parse(await readFile(target, 'utf8'))).toEqual({
          version: 'new',
        });
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  );

  it.each(['EPERM', 'EBUSY'] as const)(
    'на Windows сохраняет прежний snapshot и исходный %s после пяти попыток',
    async (code) => {
      const directory = await mkdtemp(path.join(os.tmpdir(), 'atomic-json-'));
      const target = path.join(directory, 'state.json');
      await writeFile(target, JSON.stringify({ version: 'old' }));
      control.failuresLeft = 5;
      control.failureCode = code;
      try {
        const written = withPlatform('win32', () =>
          writeAtomicJson(target, JSON.stringify({ version: 'new' })),
        );
        const error = await written.catch((value: unknown) => value);
        expect(error).toBe(control.terminalError);
        expect(control.renameCalls).toHaveLength(5);
        expect([control.writes, control.syncs, control.closes]).toEqual([
          1, 1, 1,
        ]);
        expect(JSON.parse(await readFile(target, 'utf8'))).toEqual({
          version: 'old',
        });
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  );

  it('не повторяет другую ошибку rename', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'atomic-json-'));
    const target = path.join(directory, 'state.json');
    await writeFile(target, JSON.stringify({ version: 'old' }));
    control.failuresLeft = 1;
    control.failureCode = 'EACCES';
    try {
      const error = await withPlatform('win32', () =>
        writeAtomicJson(target, JSON.stringify({ version: 'new' })),
      ).catch((value: unknown) => value);
      expect(error).toBe(control.terminalError);
      expect(control.renameCalls).toHaveLength(1);
      expect(JSON.parse(await readFile(target, 'utf8'))).toEqual({
        version: 'old',
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it.each(['EPERM', 'EBUSY'] as const)(
    'не повторяет %s вне Windows',
    async (code) => {
      const directory = await mkdtemp(path.join(os.tmpdir(), 'atomic-json-'));
      const target = path.join(directory, 'state.json');
      await writeFile(target, JSON.stringify({ version: 'old' }));
      control.failuresLeft = 1;
      control.failureCode = code;
      try {
        const error = await withPlatform('linux', () =>
          writeAtomicJson(target, JSON.stringify({ version: 'new' })),
        ).catch((value: unknown) => value);
        expect(error).toBe(control.terminalError);
        expect(control.renameCalls).toHaveLength(1);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
});
