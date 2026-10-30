import { describe, expect, it, vi } from 'vitest';
import {
  CommandRefusalError,
  PermissionError,
  type ControlRequest,
  type LeaseState,
} from '@music-downloader/shared';
import { createDownloadManager } from './manager.js';
import { managerFixture } from './fixtures/manager-fixture.js';

/**  Изолирует отказ acquire от алгоритмов аренды и inbox. */
async function foreignOwner(
  lease: LeaseState,
  state: 'running' | 'paused' = 'running',
) {
  const fixture = managerFixture(1);
  await fixture.create('job');
  const manifest = (await fixture.deps.store.read('job'))!;
  const sendControl = vi.fn(
    async (_id: string, input: { command: ControlRequest['command'] }) => ({
      ...input,
      requestId: 'request',
      createdAt: manifest.createdAt,
    }),
  );
  const waitControlAck = vi.fn(fixture.deps.store.waitControlAck);
  fixture.deps.store = {
    ...fixture.deps.store,
    acquire: async () => {
      throw new PermissionError();
    },
    read: async () => ({ ...manifest, control: { state } }),
    readLeaseState: async () => lease,
    sendControl,
    waitControlAck,
  };
  return {
    fixture,
    sendControl,
    waitControlAck,
    manager: createDownloadManager(fixture.deps),
  };
}

describe('причины отказа команды чужому владельцу', () => {
  it.each(['inactive', 'unknown', 'error'] as const)(
    'не помечает таймаут при наблюдении %s',
    async (lease) => {
      const value = await foreignOwner(lease === 'error' ? 'unknown' : lease);
      if (lease === 'error')
        value.fixture.deps.store.readLeaseState = async () => {
          throw new PermissionError();
        };
      const error = await value.manager
        .command('job', 'resume')
        .catch((failure: unknown) => failure);
      expect(error).toMatchObject({ code: 'DOWNLOAD_ERROR', retryable: false });
      expect(error).not.toBeInstanceOf(CommandRefusalError);
      expect(error).not.toHaveProperty('reason');
      expect(value.sendControl).toHaveBeenCalledOnce();
    },
  );

  it('отклоняет resume running job при active lease до записи inbox', async () => {
    const value = await foreignOwner('active');
    await expect(value.manager.command('job', 'resume')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      reason: 'LEASE_HELD_BY_OTHER_OWNER',
      retryable: false,
    });
    expect(value.sendControl).not.toHaveBeenCalled();
  });

  it('пересылает resume paused job и возвращает обновлённый manifest', async () => {
    const value = await foreignOwner('active', 'paused');
    value.waitControlAck.mockImplementation(async () => {
      const manifest = (await value.fixture.deps.store.read('job'))!;
      value.fixture.deps.store.read = async () => ({
        ...manifest,
        control: { state: 'running' },
      });
      return {
        requestId: 'request',
        accepted: true,
        completedAt: manifest.updatedAt,
      };
    });
    await expect(value.manager.command('job', 'resume')).resolves.toMatchObject(
      { control: { state: 'running' } },
    );
    expect(value.sendControl).toHaveBeenCalledWith('job', {
      command: 'resume',
    });
  });

  it.each(['resume', 'pause', 'cancel', 'retry'] as const)(
    'помечает только отсутствие подтверждения для %s',
    async (command) => {
      const value = await foreignOwner('active', 'paused');
      await expect(value.manager.command('job', command)).rejects.toMatchObject(
        {
          code: 'DOWNLOAD_ERROR',
          reason: 'OWNER_ACK_TIMEOUT',
          retryable: false,
        },
      );
      expect(value.sendControl).toHaveBeenCalledWith('job', { command });
    },
  );

  it.each([
    ['pause', 'VALIDATION_ERROR'],
    ['cancel', 'DOWNLOAD_ERROR'],
    ['retry', 'AUTH_ERROR'],
    ['resume', 'AUTH_ERROR'],
  ] as const)(
    'сохраняет отказ владельца для %s с кодом %s',
    async (command, code) => {
      const value = await foreignOwner('active', 'paused');
      value.waitControlAck.mockResolvedValue({
        requestId: 'request',
        accepted: false,
        completedAt: '2026-01-01T00:00:00.000Z',
        error: {
          code,
          message: 'ownerToken=секрет; pid=123; hostname=хост; /raw/path',
          retryable: false,
        },
      });
      const error = await value.manager
        .command('job', command)
        .catch((failure: unknown) => failure);
      expect(error).toMatchObject({ code, retryable: false });
      expect(error).not.toHaveProperty('reason');
      expect(JSON.stringify(error)).not.toMatch(/ownerToken|pid|hostname|raw/);
    },
  );
});
