# Architecture

> Текущее устройство продукта. Устойчивые решения описаны в [ADR](architecture-decisions/README.md), нерешённые вопросы — в [оглавлении открытых вопросов](open-questions/README.md).

## System context

Приложение — локальный клиент одного пользователя. Оно обращается к неофициальному API Яндекс Музыки (метаданные, список вариантов аудио, потоки на CDN с signed URL) от имени авторизованного пользователя и записывает файлы в выбранный каталог. Серверной части, облачной синхронизации и multi-user режима нет.

CLI и Electron UI используют один downloader core через общий application API.

## Основные компоненты / границы

Направление зависимостей (ADR-001, REQ-044):

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
- **MusicProvider** — контракт источника (ADR-002); **YandexMusicProvider** изолирует Device Authorization, нормализацию ошибок, runtime-схемы и mapping в provider. Его текущая версия схем/маппинга — `PROVIDER_SCHEMA_VERSION` `1.1.0` ([экспорт](../packages/providers/yandex-music/src/index.ts)).
- **Metadata** — `createMetadataWriter()` записывает теги и уже полученные от provider bytes обложки через buffer API `taglib-wasm`; container `mp3 | mp4` передаётся явно и сверяется с содержимым `.part` до изменения. Writer не выполняет сеть и не запускает subprocess ([реализация](../packages/metadata/src/index.ts), [ADR-012](architecture-decisions/ADR-012-audio-metadata-library.md)).
- **Validation** — `createAudioValidator()` / `validateLocalAudio()` проверяют непустой файл, завершение и размер потока при переданных stream-признаках, container/codec и длительность через `music-metadata`; допуск длительности — большее из 1000 мс и 1% ожидаемой. Базовая проверка не запускает внешний decoder; `validateWithFfmpeg()` — отдельный явный opt-in с путём к executable ([реализация](../packages/core/validation/src/index.ts), [ADR-013](architecture-decisions/ADR-013-optional-ffmpeg.md)).
- **Cache** — application оборачивает provider в `CachedProvider` с файловым `FileCacheStore`: TTL по умолчанию 5 минут, `runtimeAdapters.cache.ttlMs = 0` отключает cache. Ключ учитывает provider, текущий account, schema version, метод и аргументы; кэшируются track/album/playlist metadata и artwork. Без аккаунта запрос идёт к provider; variants и audio stream всегда делегируются без cache. `clearApplicationCache()` очищает только `<stateDir>/cache`, сохраняя manifest и аудиофайлы ([composition root](../packages/application/src/composition-root.ts), [decorator](../packages/application/src/cached-provider.ts), [очистка](../packages/application/src/cache.ts)).
- **Persistence** — default для CLI и desktop — SQLite в общей базе `<stateDir>/state.sqlite3` с forward-only миграциями N → N+1 ([ADR-014](architecture-decisions/ADR-014-sqlite-persistence.md)). `FileManifestStore` сохраняется для импорта и contract-тестов. `CredentialStore` использует native системный keyring (ADR-010/015), создаётся application composition root и передаётся provider через shared-порт; секреты не хранятся в SQLite.
- **Desktop** — Electron main (окна, IPC broker, системные диалоги), application host в `utilityProcess` (application, provider, SQLite, credential store), preload с typed `DesktopApi`, недоверенный renderer на React + MUI (ADR-015, ADR-016).
  - Безопасные preview/account DTO передают только доступные metadata и байты изображений; renderer не получает provider keys, signed URL или raw payload. `downloadArtwork(jobId)` отделён от чтения списка и управления заданиями. Preview и рабочий resolver используют общий фильтр поддержанных MP3/mp3, AAC/m4a и FLAC/m4a; exact selector не допускает тихого fallback. Автоматическое открытие папки не выполняется. Ручные `jobFolderAvailability`/открытие используют main-owned проверку сохранённого результата через host с повторной проверкой перед shell; renderer не задаёт путь. История не перечитывается ради открытия папки. Локальный `appInfo` возвращает версию/dev без сети. Необязательный `accountAvatar()` передаёт только ограниченные bytes/MIME через application/typed IPC; profile/CDN остаются внутри provider, отсутствие/ошибка фото не задерживают account.

## Data / state model

Доменные сущности: `Track`, `Album`, `Playlist`, `AudioVariant`, `DownloadRequest`, `DownloadJob`, `DownloadTrackJob`, `MediaReference`.

Metadata contract определяет [ADR-011](architecture-decisions/ADR-011-shared-metadata-contract.md): shared `Track` — union `available`/`unavailable`/`unknown`; `genre` необязателен в track/album/album reference. Полные `title`/`artists` обязательны только для `available`; минимальная недоступная или неподтверждённая запись сохраняет ID и позицию в коллекции без выдуманных metadata ([контракт](../packages/shared/src/domain.ts)). Плейлист сохраняет позицию каждой записи, поэтому повтор одного track не теряется. REQ-038 сохраняется: `unknown` не разрешает чтение контента, а `available` metadata не заменяет проверку полного audio variant.

`JobEvent` и `CommandResult` имеют versioned JSON-envelope schema `1`: событие содержит `seq` и `jobId`, track-события — `trackKey`, а наблюдаемые завершения — `durationMs`; `CommandResult` разделяет успешный `data` и ошибку ([контракт](../packages/shared/src/events.ts)).

- Единица работы — трек в составе job (ключ — позиция в плане); статусы и переходы описаны в ADR-006; статус job агрегируется детерминированно (`completed_with_errors`, `interrupted` и др.); job имеет control-состояние (`running`/`paused`/`cancelled`).
- `DownloadPlan` формируется до загрузки и неизменяем для операции.
- Manifest v1 (ADR-004, ADR-014) — валидированный документ job: план, статусы и выбранные variants треков, пути, попытки и последняя ошибка; не содержит секретов. Job принадлежит одному процессу через эксклюзивную аренду (PID и время старта, hostname, heartbeat); manifest пишет только держатель аренды, а команды других процессов — control-запросы через отдельный канал хранилища (ADR-004).
- Хранилище за `ManifestStore` (ADR-014):
  - SQLite — единый источник истины для CLI и desktop: manifest v1 как валидированный документ, аренда, control-запросы, история, очередь, настройки, безопасная диагностика;
  - WAL, `BEGIN IMMEDIATE` для аренды;
  - миграции N → N+1 с резервной копией;
  - база новее поддерживаемой не изменяется;
  - идемпотентный импорт файловых manifest (повторяется при открытии для ещё не импортированных) без удаления исходников;
  - аудио, `.part`, обложки и файловый cache остаются в файловой системе.
- JSON настроек и `EffectiveDownload`: `writeTags/saveCoverFile/writeM3u8` по умолчанию `true`, тема настроек — `light`. Чтение настроек полностью игнорирует устаревшее `openFolderOnComplete`, включая `true`, и не публикует его в settings/job DTO или новых snapshots; чтение старых JSON не запускает shell и не меняет остальные параметры. Старые настройки и полные snapshots нормализуются при чтении без переписывания сохранённого JSON. Snapshot фиксирует точный `variantSelection` и эффективные параметры до запуска; resume/retry/replay сохраняют исходные значения, а legacy-запись без snapshot не получает replay. Встроенная обложка остаётся включена независимо от текстовых тегов и `cover.jpg`.
- Cache метаданных/обложек/ответов provider с TTL; audio cache не предусмотрен. Необязательный avatar cache использует существующий файловый store и account-scoped ключ provider/account/schema/method, payload — только MIME/image bytes. TTL настраивается через runtime adapters (по умолчанию 5 минут); повторное открытие/новый instance используют свежую запись, expiry/очистка требуют нового получения фото. Avatar request не занимает общую serial очередь; provider/application/cache/renderer проверяют текущий account и актуальность ответа после logout/change account. Это предотвращает публикацию чужого/позднего изображения, но не вводит отдельную гарантию удаления cache-файлов при выходе.

## Основные потоки

1. `url` → provider `resolveUrl` → `MediaReference` (или `UNSUPPORTED_URL`).
2. Provider `getTrack/getAlbum/getPlaylist` → Planner строит immutable `DownloadPlan` → job создаётся, manifest записывается.
3. Для каждого трека: в `resolving` provider получает metadata, варианты и байты обложки → quality resolver выбирает variant (контейнер известен) → если итоговый файл уже существует и валиден — `skipped`; иначе `openAudioStream` (→ `AudioStream` с размером, контейнером, поддержкой Range) → запись в уникальный `*.part` → валидация → теги и уже полученная обложка → атомарный rename (точка фиксации) → статус `completed` в manifest.
4. Ошибки: transient → `retry_wait` с backoff+jitter; non-retryable → `failed`; `STREAM_EXPIRED` (истёкшая подпись) → повторный `openAudioStream` в пределах попыток. Повторы выполняет только core.
5. Прерывание: SIGINT переводит активные треки в `paused`; после аварийного завершения recovery при захвате устаревшей аренды нормализует незавершённые треки в очередь (ADR-006/ADR-004), completed пропускаются.
6. Playlist: каталог, нумерация по позиции, `cover.jpg`, `.m3u8` с относительными путями.

## External dependencies / integrations

- **API Яндекс Музыки** — неофициальный; доступ только через provider adapter; стабильность не гарантируется. Реализованы `resolveUrl`, Device Authorization, account, track/album/playlist metadata, artwork и audio variants/stream ([provider](../packages/providers/yandex-music/src/index.ts)). Стратегия schema drift принята ADR-009/OQ-007; числовой rate limit не установлен.
- **`@dvxch/yandex-music@0.3.0`** — закреплённая библиотека внутри provider. Обёртка проверяет raw JSON до моделей и выполняет доменную проекцию после них через Zod 4; library retries отключены, полные audio variants допускаются только при `preview=false`. `PROVIDER_SCHEMA_VERSION` `1.1.0` — отдельная SemVer-версия проверяемых схем/маппинга ([экспорт](../packages/providers/yandex-music/src/index.ts)).
- **Audio provider boundary** — полный вариант допускается только при явном `preview=false`; preview/unknown исключаются. Поддержка `Range` и срок жизни signed URL зависят от ответа provider; универсальная гарантия для всех потоков отсутствует.
- **CLI native credential storage** — `CliCredentialStore` использует `@napi-rs/keyring`: Windows Credential Manager текущего пользователя, macOS Login Keychain, Linux защищённый GNOME Keyring через явно выбранный Secret Service, без keyutils/plaintext fallback ([реализация](../packages/persistence/src/cli-credential-store.ts)). При недоступном или locked backend store отказывает, не переключаясь на альтернативное хранение.
- **Metadata / validation** — runtime writer использует `taglib-wasm`, baseline reader — `music-metadata` ([writer](../packages/metadata/src/index.ts), [validator](../packages/core/validation/src/index.ts)). Выбор writer принят [ADR-012](architecture-decisions/ADR-012-audio-metadata-library.md); синтетические MP3, MP4/AAC и MP4/FLAC покрыты [тестами независимого readback](../packages/metadata/src/index.test.ts).
- **FFmpeg / ffprobe** — опциональные внешние инструменты. Baseline без обязательной установки, автоматического скачивания и bundling определяет [ADR-013](architecture-decisions/ADR-013-optional-ffmpeg.md), которым разрешён OQ-005; обязательные загрузка, тегирование и базовая validation работают без них. Отдельный `validateWithFfmpeg()` не включается автоматически наличием binary; упаковка и возможный будущий bundled вариант требуют собственных доказательств и решения.
- **Провайдер обложек** — только через `provider.fetchArtwork`; клиенты и core не обращаются к CDN обложек.
- **SQLite** — `better-sqlite3` 13 (Node-API, prebuilt binaries) только в `packages/persistence` (ADR-014).
- **Desktop credential storage** — `@napi-rs/keyring` в application host, namespace `music-downloader.desktop.yandex-music`, без `safeStorage` и plaintext fallback (ADR-015, OQ-010 решён).

## Security boundaries

- Пароль пользователя не запрашивается и не хранится; CLI использует Device Authorization с приватной browser-страницей provider и native CredentialStore (ADR-010). Challenge/credentials не проходят application API и AuthInteraction.notify; там только безопасное уведомление. Истёкший токен даёт AUTH_ERROR без автоматического refresh/replay; повторная авторизация явная. Desktop использует тот же Device Authorization flow в application host и системное хранилище через `@napi-rs/keyring` с отдельным namespace; при недоступном хранилище — явная ошибка без fallback (ADR-015, REQ-039).
- Секреты (токен, cookies, Authorization, credentials, signed URL с security-параметрами) не попадают в logs, events, manifest, cache, SQLite (централизованная редакция).
- Работа только с контентом, доступным текущему аккаунту (REQ-038).
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
- Logger пишет JSON в stderr, по умолчанию на уровне `info`, поддерживает `error`/`warn`/`info`/`debug`/`trace` и наследуемый child-context с `jobId`/`correlationId` ([logger](../packages/logging/src/logger.ts)). Redactor очищает зарегистрированные поля и значения, а также query у URL; он не является универсальным обнаружителем секретов ([redactor](../packages/logging/src/redactor.ts)).
- Нормализованные доменные ошибки; provider health различает `NETWORK_ERROR`, `AUTH_ERROR`, `API_CHANGED`, `SERVICE_UNAVAILABLE`, `PROVIDER_RESPONSE_INVALID`.
- `doctor` проверяет runtime, provider, auth, account, metadata, variants, filesystem, FFmpeg, хранилище.

## Deployment / runtime assumptions

- Node.js `>=22.14.0 <25` (ADR-008, ADR-017), TypeScript `strict`, Yarn 4 workspaces с `nodeLinker: node-modules` (ADR-008). Команды сборки и проверки — в [руководстве разработчика](development.md).
- CLI запускается локально; desktop — Electron для Windows x64, macOS arm64/x64 и Linux x64. Единый Linux-сборщик использует electron-builder: portable Windows ZIP, macOS `.app` ZIP и Linux AppImage ([ADR-019](architecture-decisions/ADR-019-portable-distribution-and-updates.md)). Платные сертификаты и notarization не требуются; предупреждения ОС о неизвестном издателе допустимы.
- Каталог состояния общий для CLI и desktop — `resolveStateDirectory()`. Electron `userData` не хранит доменное состояние (ADR-014).
- Native-модули `better-sqlite3` и `@napi-rs/keyring` используют Node-API. Их совместимость с Node.js и Electron проверяется на целевых платформах; скрытая замена хранилища при несовместимости не допускается.
- Упаковка сохраняет Electron fuses и не использует виртуализацию/sandbox, изолирующие общий `stateDir` или доступ к Secret Service/Keychain: MSIX AppData, Mac App Sandbox, Flatpak/Snap.
- На macOS без системной подписи возможны запросы или отказ доступа к Keychain; допустима явная повторная авторизация без plaintext fallback (ADR-019).
- После миграции SQLite старая версия клиента перестаёт писать до обновления (ADR-014).

Проверка обновлений принадлежит Electron main ([реализация](../apps/desktop/src/main/update/service.ts), ADR-019). По запросу пользователя проверяются Ed25519 descriptor, версия, канал, target, разрешённые HTTPS origins, фактический размер и SHA-256 portable-пакета. Перед открытием папки файл проверяется повторно; неполный файл не выдаётся как готовый. Пользователь заменяет приложение вручную; фоновая загрузка, автоматическая установка/запуск и electron-updater/Squirrel не используются. Application host сохраняет ownership заданий, SQLite и credentials.

Публичный [trust config](../apps/desktop/packaging/update-trust.json) включается в production ASAR и manifest inputs. Stable-канал использует GitHub Releases текущего репозитория: плоские assets `update-stable-<target>.json(.sig)` выбираются через `latest`, а подписанный URL пакета привязан к версии. Generic HTTPS feeds используют вложенную адресацию. Stable не принимает prerelease. Приватный Ed25519-ключ доступен Linux-команде `release-update.mjs init-key/sign` через системный credential store; fallback в файл и передача ключа аргументом не предусмотрены. Подготовка release-комплекта не публикует Releases и не создаёт Git-теги.

## Accepted ADR

См. [индекс архитектурных решений](architecture-decisions/README.md).
