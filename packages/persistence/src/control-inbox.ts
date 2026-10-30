import { randomUUID } from 'node:crypto';
import { mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import {
  decodeControlReceipt,
  decodeControlRequest,
  type ControlReceipt,
  type ControlRequest,
} from '@music-downloader/shared';
import { readJsonIfPresent, writeAtomicJson } from './atomic-json.js';

export class ControlInbox {
  public constructor(private readonly directory: string) {}
  public async send(
    request: Omit<ControlRequest, 'requestId' | 'createdAt'>,
  ): Promise<ControlRequest> {
    const item = decodeControlRequest({
      command: request.command,
      requestId: randomUUID(),
      createdAt: new Date().toISOString(),
    });
    await writeAtomicJson(
      path.join(this.directory, 'requests', `${item.requestId}.json`),
      JSON.stringify(item),
    );
    return item;
  }
  public async list(): Promise<readonly ControlRequest[]> {
    const folder = path.join(this.directory, 'requests');
    try {
      const files = await readdir(folder);
      return Promise.all(
        files
          .filter((file) => file.endsWith('.json'))
          .sort()
          .map(async (file) =>
            decodeControlRequest(
              JSON.parse((await readJsonIfPresent(path.join(folder, file)))!),
            ),
          ),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  }
  public async acknowledge(receipt: ControlReceipt): Promise<void> {
    await writeAtomicJson(
      path.join(this.directory, 'acks', `${receipt.requestId}.json`),
      JSON.stringify(decodeControlReceipt(receipt)),
    );
  }
  public async receipt(requestId: string): Promise<ControlReceipt | undefined> {
    const value = await readJsonIfPresent(
      path.join(this.directory, 'acks', `${requestId}.json`),
    );
    return value === undefined
      ? undefined
      : decodeControlReceipt(JSON.parse(value));
  }
  public async remove(requestId: string): Promise<void> {
    await rm(path.join(this.directory, 'requests', `${requestId}.json`), {
      force: true,
    });
  }
  public async ensure(): Promise<void> {
    await mkdir(path.join(this.directory, 'requests'), {
      recursive: true,
      mode: 0o700,
    });
    await mkdir(path.join(this.directory, 'acks'), {
      recursive: true,
      mode: 0o700,
    });
  }
}
