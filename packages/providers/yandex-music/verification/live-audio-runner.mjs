import { YandexMusicProvider, PROVIDER_SCHEMA_VERSION } from '../dist/index.js';

/** Проверяет один разрешённый full поток без записи аудио или секретов на диск.
 * @link ../../../../planning/tasks/STEP-010.md
 */
export async function runLiveAudio(credentialStore) {
  const original = await credentialStore.read();
  let temporary = false;
  let stage = 'account';
  const modernPreview = [];
  const provider = new YandexMusicProvider({
    credentialStore,
    authInteraction: {
      notify: () => console.log('AUDIO_LIVE: BROWSER_CONFIRMATION_REQUIRED'),
    },
    fetch: async (url, init) => {
      const parsed = new URL(url);
      const path = parsed.pathname;
      const bucket =
        path === '/device/code' || path === '/token'
          ? 'oauth'
          : path.startsWith('/get-mp3/')
            ? 'cdn'
            : parsed.hostname === 'api.music.yandex.net'
              ? path === '/tracks'
                ? 'track'
                : path === '/get-file-info'
                  ? 'modern'
                  : path.endsWith('/download-info')
                    ? 'legacy'
                    : path === '/account/status'
                      ? 'account'
                      : 'link'
              : path.includes('download-info')
                ? 'link'
                : 'cdn';
      let response;
      try {
        response = await globalThis.fetch(url, init);
      } catch (error) {
        const known = [
          'ENOTFOUND',
          'ECONNRESET',
          'ETIMEDOUT',
          'ECONNREFUSED',
          'UND_ERR_CONNECT_TIMEOUT',
          'ERR_TLS_CERT_ALTNAME_INVALID',
          'ERR_SSL_WRONG_VERSION_NUMBER',
          'ERR_INVALID_URL',
          'ERR_INVALID_ARG_TYPE',
          'UND_ERR_INVALID_ARG',
          'CERT_HAS_EXPIRED',
          'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
          'UND_ERR_SOCKET',
        ];
        const observedCode = error?.cause?.code ?? error?.code;
        const code = known.includes(observedCode) ? observedCode : 'UNKNOWN';
        const names = ['TypeError', 'Error', 'AbortError', 'AggregateError'];
        const name = names.includes(error?.name) ? error.name : 'UNKNOWN';
        const credentialsInUrl = Boolean(parsed.username || parsed.password);
        const headerValues = Object.values(init.headers ?? {});
        const nonAsciiHeader = headerValues.some((value) =>
          [...value].some((character) => character.charCodeAt(0) > 127),
        );
        const redirectRejected =
          error?.cause?.message === 'unexpected redirect';
        console.error(
          `AUDIO_LIVE: FETCH_FAILURE (stage=${bucket}, code=${code}, type=${name}, urlCredentials=${credentialsInUrl}, nonAsciiHeader=${nonAsciiHeader}, redirectRejected=${redirectRejected})`,
        );
        throw error;
      }
      console.log(
        `AUDIO_LIVE: HTTP (stage=${bucket}, status=${response.status})`,
      );
      if ((bucket === 'link' || bucket === 'cdn') && response.ok) {
        const reader = response.clone().body?.getReader();
        const prefix = reader ? await reader.read() : undefined;
        const text = new TextDecoder().decode(prefix?.value?.subarray(0, 64));
        // Проба не хранит raw bytes; clone не задерживает чтение original response.
        if (reader) {
          void reader.cancel().catch(() => {});
          reader.releaseLock();
        }
        const format = text.trimStart().startsWith('<')
          ? 'xml'
          : text.trimStart().startsWith('{')
            ? 'json'
            : 'other';
        console.log(`AUDIO_LIVE: LINK_FORMAT (${format})`);
        if (format === 'xml') {
          const document = await response.clone().text();
          const present = ['host', 'path', 'ts', 's']
            .map(
              (field) =>
                `${field}=${new RegExp(`<${field}>([^<]+)</${field}>`).test(document)}`,
            )
            .join(',');
          console.log(`AUDIO_LIVE: LINK_FIELDS (${present})`);
        }
      }
      if (bucket === 'legacy' && response.ok) {
        const envelope = await response.clone().json();
        const flags = (
          Array.isArray(envelope?.result) ? envelope.result : []
        ).map((value) =>
          value.direct === true
            ? 'direct'
            : value.direct === false
              ? 'xml'
              : 'unknown',
        );
        console.log(`AUDIO_LIVE: LEGACY_LINK_FLAGS (${flags.join(',')})`);
      }
      if (path === '/get-file-info' && response.ok) {
        const envelope = await response.clone().json();
        const preview = envelope?.result?.downloadInfo?.preview;
        modernPreview.push(
          preview === false ? 'full' : preview === true ? 'preview' : 'unknown',
        );
      }
      return response;
    },
  });
  try {
    let account;
    try {
      account = await provider.getAccount();
    } catch (error) {
      if (error?.code !== 'AUTH_ERROR') throw error;
    }
    if (!account) {
      temporary = true;
      await provider.authenticate();
    }
    console.log('AUDIO_LIVE: ACCOUNT_READY');
    const trackId = '2224197';
    stage = 'variants';
    const variants = await provider.getAudioVariants(trackId);
    // Это выбор проверочного потока; продуктовые high/normal правила остаются core.
    const variant =
      variants.find((candidate) => candidate.codec === 'mp3') ?? variants[0];
    if (!variant) throw new Error('Нет разрешённого полного варианта');
    console.log(`AUDIO_LIVE: VARIANTS_READY (count=${variants.length})`);
    const controller = new AbortController();
    let opened;
    let bytesRead = 0;
    const sample = new Uint8Array(64);
    let sampleLength = 0;
    try {
      stage = 'open';
      opened = await provider.openAudioStream(trackId, variant.key, {
        signal: controller.signal,
      });
      if (opened.startOffset !== 0 || opened.container !== variant.container)
        throw new Error('Несогласованный полный поток');
      const reader = opened.stream.getReader();
      stage = 'full-read';
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (sampleLength < sample.length) {
            const prefix = value.subarray(0, sample.length - sampleLength);
            sample.set(prefix, sampleLength);
            sampleLength += prefix.length;
          }
          bytesRead += value.length;
        }
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
      if (
        !bytesRead ||
        (opened.contentLength !== undefined &&
          bytesRead !== opened.contentLength)
      )
        throw new Error('Неполный EOF');
    } finally {
      controller.abort();
    }
    console.log(
      `AUDIO_LIVE: FULL_EOF_PASS (bytes=${bytesRead}, contentLength=${opened.contentLength ?? 'unknown'}, container=${opened.container})`,
    );

    // Сохраняется только короткий RAM sample; suffix сравнивается byte-exact.
    const offset = 8;
    if (sampleLength <= offset) throw new Error('Недостаточный sample');
    const rangeController = new AbortController();
    let rangeResult;
    try {
      stage = 'range-open';
      const ranged = await provider.openAudioStream(trackId, variant.key, {
        signal: rangeController.signal,
        offset,
      });
      const expectedStart = ranged.acceptsRanges ? offset : 0;
      if (
        ranged.startOffset !== expectedStart ||
        ranged.container !== opened.container
      )
        throw new Error('Несогласованный Range fallback');
      const expected = sample.subarray(expectedStart, sampleLength);
      const reader = ranged.stream.getReader();
      stage = 'range-read';
      let matched = 0;
      try {
        while (matched < expected.length) {
          const { done, value } = await reader.read();
          if (done) throw new Error('Неполный Range sample');
          const length = Math.min(value.length, expected.length - matched);
          for (let index = 0; index < length; index += 1)
            if (value[index] !== expected[matched + index])
              throw new Error('Несовпадение Range bytes');
          matched += length;
        }
      } finally {
        rangeController.abort();
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
      rangeResult = {
        acceptsRanges: ranged.acceptsRanges,
        startOffset: ranged.startOffset,
        matchedBytes: matched,
      };
    } finally {
      rangeController.abort();
    }
    console.log(
      `AUDIO_LIVE: RANGE_SAMPLE_PASS (acceptsRanges=${rangeResult.acceptsRanges}, startOffset=${rangeResult.startOffset}, matchedBytes=${rangeResult.matchedBytes})`,
    );
    const modernEligibleObserved = modernPreview.includes('full');
    console.log(
      `AUDIO_LIVE: MODERN_PREVIEW_OBSERVATION (${modernEligibleObserved ? 'reported-full' : 'not-confirmed-full'})`,
    );
    const observations = {
      capturedAt: new Date().toISOString(),
      sdkVersion: '0.3.0',
      schemaVersion: PROVIDER_SCHEMA_VERSION,
      variant: {
        codec: variant.codec,
        container: variant.container,
        bitrate: variant.bitrate,
        lossless: variant.lossless,
      },
      variantsCount: variants.length,
      bytesRead,
      contentLength: opened.contentLength,
      range: rangeResult,
      modernPreview: [...new Set(modernPreview)],
      limitations:
        'Один аккаунт и один full трек; modern preview observation не является чтением encraw. Отрицательные/encraw случаи в offline tests synthetic. URL/ключи/headers/credentials и аудиобайты не сохраняются.',
    };
    console.log(`AUDIO_LIVE: PASS (schema=${PROVIDER_SCHEMA_VERSION})`);
    return observations;
  } catch (error) {
    console.error(`AUDIO_LIVE: FAILED_STAGE (${stage})`);
    throw error;
  } finally {
    if (temporary) {
      await provider.logout();
      if (original !== null) await credentialStore.write(original);
      console.log('AUDIO_LIVE: TEMPORARY_SESSION_CLEANUP_PASS');
    }
  }
}
