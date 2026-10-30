import { createServer } from 'node:https';
import { request } from 'node:https';
import { Readable } from 'node:stream';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

/** Изолированный HTTPS fixture доверяет только своему временному CA; shipping TLS не меняется. */
export async function fixtureServer(directory, route) {
  const key = path.join(directory, 'fixture-key.pem');
  const cert = path.join(directory, 'fixture-cert.pem');
  const created = spawnSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-days',
      '1',
      '-subj',
      '/CN=localhost',
      '-addext',
      'subjectAltName=DNS:localhost',
      '-keyout',
      key,
      '-out',
      cert,
    ],
    { encoding: 'utf8' },
  );
  if (created.status !== 0) throw new Error('Не создан fixture CA');
  const ca = await readFile(cert);
  const server = createServer({ key: await readFile(key), cert: ca }, route);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const origin = `https://localhost:${server.address().port}`;
  const fetch = (url, options) =>
    new Promise((resolve, reject) => {
      const call = request(
        url,
        {
          ca,
          signal: options?.signal,
          lookup: (_host, options, done) =>
            options.all
              ? done(null, [{ address: '127.0.0.1', family: 4 }])
              : done(null, '127.0.0.1', 4),
        },
        (response) => {
          const headers = new Headers();
          for (const [name, value] of Object.entries(response.headers))
            if (value !== undefined)
              headers.set(name, Array.isArray(value) ? value.join(',') : value);
          resolve(
            new Response(Readable.toWeb(response), {
              status: response.statusCode,
              headers,
            }),
          );
        },
      );
      call.once('error', reject);
      call.end();
    });
  return {
    origin,
    fetch,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
