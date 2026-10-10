import { open } from 'node:fs/promises';
// @ts-expect-error fs-native-extensions 1.5.1 не публикует декларации TypeScript.
import nativeExtensions from 'fs-native-extensions';

const fsNative = nativeExtensions as unknown as {
  tryLock(fd: number): boolean;
  unlock(fd: number): void;
};

/** Kernel lock живёт на постоянном mutex-файле: inode не удаляется до закрытия session. */
export class NativeJobLock {
  private constructor(
    private readonly handle: Awaited<ReturnType<typeof open>>,
  ) {}

  public static async tryAcquire(
    path: string,
  ): Promise<NativeJobLock | undefined> {
    const handle = await open(path, 'a+', 0o600);
    try {
      if (!fsNative.tryLock(handle.fd)) {
        await handle.close();
        return undefined;
      }
      return new NativeJobLock(handle);
    } catch (error) {
      await handle.close().catch(() => undefined);
      throw error;
    }
  }

  public async release(): Promise<void> {
    try {
      fsNative.unlock(this.handle.fd);
    } finally {
      await this.handle.close();
    }
  }
}
