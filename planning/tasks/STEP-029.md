---
schema: 1
id: STEP-029
status: planned
type: implementation
priority: medium
phase: desktop
depends_on:
  - STEP-018
  - STEP-028
  - STEP-055
requirements:
  - REQ-033
adrs:
  - ADR-004
  - ADR-014
  - ADR-017
architecture_refs:
  - docs/architecture.md#data-state-model
risk_flags:
  - data-migration
plan:
  status: draft
  revision: 0
  context_basis: null
  content_hash: null
  reviewed_report: null
  planned_at: null
  execution_groups:
  context_components: []
---

# STEP-029 — SQLite persistence и миграции

## Goal

Реализовать SQLite-реализацию `ManifestStore` (jobs, manifest, аренда, control-запросы, история и очередь как производные от jobs) с миграциями и импортом файловых manifest; заменить ею default store application.

## Context

Семантика manifest и интерфейс `ManifestStore` сохраняются (ADR-004).

ADR-014 требует доказать загрузку `better-sqlite3` и тесты persistence на Node.js для Windows x64, macOS arm64/x64 и Linux x64. GitHub Actions для Windows/macOS недоступен до восстановления биллинга (не раньше 2026-11-07, см. STEP-054). Решение владельца продукта (2026-10-16): платформы подтверждаются ручным прогоном самодостаточного набора проверки (свой Node.js внутри, без установленного Node.js/Yarn на машине проверяющего) на Windows x64 и на Mac (arm64 нативно и x64 через Rosetta); Linux x64 — локально.

Решения владельца продукта (2026-10-16, после planning review PLAN-REVIEW-20261016T162234Z): нижняя граница Node.js поднимается до 22.14.0 (ADR-017, prerequisite STEP-055); хранение settings и безопасной диагностики в SQLite передано STEP-032; для понятной ошибки несовместимости базы разрешена аддитивная правка `packages/shared` и отображение в CLI.

## Scope

- Схема v1 и механизм миграций N → N+1.
- Реализация интерфейсов хранения за application layer.
- Отказ при более новой версии схемы.
- Тесты миграций.
- Различимый сигнал несовместимости базы более новой версии в публичном результате (CLI и `--json`, doctor).
- Самодостаточный набор платформенной проверки (встроенный Node.js) в `packages/persistence/platform-check/`.

## Mutation policy

### Allowed

- `packages/persistence/**`, `packages/application/**` (wiring), тесты.

### Conditional

- `packages/shared/src/errors.ts`, `packages/shared/src/events.ts` — только аддитивный безопасный сигнал несовместимости схемы базы (ADR-007).
- `apps/cli/src/**` — только отображение этого сигнала и адаптация существующих тестов/фикстур CLI к SQLite default store; без импорта persistence в apps.
- `yarn.lock` — только записи `better-sqlite3`, `@types/better-sqlite3` и их транзитивных зависимостей, штатным Yarn.

### Forbidden

- Пересоздание базы при несовпадении версии, токены в базе.
- Реализация future/unrelated STEP «заодно».

## Out of scope

- Хранение settings и безопасной диагностики provider в SQLite (STEP-032, миграция следующей версии).
- UI истории (STEP-032).

## Acceptance criteria

- Все миграции применяются последовательно к базе v1 без потери данных.
- База более новой версии не изменяется; приложение сообщает о несовместимости.
- В базе нет токенов (автоматическая проверка).

## Verification

- command: `node packages/testing/scripts/run-yarn.mjs install --immutable`
- command: `npm run lint`
- command: `npm run typecheck`
- command: `npm test`
- command: `python3 .harness/tools/validate.py --mode manual`
- manual: Владелец или коллега запускает самодостаточный набор платформенной проверки (встроенный Node.js, без установки зависимостей) на Windows x64, macOS arm64 и macOS x64 (Rosetta или Intel); отчёты `report.json` показывают platform/arch и PASS проверок SQLite store.

## Deliverables

- SQLite store и тесты миграций.

## Implementation plan

### 1. Зависимости

- В packages/persistence/package.json закрепить better-sqlite3 13.0.3 (dependency) и @types/better-sqlite3 9.6.0 (devDependency); обновить yarn.lock штатным Yarn (прецедент STEP-008)
- Boundaries не менять: persistence уже может импортировать better-sqlite3, application/core — нет

**Files:**
- packages/persistence/package.json
- yarn.lock

**Risks:**
- Prebuilt binaries better-sqlite3 13 есть в пакете для darwin-arm64/x64, win32-x64, linux-x64; иной платформе нужен toolchain сборки

### 2. Открытие базы, права и миграции

- Модуль sqlite-database.ts: путь <stateDir>/state.sqlite3; на POSIX stateDir создаётся/проверяется 0700, файл базы предсоздаётся 0600 до открытия; WAL, synchronous=FULL, foreign_keys=ON, busy_timeout
- До любой записи прочитать user_version (read-only соединение); версия новее поддерживаемой — ValidationError несовместимости без записи и без создания файлов
- Forward-only раннер: упорядоченный список {version, up}; каждая миграция N→N+1 в своей транзакции вместе с user_version и строкой schema_migrations; список инъецируется для тестов
- Перед миграцией существующей базы — резервная копия SQLite backup в state.sqlite3.bak-v<N>, предсозданная 0600; без копии миграция не начинается; при ошибке шага база остаётся в последней успешной версии
- Каждая транзакция записи сверяет user_version с версией процесса и при расхождении отказывает безопасной ошибкой
- Raw SQLite/native сообщения не попадают в публичные ошибки

**Files:**
- packages/persistence/src/sqlite-database.ts
- packages/persistence/src/sqlite-migrations.ts

### 3. Схема v1

- Таблицы: jobs (job_id PK, manifest JSON, status, updated_at), leases (job_id PK, pid, hostname, process_started_at, generation, owner_token, acquired_at, heartbeat_at, released_at), control_requests (request_id PK, job_id, command, created_at), control_receipts (request_id PK, job_id, receipt JSON), file_imports (source_path, sha256, job_id, imported_at), schema_migrations (version PK, applied_at)
- Колонок для токенов, cookies, Authorization, credentials и signed URL нет

**Files:**
- packages/persistence/src/sqlite-migrations.ts

### 4. SqliteManifestStore и SqliteLeaseSession

- Реализовать ManifestStore поверх схемы: read/list (валидация decodeManifest, порядок jobId), create (отказ при существующем), readLeaseState (те же правила active/inactive/unknown, что у файлового store)
- acquire: прочитать lease → async probeLease вне транзакции → BEGIN IMMEDIATE: убедиться, что lease не изменилась (generation/owner_token/heartbeat), записать новую lease generation+1 и ownerToken (CAS) → вызвать recover → сохранить manifest; при ошибке recover/save освободить lease. Правила reclaim (heartbeat 30 с, probe, foreign host только force+expectedGeneration) повторяют ADR-004/FileManifestStore
- LeaseSession повторяет семантику файловой: serial-очередь, объединение progress-only save на 250 мс, heartbeat 5 с, runOwned/closing, release; каждая запись в одной транзакции сверяет owner_token+generation и user_version; план неизменяем после create
- sendControl/waitControlAck/consumeControls/acknowledge через control_requests/control_receipts с той же семантикой lastControl
- Общую политику (observedLeaseFrom, isProgressOnly, правила reclaim) вынести в общий модуль persistence без изменения поведения FileManifestStore

**Files:**
- packages/persistence/src/sqlite-manifest-store.ts
- packages/persistence/src/lease-policy.ts
- packages/persistence/src/file-manifest-store.ts
- packages/persistence/src/index.ts

### 5. Импорт файловых manifest

- При открытии store идемпотентно (job_id + sha256) импортировать валидные manifest v1 файлового store без активной аренды (readLeaseState файлового store = inactive); active/unknown/чужой хост — пропустить до следующего открытия; повреждённые — пропустить
- Исходные файлы не менять и не удалять; импортированный manifest больше не читается из файла; безопасная диагностика — только счётчики
- FileManifestStore и его contract-тесты сохраняются

**Files:**
- packages/persistence/src/sqlite-file-import.ts

### 6. Wiring в application

- composition-root: default store — SqliteManifestStore({stateDir}) вместо FileManifestStore; adapters.manifestStore по-прежнему переопределяет
- Обновить application/CLI integration-тесты и фикстуры, которые читали файловый store напрямую, на проверку через порт/новый default

**Files:**
- packages/application/src/composition-root.ts
- packages/application/src/*.test.ts
- packages/application/src/fixtures/*.mjs
- apps/cli/src/headless.integration.test.ts

**Risks:**
- Изменение apps/cli теста выходит за packages/**: только адаптация существующего теста к новому default store, без изменения CLI-кода

### 7. Тесты

- runManifestStoreContract для SqliteManifestStore
- Двухпроцессные integration-тесты на built dist: второй живой владелец отклоняется, ровно один победитель при конкурентном reclaim устаревшей аренды, foreign lease только с force
- Миграции: база v1 с данными + тестовая миграция v2 → данные сохранены, user_version=2, есть резервная копия; ошибка шага оставляет последнюю успешную версию
- База версии новее: отказ, байты файла и отсутствие -wal/-shm неизменны
- Соединение, открытое до миграции другим процессом, после неё не пишет
- POSIX-права 0700/0600 на stateDir, базу, WAL, SHM и резервную копию
- Отсутствие секретов: после работы application с fixture credentials байты базы, WAL и копии не содержат fixture-токенов
- Импорт: inactive импортируется, active/unknown пропускается, повтор идемпотентен, исходники не изменены

**Files:**
- packages/persistence/src/sqlite-*.test.ts
- packages/persistence/src/fixtures/sqlite-owner.mjs

### 8. Самодостаточный набор платформенной проверки

- packages/persistence/platform-check/check.mjs: без vitest и сети, на built dist и better-sqlite3 из набора; во временном каталоге проверяет загрузку binding, миграции, CRUD, двухпроцессную аренду (process.execPath), отказ новой версии, POSIX-права, отсутствие секретов; пишет report-<platform>-<arch>.json с версиями Node/SQLite/better-sqlite3 и статусом каждой проверки
- packages/persistence/platform-check/build-kit.mjs (запуск на машине разработчика): собирает zip с check.mjs, dist persistence/shared, better-sqlite3 (prebuilds всех платформ) и зависимостями рантайма, а также официальными Node.js 24.21.0 darwin-arm64, darwin-x64, win-x64, скачанными с nodejs.org с проверкой SHASUMS256
- Launchers: run-macos.command (arm64 нативно; x64 через arch -x86_64 при наличии Rosetta; Intel — x64; проверка SHA-256 runtime перед запуском) и run-windows.cmd; на машине проверяющего не нужны Node.js, Yarn и сеть
- README набора: запуск двойным кликом, снятие quarantine при необходимости, какие файлы прислать; zip не коммитится
- Vitest-тест запускает check.mjs текущим Node на Linux как smoke

**Files:**
- packages/persistence/platform-check/**
- packages/persistence/src/platform-check.test.ts

**Risks:**
- Gatekeeper может потребовать открыть .command через контекстное меню — описано в README
- Если на Mac нет Rosetta, x64 проверяется на Intel Mac или ставится Rosetta

### 9. Проверка

- npm run lint, npm run typecheck, npm test, validate.py
- Собрать набор, прогнать его launcher-логику на Linux, передать zip владельцу; принять report.json Windows x64, macOS arm64, macOS x64 в Evidence

## Evidence

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.

## Blocker / Failure reason

—
