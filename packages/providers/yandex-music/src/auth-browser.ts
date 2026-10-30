import { randomBytes } from 'node:crypto';
import { createServer, type Server, type ServerResponse } from 'node:http';
import { spawn } from 'node:child_process';
import { authIcon } from './auth-icon.js';
import { renderAuthPage, type ChallengeTiming } from './auth-page.js';

export interface AuthBrowser {
  open(url: string): Promise<void>;
}

export interface PrivateChallenge {
  readonly cancel: Promise<void>;
  complete(): void;
  close(): Promise<void>;
}

/** Страница и ресурсы доступны только внутри непредсказуемого пути challenge.
 * Deadline принадлежит authenticate, поэтому GET и reload не продлевают вход.
 */
export async function openPrivateChallenge(
  userCode: string,
  verificationUrl: string,
  timing: ChallengeTiming,
  browser: AuthBrowser = { open: systemBrowser },
): Promise<PrivateChallenge> {
  const path = `/${randomBytes(24).toString('base64url')}`;
  type Status = 'completed' | 'cancelled' | 'closed';
  let status: Status | undefined;
  const waiting = new Set<ServerResponse>();
  const sendStatus = (response: ServerResponse) => {
    response.writeHead(200, {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
    });
    response.end(JSON.stringify({ status }));
  };
  // Один ожидающий запрос получает только итог входа; credentials и код в ответ не входят.
  const finish = (next: Status) => {
    if (status) return;
    status = next;
    for (const response of waiting) sendStatus(response);
    waiting.clear();
  };
  const server: Server = createServer((request, response) => {
    if (request.url === path && request.method === 'GET') {
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer',
      });
      response.end(renderAuthPage(userCode, verificationUrl, path, timing));
      return;
    }
    if (request.url === `${path}/icon.png` && request.method === 'GET') {
      response.writeHead(200, {
        'content-type': 'image/png',
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer',
      });
      response.end(authIcon);
      return;
    }
    if (request.url === `${path}/status` && request.method === 'GET') {
      if (status) sendStatus(response);
      else {
        waiting.add(response);
        response.once('close', () => waiting.delete(response));
      }
      return;
    }
    if (request.url === `${path}/cancel` && request.method === 'POST') {
      response.writeHead(204, { 'cache-control': 'no-store' });
      response.end();
      finish('cancelled');
      cancel();
      return;
    }
    response.writeHead(404, { 'cache-control': 'no-store' });
    response.end();
  });
  let cancel!: () => void;
  const cancelled = new Promise<void>((resolve) => {
    cancel = resolve;
  });
  await new Promise<void>((resolve, reject) => {
    server!.once('error', reject);
    server!.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    await closeServer(server);
    throw new Error('unavailable');
  }
  try {
    await browser.open(`http://127.0.0.1:${address.port}${path}`);
  } catch (error) {
    await closeServer(server);
    throw error;
  }
  return {
    cancel: cancelled,
    complete: () => finish('completed'),
    close: () => {
      // Отказ/закрытие сервера не означает успешный вход; отвечаем перед остановкой listener.
      finish('closed');
      return closeServer(server);
    },
  };
}

async function systemBrowser(url: string): Promise<void> {
  const command =
    process.platform === 'win32'
      ? 'cmd'
      : process.platform === 'darwin'
        ? 'open'
        : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'ignore', detached: true });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}
