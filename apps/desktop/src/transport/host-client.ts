import { randomUUID } from 'node:crypto';
import { failure } from '../contract/result.js';
import type { DesktopEvent, Method } from '../contract/desktop-api.js';
import type { Port } from '../contract/host-protocol.js';

/** Таймаут не отменяет работу host и никогда не повторяет mutating command (ADR-016). */
export class HostClient {
  private readonly pending = new Map<
    string,
    {
      resolve: (value: unknown) => void;
      timer: ReturnType<typeof setTimeout> | undefined;
    }
  >();
  private connected = true;
  public constructor(
    private readonly port: Port,
    private readonly onEvent: (event: DesktopEvent) => void,
    private readonly timeoutMs = 30_000,
  ) {
    port.on('message', ({ data }) => {
      if (typeof data !== 'object' || data === null) return;
      const message = data as Record<string, unknown>;
      if (message.v !== 1) return;
      if (typeof message.id === 'string') {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(message.id);
        pending.resolve(message.result);
      } else if (typeof message.event === 'object' && message.event !== null)
        this.onEvent(message.event as DesktopEvent);
    });
    port.start();
  }
  public invoke(
    method: Method | 'shutdown',
    payload?: unknown,
  ): Promise<unknown> {
    if (!this.connected) return Promise.resolve(failure(method));
    const id = randomUUID();
    return new Promise((resolve) => {
      // Вход ждёт действий пользователя: его срок и отмена принадлежат provider.
      // Общий таймаут отбрасывал успешный ответ после сохранения credentials.
      const timer =
        method === 'authenticate'
          ? undefined
          : setTimeout(() => {
              this.pending.delete(id);
              resolve(failure(method, 'OUTCOME_UNKNOWN'));
            }, this.timeoutMs);
      this.pending.set(id, { resolve, timer });
      try {
        this.port.postMessage({ v: 1, id, method, payload });
      } catch {
        clearTimeout(timer);
        this.pending.delete(id);
        resolve(failure(method));
      }
    });
  }
  public close(): void {
    this.connected = false;
    for (const { resolve, timer } of this.pending.values()) {
      clearTimeout(timer);
      resolve(failure('host'));
    }
    this.pending.clear();
    this.port.close();
  }
}
