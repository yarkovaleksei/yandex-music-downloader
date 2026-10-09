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

- **Application layer** — транспорт-независимый API для клиентов (авторизация, preview, создание и управление job, история, диагностика, `subscribe` на версионированные события и `CommandResult`); единственный composition root; runtime-специфичные реализации (secure storage, SQLite, каталог состояния) передаются клиентом через `runtimeAdapters` (ADR-001, ADR-007).
- **Downloader core** — Download Planner (immutable `DownloadPlan`), quality resolver, Download Manager (очередь, concurrency, pause/resume/cancel/retry, прогресс), state machine (ADR-006), manifest/recovery, filesystem (sanitizer, генератор путей, `.part`-запись), validation.
- **MusicProvider** — контракт источника (ADR-002); **YandexMusicProvider** — adapter с runtime-схемами, `PROVIDER_SCHEMA_VERSION` и нормализацией ошибок.
- **Metadata** — запись тегов и обложек (библиотека — по ADR STEP-020).
- **Persistence** — файловый `ManifestStore` в headless MVP; CLI `CredentialStore` через native системный keyring (ADR-010), создаваемый application composition root и передаваемый provider через shared-порт; SQLite с миграциями на этапе desktop.
- **Desktop (этап 2)** — Electron main/preload/renderer, typed IPC, React + MUI.

## Data / state model

Доменные сущности: `Track`, `Album`, `Playlist`, `AudioVariant`, `DownloadRequest`, `DownloadJob`, `DownloadTrackJob`, `MediaReference` (brief §8).

Metadata contract развивается [ADR-011](adr/ADR-011-shared-metadata-contract.md): Track — union available/unavailable/unknown, genre — optional строка в track/album/album reference. Полные title/artists обязательны только для available; минимальная недоступная/неподтверждённая запись сохраняет ID и место в коллекции без выдуманных metadata. Это документальная форма; shared/mock код вводит STEP-039, provider raw mapping — STEP-009 после этого prerequisite. PRN-003 сохраняется: unknown не разрешает чтение контента, а available metadata не заменяет проверку полного audio variant.

- Единица работы — трек в составе job (ключ — позиция в плане); статусы и переходы описаны в ADR-006; статус job агрегируется детерминированно (`completed_with_errors`, `interrupted` и др.); job имеет control-состояние (`running`/`paused`/`cancelled`).
- `DownloadPlan` формируется до загрузки и неизменяем для операции.
- Manifest v1 (ADR-004): один JSON на job — план, статусы и выбранные variants треков, пути, попытки, последняя ошибка; записывается атомарно; не содержит секретов. Job принадлежит одному процессу через эксклюзивную аренду (PID и время старта, hostname, heartbeat); manifest пишет только держатель аренды, а команды других процессов — control-запросы через отдельный канал хранилища (ADR-004).
- Headless MVP: файловое хранилище за `ManifestStore` (OQ-006 разрешён); desktop: SQLite (история, очередь, jobs, настройки, ссылки на manifest, диагностика) с миграциями N → N+1.
- Cache метаданных/обложек/ответов provider с TTL; audio cache в MVP не предусмотрен.

## Основные потоки

1. `url` → provider `resolveUrl` → `MediaReference` (или `UNSUPPORTED_URL`).
2. Provider `getTrack/getAlbum/getPlaylist` → Planner строит immutable `DownloadPlan` → job создаётся, manifest записывается.
3. Для каждого трека: в `resolving` provider получает metadata, варианты и байты обложки → quality resolver выбирает variant (контейнер известен) → если итоговый файл уже существует и валиден — `skipped`; иначе `openAudioStream` (→ `AudioStream` с размером, контейнером, поддержкой Range) → запись в уникальный `*.part` → валидация → теги и уже полученная обложка → атомарный rename (точка фиксации) → статус `completed` в manifest.
4. Ошибки: transient → `retry_wait` с backoff+jitter; non-retryable → `failed`; `STREAM_EXPIRED` (истёкшая подпись) → повторный `openAudioStream` в пределах попыток. Повторы выполняет только core.
5. Прерывание: SIGINT переводит активные треки в `paused`; после аварийного завершения recovery при захвате устаревшей аренды нормализует незавершённые треки в очередь (ADR-006/ADR-004), completed пропускаются.
6. Playlist: каталог, нумерация по позиции, `cover.jpg`, `.m3u8` с относительными путями.

## External dependencies / integrations

- **API Яндекс Музыки** — неофициальный; доступ только через provider adapter; стабильность не гарантируется. Стратегия schema drift принята ADR-009/OQ-007; наблюдения Range/signed URL ограничены STEP-005, числовой rate limit не установлен.
- **`@dvxch/yandex-music@0.3.0`** — закреплённая библиотека внутри provider. Стратегия ADR-009 предписывает обёртку с проверкой raw JSON до моделей и доменной проекции после них через Zod 4, отключение library retries и допуск preview только при явном false; реализация — STEP-008/009/010, modern encraw и полный resume ещё требуют proof STEP-010. `PROVIDER_SCHEMA_VERSION` — отдельная SemVer версия проверяемых схем/маппинга, экспорт STEP-009 и diagnostics STEP-025.
- **CLI native credential storage** — `@napi-rs/keyring`: Windows Credential Manager текущего пользователя, macOS Login Keychain, Linux защищённый GNOME Keyring через явно выбранный Secret Service, без keyutils/plaintext fallback (ADR-010). Реализация/платформенные проверки — STEP-008; отсутствие доступного backend даёт ошибку, не альтернативное сохранение.
- **FFmpeg** — опциональная зависимость диагностики/валидации (решение об упаковке — OQ-005).
- **Провайдер обложек** — только через `provider.fetchArtwork`; клиенты и core не обращаются к CDN обложек.
- **SQLite-библиотека, библиотека тегов, Electron secure storage** — выбираются отдельными ADR (STEP-020, STEP-028).

## Security boundaries

- Пароль пользователя не запрашивается и не хранится; CLI использует Device Authorization с приватной browser-страницей provider и native CredentialStore (ADR-010). Challenge/credentials не проходят application API и AuthInteraction.notify; там только безопасное уведомление. Истёкший токен даёт AUTH_ERROR без автоматического refresh/replay; повторная авторизация явная. Desktop secure storage остаётся отдельным решением OQ-010 (PRN-002).
- Секреты (токен, cookies, Authorization, credentials, signed URL с security-параметрами) не попадают в logs, events, manifest, cache, SQLite (централизованная редакция).
- Работа только с контентом, доступным текущему аккаунту (PRN-003).
- Ключи расшифровки потока (если применяются) остаются внутри provider и не попадают в `variantKey`, manifest, cache, логи и события.
- Токены не проходят через application API и IPC; события и DTO ошибок не содержат секретов.
- Electron: `contextIsolation = true`, `nodeIntegration = false`, `sandbox = true`; renderer не имеет прямого доступа к fs, child_process, токенам, базе и provider; связь только через typed preload API / IPC (детали — ADR STEP-028).
- Filename sanitizer предотвращает path traversal.

## Reliability / observability

- Атомарная финализация файлов и manifest (ADR-004); retry только для transient-ошибок.
- Structured logging (error/warn/info/debug/trace, default info), `jobId`/`correlationId`; события операции с `durationMs`.
- Нормализованные доменные ошибки; provider health различает `NETWORK_ERROR`, `AUTH_ERROR`, `API_CHANGED`, `SERVICE_UNAVAILABLE`, `PROVIDER_RESPONSE_INVALID`.
- `doctor` проверяет runtime, provider, auth, account, metadata, variants, filesystem, FFmpeg, хранилище.

## Deployment / runtime assumptions

- Node.js `>=22.13.0 <25`, TypeScript `strict`, Yarn 4 workspaces с `nodeLinker: node-modules` (ADR-008).
- CLI запускается локально; desktop — Electron для Windows x64, macOS arm64/x64, Linux x64; дистрибутивы, подписание и автообновление — этап packaging (ADR STEP-034).
- Остальной toolchain (тестовый раннер, сборка, формат модулей) выбирается в STEP-001 и фиксируется в `docs/development.md`.

## Accepted ADR

См. `docs/adr/README.md`.

## Известный architecture debt / drift

Слои monorepo/shared реализованы STEP-001/003, исследование API — STEP-005. ADR-009/010 фиксируют стратегию adapter/CLI auth, но production wrapper, схемы, native store и platform proof ещё принадлежат STEP-008/009/010/018/019/025. Открытые и отложенные решения, включая desktop storage OQ-010 и качество OQ-011, перечислены в `docs/OPEN_QUESTIONS.md`; решения по метаданным/FFmpeg, SQLite/Electron/IPC и упаковке принимаются соответствующими STEP. Известный architecture drift этим STEP не установлен.
