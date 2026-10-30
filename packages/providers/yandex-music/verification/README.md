# Ручные проверки provider

Сначала выполните `node packages/testing/scripts/run-yarn.mjs build`. Для isolated native canary используйте `node packages/persistence/verification/native-store-probe.mjs`. Поведение защищённой Linux collection, заблокированного backend и native storage Windows/macOS проверяется отдельно в соответствующем окружении.

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
    'music-downloader.credentials.live-canary',
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

## Метаданные и реальные fixtures

После build запустите `runLiveMetadata(store, fixtureDirectory)` из
`live-metadata-runner.mjs`, передав тот же native adapter через DI. Provider
не импортирует persistence. Для нового ручного прогона предпочтительна отдельная
canary запись keyring, как в примере выше; после проверки она удаляется.

Runner выполняет production `getTrack`, full `getAlbum` и собственный
`getPlaylist`, сохраняет allowlisted raw fixtures и provenance. Account/owner
данные заменяются псевдонимами, user cover и unused поля исключаются; headers,
credentials и signed URLs не записываются. Если runner создаёт временную auth
сессию, он очищает её и восстанавливает ранее существовавшую native запись.

## Полный audio поток и Range

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
из RAM.

Modern API проверяется только в пределах production preview gate. Если он не
сообщает `preview=false`, такой вариант исключается; наблюдение preview само
по себе не доказывает encraw чтение. Полный EOF выбранного legacy потока и
synthetic encraw tests фиксируются как разные виды evidence.
