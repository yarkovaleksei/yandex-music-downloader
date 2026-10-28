import { expect, it, vi } from 'vitest';
import { HostClient } from './host-client.js';
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
    client.close();
    expect(await second).toMatchObject({ kind: 'error' });
    expect(await client.invoke('account')).toMatchObject({ kind: 'error' });
    expect(port.postMessage).toHaveBeenCalledTimes(2);
  } finally {
    vi.useRealTimers();
  }
});
