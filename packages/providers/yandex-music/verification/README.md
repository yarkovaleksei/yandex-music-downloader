# STEP-008 manual verification

Сначала выполните `node packages/testing/scripts/run-yarn.mjs build`. Для isolated native canary используйте `node packages/persistence/verification/native-store-probe.mjs`; Linux protected default collection с непустым master password, locked backend и Windows/macOS требуют отдельного фактического evidence и остаются pending до ручного запуска.

В отдельной авторизованной сессии запускайте только provider flow через `runLiveAuth`; выводите только возвращённые stage labels. Composition создаёт отдельную запись keyring и удаляет её в `finally`; production namespace не используется.

```bash
node --input-type=module <<'JS'
import { randomUUID } from 'node:crypto';
import { Entry } from '@napi-rs/keyring';
import { CliCredentialStore } from '@music-downloader/persistence';
import { runLiveAuth } from './packages/providers/yandex-music/verification/live-auth-runner.mjs';

let store;
try {
  const entry = new Entry(
    'music-downloader.step008.live-canary',
    randomUUID(),
    { linux: { store: 'secret-service' } },
  );
  store = new CliCredentialStore(() => entry);
  const stages = await runLiveAuth(store);
  console.log(`LIVE_AUTH: PASS (${stages.join(', ')})`);
} catch {
  console.error('LIVE_AUTH: FAIL (безопасный статус)');
  process.exitCode = 1;
} finally {
  try {
    if (store) {
      await store.clear();
      console.log('LIVE_AUTH_CLEANUP: PASS');
    }
  } catch {
    console.error('LIVE_AUTH_CLEANUP: FAIL');
    process.exitCode = 1;
  }
}
JS
```

## STEP-009 — metadata и реальные fixtures

После build запустите `runLiveMetadata(store, fixtureDirectory)` из
`live-metadata-runner.mjs`, передав тот же native adapter через DI. Provider
не импортирует persistence. Для нового ручного прогона предпочтительна отдельная
canary запись keyring, как в примере выше; после проверки она удаляется.

Runner выполняет production `getTrack`, full `getAlbum` и собственный
`getPlaylist`, сохраняет allowlisted raw fixtures и provenance. Account/owner
данные заменяются псевдонимами, user cover и unused поля исключаются; headers,
credentials и signed URLs не записываются. Если runner создаёт временную auth
сессию, он очищает её и восстанавливает ранее существовавшую native запись.

Фактический прогон STEP-009: один собственный аккаунт, SDK `0.3.0`, schema
`1.0.0`; track — `available`, full album — 11 записей, playlist — 33 записи с
позициями 1..33. Command: Node composition с `CliCredentialStore` и
`runLiveMetadata`, exit `0`; безопасный captured output:

```text
METADATA_LIVE: ACCOUNT_READY
METADATA_LIVE: RAW_TRACK_PASS
METADATA_LIVE: TRACK_READY
METADATA_LIVE: RAW_ALBUM_PASS
METADATA_LIVE: ALBUM_READY
METADATA_LIVE: RAW_PLAYLIST_PASS
METADATA_LIVE: PASS (track=available, albumTracks=11, playlistTracks=33, schema=1.0.0)
METADATA_LIVE: TEMPORARY_SESSION_CLEANUP_PASS
```

Первые два прогона завершились безопасным `PROVIDER_RESPONSE_INVALID` до записи
fixtures; диагностика подтвердила valid raw track. Исправление public artwork
resource parser (точка в resource ID) позволило пройти projection. Неполные,
недоступные и malformed cases в offline tests — явно synthetic mutations;
они не доказывают фактическое поведение иных аккаунтов/регионов. Audio, TTL,
rate limits и повторная qualification keyring других ОС здесь не проверялись.

## STEP-010 — полный audio поток и Range

После build импортируйте `runLiveAudio` из `live-audio-runner.mjs` и передайте
`CliCredentialStore` через DI в отдельной Node composition. Runner проверяет
один разрешённый full трек: получает production variants, читает plaintext поток
до EOF, сравнивает размер при наличии `contentLength`, затем сравнивает короткий
sample при ненулевом offset либо фактическом full-start fallback. Аудио на диск
не записывается; в RAM остаётся только 64-byte sample, счётчик и текущий chunk.

Возвращённые observations можно сохранить как JSON: они содержат только
allowlisted codec/container/bitrate/lossless, counts, Range flags и provenance.
Credentials, URL, headers, ключи и raw body не входят в результат. Если вход
создаёт временную сессию, она очищается, а прежняя native запись восстанавливается
из RAM. Старые evidence STEP-008/009 сохраняют версии и даты своих прогона.

Modern API проверяется только в пределах production preview gate. Если он не
сообщает `preview=false`, такой вариант исключается; наблюдение preview само
по себе не доказывает encraw чтение. Полный EOF выбранного legacy потока и
synthetic encraw tests фиксируются как разные виды evidence.

Финальный live-прогон STEP-010 на production schema `1.1.0`, SDK `0.3.0`,
Node `24.21.0`: один собственный аккаунт и трек, MP3 192 kbps, `lossless=false`.
Command: `node .harness/local/step010-live-composition.mjs` из управляющей
Node composition с `CliCredentialStore` через DI; child exit `0`, parent exit
`0`. Native-сессия между диагностическими прогонами сохранялась только в
защищённом store; прежняя запись была удержана в RAM, cleanup выполнен в `finally`.
Безопасные observations с capture time сохранены в `audio-live-observations.json`.

Captured output финального прогона (выбраны только summary lines):

```text
AUDIO_LIVE: VARIANTS_READY (count=2)
AUDIO_LIVE: FULL_EOF_PASS (bytes=5650599, contentLength=5650599, container=mp3)
AUDIO_LIVE: RANGE_SAMPLE_PASS (acceptsRanges=true, startOffset=8, matchedBytes=56)
AUDIO_LIVE: MODERN_PREVIEW_OBSERVATION (not-confirmed-full)
AUDIO_LIVE: PASS (schema=1.1.0)
AUDIO_SESSION: RUN_EXIT=0
AUDIO_SESSION: CLEANUP_PASS
```

На обоих открытиях наблюдался один HTTP `308`: конечный full ответ `200`,
Range ответ `206`. Redirect продолжает HTTP relocation того же варианта и
обрабатывается один раз, без выбора зеркала, повтора отказавшей операции или
обновления credentials. Новый ADR для этой private transport детали не требуется;
отдельный read-only architect pass подтвердил совместимость с ADR-002/009.

Ранние неуспешные прогоны не являются PASS evidence. Диагностика и offline tests
позволили исправить разделение JSON/XML по роли endpoint, сохранение typed SDK
errors, Range prefix и EOF/cancellation cleanup; native `fetch` также отклонял
CDN redirect при `redirect:error`. Логи диагностики содержали только allowlisted
stage/status/boolean labels, без URL или XML значений. Modern preview остался
`unknown`, его поток не открывался; encraw доказывается только synthetic tests.
