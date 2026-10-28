# Architecture

> Архитектурный baseline создан `PROJECT INIT` только на уровне решений, поддержанных brief/requirements и Accepted ADR. Неопределённости перечислены в OQ и не превращены в выдуманные факты.

## System context

Приложение — локальный клиент одного пользователя. Оно обращается к неофициальному API Яндекс Музыки (метаданные, список вариантов аудио, потоки на CDN с signed URL) от имени авторизованного пользователя и записывает файлы в выбранный каталог. Серверной части, облачной синхронизации и multi-user режима нет.

Разработка идёт в два этапа: headless CLI (этап 1) и Electron UI (этап 2) поверх одного downloader core.

## Основные компоненты / границы

Направление зависимостей (ADR-001, PRN-001):

```text
apps/cli, apps/desktop            ← клиенты: не знают про Yandex API
        │
        ▼
packages/application              ← API операций (сериализуемые DTO, события) + composition root createApplication(runtimeAdapters)
        │
        ▼
packages/core/*                   ← downloader, planner, queue, retry, manifest, filesystem, validation
        │
        ▼
packages/shared                   ← доменные типы, ошибки, MusicProvider, порты, DTO и union событий (без Node built-ins)
        ▲
        │ реализуют порты
packages/providers/yandex-music   ← единственное место с @dvxch/yandex-music и знанием endpoint'ов
packages/metadata, packages/persistence, packages/logging
packages/testing                  ← mock provider и тестовые утилиты
```

Компоненты:

- **Application layer** — транспорт-независимый API для клиентов (авторизация, preview, создание и управление job, история, диагностика, `subscribe` на версионированные события и `CommandResult`); единственный composition root (ADR-001, ADR-007).
  - Default `SqliteManifestStore`, `SqliteDesktopStateStore` и keyring `CliCredentialStore` из `packages/persistence` создаёт application composition root. Клиент задаёт через `runtimeAdapters` нейтральные опции (каталог состояния, профиль `cli | desktop`, `AuthInteraction`, logger); adapters также допускают явные подмены для тестов и host ([composition root](../packages/application/src/composition-root.ts), ADR-014, ADR-015).
  - Node-API bindings не считаются runtime-специфичными реализациями (ADR-014, ADR-015).
- **Downloader core** — Download Planner (immutable `DownloadPlan`), quality resolver, Download Manager (очередь, concurrency, pause/resume/cancel/retry, прогресс), state machine (ADR-006), manifest/recovery, filesystem (sanitizer, генератор путей, `.part`-запись), validation.
- **MusicProvider** — контракт источника (ADR-002); реализованный **YandexMusicProvider** изолирует Device Authorization, нормализацию ошибок, runtime-схемы и mapping в provider. Его текущая версия схем/маппинга — `PROVIDER_SCHEMA_VERSION` `1.1.0` ([экспорт](../packages/providers/yandex-music/src/index.ts), [STEP-009](../planning/tasks/STEP-009.md)).
- **Metadata** — `createMetadataWriter()` записывает теги и уже полученные от provider bytes обложки через buffer API `taglib-wasm`; container `mp3 | mp4` передаётся явно и сверяется с содержимым `.part` до изменения. Writer не выполняет сеть и не запускает subprocess ([реализация](../packages/metadata/src/index.ts), [ADR-012](adr/ADR-012-audio-metadata-library.md), [STEP-021](../planning/tasks/STEP-021.md)).
- **Validation** — `createAudioValidator()` / `validateLocalAudio()` проверяют непустой файл, завершение и размер потока при переданных stream-признаках, container/codec и длительность через `music-metadata`; допуск длительности — большее из 1000 мс и 1% ожидаемой. Базовая проверка не запускает внешний decoder; `validateWithFfmpeg()` — отдельный явный opt-in с путём к executable ([реализация](../packages/core/validation/src/index.ts), [ADR-013](adr/ADR-013-optional-ffmpeg.md), [STEP-023](../planning/tasks/STEP-023.md)).
- **Cache** — application оборачивает provider в `CachedProvider` с файловым `FileCacheStore`: TTL по умолчанию 5 минут, `runtimeAdapters.cache.ttlMs = 0` отключает cache. Ключ учитывает provider, текущий account, schema version, метод и аргументы; кэшируются track/album/playlist metadata и artwork. Без аккаунта запрос идёт к provider; variants и audio stream всегда делегируются без cache. `clearApplicationCache()` очищает только `<stateDir>/cache`, сохраняя manifest и аудиофайлы ([composition root](../packages/application/src/composition-root.ts), [decorator](../packages/application/src/cached-provider.ts), [очистка](../packages/application/src/cache.ts), [STEP-024](../planning/tasks/STEP-024.md)).
- **Persistence** — исторический headless MVP принят на файловом `ManifestStore`; текущий default для CLI и desktop — SQLite в общей базе `<stateDir>/state.sqlite3` с forward-only миграциями N → N+1 ([ADR-014](adr/ADR-014-sqlite-persistence.md), [завершённый STEP-029](../planning/tasks/STEP-029.md)). `FileManifestStore` сохраняется для импорта и contract-тестов. `CredentialStore` использует native системный keyring (ADR-010/015), создаётся application composition root и передаётся provider через shared-порт; секреты не хранятся в SQLite.
- **Desktop (этап 2)** — Electron main (окна, IPC broker, системные диалоги), application host в `utilityProcess` (application, provider, SQLite, credential store), preload с typed `DesktopApi`, недоверенный renderer на React + MUI (ADR-015, ADR-016).

## Data / state model

Доменные сущности: `Track`, `Album`, `Playlist`, `AudioVariant`, `DownloadRequest`, `DownloadJob`, `DownloadTrackJob`, `MediaReference` (brief §8).

Metadata contract развивается [ADR-011](adr/ADR-011-shared-metadata-contract.md): реализованный shared `Track` — union `available`/`unavailable`/`unknown`; `genre` необязателен в track/album/album reference. Полные `title`/`artists` обязательны только для `available`; минимальная недоступная или неподтверждённая запись сохраняет ID и позицию в коллекции без выдуманных metadata ([контракт](../packages/shared/src/domain.ts), [STEP-039](../planning/tasks/STEP-039.md)). Плейлист сохраняет позицию каждой записи, поэтому повтор одного track не теряется. PRN-003 сохраняется: `unknown` не разрешает чтение контента, а `available` metadata не заменяет проверку полного audio variant.

`JobEvent` и `CommandResult` уже имеют versioned JSON-envelope schema `1`: событие содержит `seq` и `jobId`, track-события — `trackKey`, а наблюдаемые завершения — `durationMs`; `CommandResult` разделяет успешный `data` и ошибку ([контракт](../packages/shared/src/events.ts), [STEP-003](../planning/tasks/STEP-003.md), [STEP-004](../planning/tasks/STEP-004.md)). Одни shared-типы не доказывают runtime-публикацию, порядок событий или transport.

- Единица работы — трек в составе job (ключ — позиция в плане); статусы и переходы описаны в ADR-006; статус job агрегируется детерминированно (`completed_with_errors`, `interrupted` и др.); job имеет control-состояние (`running`/`paused`/`cancelled`).
- `DownloadPlan` формируется до загрузки и неизменяем для операции.
- Manifest v1 (ADR-004): один JSON на job — план, статусы и выбранные variants треков, пути, попытки, последняя ошибка; записывается атомарно; не содержит секретов. Job принадлежит одному процессу через эксклюзивную аренду (PID и время старта, hostname, heartbeat); manifest пишет только держатель аренды, а команды других процессов — control-запросы через отдельный канал хранилища (ADR-004).
- Headless MVP: файловое хранилище за `ManifestStore` (OQ-006 разрешён). Desktop-этап (ADR-014):
  - SQLite — единый источник истины для CLI и desktop: manifest v1 как валидированный документ, аренда, control-запросы, история, очередь, настройки, безопасная диагностика;
  - WAL, `BEGIN IMMEDIATE` для аренды;
  - миграции N → N+1 с резервной копией;
  - база новее поддерживаемой не изменяется;
  - идемпотентный импорт файловых manifest (повторяется при открытии для ещё не импортированных) без удаления исходников;
  - аудио, `.part`, обложки и файловый cache остаются в файловой системе.
- Cache метаданных/обложек/ответов provider с TTL; audio cache в MVP не предусмотрен.

## Основные потоки

1. `url` → provider `resolveUrl` → `MediaReference` (или `UNSUPPORTED_URL`).
2. Provider `getTrack/getAlbum/getPlaylist` → Planner строит immutable `DownloadPlan` → job создаётся, manifest записывается.
3. Для каждого трека: в `resolving` provider получает metadata, варианты и байты обложки → quality resolver выбирает variant (контейнер известен) → если итоговый файл уже существует и валиден — `skipped`; иначе `openAudioStream` (→ `AudioStream` с размером, контейнером, поддержкой Range) → запись в уникальный `*.part` → валидация → теги и уже полученная обложка → атомарный rename (точка фиксации) → статус `completed` в manifest.
4. Ошибки: transient → `retry_wait` с backoff+jitter; non-retryable → `failed`; `STREAM_EXPIRED` (истёкшая подпись) → повторный `openAudioStream` в пределах попыток. Повторы выполняет только core.
5. Прерывание: SIGINT переводит активные треки в `paused`; после аварийного завершения recovery при захвате устаревшей аренды нормализует незавершённые треки в очередь (ADR-006/ADR-004), completed пропускаются.
6. Playlist: каталог, нумерация по позиции, `cover.jpg`, `.m3u8` с относительными путями.

## External dependencies / integrations

- **API Яндекс Музыки** — неофициальный; доступ только через provider adapter; стабильность не гарантируется. Реализованы `resolveUrl`, Device Authorization, account, track/album/playlist metadata, artwork и audio variants/stream ([provider](../packages/providers/yandex-music/src/index.ts), [STEP-007](../planning/tasks/STEP-007.md), [STEP-009](../planning/tasks/STEP-009.md), [STEP-010](../planning/tasks/STEP-010.md)). Стратегия schema drift принята ADR-009/OQ-007; числовой rate limit не установлен.
- **`@dvxch/yandex-music@0.3.0`** — закреплённая библиотека внутри provider. Обёртка проверяет raw JSON до моделей и выполняет доменную проекцию после них через Zod 4; library retries отключены, полные audio variants допускаются только при `preview=false`. `PROVIDER_SCHEMA_VERSION` `1.1.0` — отдельная SemVer-версия проверяемых схем/маппинга ([экспорт](../packages/providers/yandex-music/src/index.ts), [STEP-009](../planning/tasks/STEP-009.md)). Историческое наблюдение STEP-009 сделано на schema `1.0.0`; оно не заменяет текущий экспорт.
- **Audio provider boundary** — один трек MP3 192 kbps подтверждён полным EOF `5 650 599` bytes и одним ответом `Range` с offset `8`/`56` bytes; вариант допускается только при явном `preview=false`, modern preview/unknown исключены, `encraw` доказан только synthetic-проверками ([STEP-010](../planning/tasks/STEP-010.md)). Универсальная поддержка `Range` и TTL signed URL не доказаны.
- **CLI native credential storage** — реализованный `CliCredentialStore` использует `@napi-rs/keyring`: Windows Credential Manager текущего пользователя, macOS Login Keychain, Linux защищённый GNOME Keyring через явно выбранный Secret Service, без keyutils/plaintext fallback ([реализация](../packages/persistence/src/cli-credential-store.ts), [STEP-008](../planning/tasks/STEP-008.md)). При недоступном или locked backend store отказывает, не переключаясь на альтернативное хранение. Native canary подтверждён на Linux GNOME Login Secret Service, Windows x64 VirtualBox и macOS 15.7.7 arm64: write/read, persistence из нового процесса и delete. Это не packaging и не полная платформенная квалификация; Windows exit code не зафиксирован в evidence.
- **Metadata / validation** — runtime writer использует `taglib-wasm`, baseline reader — `music-metadata` ([writer](../packages/metadata/src/index.ts), [validator](../packages/core/validation/src/index.ts)). Выбор writer принят [ADR-012](adr/ADR-012-audio-metadata-library.md); локальные синтетические MP3, MP4/AAC и MP4/FLAC проверены независимым readback ([тесты](../packages/metadata/src/index.test.ts)). Это не доказательство transport для всех форматов provider.
- **FFmpeg / ffprobe** — опциональные внешние инструменты. Baseline без обязательной установки, автоматического скачивания и bundling уже принят [ADR-013](adr/ADR-013-optional-ffmpeg.md), которым разрешён OQ-005; обязательные загрузка, тегирование и базовая validation работают без них. Отдельный `validateWithFfmpeg()` не включается автоматически наличием binary; упаковка и возможный будущий bundled вариант требуют собственных доказательств и решения.
- **Провайдер обложек** — только через `provider.fetchArtwork`; клиенты и core не обращаются к CDN обложек.
- **SQLite** — `better-sqlite3` 13 (Node-API, prebuilt binaries) только в `packages/persistence` (ADR-014). Загрузка в Node.js доказывается STEP-029, в Electron `utilityProcess` — STEP-030.
- **Desktop credential storage** — `@napi-rs/keyring` в application host, namespace `music-downloader.desktop.yandex-music`, без `safeStorage` и plaintext fallback (ADR-015, OQ-010 решён).

## Security boundaries

- Пароль пользователя не запрашивается и не хранится; CLI использует Device Authorization с приватной browser-страницей provider и native CredentialStore (ADR-010). Challenge/credentials не проходят application API и AuthInteraction.notify; там только безопасное уведомление. Истёкший токен даёт AUTH_ERROR без автоматического refresh/replay; повторная авторизация явная. Desktop использует тот же Device Authorization flow в application host и системное хранилище через `@napi-rs/keyring` с отдельным namespace; при недоступном хранилище — явная ошибка без fallback (ADR-015, PRN-002).
- Секреты (токен, cookies, Authorization, credentials, signed URL с security-параметрами) не попадают в logs, events, manifest, cache, SQLite (централизованная редакция).
- Работа только с контентом, доступным текущему аккаунту (PRN-003).
- Ключи расшифровки потока (если применяются) остаются внутри provider и не попадают в `variantKey`, manifest, cache, логи и события.
- Токены не проходят через application API и IPC; события и DTO ошибок не содержат секретов.
- Electron (ADR-015):
  - `contextIsolation = true`, `nodeIntegration = false`, `sandbox = true`, `webSecurity`, без webview;
  - строгий CSP (`default-src 'none'` плюс явные исключения) и загрузка только упакованного контента через собственную схему;
  - renderer не передаёт путей: каталоги выбираются диалогом main и передаются непрозрачным `directoryRef`;
  - запрет навигации и новых окон, отклонение permissions;
  - renderer не имеет доступа к fs, child_process, токенам, базе и provider;
  - main не держит секретов: application, provider, SQLite и credentials работают в `utilityProcess`.
- IPC (ADR-016):
  - только typed `DesktopApi` из единого contract module, каналы `desktop-api:v1:<method>`;
  - main проверяет отправителя и валидирует вход runtime-схемой до host;
  - произвольные channel strings запрещены lint-правилом.
- Filename sanitizer предотвращает path traversal.

## Reliability / observability

- Атомарная финализация файлов и manifest (ADR-004); retry только для transient-ошибок.
- Реализованный logger пишет JSON в stderr, по умолчанию на уровне `info`, поддерживает `error`/`warn`/`info`/`debug`/`trace` и наследуемый child-context с `jobId`/`correlationId` ([logger](../packages/logging/src/logger.ts), [STEP-004](../planning/tasks/STEP-004.md)). Redactor очищает зарегистрированные поля и значения, а также query у URL; он не является универсальным обнаружителем секретов ([redactor](../packages/logging/src/redactor.ts)).
- Нормализованные доменные ошибки; provider health различает `NETWORK_ERROR`, `AUTH_ERROR`, `API_CHANGED`, `SERVICE_UNAVAILABLE`, `PROVIDER_RESPONSE_INVALID`.
- `doctor` проверяет runtime, provider, auth, account, metadata, variants, filesystem, FFmpeg, хранилище.

## Deployment / runtime assumptions

- Node.js `>=22.14.0 <25` (ADR-008; нижняя граница Node-API 10 — ADR-017), TypeScript `strict`, Yarn 4 workspaces с `nodeLinker: node-modules` (ADR-008).
- CLI запускается локально; desktop — Electron для Windows x64, macOS arm64/x64, Linux x64; дистрибутивы, подписание и автообновление — этап packaging (ADR STEP-034).
- Electron-процессы: main, application host (`utilityProcess`), preload, renderer (ADR-015). Каталог состояния общий для CLI и desktop — `resolveStateDirectory()`; Electron `userData` не хранит доменное состояние (ADR-014).
- Native-модули (`better-sqlite3`, `@napi-rs/keyring`) используют Node-API. Их работа в Electron должна быть доказана платформенно (STEP-030); при несовместимости — blocker и новый ADR, без fallback.
- Требования к packaging (STEP-034/035/036):
  - Electron fuses;
  - без виртуализации и sandbox, которые изолируют общий `stateDir` или доступ к Secret Service/Keychain (MSIX AppData, Mac App Sandbox, Flatpak/Snap);
  - на macOS — подпись для стабильного доступа к Keychain (OQ-013);
  - после миграции SQLite старая версия клиента перестаёт писать до обновления (ADR-014).
- Остальной toolchain (тестовый раннер, сборка, формат модулей) выбирается в STEP-001 и фиксируется в `docs/development.md`.

## Accepted ADR

См. `docs/adr/README.md`.

## Известный architecture debt / drift

Слои monorepo/shared реализованы STEP-001/003, исследование API — STEP-005; provider wrapper, schemas, native CLI store и ограниченные platform proof — STEP-008/009/010. Core, application и CLI поставлены [STEP-017](../planning/tasks/STEP-017.md), [STEP-018](../planning/tasks/STEP-018.md), [STEP-019](../planning/tasks/STEP-019.md); metadata, validation и cache — STEP-021/023/024. Выбор writer и baseline без обязательного FFmpeg принят ADR-012/013.

[STEP-027](../planning/tasks/STEP-027.md) завершён: [финальный audit](../planning/audits/AUDIT-20261015T172147Z.md) фиксирует 27/27 реальных циклов и 96 файлов на Linux x64, Windows x64 и macOS arm64, технический PASS и GO владельца от 2026-10-15. Приёмка относится к product source `sha256:25a6a43bde2aa78ac3f5d74f533cec434ff0173d87859dbf0dfcaf78c0fdea07`, а не к текущему HEAD или будущим версиям. Сохранённые failed/partial попытки не считаются дополнительными PASS; эта матрица не доказывает универсальные Range, TTL signed URL или все форматы provider.

Решения desktop по SQLite, Electron и IPC приняты ADR-014/015/016 ([STEP-028](../planning/tasks/STEP-028.md)); отдельно завершены [SQLite STEP-029](../planning/tasks/STEP-029.md), [desktop shell STEP-030](../planning/tasks/STEP-030.md), [загрузки STEP-031](../planning/tasks/STEP-031.md) и [History/Settings/Account/Diagnostics STEP-032](../planning/tasks/STEP-032.md). Их собственные Acceptance/Verification и оставшиеся desktop E2E, packaging и platform gates не заменяются headless GO. Открытые и отложенные решения, включая rate limits OQ-009 (deferred) и подпись OQ-013 (open), перечислены в `docs/OPEN_QUESTIONS.md`; упаковка относится к STEP-034/035/036. Известный architecture drift этим STEP не установлен.
