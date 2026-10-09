/**
 * Одноразовый STEP-005: только чтение каталога и ограниченных префиксов аудио.
 * Секреты остаются в памяти; @link ../../../../planning/tasks/STEP-005.md.
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { Client, decryptEncraw } from '@dvxch/yandex-music';

const PREFIX_LIMIT = 1024 * 1024;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const enums = {
  phase: [
    'auth',
    'catalog',
    'variants',
    'range',
    'ttl',
    'limits',
    'network',
    'run',
  ],
  status: [
    'started',
    'waiting',
    'confirmed',
    'completed',
    'failed',
    'skipped',
    'observed',
  ],
  service: ['oauth', 'api', 'cdn'],
  method: ['GET', 'POST'],
  account: ['A'],
  source: ['legacy', 'file-info'],
  codec: ['mp3', 'aac', 'flac', 'flac-mp4', 'aac-mp4', 'he-aac', 'unknown'],
  container: ['mp3', 'adts', 'flac', 'mp4', 'ogg', 'unknown'],
  transport: ['raw', 'encraw', 'unknown'],
  preview: ['yes', 'no', 'unknown'],
  reason: [
    'unavailable',
    'preview',
    'ambiguous',
    'no-tracks',
    'no-playlist',
    'browser-open-failed',
    'no-device-code',
    'no-token',
    'authorization-pending',
    'invalid-client',
    'invalid-grant',
    'access-denied',
    'expired-token',
    'timeout',
    'network',
    'request-failed',
    'rate-limited',
    'server-error',
    'body-limit',
    'stopped',
    'invalid-arguments',
    'empty',
    'no-eligible-variant',
  ],
  errorType: [
    'BadRequestError',
    'UnauthorizedError',
    'ForbiddenError',
    'NotFoundError',
    'DeviceAuthError',
    'TimedOutError',
    'NetworkError',
    'AbortError',
    'TimeoutError',
    'Error',
  ],
  expiry: ['not-observed', 'gone', 'rejected-old-link', 'other-failure'],
};
const numbers = new Set([
  'httpStatus',
  'elapsedMs',
  'elapsedSeconds',
  'expiresIn',
  'confirmationPort',
  'intervalSeconds',
  'bitrate',
  'size',
  'bytesRead',
  'durationMs',
  'count',
  'apiRequests',
  'cdnRequests',
  'concurrency',
  'retryAfterSeconds',
]);
const booleans = new Set([
  'accountConfirmed',
  'available',
  'premiumAvailable',
  'fullWithoutPermission',
  'refreshPresent',
  'refreshSucceeded',
  'keyPresent',
  'lossless',
  'urlChanged',
  'freshLinkWorks',
  'rangeHonored',
]);
const ids = new Set(['trackId', 'albumId', 'playlistKind']);

/** Белый список защищает и обычный вывод, и ошибки: модели/URL не сериализуются. */
export function projectEvidence(record) {
  const result = {};
  for (const [key, value] of Object.entries(record)) {
    if (enums[key]?.includes(value)) result[key] = value;
    else if (
      numbers.has(key) &&
      typeof value === 'number' &&
      Number.isFinite(value) &&
      value >= 0
    )
      result[key] = value;
    else if (booleans.has(key) && typeof value === 'boolean')
      result[key] = value;
    else if (ids.has(key) && /^(?:\d{1,20})(?::\d{1,20})?$/.test(String(value)))
      result[key] = String(value);
    else if (
      key === 'contentRange' &&
      typeof value === 'string' &&
      /^bytes \d+-\d+\/(?:\d+|\*)$/.test(value)
    )
      result[key] = value;
    else if (key === 'acceptRanges' && ['bytes', 'none'].includes(value))
      result[key] = value;
  }
  return result;
}

export function failureEvidence(error, phase) {
  const message = typeof error?.message === 'string' ? error.message : '';
  let reason = 'request-failed';
  for (const [fragment, code] of [
    ['invalid_client', 'invalid-client'],
    ['invalid_grant', 'invalid-grant'],
    ['access_denied', 'access-denied'],
    ['expired_token', 'expired-token'],
    ['authorization_pending', 'authorization-pending'],
  ]) {
    if (message.includes(fragment)) reason = code;
  }
  if (['AbortError', 'TimeoutError', 'TimedOutError'].includes(error?.name))
    reason = 'timeout';
  return projectEvidence({
    phase,
    status: 'failed',
    errorType: error?.name,
    reason,
  });
}

/** Отсутствующий preview-флаг означает неизвестность, а не разрешение загрузки. */
export function probePermission(track, variant) {
  if (track.available !== true) return 'unavailable';
  if (variant.preview === true) return 'preview';
  if (variant.preview !== false) return 'ambiguous';
  return null;
}

export function identifyContainer(bytes) {
  const prefix = Buffer.from(bytes);
  if (prefix.subarray(0, 4).toString('ascii') === 'fLaC') return 'flac';
  if (prefix.subarray(0, 4).toString('ascii') === 'OggS') return 'ogg';
  if (prefix.subarray(4, 8).toString('ascii') === 'ftyp') return 'mp4';
  if (prefix.subarray(0, 3).toString('ascii') === 'ID3') return 'mp3';
  if (prefix[0] === 0xff && (prefix[1] & 0xf6) === 0xf0) return 'adts';
  if (prefix[0] === 0xff && (prefix[1] & 0xe0) === 0xe0) return 'mp3';
  return 'unknown';
}

function emit(record) {
  process.stdout.write(`${JSON.stringify(projectEvidence(record))}\n`);
}

function makeClient() {
  const state = {
    apiRequests: 0,
    cdnRequests: 0,
    lastPreview: undefined,
    limited: false,
  };
  const client = new Client({
    retries: 0,
    reportUnknownFields: false,
    fetch: async (url, init) => {
      const origin = new URL(url).hostname;
      const service =
        origin === 'oauth.yandex.ru'
          ? 'oauth'
          : origin === 'api.music.yandex.net'
            ? 'api'
            : 'cdn';
      if (service === 'api') state.apiRequests += 1;
      if (service === 'cdn') state.cdnRequests += 1;
      const started = Date.now();
      const response = await fetch(url, {
        ...init,
        signal: AbortSignal.any([init.signal, AbortSignal.timeout(20_000)]),
      });
      if (response.status === 429 || response.status >= 500)
        state.limited = true;
      emit({
        phase: 'network',
        service,
        method: init.method,
        httpStatus: response.status,
        elapsedMs: Date.now() - started,
      });
      if (new URL(url).pathname === '/get-file-info' && response.ok) {
        // Модель 0.3.0 не переносит preview: проверяем этот флаг до преобразования.
        const envelope = await response.clone().json();
        state.lastPreview = envelope?.result?.downloadInfo?.preview;
      }
      return response;
    },
  });
  client.request.timeout = 20_000;
  return { client, state };
}

/** Страница содержит только одноразовый user code, никогда access/device token. */
async function confirmInBrowser(code, signal) {
  const escape = (value) =>
    String(value).replace(
      /[&<>"']/g,
      (char) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[char],
    );
  const verification = new URL(code.verificationUrl);
  if (
    verification.protocol !== 'https:' ||
    !['oauth.yandex.ru', 'oauth.yandex.com', 'ya.ru'].includes(
      verification.hostname,
    )
  )
    throw new Error('invalid verification origin');
  const html = `<!doctype html><meta charset="utf-8"><title>STEP-005: вход</title><h1>Подтверждение Яндекс Музыки</h1><p>Введите код <strong>${escape(code.userCode)}</strong> на странице Яндекса.</p><p><a target="_blank" rel="noreferrer" href="${escape(verification.href)}">Открыть страницу Яндекса</a></p><p>Пароль вводится только на сайте Яндекса. Токен остаётся в памяти research-процесса.</p>`;
  const server = createServer((request, response) => {
    if (request.url !== '/' || request.method !== 'GET') {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    response.end(html);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  const close = () => server.close();
  signal.addEventListener('abort', close, { once: true });
  const opener =
    process.platform === 'darwin'
      ? 'open'
      : process.platform === 'win32'
        ? 'explorer.exe'
        : 'xdg-open';
  const browser = spawn(opener, [`http://127.0.0.1:${port}/`], {
    detached: true,
    stdio: 'ignore',
  });
  browser.on('error', () =>
    emit({ phase: 'auth', status: 'failed', reason: 'browser-open-failed' }),
  );
  browser.unref();
  emit({
    phase: 'auth',
    status: 'waiting',
    confirmationPort: port,
    expiresIn: code.expiresIn,
    intervalSeconds: code.interval,
  });
  return close;
}

async function authenticate(client, signal) {
  emit({ phase: 'auth', status: 'started' });
  const code = await client.requestDeviceCode(
    undefined,
    'MusicDownloader STEP-005',
  );
  if (!code.deviceCode || !code.userCode || !code.verificationUrl)
    throw new Error('no device code');
  const close = await confirmInBrowser(code, signal);
  const interval = Math.max(5, code.interval ?? 5);
  const deadline = Date.now() + Math.min(code.expiresIn ?? 600, 600) * 1000;
  let token;
  try {
    while (!signal.aborted && Date.now() < deadline) {
      token = await client.pollDeviceToken(code.deviceCode);
      if (token?.accessToken) break;
      await sleep(interval * 1000);
    }
  } finally {
    close();
  }
  if (!token?.accessToken)
    throw new DOMException('authorization incomplete', 'TimeoutError');
  client.token = token.accessToken;
  // В 0.3.0 смена client.token не обновляет сохранённый заголовок transport.
  client.request.setAuthorization(token.accessToken);
  await client.init();
  const uid = client.accountUid;
  if (!uid) throw new Error('account not identified');
  emit({
    phase: 'auth',
    status: 'confirmed',
    account: 'A',
    accountConfirmed: true,
    expiresIn: token.expiresIn,
    refreshPresent: Boolean(token.refreshToken),
  });
  if (token.refreshToken) {
    try {
      const refreshed = await client.refreshAccessToken(token.refreshToken);
      if (!refreshed.accessToken) throw new Error('no token');
      client.token = refreshed.accessToken;
      client.request.setAuthorization(refreshed.accessToken);
      await client.init();
      emit({
        phase: 'auth',
        status: 'completed',
        account: 'A',
        accountConfirmed: client.me?.account?.uid === uid,
        refreshSucceeded: client.me?.account?.uid === uid,
        expiresIn: refreshed.expiresIn,
      });
    } catch (error) {
      // Наблюдаемый отказ refresh не отменяет доказанный вход исходным токеном.
      emit({ ...failureEvidence(error, 'auth'), refreshSucceeded: false });
      client.token = token.accessToken;
      client.request.setAuthorization(token.accessToken);
    }
  }
}

async function catalog(client, requested) {
  let idsToRead = requested;
  if (!idsToRead.length) {
    const likes = await client.usersLikesTracks();
    idsToRead = (likes?.tracks ?? [])
      .slice(0, 3)
      .map((track) => String(track.id));
  }
  const tracks = idsToRead.length ? await client.tracks(idsToRead) : [];
  if (!tracks.length) throw new Error('no tracks');
  for (const track of tracks)
    emit({
      phase: 'catalog',
      status: 'observed',
      trackId: track.id,
      available: track.available,
      premiumAvailable: track.availableForPremiumUsers,
      fullWithoutPermission: track.availableFullWithoutPermission,
      durationMs: track.durationMs,
    });
  const albumId = tracks[0].albums?.[0]?.id;
  if (albumId) {
    const albums = await client.albums(albumId);
    emit({
      phase: 'catalog',
      status: albums.length ? 'completed' : 'failed',
      albumId,
      count: albums.length,
    });
  }
  const playlists = await client.usersPlaylistsList();
  if (playlists[0]?.kind !== undefined) {
    const playlist = await client.usersPlaylists(playlists[0].kind);
    emit({
      phase: 'catalog',
      status: playlist ? 'completed' : 'failed',
      playlistKind: playlists[0].kind,
    });
  } else emit({ phase: 'catalog', status: 'skipped', reason: 'no-playlist' });
  return tracks;
}

/** Сохраняются только bytes в памяти; игнорирующий Range сервер тоже ограничен. */
async function prefixProbe(url, limit = PREFIX_LIMIT) {
  const started = Date.now();
  const response = await fetch(url, {
    headers: { Range: `bytes=0-${limit - 1}` },
    signal: AbortSignal.timeout(20_000),
  });
  const chunks = [];
  let total = 0;
  if (response.ok && response.body) {
    const reader = response.body.getReader();
    try {
      while (total < limit) {
        const { value, done } = await reader.read();
        if (done) break;
        const part = value.subarray(0, limit - total);
        chunks.push(part);
        total += part.length;
      }
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
  } else await response.body?.cancel();
  const range = response.headers.get('content-range');
  const retryAfter = response.headers.get('retry-after');
  const evidence = projectEvidence({
    httpStatus: response.status,
    elapsedMs: Date.now() - started,
    bytesRead: total,
    contentRange: range,
    acceptRanges: response.headers.get('accept-ranges'),
    rangeHonored:
      response.status === 206 && /^bytes 0-\d+\/(?:\d+|\*)$/.test(range ?? ''),
    retryAfterSeconds: /^\d+$/.test(retryAfter ?? '')
      ? Number(retryAfter)
      : undefined,
  });
  return { bytes: Buffer.concat(chunks), evidence };
}

async function variants(client, state, tracks, signal) {
  const eligible = [];
  for (const track of tracks) {
    if (signal.aborted || state.limited) break;
    const legacy = await client.tracksDownloadInfo(track.id);
    const infos = legacy.map((info) => ({
      track,
      info,
      source: 'legacy',
      preview: info.preview,
      codec: info.codec,
      bitrate: info.bitrateInKbps,
      transport: 'raw',
      refresh: async () => {
        const [current] = await client.tracks(track.id);
        const fresh = (await client.tracksDownloadInfo(track.id)).find(
          (v) =>
            v.codec === info.codec && v.bitrateInKbps === info.bitrateInKbps,
        );
        if (!fresh || probePermission(current ?? {}, fresh))
          throw new Error('access changed');
        return fresh.getDirectLink();
      },
    }));
    try {
      state.lastPreview = undefined;
      const modern = await client.tracksLosslessInfo(track.id);
      if (modern)
        infos.push({
          track,
          info: modern,
          source: 'file-info',
          preview: state.lastPreview,
          codec: modern.codec,
          bitrate: modern.bitrate,
          transport: modern.transport ?? 'unknown',
          refresh: async () => {
            const [current] = await client.tracks(track.id);
            state.lastPreview = undefined;
            const fresh = await client.tracksLosslessInfo(track.id);
            if (
              !fresh ||
              probePermission(current ?? {}, { preview: state.lastPreview })
            )
              throw new Error('access changed');
            return fresh.getDirectLink();
          },
        });
    } catch (error) {
      emit(failureEvidence(error, 'variants'));
    }
    for (const variant of infos) {
      if (signal.aborted || state.limited) break;
      emit({
        phase: 'variants',
        status: 'observed',
        trackId: track.id,
        source: variant.source,
        codec: variant.codec,
        bitrate: variant.bitrate,
        transport: variant.transport,
        size: variant.info.size,
        keyPresent: Boolean(variant.info.key),
        lossless: variant.info.isLossless,
        preview:
          variant.preview === true
            ? 'yes'
            : variant.preview === false
              ? 'no'
              : 'unknown',
      });
      const reason = probePermission(track, variant);
      if (reason) {
        emit({
          phase: 'variants',
          status: 'skipped',
          trackId: track.id,
          reason,
        });
        continue;
      }
      try {
        variant.url = await variant.info.getDirectLink();
        const { bytes, evidence } = await prefixProbe(variant.url);
        const plain =
          variant.transport === 'encraw' && variant.info.key
            ? decryptEncraw(bytes, variant.info.key)
            : bytes;
        emit({
          ...evidence,
          phase: 'range',
          status: 'observed',
          trackId: track.id,
          source: variant.source,
        });
        emit({
          phase: 'variants',
          status: 'observed',
          trackId: track.id,
          source: variant.source,
          container: identifyContainer(plain),
          bytesRead: bytes.length,
        });
        if (evidence.httpStatus === 429 || evidence.httpStatus >= 500)
          state.limited = true;
        if (evidence.httpStatus === 200 || evidence.httpStatus === 206)
          eligible.push(variant);
      } catch (error) {
        emit(failureEvidence(error, 'variants'));
      }
    }
  }
  return eligible;
}

async function limits(client, state, eligible, signal) {
  const before = state.apiRequests;
  let cdnRequests = 0;
  state.limited = false;
  for (const concurrency of [1, 4]) {
    for (
      let batch = 0;
      batch < 2 && !signal.aborted && !state.limited;
      batch += 1
    ) {
      await Promise.all(
        Array.from({ length: concurrency }, async () => {
          try {
            await client.accountStatus();
          } catch (error) {
            emit(failureEvidence(error, 'limits'));
          }
        }),
      );
      if (eligible[0] && cdnRequests + concurrency <= 8 && !state.limited) {
        await Promise.all(
          Array.from({ length: concurrency }, async () => {
            cdnRequests += 1;
            try {
              const { evidence } = await prefixProbe(eligible[0].url, 4096);
              if (evidence.httpStatus === 429 || evidence.httpStatus >= 500)
                state.limited = true;
              emit({
                ...evidence,
                phase: 'limits',
                status: 'observed',
                concurrency,
              });
            } catch (error) {
              emit(failureEvidence(error, 'limits'));
            }
          }),
        );
      }
    }
    emit({
      phase: 'limits',
      status: 'completed',
      concurrency,
      apiRequests: state.apiRequests - before,
      cdnRequests,
    });
    if (state.limited) break;
  }
}

async function ttl(variant, windowSeconds, signal) {
  if (!variant) {
    emit({ phase: 'ttl', status: 'skipped', reason: 'no-eligible-variant' });
    return;
  }
  const started = Date.now();
  const checkpoints = [
    ...new Set(
      [0, 60, 300, 900, 1800, 3600, windowSeconds].filter(
        (n) => n <= windowSeconds,
      ),
    ),
  ];
  for (const checkpoint of checkpoints) {
    while (!signal.aborted && Date.now() - started < checkpoint * 1000) {
      emit({
        phase: 'ttl',
        status: 'waiting',
        elapsedSeconds: Math.floor((Date.now() - started) / 1000),
      });
      await sleep(Math.min(30_000, checkpoint * 1000 - (Date.now() - started)));
    }
    if (signal.aborted) {
      emit({ phase: 'ttl', status: 'skipped', reason: 'stopped' });
      return;
    }
    try {
      const { evidence } = await prefixProbe(variant.url, 4096);
      const fresh = await variant.refresh();
      const refreshed = await prefixProbe(fresh, 4096);
      const oldWorks = [200, 206].includes(evidence.httpStatus);
      const freshLinkWorks = [200, 206].includes(refreshed.evidence.httpStatus);
      emit({
        ...evidence,
        phase: 'ttl',
        status: 'observed',
        elapsedSeconds: Math.floor((Date.now() - started) / 1000),
        source: variant.source,
        urlChanged: fresh !== variant.url,
        freshLinkWorks,
        expiry: oldWorks
          ? 'not-observed'
          : evidence.httpStatus === 410
            ? 'gone'
            : [401, 403].includes(evidence.httpStatus) && freshLinkWorks
              ? 'rejected-old-link'
              : 'other-failure',
      });
      if (
        evidence.httpStatus === 410 ||
        ([401, 403].includes(evidence.httpStatus) && freshLinkWorks)
      )
        break;
      if (evidence.httpStatus === 429 || evidence.httpStatus >= 500) break;
    } catch (error) {
      emit(failureEvidence(error, 'ttl'));
      break;
    }
  }
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      track: { type: 'string', multiple: true, default: [] },
      'window-seconds': { type: 'string', default: '3600' },
    },
  });
  const command = positionals[0];
  const windowSeconds = Number(values['window-seconds']);
  if (
    positionals.length !== 1 ||
    !['auth', 'catalog', 'variants', 'range', 'ttl', 'limits', 'all'].includes(
      command,
    ) ||
    !Number.isInteger(windowSeconds) ||
    windowSeconds < 0 ||
    windowSeconds > 86400 ||
    values.track.length > 3 ||
    values.track.some((id) => !/^\d{1,20}(?::\d{1,20})?$/.test(id))
  ) {
    emit({ phase: 'run', status: 'failed', reason: 'invalid-arguments' });
    process.exitCode = 1;
    return;
  }
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  const { client, state } = makeClient();
  try {
    await authenticate(client, controller.signal);
    if (command === 'auth') return;
    const tracks = await catalog(client, values.track);
    if (command === 'catalog') return;
    const eligible = await variants(client, state, tracks, controller.signal);
    if (['all', 'limits'].includes(command) && !state.limited)
      await limits(client, state, eligible, controller.signal);
    if (['all', 'ttl'].includes(command) && !state.limited)
      await ttl(eligible[0], windowSeconds, controller.signal);
    emit({
      phase: 'run',
      status: controller.signal.aborted ? 'skipped' : 'completed',
      count: eligible.length,
    });
  } finally {
    client.token = undefined;
    delete client.request.headers.Authorization;
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    emit(failureEvidence(error, 'run'));
    process.exitCode = 1;
  });
}
