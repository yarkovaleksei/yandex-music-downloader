import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ControlInbox } from './control-inbox.js';

describe('ControlInbox', () => {
  it('проецирует request и receipt без вложенных секретов (F-011)', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'control-inbox-'));
    try {
      const inbox = new ControlInbox(directory);
      const request = await inbox.send({
        command: 'pause',
        cookies: 'secret',
      } as never);
      await inbox.acknowledge({
        requestId: request.requestId,
        accepted: false,
        completedAt: request.createdAt,
        error: {
          code: 'DOWNLOAD_ERROR',
          message: 'safe',
          retryable: false,
          cause: 'secret',
        } as never,
      });
      const requestRaw = await readFile(
        path.join(directory, 'requests', `${request.requestId}.json`),
        'utf8',
      );
      const receiptRaw = await readFile(
        path.join(directory, 'acks', `${request.requestId}.json`),
        'utf8',
      );
      expect(requestRaw).not.toContain('secret');
      expect(receiptRaw).not.toContain('secret');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
