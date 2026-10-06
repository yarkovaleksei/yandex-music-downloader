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
- **Persistence** — файловый `ManifestStore` в headless MVP; SQLite с миграциями на этапе desktop.
- **Desktop (этап 2)** — Electron main/preload/renderer, typed IPC, React + MUI.

## Data / state model

Доменные сущности: `Track`, `Album`, `Playlist`, `AudioVariant`, `DownloadRequest`, `DownloadJob`, `DownloadTrackJob`, `MediaReference` (brief §8).

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

- **API Яндекс Музыки** — неофициальный; доступ только через provider adapter; стабильность не гарантируется (дрейф схемы, rate limits, TTL signed URL — открытые вопросы).
- **`@dvxch/yandex-music`** — начальная реализация adapter, деталь реализации (ADR-002).
- **FFmpeg** — опциональная зависимость диагностики/валидации (решение об упаковке — OQ-005).
- **Провайдер обложек** — только через `provider.fetchArtwork`; клиенты и core не обращаются к CDN обложек.
- **SQLite-библиотека, библиотека тегов, Electron secure storage** — выбираются отдельными ADR (STEP-020, STEP-028).

## Security boundaries

- Пароль пользователя не запрашивается и не хранится; токен — только в механизме, принятом ADR (CLI: защищённое локальное хранилище; desktop: системное secure storage) (PRN-002).
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

Нет (код ещё не создан). Нерешённые решения: OQ-001…OQ-005, OQ-007…OQ-011, OQ-013 (см. `docs/OPEN_QUESTIONS.md`); ADR по стратегии adapter и хранению токена, библиотеке метаданных/FFmpeg, SQLite/Electron/IPC и упаковке будут приняты соответствующими STEP.
