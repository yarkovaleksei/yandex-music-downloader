# STEP-005 — Исследование API Яндекс Музыки

Дата начала: 2026-10-08. Статус: живое исследование завершено; результаты и ограничения записаны. Канонический результат Verification хранится в Evidence STEP-005.

## Воспроизводимость

- Среда: Linux, Node `v24.21.0`, Yarn `4.18.1`.
- `@dvxch/yandex-music`: строго `0.3.0`, dependency только workspace `@music-downloader/provider-yandex-music`; `yarn.lock` обновлён Yarn.
- Registry integrity: `sha512-pq42Pkfd6eRURra3iewsE9aUbSvV9nu2g/ctDNEKnJbvx/WClS1Rx+GwfNvXt7IYBeEqLVJM/Nsrkln7gqFkSg==`.
- Tarball shasum: `9649ab552fefd0c2439c9250d4fa9c6938be9880`.
- Источник metadata: `corepack yarn npm info @dvxch/yandex-music@0.3.0 --fields version,dist --json`, exit `0` (summary: версия и integrity совпадают с записью выше).
- Источники: [репозиторий библиотеки](https://github.com/thedvxch/yandex-music), [API-reference](https://gh.dvxch.link/yandex-music/); фактические методы сверены по опубликованным `src` версии `0.3.0`, а не по плавающему `main`.
- Выборка по ответу владельца: один собственный аккаунт с подпиской, псевдоним `A`. Треки: `2224197`, `150217442`, `151910374`; album `221173`, собственный playlist kind `1000`. Для всех треков API сообщил available=true, availableForPremiumUsers=true, availableFullWithoutPermission=false. Регион независимо не зафиксирован. На аккаунты без подписки результаты не распространяются.
- Временные скрипты: `packages/providers/yandex-music/research/spike.mjs`, `check.mjs`. Production exports и TypeScript build включают только `src`, research `.mjs` не входят в сборку.

Команды из корня репозитория:

```sh
node packages/providers/yandex-music/research/check.mjs --self-check
node packages/providers/yandex-music/research/check.mjs --check-artifacts
node packages/providers/yandex-music/research/spike.mjs all --window-seconds 3600
```

Каждая отдельная фаза `auth`, `catalog`, `variants`, `range`, `limits`, `ttl` выполняет собственный Device Authorization. `all` использует один токен только в памяти. Не передавать токен аргументом или в отчёте. Для иной выборки доступны до трёх `--track <ID>`; по умолчанию используются первые три ID избранных треков текущего аккаунта.

Скрипт открывает временную страницу `http://127.0.0.1:<port>/` через системный браузер. На ней только одноразовый user code и ссылка на официальный OAuth-сайт. Подтверждение выполняет владелец; Device/access/refresh token не показываются и не записываются. После авторизации локальный сервер закрывается. `Ctrl+C` останавливает дальнейшие запросы; токен не сохраняется для последующего запуска.

## Авторизация

Живой Device Authorization подтверждён владельцем; account status идентифицировал его аккаунт. [OQ-001](../open-questions/OQ-001-auth.md) resolved с ограничениями. Запуск итогового процесса: 2026-10-08 22:05:01 MSK (время создания захваченного stdout-файла). Выданный сервером адрес подтверждения имеет hostname `ya.ru`; одноразовый код в отчёт не включается.

Дословная безопасная запись итогового прогона:

```json
{"phase":"auth","status":"confirmed","account":"A","accountConfirmed":true,"expiresIn":31536000,"refreshPresent":true}
{"phase":"auth","status":"failed","errorType":"UnauthorizedError","reason":"request-failed","refreshSucceeded":false}
```

OAuth response сообщает годовой expiresIn, но фактическое истечение не наблюдалось. Refresh на авторизованном Client вернул HTTP 401; исходный токен затем успешно использован для каталога. Причина 401 не установлена (в частности, влияние сохранённого Authorization на OAuth-запрос отдельно не проверялось); нельзя утверждать, что сервер вообще не поддерживает refresh.

Собственные ошибки подготовки, исправленные до итогового прогона: первый allowlist не включал выданный сервером `ya.ru`; затем смена `client.token` не обновляла transport Authorization. В `0.3.0` требуется `client.request.setAuthorization(token)` либо создание авторизованного Client с token. Предварительные команды `spike.mjs all --window-seconds 3600` завершались с exit 1; их наблюдения — summary, а не реконструированный terminal quote. Отказ refresh теперь фиксируется и не прекращает исследование действующим исходным токеном.

По исходникам `src/methods/deviceAuth.ts` и `src/models/deviceAuth.ts` опубликованной версии доступны `requestDeviceCode`, `pollDeviceToken`, `deviceAuth`, `refreshAccessToken`, поля `expiresIn` и `refreshToken`. Это возможности реализации, не подтверждение работоспособности сервера или срока токена. Приложение не запрашивает пароль; подтверждение только на странице Яндекса.

Публичные OAuth-константы `DEFAULT_CLIENT_ID`, `DEFAULT_CLIENT_SECRET` принадлежат библиотеке; значения сюда не копируются. Решение о допустимости уже принято в [OQ-012](../open-questions/OQ-012-encrypted-variants.md).

Device Code: 300 секунд, interval 5 секунд (это не срок access token). Подтверждение account, срок из OAuth response, наличие refresh и его отказ записаны. Product auth/storage не реализованы и должны принять эти ограничения в ADR STEP-006.

## Варианты аудио

[OQ-002](../open-questions/OQ-002-codecs.md) resolved по ограниченной выборке; [OQ-011](../open-questions/OQ-011-quality-policy.md) остаётся open и содержит два варианта правил для владельца.

| Track ID | Путь API | Codec / bitrate API | Префикс / lossless | Transport / preview |
| --- | --- | --- | --- | --- |
| 2224197 | download-info | MP3 192, 320 kbps | сигнатура MP3, по 1 MiB | raw, preview=false |
| 150217442 | download-info | MP3 192, 320 kbps | сигнатура MP3, по 1 MiB | raw, preview=false |
| 151910374 | download-info | MP3 192, 320 kbps | сигнатура MP3, по 1 MiB | raw, preview=false |
| 2224197 | get-file-info (lossless) | aac-mp4, 256 kbps | bytes не читались, isLossless=false | encraw, preview неизвестен, ключ присутствует |
| 150217442 | get-file-info (lossless) | flac-mp4, bitrate=0 | bytes не читались, isLossless=true | encraw, preview неизвестен, ключ присутствует |
| 151910374 | get-file-info (lossless) | flac-mp4, bitrate=0 | bytes не читались, isLossless=true | encraw, preview неизвестен, ключ присутствует |

192/320 и современный codec/lossless — поля API; битрейт не измерялся независимым анализом полного файла. Определитель префикса проверяет ID3/MPEG sync, fLaC, OggS, ftyp/ADTS; это проверка сигнатуры, а не полноценное декодирование. Нулевой bitrate FLAC не является измеренным качеством. Наблюдаемый AAC fallback опровергает универсальное соответствие «подписка/запрос lossless = FLAC». Варианты с неизвестным preview не выбираются; расшифровка encraw в живом прогоне не выполнялась.

По опубликованным исходникам:

- `src/methods/tracks.ts`: lossy — `tracksDownloadInfo`, современный путь — `tracksLosslessInfo` через `/get-file-info`. Сервер может ответить иным codec на запрос `lossless`; название метода не гарантирует FLAC.
- `src/models/track/extras.ts`: `DownloadInfo.preview` переносится из API; `LosslessDownloadInfo` переносит codec/bitrate/transport/key/urls, но не preview. Research проверяет исходный `downloadInfo.preview` до преобразования; при отсутствии явного `false` префикс этого варианта не запрашивается.
- `DownloadInfo.getDirectLink` использует `SIGN_SALT` для построения ссылки. `src/signRequest.ts` содержит `DEFAULT_SIGN_KEY` и помощники подписи `/get-file-info`. Значения констант не копируются в проект.
- `decryptEncraw`/`encrawDecipher` библиотеки используют ключ ответа текущему аккаунту. Research применяет расшифровку только к ограниченному префиксу разрешённого полного варианта; offline-cache и извлечение ключей клиента отсутствуют.

Для каждого варианта поля API отделены от сигнатуры bytes. Предложения `high`/`normal` записаны в OQ-011: max/min сопоставимых полных lossy-вариантов либо max/следующий более низкий; различается поведение при единственном варианте. Решение владельцем ещё не принято, тихий fallback запрещён.

## Range

[OQ-003](../open-questions/OQ-003-range.md) resolved: шесть полных MP3-вариантов ответили 206 с Content-Range bytes 0-1048575/<size> и 1048576 фактически прочитанными bytes. Пробы по 4096 bytes тоже согласованы. Ненулевые смещения, suffix и out-of-bounds отдельно не проверены; доказательство ограничено чтением префикса, не всеми resume-сценариями.

Исследование запрашивает `Range: bytes=0-1048575`, сохраняет только безопасные status/Content-Range/Accept-Ranges и число прочитанных bytes. Даже ответ `200`, игнорирующий Range, прекращается на лимите префикса. `206` требует согласованного Content-Range с началом `0`. Поддержка HTTP Range не доказывает корректное возобновление расшифровки `encraw`.

## Signed URL

[OQ-008](../open-questions/OQ-008-signed-url.md) resolved по наблюдаемому интервалу и подтверждённому обновлению. elapsedSeconds относятся к началу TTL-фазы, не к точному моменту выдачи URL.

| elapsedSeconds | Старая URL | Новая URL отличается / работает |
| --- | --- | --- |
| 1 | 206 | true / true |
| 61 | 206 | true / true |
| 301 | 206 | true / true |
| 901 | 206 | true / true |
| 1801 | 206 | true / true |
| 3602 | 401, 0 bytes | true / true |

Дословная запись последней пробы:

```json
{"httpStatus":401,"elapsedMs":503,"bytesRead":0,"rangeHonored":false,"phase":"ttl","status":"observed","elapsedSeconds":3602,"source":"legacy","urlChanged":true,"freshLinkWorks":true,"expiry":"rejected-old-link"}
```

Исходная ссылка перестала работать между пробами 1801 и 3602 секунд. Точный TTL от выдачи, универсальный срок и причина конкретного 401 не установлены; называть это точным TTL=3600 нельзя. Практическое наблюдение — отказ старой ссылки при сохранившейся доступности и успешном обновлении. Повторная выдача: заново прочитать track availability, fresh tracksDownloadInfo, подтвердить preview=false, получить getDirectLink от нового объекта и проверить новый префикс. Нельзя переносить условие «любой 401 = expiry» на auth/другие API.

Комментарий библиотеки к `DownloadInfo.getDirectLink` заявляет срок порядка минуты и ответ `410` позднее. Это непроверенное утверждение библиотеки. Начальное окно живого наблюдения — до часа: `t0`, 1, 5, 15, 30, 60 минут. URL остаётся в памяти; выводятся только changed/same как boolean, времена и статусы старой/свежей ссылки. Новая ссылка запрашивается с повторной проверкой доступности трека и полного варианта.

Успех старой ссылки в конце окна — только нижняя граница TTL. `401/403` старой ссылки при работающей свежей отличает отклонённую ссылку от общей недоступности, но сам по себе не устанавливает точную причину/TTL. `410` записывается как наблюдаемое условие. Не закрывать OQ-008 без достаточного evidence о сроке/условиях и обновлении.

## Rate limits

[OQ-009](../open-questions/OQ-009-rate-limits.md) deferred с evidence: все 10 API-запросов вернули 200, 6 CDN-проб — 206. При concurrency 1/4 ограничений не наблюдалось; числовой порог/backoff и длительная безопасность не доказаны. Повторить при естественном throttling обычного job; поиск предела нагрузкой не выполнялся.

Конечная выборка: до 10 дополнительных API-запросов и до 6 CDN-проб по 4096 bytes, concurrency `1`, затем `4`. На `429`/повторяющихся `5xx` новые пачки прекращаются. Записываются count/concurrency/status/длительность и числовой Retry-After; предел нагрузки специально не ищется. Отсутствие `429` означает лишь отсутствие ограничения в этой выборке.

## Ограничения

- Device auth/account и каталог подтверждены; refresh в проверенных условиях отказал. MP3-префиксы/Range подтверждены; современные форматы только по API, для legacy URL зафиксирован интервал прекращения работы между 30 и 60 минутами и успешная повторная выдача; точный универсальный TTL и modern URL не установлены.
- Нет данных аккаунта без подписки, других регионов и всех типов треков.
- Современная модель библиотеки теряет preview-флаг; неподтверждённый полный вариант не читается. Это наблюдение об исходниках, не утверждение о фактическом ответе API.
- Выбор product auth/storage, provider DTO, retry/resume и политика качества принадлежат последующим STEP/ADR.
- Offline-проверки охватывают фактическую проекцию вывода/ошибки и допуск вариантов. Pattern scan охватывает tracked и новые неигнорируемые текстовые файлы, выводит только пути совпадений; не доказывает отсутствие любого неизвестного секрета и дополняется review итогового diff.

## Проверки и фактический вывод

Локальные команды (summary фактических запусков, exit 0):

- `corepack yarn install --immutable` — существующая согласованная lockfile без изменений, Yarn 4.18.1.
- `node packages/providers/yandex-music/research/check.mjs --self-check` — редакция ошибок/вывода, доступ/preview, сигнатуры PASS.
- `node packages/providers/yandex-music/research/check.mjs --check-artifacts` — на момент подготовки 650 tracked/новых файлов, шаблоны секретов, отчёт, dependency/exports/build PASS; scan повторяется на финальных artifacts.
- `corepack yarn run lint` — PASS.
- `corepack yarn build` — PASS.
- `python3 .harness/tools/validate.py --mode manual` после sync-projections — PASS (646 tracked files на момент запуска).

Живая команда `node packages/providers/yandex-music/research/spike.mjs all --window-seconds 3600` завершилась с exit `0`. Последняя запись захваченного stdout: `2026-10-08T23:05:50+03:00` (Moscow). Итоговая запись: `{"phase":"run","status":"completed","count":6}`; это завершение процесса с шестью исследованными полными legacy-вариантами, а не самостоятельное закрытие lifecycle STEP.

stdout сохранялся только после белого списка полей. [Выбранные дословные строки](yandex-api-spike-output.jsonl) исключают сетевой шум и ожидание, но не изменяют оставшиеся строки. Каноническая Verification отдельно проверяет текущие artifacts и все manual observations; её generated Evidence хранится в STEP-005. Локальный exit 0 сам по себе не подменяет Acceptance.
