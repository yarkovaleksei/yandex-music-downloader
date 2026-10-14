import http from 'node:http';
import https from 'node:https';
import { StringDecoder } from 'node:string_decoder';

// Сохраняются только известные коды и категории, без raw errors, URL из ошибок и env values.
// Это диагностические признаки; YN0001 сам по себе не доказывает сетевую первопричину.
// @link https://yarnpkg.com/advanced/error-codes
const nativeCodes = [
  'ENOENT',
  'EACCES',
  'EPERM',
  'EBUSY',
  'ENOSPC',
  'ENAMETOOLONG',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'CERT_HAS_EXPIRED',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
];
export const safeNativeError = (code) =>
  nativeCodes.includes(code) ? code : 'UNCLASSIFIED_PROCESS_ERROR';
export function createPreparationDiagnostics({ captureVersion = false } = {}) {
  const codes = new Set(),
    markers = new Set();
  const decoders = {
    stdout: new StringDecoder('utf8'),
    stderr: new StringDecoder('utf8'),
  };
  const tails = { stdout: '', stderr: '' };
  let version;
  function inspect(text, stream) {
    for (const match of text.matchAll(/\bYN\d{4}\b/g)) codes.add(match[0]);
    for (const code of nativeCodes)
      if (new RegExp('\\b' + code + '\\b').test(text)) codes.add(code);
    if (/Cannot find matching keyid/i.test(text))
      markers.add('COREPACK_SIGNATURE_KEY_MISMATCH');
    if (
      /Error when performing the request|RequestError|fetch failed/i.test(text)
    )
      markers.add('REQUEST_FAILED');
    if (
      /self[- ]signed certificate|unable to verify.*certificate|certificate has expired/i.test(
        text,
      )
    )
      markers.add('CERTIFICATE_ERROR');
    if (
      /corepack(?:\.cmd)?.*(?:not recognized|not found|не является|не найден)/i.test(
        text,
      )
    )
      markers.add('COREPACK_COMMAND_NOT_FOUND');
    if (captureVersion && stream === 'stdout') {
      const line = text.trim();
      if (/^\d{1,3}\.\d{1,3}\.\d{1,3}(?:-[a-zA-Z0-9.-]{1,30})?$/.test(line))
        version = line;
    }
  }
  return {
    write(bytes, stream) {
      const text = tails[stream] + decoders[stream].write(bytes);
      inspect(text, stream);
      tails[stream] = text.slice(-8192);
    },
    finish() {
      for (const stream of ['stdout', 'stderr'])
        inspect(tails[stream] + decoders[stream].end(), stream);
      return {
        observedCodes: [...codes].sort(),
        observedMarkers: [...markers].sort(),
        ...(version ? { version } : {}),
      };
    },
  };
}

/** HEAD проверяет доступность DNS/TLS/HTTP; body/headers/IP/credentials не сохраняются. */
export async function probeEndpoint(address, timeoutMs = 10000) {
  const url = new URL(address),
    started = Date.now();
  return new Promise((resolve) => {
    let finished = false;
    const request = (url.protocol === 'https:' ? https : http).request(url, {
      method: 'HEAD',
    });
    const finish = (facts) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve({
        host: url.hostname,
        elapsedMs: Date.now() - started,
        ...facts,
      });
    };
    const timer = setTimeout(() => {
      finish({ reachable: false, code: 'PROBE_TIMEOUT' });
      request.destroy();
    }, timeoutMs);
    request.once('response', (response) => {
      response.resume();
      finish({ reachable: true, statusCode: response.statusCode });
    });
    request.once('error', (error) =>
      finish({ reachable: false, code: safeNativeError(error.code) }),
    );
    request.end();
  });
}
