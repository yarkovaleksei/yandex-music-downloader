import { expect, it, vi } from 'vitest';
import { HostClient } from './host-client.js';
import { failure, success } from '../contract/result.js';
import type { Port } from '../contract/host-protocol.js';
it('таймаут сообщает неизвестный исход, не повторяет команду и закрытие завершает pending', async () => {
  vi.useFakeTimers();
  try {
    const port: Port = {
      postMessage: vi.fn(),
      on: vi.fn(),
      start: vi.fn(),
      close: vi.fn(),
    };
    const client = new HostClient(port, vi.fn(), 20);
    const pending = client.invoke('cancel', { jobId: '1' });
    await vi.advanceTimersByTimeAsync(21);
    expect(await pending).toMatchObject({
      kind: 'error',
      error: { code: 'OUTCOME_UNKNOWN' },
    });
    expect(port.postMessage).toHaveBeenCalledTimes(1);
    const second = client.invoke('account');
    const auth = client.invoke('authenticate');
    client.close();
    expect(await auth).toMatchObject({
      kind: 'error',
      error: { code: 'HOST_UNAVAILABLE' },
    });
    expect(await second).toMatchObject({ kind: 'error' });
    expect(await client.invoke('account')).toMatchObject({ kind: 'error' });
    expect(port.postMessage).toHaveBeenCalledTimes(3);
  } finally {
    vi.useRealTimers();
  }
});

it.each([
  success('authenticate', { id: 'fixture', displayName: 'Пользователь' }),
  failure('authenticate', 'AUTH_ERROR'),
])(
  'вход дольше 30 секунд передаёт результат provider, а обычные команды сохраняют таймаут: $kind',
  async (result) => {
    vi.useFakeTimers();
    let client: HostClient | undefined;
    try {
      let receive!: (event: { data: unknown }) => void;
      const sent = vi.fn<(message: unknown) => void>();
      const port: Port = {
        postMessage: sent,
        on: (_event, listener) => {
          receive = listener;
        },
        start: vi.fn(),
        close: vi.fn(),
      };
      client = new HostClient(port, vi.fn());
      const auth = client.invoke('authenticate');
      const settled = vi.fn();
      void auth.then(settled);
      const account = client.invoke('account');

      await vi.advanceTimersByTimeAsync(30_001);
      expect(await account).toMatchObject({
        kind: 'error',
        error: { code: 'OUTCOME_UNKNOWN' },
      });
      expect(settled).not.toHaveBeenCalled();
      expect(sent).toHaveBeenCalledTimes(2);

      const request = sent.mock.calls[0]?.[0] as { id: string };
      receive({ data: { v: 1, id: request.id, result } });
      expect(await auth).toEqual(result);
      expect(sent).toHaveBeenCalledTimes(2);
    } finally {
      client?.close();
      vi.useRealTimers();
    }
  },
);
