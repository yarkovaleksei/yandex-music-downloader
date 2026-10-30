import { expect, it, vi } from 'vitest';
const { expose, on, remove } = vi.hoisted(() => ({
  expose: vi.fn(),
  on: vi.fn(),
  remove: vi.fn(),
}));
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: expose },
  ipcRenderer: { invoke: vi.fn(), on, removeListener: remove },
}));
it('contextBridge публикует только desktopApi, subscribe снимает только свой listener', async () => {
  await import('../transport/preload.js');
  expect(expose).toHaveBeenCalledTimes(1);
  const [name, value] = expose.mock.calls[0] as [
    string,
    Record<string, unknown>,
  ];
  expect(name).toBe('desktopApi');
  for (const forbidden of ['invoke', 'require', 'process', 'ipcRenderer'])
    expect(value).not.toHaveProperty(forbidden);
  const unsubscribe = (value.subscribe as (listener: () => void) => () => void)(
    vi.fn(),
  );
  unsubscribe();
  expect(remove).toHaveBeenCalledWith(
    on.mock.calls[0]?.[0],
    on.mock.calls[0]?.[1],
  );
});
