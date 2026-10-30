import { createApplication } from '@music-downloader/application';
import { isMethod } from '../contract/desktop-api.js';
import { safeResult } from '../contract/result.js';
import { executeApplication } from './application-handler.js';
import type { Port } from '../contract/host-protocol.js';

/** utilityProcess — единственный Electron процесс, создающий application и stores. */
process.parentPort?.once('message', (event: { ports: Port[] }) => {
  const port = event.ports[0];
  if (!port) return;
  const api = createApplication({
    clientProfile: 'desktop',
    authInteraction: {
      notify(message) {
        port.postMessage({ v: 1, event: { event: 'auth.notice', message } });
      },
    },
  });
  const unsubscribe = api.subscribe((event) => {
    const projected = safeResult({ kind: 'result', data: event }, 'event') as {
      data?: unknown;
    };
    if (projected.data) port.postMessage({ v: 1, event: projected.data });
  });
  port.on('message', ({ data }) => {
    if (typeof data !== 'object' || data === null) return;
    const request = data as Record<string, unknown>;
    if (
      request.v !== 1 ||
      typeof request.id !== 'string' ||
      !(isMethod(request.method) || request.method === 'shutdown')
    )
      return;
    const method = request.method;
    void executeApplication(api, method, request.payload).then((result) => {
      port.postMessage({ v: 1, id: request.id, result });
      if (method === 'shutdown') {
        unsubscribe();
        port.close();
        process.exit(0);
      }
    });
  });
  port.start();
  port.postMessage({ v: 1, event: { event: 'host.status', connected: true } });
});
