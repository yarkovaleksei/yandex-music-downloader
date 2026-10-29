# Разработка

Документ описывает фактический toolchain, созданный STEP-001 по ADR-001 (слои и границы) и ADR-008 (Yarn workspaces). Локальная политика проверок описана в разделе «CI/CD». Desktop workspace STEP-030 собирает main/application host через TypeScript, renderer через Vite, а sandbox preload — в один CommonJS bundle через esbuild.

## Prerequisites

- Node.js `>=22.14.0 <25` (поддерживаются Node.js 22 и 24 LTS; Node.js 25 и новее не поддерживаются, ADR-008; нижняя граница 22.14.0 нужна для Node-API 10 у `better-sqlite3`, ADR-017). Для разработки рекомендуется Node.js 24 (`.nvmrc`).
- Corepack из состава Node.js и сетевой доступ к npm registry при первом скачивании Yarn.
- Yarn фиксируется в корневом `package.json`: `packageManager` = `yarn@4.18.1+sha512.<hash>`. Менять версию вручную не нужно: используйте Corepack.

Corepack при запуске сверяет версию и sha512-хеш архива из `packageManager`. Он не проверяет подписи Yarn (для Yarn 2 и новее подписи не проверяются), поэтому этот документ не заявляет такой защиты: гарантия ограничена хешем в `packageManager`.

## Local setup

```bash
corepack enable
yarn install --immutable
```

Если установка Node.js доступна только для чтения, глобальные shims не создаются, а используется временный каталог только для текущей сессии:

```bash
mkdir -p "$HOME/.local/corepack-bin"
corepack enable --install-directory "$HOME/.local/corepack-bin"
export PATH="$HOME/.local/corepack-bin:$PATH"
yarn install --immutable
```

Тот же Yarn без записи global shims и пользовательского кеша запускает обёртка (она же использована в канонической верификации STEP-001):

```bash
node packages/testing/scripts/run-yarn.mjs install --immutable
```

`yarn.lock` — отслеживаемый generated-файл: вручную его не форматируют и не правят. При изменении зависимостей запустите `yarn install` (без `--immutable`) в корне, проверьте diff `yarn.lock` и закоммитьте его вместе с `package.json`. Внутренние зависимости всегда объявляются как `workspace:*`. Другие lockfile (`package-lock.json`) и `.npmrc` не используются.

## Development commands

Команды выполняются из корня репозитория:

```bash
yarn run lint
yarn run typecheck
yarn run format:check
yarn test
yarn run build
yarn run format
yarn run desktop
```

- `yarn run desktop` — запускает Electron-приложение с экранами «Главная», «Загрузки», «История загрузок», «Настройки», «Аккаунт» и «Диагностика»; перед первым запуском выполните `yarn run build`. Доступны предпросмотр трека, альбома или плейлиста по URL, выбор качества с отображением покрытия и папки, явный запуск загрузки, прогресс, управление заданиями и уведомления из main process. Навигация закреплена, контент использует ширину окна. Задания показаны свёрнутыми аккордеонами; в заголовке доступны ссылка на источник, состояние, счётчики и действия. Общие кнопки приостанавливают и продолжают подходящие задания, открывают настроенную папку и убирают завершённые из списка без удаления истории или файлов; скрытие сохраняется после перезапуска. В истории есть поиск, фильтры по типу и периоду, ссылки, доступные обложки, компактные действия и повторная загрузка с исходными настройками. Локальные записи и действия доступны без сети; обложки подгружаются отдельно и при недоступности источника заменяются заглушкой. Для старых записей без этих настроек доступная подсказка предлагает открыть источник на Главной и создать новую загрузку. Плейлисты не перечисляют треки и всех их исполнителей. Настройки сохраняют папку, качество, параллельность, готовый шаблон имён и каталогов, замену файлов, путь к FFmpeg и уровень журнала; изменения параллельности и логирования применяются после перезапуска. FFmpeg необязателен: возле поля есть отдельная явная проверка и помощь для ОС. «Аккаунт» показывает состояние авторизации, имя и ID, позволяет войти через браузер и выйти. Общая desktop-диагностика проверяет только условия, мешающие пользоваться приложением, объясняет причину и исправление проблемы, скрывает неприменимые и служебные строки и не запускает FFmpeg. Полный CLI doctor сохраняет прежние проверки. Токен desktop хранится в отдельном системном keyring namespace; packaging и платформенная квалификация остаются за рамками текущей поставки.
- `yarn run lint` — два независимых прохода ESLint с `--max-warnings 0`: основной (`eslint.config.mjs`, качество кода) и архитектурный (`eslint.boundaries.config.mjs`, границы ADR-001) с `--no-inline-config`, поэтому директива в коде не снимает запрет границ.
- `yarn run typecheck` — `tsc -b` по root solution (`tsconfig.json`, project references всех пакетов) и отдельная non-composite программа `tsconfig.tests.json`, которая включает все тесты, конфигурации и tooling-файлы TypeScript.
- `yarn test` — Vitest, отдельный project на каждый workspace и project `tooling` для `eslint/**/*.test.ts`.
- `yarn run build` — `tsc -b`, затем сборка desktop preload через esbuild и renderer через Vite; результат в `dist/` каждого пакета и приложения (игнорируется Git).
- `yarn run format` / `yarn run format:check` — Prettier для `apps`, `packages`, `eslint`, корневых конфигураций, `.yarnrc.yml` и этого файла. Остальные документы, Harness и `planning/` не форматируются автоматически.

### Локальная упаковка desktop — STEP-035

Текущая упаковка выполняется только на Linux по [ADR-019](adr/ADR-019-portable-distribution-and-updates.md) и [STEP-036](../planning/tasks/STEP-036.md); исторические результаты STEP-035 сохранены ниже. Нужны Node.js/Yarn из Prerequisites и установленные зависимости (`yarn install --immutable`). Если Wine отсутствует, скрипт автоматически собирает закреплённый Linux build image и запускает упаковку через Docker; в этом случае нужен доступный Docker daemon. Docker нужен и для чистого Linux smoke. Для извлечения и проверки дистрибутивов установите `7z`, `unzip` и `unsquashfs`. ImageMagick не требуется. При первой сборке нужен сетевой доступ для загрузки сборочных инструментов и Electron.

Из корня репозитория выполните:

```sh
node packages/testing/scripts/run-yarn.mjs run package:local
node packages/testing/scripts/run-yarn.mjs run package:verify
node packages/testing/scripts/run-yarn.mjs run package:smoke --check
```

`package:local` использует electron-builder 26.18.1 и собирает сразу четыре дистрибутива с локальной версией `0.0.0`: AppImage Linux x64, portable ZIP Windows x64 и отдельные `.app.zip` macOS arm64/x64. Они сохраняются в `.cache/desktop-packaging/local-0.0.0/` в каталогах `linux-x64`, `win32-x64`, `darwin-arm64`, `darwin-x64`. Сборка не подписывает и не публикует артефакты; manifest содержит `signed: false`, `published: false`, `tag: null`.

Отдельный режим `node apps/desktop/scripts/package.mjs --tag v1.2.3` берёт версию из существующего Git-тега, требует его соответствия `HEAD` и чистого рабочего дерева. Команда сама не создаёт тег, не подписывает и не публикует сборку. Локальный запуск `package:local` не требует релизного тега.

`package:verify` извлекает содержимое всех четырёх артефактов и проверяет полноту production-зависимостей, целевые архитектуры native-модулей, версию, shipping fuses, ASAR integrity и актуальность хешей исходных файлов. Исторический PASS STEP-035 получен для прежнего набора AppImage/NSIS/macOS ZIP; он не переносится на текущие portable-пакеты STEP-036 и не заменяет запуск на соответствующей ОС.

`package:smoke -- --check` запускает извлечённый AppImage в новом контейнере Ubuntu 24.04 без установленных Node.js/FFmpeg, с сетью `none` и отдельными HOME/state/userData. Проверка пишет только в игнорируемый кеш. `node packages/testing/scripts/run-yarn.mjs run package:smoke` дополнительно сохраняет долговременные PNG/JSON в `apps/desktop/evidence/STEP-035/`. Подтверждены `uiReady: true`, четыре проверки изоляции и заголовок SQLite; [снимок окна](../apps/desktop/evidence/STEP-035/linux-window.png) показывает интерфейс и жёлтую иконку приложения.

Ограничения: извлечённый запуск не проверяет FUSE и desktop integration; Docker smoke использует `--no-sandbox`. В контейнере нет Secret Service, поэтому видимое системное предупреждение ожидаемо; вход в аккаунт не проверен. Успешная Linux-проверка не доказывает нативный запуск Windows/macOS. Исторический FAIL macOS x64/Rosetta остаётся нерешённым и проверяется в финальном STEP-054. Текущий сборщик уже выбирает portable Windows ZIP вместо NSIS; свежие результаты сборки всех четырёх целей и Linux N → N+1 в STEP-036 ещё не зафиксированы. Нативная приёмка Windows/macOS относится к STEP-054. Готовность релиза этими результатами не заявляется.

### Проверенные portable-обновления — STEP-036

В «Настройках» доступны «Проверить обновления», затем «Скачать обновление» и «Открыть папку с обновлением». Проверка и скачивание выполняются только по явному действию пользователя. Main проверяет detached Ed25519-подпись точных байтов описания релиза до разбора JSON, более новую SemVer-версию без build metadata, канал, ОС/архитектуру, HTTPS и доверенные origins, включая перенаправления. При скачивании проверяются фактические размер и SHA-256; неполный `.part` удаляется, готовым становится только проверенный файл. Перед открытием папки размер и хеш проверяются повторно. Renderer не задаёт URL, путь или ключ.

Публичная конфигурация находится в `apps/desktop/packaging/update-trust.json` и при сборке включается в production ASAR; её хеш входит в manifest inputs. Сейчас `feedBaseUrl` и `publicKey` равны `null`, `origins` пуст, `channel` — `stable`: проверка явно сообщает, что обновления не настроены. Production feed ещё не задан. Для подготовки выпуска автор задаёт HTTPS `feedBaseUrl`, открытый Ed25519-ключ в PEM/SPKI, разрешённые origins вида `https://downloads.example.org` и канал, затем пересобирает приложение. Это доверие задаётся сборкой, а не renderer, переменными окружения или сетевым ответом. Ключ из feed не принимается автоматически.

Ключ подписи создаётся один раз на Linux после сборки проекта, при доступном разблокированном системном Secret Service:

```sh
node packages/testing/scripts/run-yarn.mjs run build
node apps/desktop/scripts/release-update.mjs init-key
```

Команда печатает только открытый ключ для `publicKey`; повторный вызов использует существующий ключ. Закрытый Ed25519-ключ хранится через native credential store в namespace `music-downloader.release.update-signing`. Команда не принимает его файлом или аргументом и при недоступности хранилища завершается ошибкой без plaintext fallback. Закрытый ключ не копируют в репозиторий, пакет, журналы или Evidence.

Для каждой цели готовится отдельный `latest.json`. Адрес проверки: `<feedBaseUrl>/<channel>/<target>/latest.json`; рядом ожидается `latest.json.sig` с 64 байтами бинарной detached-подписи. Допустимые `target`: `linux-x64`, `win32-x64`, `darwin-arm64`, `darwin-x64`. Описание содержит ровно следующие поля (пример требует замены URL, размера и хеша на данные окончательного пакета):

```json
{
  "schemaVersion": 1,
  "version": "1.2.3",
  "channel": "stable",
  "target": "linux-x64",
  "url": "https://downloads.example.org/music-downloader-1.2.3.AppImage",
  "size": 123456789,
  "sha256": "0000000000000000000000000000000000000000000000000000000000000000"
}
```

`size` — целое положительное число байт до 2 147 483 648; `sha256` — 64 строчных шестнадцатеричных символа. Канал и цель должны совпадать со встроенной конфигурацией и текущим приложением; URL пакета и feed, а также каждый redirect должны оставаться на разрешённых HTTPS origins. Подписывается готовый файл, после подписи его байты не меняют:

```sh
node apps/desktop/scripts/release-update.mjs sign /путь/к/latest.json
```

Результат — `/путь/к/latest.json.sig`. HTTPS-размещение пакета, описания и подписи выполняется отдельно: эти команды не публикуют релиз, не создают Git-теги и не настраивают хостинг. `signed: false` в packaging manifest означает отсутствие системной подписи приложения; собственная подпись descriptor создаётся отдельной командой.

После получения проверенного пакета:

1. Нажмите «Открыть папку с обновлением» и полностью закройте приложение.
2. На Windows распакуйте ZIP и замените каталог приложения целиком; на macOS распакуйте ZIP подходящей архитектуры и замените `.app`; на Linux замените AppImage и разрешите исполнение нового файла (`chmod +x /путь/к/приложению.AppImage`): скачанный файл создаётся с приватными правами `0600`.
3. Запустите новую версию. Сохраняйте общий каталог состояния, папку аудио и системное хранилище credentials: portable означает отсутствие установщика, а не хранение SQLite или секретов рядом с executable.

Автоматическая установка, замена или запуск скачанного пакета, фоновое скачивание, electron-updater/Squirrel отсутствуют. Платные сертификаты и Apple notarization не требуются постоянно, по ADR-019. Собственная Ed25519-подпись подтверждает соответствие ключу автора, но не доверие Apple/Microsoft к издателю. Предупреждения ОС допустимы; отказ доступа к macOS Keychain может потребовать повторной авторизации без plaintext fallback. После forward-only миграции SQLite старый клиент безопасно отказывает; ручная замена не является откатом базы.

Для локальной Linux-проверки двух явно проверочных версий после сборки и проверки `0.0.0` выполните:

```sh
node apps/desktop/scripts/package.mjs --local-version 0.0.1 --linux-only
node apps/desktop/scripts/verify-package.mjs .cache/desktop-packaging/local-0.0.1 --linux-only
node apps/desktop/scripts/package-update-smoke.mjs --check
```

Обычный `package:verify` требует все четыре цели; явный каталог с `--linux-only` проверяет manifest только с Linux. Режим `--local-version` пишет в `.cache/desktop-packaging/local-0.0.1/`, не создаёт тег и не публикует пакет. Update smoke использует готовые приложения `0.0.0` и `0.0.1`, временный тестовый Ed25519-ключ и отдельный HTTPS fixture CA; production trust он не настраивает. Скачанный проверенный AppImage извлекается для ручной замены между запусками в контейнере с общим SQLite state; проверяются версии и сохранение настроек. `--check` оставляет результат в игнорируемом кеше; запуск без него сохраняет отчёт и снимки в `apps/desktop/evidence/STEP-036/`. Ограничения: `--no-sandbox`, без FUSE/desktop integration, авторизации и нативного запуска Windows/macOS. Свежий прогон STEP-036 прошёл: готовые приложения 0.0.0 → 0.0.1 запущены, собственная подпись/HTTPS download проверены, после ручной замены сохранены настройки и SQLite. [Отчёт и снимки](../apps/desktop/evidence/STEP-036/README.md).

### Проверка provider на реальном API

Отдельный ручной suite проверяет публичный контракт Yandex provider. После `yarn install --immutable` и `yarn run build` задайте `PROVIDER_TEST_TOKEN` только в окружении текущего процесса и выполните `yarn run test:provider`. Имя script `test:provider` совместимо с npm; отдельная npm-установка для этого не требуется. Значение токена не записывайте в команды, файлы, fixtures или evidence.

Без токена или с пустым токеном команда печатает `PROVIDER_TEST: SKIP TOKEN_MISSING`, завершается с кодом 0 и не загружает provider и не обращается к сети. С токеном она проверяет account, track, album, собственный playlist и audio variants; любая ошибка конфигурации или контракта завершается с ненулевым кодом и безопасными `stage` и `code`. По завершении provider очищает только test-only credentials в памяти.

По умолчанию используются track `2224197`, album `221173` и playlist `users/<account>/playlists/1000`. Для разрешённых аккаунту ресурсов можно задать не секретные `PROVIDER_TEST_TRACK_ID`, `PROVIDER_TEST_ALBUM_ID` и `PROVIDER_TEST_PLAYLIST_ID`; допустимы числовые ID track/album и UUID или `users/<encoded-owner>/playlists/<number>` для playlist. `yarn test` остаётся offline, не требует токена и не запускает этот suite; PR CI также его не запускает.

Историческая проверка реального аккаунта от 2026-10-09 подтвердила schema `1.1.0`: account, track, album с 11 треками, playlist с 33 позициями и два variants; test-only credentials в памяти очищены ([STEP-011](../planning/tasks/STEP-011.md), [runner](../packages/providers/yandex-music/test-live/runner.mjs)). Она не доказывает результат для других аккаунтов или универсальную доступность контента.

## Workspace

Workspace-пакеты (все `private`, ESM): `@music-downloader/shared`, `@music-downloader/core-downloader`, `@music-downloader/core-planner`, `@music-downloader/core-queue`, `@music-downloader/core-retry`, `@music-downloader/core-manifest`, `@music-downloader/core-filesystem`, `@music-downloader/core-validation`, `@music-downloader/provider-yandex-music`, `@music-downloader/metadata`, `@music-downloader/persistence`, `@music-downloader/application`, `@music-downloader/logging`, `@music-downloader/testing`, `@music-downloader/cli`, `@music-downloader/desktop`. Всего 16; каталоги — `packages/shared`, `packages/core/*`, `packages/providers/yandex-music`, `packages/metadata`, `packages/persistence`, `packages/application`, `packages/logging`, `packages/testing`, `apps/cli`, `apps/desktop`. STEP-003 добавил доменные типы, безопасные ошибки и контракт `MusicProvider` в `shared`, а также mock provider и fixtures в `testing`. Реализованные foundation/provider и headless-компоненты описаны ниже; desktop-возможности поставлены отдельно в STEP-029/030/031/032. Core, application и CLI реализованы в [STEP-017](../planning/tasks/STEP-017.md), [STEP-018](../planning/tasks/STEP-018.md) и [STEP-019](../planning/tasks/STEP-019.md); MVP acceptance gate [STEP-027](../planning/tasks/STEP-027.md) завершён. [Финальный audit](../planning/audits/AUDIT-20261015T172147Z.md) фиксирует технический PASS и GO владельца от 2026-10-15: 27/27 реальных циклов и 96 файлов на Linux x64, Windows x64 и macOS arm64 для product source `sha256:25a6a43bde2aa78ac3f5d74f533cec434ff0173d87859dbf0dfcaf78c0fdea07`. Это историческая приёмка указанного source, без переноса PASS на текущий HEAD, все форматы provider, универсальные Range/TTL signed URL или desktop. Предыдущие failed/partial попытки сохранены и не засчитаны как PASS; собственные Acceptance/Verification STEP-029/030/031/032 и оставшиеся desktop E2E, packaging и platform gates сохраняются.

### Реализованные foundation и provider

`shared` экспортирует metadata union `Track` (`available`/`unavailable`/`unknown`), обязательные `title`/`artists` для доступного трека, необязательный `genre` и сохранение позиции/повторов в коллекциях, а также schema `1` для `JobEvent` и `CommandResult` ([контракт metadata](../packages/shared/src/domain.ts), [события](../packages/shared/src/events.ts), [STEP-003](../planning/tasks/STEP-003.md), [STEP-004](../planning/tasks/STEP-004.md)).

`@music-downloader/logging` выводит JSON в stderr на уровне `info` по умолчанию; дочерний logger переносит `jobId` и `correlationId`. Redactor очищает известные или зарегистрированные поля и значения, включая query URL, но не ищет неизвестные секреты ([logger](../packages/logging/src/logger.ts), [redactor](../packages/logging/src/redactor.ts), [STEP-004](../planning/tasks/STEP-004.md)).

`CliCredentialStore` хранит единственную CLI credential текущего пользователя через `@napi-rs/keyring`; Linux принудительно выбирает Secret Service, а plaintext fallback отсутствует ([реализация](../packages/persistence/src/cli-credential-store.ts), [STEP-008](../planning/tasks/STEP-008.md)). Канонические evidence подтверждают canary Linux GNOME Login Secret Service и macOS 15.7.7 arm64 Login Keychain, а также Windows x64 VirtualBox Credential Manager: write/read, persistence из нового процесса и delete. Это ограниченные native probes, не packaging и не полная platform qualification; Windows exit code не реконструируется.

`@music-downloader/provider-yandex-music` реализует URL resolution, Device Authorization, metadata track/album/playlist, artwork, variants и открытие audio stream; текущий `PROVIDER_SCHEMA_VERSION` — `1.1.0` ([экспорт](../packages/providers/yandex-music/src/index.ts), [STEP-009](../planning/tasks/STEP-009.md), [STEP-010](../planning/tasks/STEP-010.md)). Историческое наблюдение STEP-009 относится к schema `1.0.0`. Live evidence STEP-010 ограничен одним треком MP3 192 kbps: полный EOF `5 650 599` bytes и один `Range` response offset `8`/`56` bytes. Вариант допускается только при явном `preview=false`; modern preview/unknown исключаются, а `encraw` проверен только synthetic; универсальные TTL signed URL и Range support не заявляются.

### Реализованные headless-компоненты

`@music-downloader/metadata` экспортирует `createMetadataWriter()` с явным container `mp3 | mp4`; buffer API `taglib-wasm` сверяет формат bytes до изменения `.part`, пишет теги и полученную от provider обложку без сети и subprocess ([writer](../packages/metadata/src/index.ts), [ADR-012](adr/ADR-012-audio-metadata-library.md), [STEP-021](../planning/tasks/STEP-021.md)). Album берётся из исходного album трека, артисты соединяются в исходном порядке через `; `, отсутствующие optional теги не заменяются пустыми строками. Writer допускает `albumArtist`, но штатный mapping application не выдумывает его из отсутствующих shared-данных ([composition root](../packages/application/src/composition-root.ts)).

`@music-downloader/core-validation` экспортирует `createAudioValidator()` / `validateLocalAudio()`: непустой файл, завершение и размер потока при переданных stream-признаках, container/codec и длительность через `music-metadata`; допуск — большее из 1000 мс и 1% ожидаемой длительности ([validator](../packages/core/validation/src/index.ts), [STEP-023](../planning/tasks/STEP-023.md)). Базовая validation не запускает внешний decoder. `validateWithFfmpeg()` — отдельная opt-in проверка с явным executable. Baseline без обязательного FFmpeg/ffprobe, автоматического скачивания и bundling принят [ADR-013](adr/ADR-013-optional-ffmpeg.md), которым разрешён OQ-005; это не будущее решение.

Application composition root создаёт default SQLite stores и `CliCredentialStore`, provider, metadata writer и файловый TTL cache ([реализация](../packages/application/src/composition-root.ts)). `CachedProvider` кэширует track/album/playlist metadata и artwork с ключом по provider, текущему account, schema version, методу и аргументам; без account cache не используется. Audio variants и stream всегда запрашиваются у provider. TTL по умолчанию 5 минут, `runtimeAdapters.cache.ttlMs = 0` отключает cache; для `providerOverride` cache требует явного provider/schema namespace. `clearApplicationCache()` удаляет только `<stateDir>/cache`, не manifest и аудиофайлы ([decorator](../packages/application/src/cached-provider.ts), [очистка](../packages/application/src/cache.ts), [STEP-024](../planning/tasks/STEP-024.md)). CLI entrypoint передаёт выполнение в `runCli`, который использует application API ([entrypoint](../apps/cli/src/index.ts), [runner](../apps/cli/src/runner.ts)); Yandex API остаётся внутри provider.

Каждый пакет экспортирует `src/index.ts` под условием `@music-downloader/source` и `dist/index.js` по умолчанию. TypeScript (`customConditions`) и Vitest (`resolve`/`ssr` conditions) используют условие `source`, поэтому тесты и typecheck не зависят от предварительной сборки `dist`.

## Границы зависимостей

Единый источник таблицы — `eslint/boundaries.config.mjs`; исполняет её локальный плагин `eslint/boundaries-plugin.mjs` (правила `boundaries/dependency`, `boundaries/external`, `boundaries/bypass`). Проверяются все `ts/tsx/mts/cts/js/mjs/cjs`: статические и динамические импорты, `require`, `import x = require()`, `import('x').T`, re-export, относительные и deep-импорты в другие пакеты. Вычисляемые specifier-ы и `createRequire` запрещены целиком (fail-closed), будущие пакеты закрыты по умолчанию.

Разбор specifier-ов fail-closed: относительный путь, ведущий в `node_modules`, отображается на имя пакета (сегмент после последнего `node_modules/`) и проходит те же проверки workspace/external (Yandex SDK, запрещённые модули, чистота `shared`); относительный путь за пределы корня репозитория или всех workspace-пакетов, абсолютные пути, URL-схемы (`file:`, `data:`, `http:`, `https:` и любые другие, кроме `node:`), `#`-imports, относительные specifier-ы с `?`, `#` или `%` (Node отбрасывает query/fragment и декодирует `%2e`, поэтому их нельзя классифицировать как обычный путь), обратные слеши и `..` внутри «голого» specifier запрещены правилом `boundaries/bypass`. Также запрещены `require` не в форме прямого вызова (`const r = require`), `module.require`, любые `createRequire` (включая деструктурирование и `m['createRequire']`). В `packages/shared` запрещены и ambient-объявления I/O-имён (`declare const|let|var`, `declare function|class|enum|namespace|module`, в том числе внутри `declare global`), поэтому `declare const process` обход не даёт.

Обязательства ADR/PRN:

| Источник                                             | Разрешено                                                                                                                                                                                                                                     |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/*` (ADR-001 п.1)                               | `application`; `shared` только type-only (`import type`/`export type`)                                                                                                                                                                        |
| `application` (п.2)                                  | `shared`, `core/*`, provider, `metadata`, `persistence`, `logging`; без `electron` и прямого импорта native bindings; default SQLite/secure stores создаёт application через `persistence` (ADR-014/015), `runtimeAdapters` допускают подмену |
| `core/*` (п.3)                                       | `shared`; `filesystem`, `retry`, `manifest`, `validation` не зависят от `downloader` и `queue`; без `electron` и `react`                                                                                                                      |
| provider, `metadata`, `persistence`, `logging` (п.4) | только `shared`, без `core/*` и друг друга                                                                                                                                                                                                    |
| `shared` (п.5)                                       | ничего: без Node built-ins (с `node:` и без), сторонних зависимостей и I/O-глобалов (`process`, `fetch`, `window`, `indexedDB`, `globalThis`/`self` и т. п.)                                                                                  |
| `testing` (п.6)                                      | только `shared`                                                                                                                                                                                                                               |
| `@dvxch/yandex-music` (PRN-001)                      | только `packages/providers/yandex-music`, любые src/test-файлы и subpaths                                                                                                                                                                     |

Локальные ужесточения STEP-001 (не требования ADR): `core/planner` не зависит от `downloader` и `queue`; в `core` запрещены также `react-dom`, `@mui/*` и native-модули (`better-sqlite3`, `sqlite3`, `keytar`, `@napi-rs/keyring`, `electron-store`); в `application` запрещены `react`, `react-dom`, `@mui/*`; `testing` доступен только тестовым файлам `packages/**` кроме `shared`, а `apps/**` (включая их тесты) его не получают. Неизвестный native-модуль в `core`/`application` остаётся документированным остаточным риском: список запрещённых модулей — явный.

Тестовыми считаются файлы `*.test.*`, `*.spec.*` и каталоги `test`, `tests`, `__tests__`, `e2e`, `fixtures` — определение одно (`eslint/boundaries.config.mjs`), из него развёрнуты tsconfig-списки, а `eslint/consistency.test.ts` проверяет их согласованность.

`packages/shared` собирается с `lib: ES2023` без DOM и `types: []`. Нужные чистые web-API (`AbortController`/`AbortSignal`, `URL`/`URLSearchParams`, `TextEncoder`/`TextDecoder`, `ReadableStream`) описаны точечными ambient-типами в `packages/shared/src/web-platform.d.ts`; новые I/O-глобалы туда не добавляются.

## Качество кода

Основной проход ESLint: `typescript-eslint` recommended, `no-explicit-any`, `ban-ts-comment` (с описанием), `consistent-type-imports`, `no-import-type-side-effects`, `reportUnusedDisableDirectives`; директивы допускаются только как `eslint-disable-next-line` с описанием после `--`. Для production-файлов `packages/**/src` и `apps/*/src` (кроме тестовых globs) включены type-aware `no-unsafe-*` правила. Обоснованный `any`:

```ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- причина
```

Boundary-проход директивы не принимает вообще. ESLint и Prettier игнорируют `.cache/**`, `.yarn/**`, `dist`, `coverage`, `node_modules`.

## Testing

Тесты лежат рядом с кодом (`src/*.test.ts`): smoke-тесты проверяют каркасы пакетов, а тесты `shared` и `testing` — доменные ошибки, контракт `MusicProvider` и mock provider из STEP-003. Реализованные logger, native store и provider покрыты offline-тестами ([logger](../packages/logging/src/logger.test.ts), [store](../packages/persistence/src/cli-credential-store.test.ts), [provider](../packages/providers/yandex-music/src/yandex-music-auth.test.ts)). `eslint/*.test.ts` проверяют toolchain: границы (`boundaries.test.ts`, независимый oracle по ADR-001), strict-контракт (`strict.test.ts`), качество (`quality.test.ts`), согласованность конфигураций (`consistency.test.ts`).

Текущие offline-тесты проверяют readback Unicode-тегов и artwork на синтетических MP3, MP4/AAC и MP4/FLAC ([metadata](../packages/metadata/src/index.test.ts)), TTL, смену account/schema, чтение cache после restart и прямое делегирование variants/stream ([cache integration](../packages/application/src/cache.integration.test.ts)). [Baseline integration](../packages/application/src/baseline-no-subprocess.integration.test.ts) завершает загрузку с default production validator при запрете внешнего decoder; тест разрешает только отдельные process-identity probes и не доказывает отсутствие любых subprocess во всём приложении. [CLI crash/resume integration](../apps/cli/src/headless.integration.test.ts) использует новый процесс и реальный SQLite store с offline provider. Эти проверки не заменяют real API и native platform evidence.

Electron E2E [STEP-033](../planning/tasks/STEP-033.md) запускается отдельно от unit/integration-тестов. Из корня репозитория на Linux с установленными workspace dependencies:

```sh
npm --prefix apps/desktop/e2e ci --ignore-scripts --workspaces=false
node packages/testing/scripts/run-yarn.mjs run build
node apps/desktop/e2e/run.mjs
```

Изолированный package закрепляет Playwright и использует workspace Electron; runner зависимости не скачивает. Linux требует графического дисплея и системных библиотек Electron; команды подготовки headless Linux и нативного запуска Windows/macOS приведены в [инструкции E2E](../apps/desktop/e2e/README.md). Сценарий проходит предпросмотр URL → явный старт → пауза → продолжение → завершение, проверяет непустой файл, тот же job в History и сохранение результата после штатного закрытия и нового запуска Electron с реальным SQLite. Renderer, IPC, utilityProcess, application, stores и обработка аудио настоящие; provider, каталоги состояния и ответ диалога выбора папки тестовые. Bootstrap сохраняет два automation switches для Playwright; это ограничивает доказательство и не проверяет удаление debugging endpoint в shipping entrypoint. Пользовательские данные, credentials и live provider не используются.

UX-проверка [STEP-056](../planning/tasks/STEP-056.md) использует большой синтетический список и обычное, широкое и низкое окно; screenshots и наблюдения находятся в [evidence STEP-056](../apps/desktop/evidence/STEP-056/README.md). Проверки сохранности очереди и разделения desktop/CLI диагностики выполняются unit/integration-тестами; screenshots не заменяют эти доказательства.

Локальный Linux Electron E2E STEP-033 повторно прошёл 2026-10-29, в том числе внутри canonical Verification: подтверждены итоговый MP3 и History после перезапуска. Предыдущий отказ при ожидании предпросмотра не воспроизведён; причина не установлена, исправление кода не заявляется. Нативные [отчёты готового приложения](../apps/desktop/e2e/evidence/native-20261029/README.md) подтверждают Windows x64 и macOS arm64: MP3 50 785 байт, тот же job в History после restart, integrity и неизменность готовых файлов PASS; сборка в гостевой ОС не выполнялась. Последний ARM64 прогон нового офлайнового набора прошёл на M2 Pro без Rosetta; предыдущий ранний отказ запуска сохранён, причина не установлена. [Привязка артефакта](../apps/desktop/e2e/evidence/native-20261029/ready-artifact-binding.json) содержит хеши текущих dist/package, сценария и prebuilt host. macOS x64/Rosetta остаётся неподтверждённой; её FAIL не объявлен исправленным. Все новые Windows/macOS прогоны перенесены в единый финальный STEP-054 после разработки и упаковки. CI-приёмка решением владельца отменена. Packaging и прочие platform gates сохраняются.

## Финальная проверка Windows и macOS — STEP-054

Решением владельца от 2026-10-29 все новые Windows/macOS прогоны выполняются одним самым последним STEP-054 после разработки, упаковки и механизмов проверенных portable-обновлений. STEP-054 зависит от STEP-034/035/036; при добавлении новой работы он должен зависеть и от неё. До финального шага отсутствие доступа к Windows/Mac не блокирует промежуточные STEP: обязательные проверки выполняются на Linux. На целевых ОС проверяются только готовые Linux-сборки.

Финальная приёмка включает Windows x64 и macOS arm64/x64: portable-запуск без установщика, офлайновый E2E с файлом и историей после restart, собственную подпись descriptor и ручное обновление N → N+1. В отчётах фиксируются build ID, revision, хеши, ОС/CPU/runtime/Rosetta. Она остаётся условием готовности релиза. До её начала новые архивы другу для проверки не передаются.

Исключение по решению владельца от 2026-10-29: STEP-058 реализует переносимые UI-функции и соответствие макетам и не является prerequisite STEP-054. STEP-054 может завершиться независимо от STEP-058; его нативные отчёты относятся к проверенным revision/build ID, а не автоматически к будущей UI-сборке. Повторные Windows/macOS прогоны не требуются для завершения STEP-058; новые платформенные интеграции в его scope запрещены.

### Подготовка и запуск финальных наборов

Наборы готовит Linux-команда:

```sh
node apps/desktop/scripts/final-kit.mjs
```

Она сверяет inputs и portable ZIP локальных версий `0.0.0` и `0.0.1`; отсутствующая или устаревшая версия пересобирается существующим Linux packaging. Результат находится в `.cache/desktop-final-check/`: три `music-downloader-final-<target>-<buildId>.zip` и общий `manifest.json` с SHA-256. `revision` относится к подготовке набора; `packagingGitHeads` сохраняет исходные revision переиспользованных portable-сборок, соответствие текущему коду проверяется по inputs. Команды `node apps/desktop/scripts/final-kit.mjs --check` и `--verify` проверяют fixture production PortableUpdates и готовые архивы соответственно. Они не подтверждают работу Windows/macOS.

Каждый ZIP содержит portable N/N+1, отдельный stock Electron и Node нужной архитектуры, production dependencies и Linux-built E2E host. TypeScript/Vite/esbuild на целевой ОС не запускаются и в набор не включаются. Подпись fixture создаётся временным отдельным Ed25519-ключом на Linux; в набор попадают только public key и подпись. Offline transport передаёт локальные байты production PortableUpdates с отдельным HTTPS origin `https://final-kit.invalid`. Это проверка service и подписи, а не production feed, доверие Apple/Microsoft или реальная сеть.

1. Сверьте SHA-256 полученного ZIP с общим manifest, распакуйте на локальный диск в новую папку. Node.js/FFmpeg, компилятор, сеть и авторизация не требуются. При блокировке macOS неизвестного издателя явно разрешите запуск в настройках безопасности. Для x64 на Apple Silicon нужна Rosetta; отказ запуска встроенного Node сохраните из терминала.
2. Запустите `run-before.cmd` на Windows или `run-before.command` на Mac. Скрипт отдельно запускает настоящее shipping N, затем полный offline UI E2E с настоящими IPC/host/SQLite, итоговым MP3 и History после restart. Проверяются production download и отказ повреждённых подписи/размера/хеша. Успешный первый этап заканчивается `AWAITING_MANUAL_REPLACEMENT`, native приёмка пока `PENDING`.
3. Закройте приложение. **Вручную** удалите каталог `current`, создайте его заново и распакуйте в него ZIP из `reports/download/valid/`. Не удаляйте `isolated-home`, `reports` и временный E2E output: это общий stateDir и проверочный аудиофайл. Скрипт не заменяет и не запускает скачанный пакет автоматически.
4. Только после замены запустите `run-after.cmd` или `run-after.command`. Он сверяет `current` с эталонными N+1 байтами, запускает shipping N+1 и проверяет версию, UI, настройки, точные сохранённые строки jobs/history_hidden/job_settings и SHA-256 аудиофайла. Не запускайте старый клиент после forward-only миграции.
5. Верните весь `reports`, включая `before.json`, `after.json`, E2E result, Electron main/renderer/preload/load/crash журналы, stderr и screenshot. При ошибке сохраняется FAIL; если shipping N отказал до первого E2E, runner выполняет один отдельный diagnostic E2E и сохраняет его raw результат, не снимая исходный FAIL. Пустое окно без причины не объявляется исправленным. Для повтора распакуйте ZIP в другую папку, сохранив старые результаты.

Скрипты запускают только встроенные runtimes по абсолютным путям. Raw `externalTools` сохраняет поиск внешних Node.js/FFmpeg в PATH; `externalTools` и `cleanEnvironment` — справочные метаданные. Приёмка Windows и macOS требует работы без необходимости устанавливать системные Node.js/FFmpeg, с использованием встроенных runtime по абсолютным путям. Наличие системных инструментов не блокирует PASS. Каталог `isolated-home` отделяет проверочные данные от обычного профиля; shipping N/N+1 и E2E используют один stateDir. Stock Electron с Playwright сохраняет automation switches только в тестовом bootstrap; его успех не подменяет отдельный запуск shipping entrypoint. Новый Windows x64 прогон набора `20261029T152446475Z-94fa63b4` дал функциональный PASS: shipping 0.0.0/0.0.1, полный E2E, ручная замена и сохранение файла/истории подтверждены ([before.json](../apps/desktop/e2e/evidence/STEP-054/native-win32-x64-20261029/before.json), [after.json](../apps/desktop/e2e/evidence/STEP-054/native-win32-x64-20261029/after.json), [provenance.json](../apps/desktop/e2e/evidence/STEP-054/native-win32-x64-20261029/provenance.json)). Windows x64 принят с результатом **PASS** по текущим отчётам без повторного прогона: [acceptance.json](../apps/desktop/e2e/evidence/STEP-054/native-win32-x64-20261029/acceptance.json) фиксирует решение владельца и SHA-256 исходников. В исторических raw сохранено `nativeAcceptance=PENDING` из-за ошибочного прежнего критерия наличия Node.js в PATH. Найденный `C:\Program Files\nodejs\node.exe`, отсутствие FFmpeg и `cleanEnvironment=false` остаются справочными сведениями. Новых отчётов macOS arm64/x64 нет, готовность релиза не заявляется. Исторический x64 FAIL ниже сохранён.

### Историческая инструкция прежнего x64 набора

Ниже сохранена прежняя инструкция, а не задание нового прогона и не утверждение об исправлении. Архив `20261029T093752Z-9f44abe6` остаётся прежним.

Это готовое приложение и заранее собранный на Linux тестовый host. Набор восстановлен без изменений; исправление прежнего x64/Rosetta отказа не заявляется. Авторизация, сеть, установленные Node.js/FFmpeg и сборка на Mac не нужны.

1. Скопируйте ZIP на локальный диск Mac и распакуйте в новую папку. Откройте Terminal в распакованной папке music-downloader-desktop-ready-check.
2. Сохраните сведения о системе и runtime:

```sh
{ uname -m; /usr/sbin/sysctl -n hw.optional.arm64; file runtime/node; ./runtime/node -p 'JSON.stringify({platform:process.platform,arch:process.arch,node:process.version})'; } > system-x64.txt 2>&1
```

На M2 это x64 через Rosetta; успешный результат не доказывает отдельный прогон на Intel. Если встроенный x64 Node сообщает Bad CPU type in executable, Rosetta отсутствует: сохраните сообщение; до запуска Electron сценарий не дошёл.

3. Запустите только автоматический офлайновый сценарий с журналами:

```sh
DEBUG=pw:browser ELECTRON_ENABLE_LOGGING=1 ELECTRON_LOG_FILE="$PWD/electron-x64.log" bash run-macos.command > launcher-x64.log 2>&1
```

Пока идёт проверка, не закрывайте окно приложения. После её окончания скрипт может ждать Enter в Terminal. В отдельный каталог скопируйте reports, launcher-x64.log, electron-x64.log (если создан) и system-x64.txt. При повторе сначала сохраните предыдущие reports. Верните весь каталог отчётов, включая FAIL, а не только последний удачный report.json.

Нужен report.json со status PASS, platform darwin, arch x64, performedOnGuest=false, integrity/prebuiltFilesUnchanged PASS, итоговым MP3 и тем же job в historyAfterRestart. Пустое окно или таймаут — FAIL с журналами, а не повод менять таймауты вслепую.

Build ID: 20261029T093752Z-9f44abe6
appArtifactHash: 7b37871db2ad5c2e8a2acfb020b2e57a048b70d470ed6a7b38f70baff9221f39
ZIP SHA256: a51db9c902766933f21d435278a684ff4b7bc5eed52349b192415deb60ffb61a

Архив предоставлен в `/home/user/Документы/vbox_shared/Mac-x64-STEP-054/`. Последний предоставленный машинный x64 отчёт — FAIL; [сохранённый исходник](../apps/desktop/e2e/evidence/native-20261029/darwin-x64/report.json). ARM64 PASS STEP-033 не подменяет x64 приёмку. Его повторная проверка отложена до финального STEP-054. CI не требуется; другие desktop/platform/packaging gates сохраняются.

## Воспроизводимая проверка STEP-001

Скрипты в `packages/testing/scripts/` принадлежат STEP-001 (toolchain) и не содержат зависимостей:

- `run-yarn.mjs` — запуск `corepack yarn` с проверкой диапазона Node.js и Corepack-кешем в `.cache/corepack` рабочей копии;
- `verify-toolchain.mjs` — Node, `packageManager` (sha512), `.yarnrc.yml`, отсутствие npm-артефактов, фактический Yarn;
- `verify-step-001.mjs` — чистые копии для Node.js 22.14.0 и 24: `corepack enable --install-directory <tmp-bin>`, immutable install, lint/test/typecheck/format:check/build, негативные boundary-проверки, mismatch `yarn.lock` и недоступный workspace;
- `verify-step-001-manual.sh` — обёртка для ручного запуска.

Требования и ограничения: нужны `nvm` с уже установленными Node.js 22.14.0 и 24 (`nvm install` скрипты не вызывают; при отсутствии версии результат FAIL с причиной) и доступ к npm registry. Проверка выполнена на Linux; Windows (запуск Corepack как `corepack.cmd` через shell) и macOS не проверялись локально; историческая CI-матрица STEP-002 проверяла Windows и macOS (Evidence STEP-002). Новые платформенные доказательства получают локально.

## Environment / configuration

`.yarnrc.yml`: `nodeLinker: node-modules`; `enableGlobalCache`, `enableMirror`, `enableTelemetry` выключены; `cacheFolder: .yarn/cache`, `globalFolder: .cache/yarn/global` — всё состояние Yarn внутри рабочей копии и в `.gitignore`. Пакеты scope `@music-downloader` привязаны к `https://registry.invalid/`: отсутствующий workspace не резолвится через публичный registry (обязательство ADR-008). `supportedArchitectures` перечисляет Linux/macOS/Windows, x64/arm64, glibc/musl, чтобы `yarn.lock` содержал platform-specific optional dependencies; установка и тесты проверены на Linux, Windows и macOS в CI.

## Database / migrations

SQLite и миграции поставлены [STEP-029](../planning/tasks/STEP-029.md): application composition root по умолчанию создаёт `SqliteManifestStore` для CLI и desktop в общей базе `<stateDir>/state.sqlite3` ([composition root](../packages/application/src/composition-root.ts), [store](../packages/persistence/src/sqlite-manifest-store.ts), [ADR-014](adr/ADR-014-sqlite-persistence.md)). Реализованы forward-only миграции N → N+1 с резервной копией и идемпотентный импорт файловых manifest без удаления исходников; база новее поддерживаемой отклоняется с `STATE_SCHEMA_UNSUPPORTED` и не изменяется. `FileManifestStore` остаётся источником импорта и contract-тестов. Настройки, история и диагностика desktop поставлены отдельно [STEP-032](../planning/tasks/STEP-032.md), со своими Acceptance/Verification. Native `CliCredentialStore` хранит секреты в системном keyring, а не в SQLite; собственных миграций базы данных ему не требуется. Завершённые STEP-029/030 не заменяют оставшиеся packaging и platform gates.

## CI/CD

Решением владельца от 2026-10-29 обязательная CI-приёмка отменена из-за исчерпанных лимитов. CI приложения включён для дополнительных проверок только на Linux: lint, typecheck, format:check, unit tests на Node.js 22.14.0/24 и Harness validation. Windows/macOS runners, интеграционные сценарии, Electron E2E и build в CI приложения не запускаются. Workflows CI Harness сохраняются без изменений, включая его собственные Windows-проверки. Успешные jobs не требуются для завершения STEP; их ожидание или отказ не блокирует приёмку. Старые CI-отчёты остаются историческим Evidence.

Перед слиянием выполняются локально:

```sh
node packages/testing/scripts/run-yarn.mjs install --immutable
node packages/testing/scripts/run-yarn.mjs run lint
node packages/testing/scripts/run-yarn.mjs run typecheck
node packages/testing/scripts/run-yarn.mjs run format:check
node packages/testing/scripts/run-yarn.mjs test
node packages/testing/scripts/run-yarn.mjs run build
python3 .harness/tools/validate.py --mode manual
```

Desktop дополнительно проходит Electron E2E по инструкции Testing. Сборка приложения и всех артефактов выполняется только на Linux. На Windows x64 и macOS arm64/x64 запускаются готовые собранные на Linux приложения и заранее собранный E2E host, без TypeScript/Vite/esbuild и пересборки. Новые Windows/macOS проверки выполняются только в финальном STEP-054 после разработки и упаковки, на соответствующих компьютерах; Evidence содержит revision, ОС, архитектуру, команды и результаты. Промежуточные шаги проходят обязательную проверку на Linux и не ждут доступа к Windows/Mac. Локальный Linux результат не заменяет Windows/macOS. Поддерживаемые Node.js 22.14.0 и 24, Yarn и архитектурные границы сохраняются; упоминания CI в исторических ADR описывают прежнее место выполнения проверок, а не дополнительный актуальный gate.

Сборка portable-дистрибутивов и проверки собственной подписи descriptor/ручного обновления выполняются локально по STEP-035/036. Платная системная подпись и notarization не требуются по ADR-019; собственный приватный ключ остаётся в защищённом хранилище ОС Linux-сборщика. Live-тесты provider запускаются только вручную с явной настройкой, отдельно от offline suite; токены не попадают в репозиторий и Evidence.

## Git и CI

Repository Git workflow задаётся `.harness/docs/GIT_WORKFLOW.md` и `.harness/git-policy.toml`. Harness validation выполняется локально; Linux CI используется как дополнительная обратная связь; ожидать CI checks для завершения STEP не требуется.
