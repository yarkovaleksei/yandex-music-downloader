import { expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ exits: [] as (() => void)[], forks: 0 }));
vi.mock('electron', () => ({
  utilityProcess: {
    fork: () => {
      state.forks++;
      return {
        on: (_name: string, listener: () => void) => state.exits.push(listener),
        postMessage: vi.fn(),
        kill: vi.fn(),
      };
    },
  },
  MessageChannelMain: class {
    public port1 = {
      on: vi.fn(),
      postMessage: vi.fn(),
      start: vi.fn(),
      close: vi.fn(),
    };
    public port2 = {};
  },
}));
import { HostSupervisor } from './host-supervisor.js';
it('ADR-015 ограничивает restart host и не отправляет команды потерянному процессу', async () => {
  vi.useFakeTimers();
  try {
    const events = vi.fn();
    const supervisor = new HostSupervisor(events, '/host.js');
    supervisor.start();
    for (let i = 0; i < 3; i++) {
      state.exits[i]?.();
      await vi.advanceTimersByTimeAsync(501);
    }
    expect(state.forks).toBe(3);
    expect(events).toHaveBeenCalledWith({
      event: 'host.status',
      connected: false,
    });
    expect(await supervisor.invoke('account', undefined)).toMatchObject({
      kind: 'error',
    });
    await supervisor.close();
  } finally {
    vi.useRealTimers();
  }
});
