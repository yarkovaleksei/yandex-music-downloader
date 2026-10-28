import path from 'node:path';
import { MessageChannelMain, utilityProcess } from 'electron';
import type { UtilityProcess } from 'electron';
import type { DesktopEvent, Method } from '../contract/desktop-api.js';
import { failure } from '../contract/result.js';
import { HostClient } from '../transport/host-client.js';

/** Ограниченный restart не повторяет незавершённые команды старого host (ADR-015/016). */
export class HostSupervisor {
  private process?: UtilityProcess;
  private client?: HostClient;
  private restarts = 0;
  private stopping = false;
  private restartTimer?: ReturnType<typeof setTimeout>;
  public constructor(
    private readonly onEvent: (event: DesktopEvent) => void,
    private readonly hostFile = path.resolve(
      import.meta.dirname,
      '../host/index.js',
    ),
  ) {}
  public start(): void {
    const child = utilityProcess.fork(this.hostFile, [], {
      serviceName: 'Music Downloader application',
      stdio: 'ignore',
    });
    this.process = child;
    const { port1, port2 } = new MessageChannelMain();
    this.client = new HostClient(port1, this.onEvent);
    child.on('exit', () => {
      if (this.process !== child) return;
      this.client?.close();
      this.client = undefined;
      this.process = undefined;
      this.onEvent({ event: 'host.status', connected: false });
      if (!this.stopping && this.restarts++ < 2)
        this.restartTimer = setTimeout(() => this.start(), 500);
    });
    child.postMessage({ v: 1 }, [port2]);
  }
  public invoke(method: Method, payload: unknown): Promise<unknown> {
    return (
      this.client?.invoke(method, payload) ?? Promise.resolve(failure(method))
    );
  }
  public async close(): Promise<void> {
    this.stopping = true;
    clearTimeout(this.restartTimer);
    const child = this.process;
    if (this.client) await this.client.invoke('shutdown');
    this.client?.close();
    this.client = undefined;
    this.process = undefined;
    child?.kill();
  }
}
