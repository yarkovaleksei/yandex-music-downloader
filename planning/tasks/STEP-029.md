---
schema: 1
id: STEP-029
status: in_progress
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
  status: ready
  revision: 1
  context_basis: sha256:34db27ca7fa926d2312591761115142a956edf8fc65ce4cdd187b89a398ff15f
  content_hash: sha256:01b7babdd0df200fa52f6ca752ab09eec362c8b724e0494c3b38de08787f2e55
  reviewed_report: planning/plan-reviews/STEP-029/PLAN-REVIEW-20261016T172942Z.md
  planned_at: 2026-10-16T17:29:42+00:00
  execution_groups:
  context_components:
    - "ADR@ADR-004=sha256:4ad987cbdefdf1409c52fd01994ccca0d6941fad8ae0126d435745f3e727ca08"
    - "ADR@ADR-014=sha256:d21dd58fd7f4167a6b4820ba1f26624fcf440fb7a3f9fdc926e1ec517a969f39"
    - "ADR@ADR-017=sha256:4b0466ed1a5ce6426d8af2e6cf5b994c69956e211bf63726d476a60cc7ec2469"
    - "ARCH@docs/architecture.md#data-state-model=sha256:38ecd31bbd0a8b067d00ce90ed660453971643d751137a909f1f497e99ccd0fc"
    - "PRN@PRN-001=sha256:3b3801f207fafc3f77272f0e93570258a6d006964839d93a276accd814d548af"
    - "PRN@PRN-002=sha256:f29ee3fbdb9cf65cf9739d0907768bbf192ad88b8e443110d4d82f81c6b79ecb"
    - "PRN@PRN-003=sha256:16516d7d302fecda5f7615f9d55e29e04b588d671f8660640e1f61d1619e4ef8"
    - "REQ@REQ-033=sha256:eebd2c563c397a0e22045b2832633cdee5ec23fc88fb3b2a025f8a6f41181a2a"
    - "STEP@STEP-018=sha256:ef554746f2dd587e4003775194675c6948f4b905d548119bfb60e491e7ec4659"
    - "STEP@STEP-028=sha256:0b26eaa1ff27fe883b551af84df8b8463676622f7c1176ce364d00eaf6e67616"
    - "STEP@STEP-029=sha256:d771e19ce5c0293db208ca5170343d28ac102e03c0bc99904fc547923f0ee89a"
    - "STEP@STEP-055=sha256:1ba8f049c5d77437da5b80d5a8615a2678c23b53ad9dcc64e41afb6b0eaa7780"
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
- manual: Тесты persistence и check.mjs проходят на Linux x64 под официальным Node.js 22.14.0 (нижняя граница ADR-017).
- manual: Владелец или коллега запускает самодостаточный набор платформенной проверки (встроенный Node.js, без установки зависимостей) на Windows x64, macOS arm64 и macOS x64 (Rosetta или Intel); отчёты `report-*.json` показывают platform/arch и PASS проверок SQLite store.

## Deliverables

- SQLite store и тесты миграций.

## Implementation plan

### 1. Зависимости

- packages/persistence/package.json: better-sqlite3 13.0.3 (dependency), @types/better-sqlite3 9.6.0 (devDependency); yarn.lock — только их записи и транзитивные (включая node-gyp, который Yarn подставляет), штатным Yarn (Conditional)
- Boundaries не менять: persistence может импортировать better-sqlite3, application/core — нет
- Проверено при планировании: tarball 13.0.3 содержит prebuilds darwin-arm64/x64, win32-x64, linux-x64; Node 22.14.0 (Node-API 10) открывает базу; эксперимент в scratch-копии репозитория с текущим .yarnrc.yml и Yarn 4.18.1: install даёт YN0004 «all build scripts have been disabled» (как и для esbuild), каталога build/ нет, binding грузится из prebuilds — toolchain не нужен, конфигурация Yarn не меняется. Источник проверен: `yarn config get enableScripts` = false и с пустым HOME (значение Yarn 4.18.1 по умолчанию, не пользовательский rc); better-sqlite3 13.0.3 не имеет install/postinstall и задаёт gypfile: false
- Если после реализации install в CI или локально начнёт собирать better-sqlite3 (YN0007 или каталог build/), это blocker с решением владельца (точечный dependenciesMeta.built=false), а не тихое изменение политики Yarn

**Files:**
- packages/persistence/package.json
- yarn.lock

### 2. Жизненный цикл, права, ошибки

- SqliteManifestStore: ленивое открытие при первом вызове; кэшируется только успешное открытие и отказы STATE_SCHEMA_UNSUPPORTED/CORRUPT, временные ошибки (BUSY, IO, EACCES) повторяются при следующем вызове; после close() — безопасный отказ без скрытого переоткрытия; явные open()/close() вне shared-порта; createApplication синхронный; ApplicationFacade.shutdown закрывает только default store, созданный composition root; auth/account базу не открывают
- journal_mode=WAL выставляется только после проверки user_version
- Путь <stateDir>/state.sqlite3; на POSIX stateDir 0700, файл базы предсоздаётся 0600 до открытия; synchronous=FULL, foreign_keys=ON, busy_timeout=5000
- Маппинг кодов SQLite: FULL → DiskFullError; PERM/READONLY/CANTOPEN → PermissionError; BUSY/LOCKED → безопасная ошибка store; CORRUPT/NOTADB → отказ без пересоздания и изменения файла; raw SQLite/native сообщения не сериализуются
- doctor не создаёт базу при её отсутствии: проверка хранилища через read-only путь (отсутствует → ok/empty); тест doctor.integration сохраняет ожидание пустого stateDir
- Тесты и набор закрывают базу до удаления каталога (Windows)

**Files:**
- packages/persistence/src/sqlite-database.ts
- packages/persistence/src/sqlite-errors.ts
- packages/application/src/composition-root.ts
- packages/application/src/application.ts
- packages/application/src/diagnostics.ts

### 3. Версия схемы и сигнал несовместимости

- До записи прочитать user_version; версия новее поддерживаемой → CommandRefusalError с новой аддитивной причиной STATE_SCHEMA_UNSUPPORTED (packages/shared errors.ts; ADR-007) без записей, миграций и копий
- Инвариант «база не изменяется»: основной файл побайтно неизменен, данных/миграций/копий нет; sidecar -wal/-shm допустимы (подтверждено экспериментом)
- CLI: при reason STATE_SCHEMA_UNSUPPORTED обычный вывод печатает подсказку «База состояния создана более новой версией приложения; обновите music-downloader»; --json несёт details.reason; exit-code как у прочих отказов валидации
- doctor: check хранилища показывает причину несовместимости без путей
- Каждая транзакция записи сверяет user_version с версией процесса и отказывает тем же сигналом; при SQL-ошибке чтения долгоживущий процесс перепроверяет user_version и возвращает STATE_SCHEMA_UNSUPPORTED, если схема новее

**Files:**
- packages/shared/src/errors.ts
- packages/persistence/src/sqlite-database.ts
- apps/cli/src/output.ts
- packages/application/src/diagnostics.ts

### 4. Миграции

- Forward-only раннер: упорядоченный список {version, up}, инъецируемый для тестов
- Шаг: BEGIN IMMEDIATE → перечитать user_version; ≥ N+1 — пропуск; выше поддерживаемой — STATE_SCHEMA_UNSUPPORTED; иначе up, user_version=N+1, строка schema_migrations, COMMIT
- Новая база (0→1) — без копии
- Перед миграцией существующей базы — SQLite backup во временный уникальный файл 0600 в stateDir, fsync, rename в state.sqlite3.bak-v<N>-<UTC>-<rand>; без успешной копии миграция не начинается; копии прошлых попыток не мешают
- При ошибке шага база остаётся в последней успешной версии; следующий запуск продолжает

**Files:**
- packages/persistence/src/sqlite-migrations.ts

### 5. Схема v1

- jobs (job_id PK, manifest JSON, control_state = manifest.control.state, updated_at); агрегированный статус вычисляет application
- leases (job_id PK, pid, hostname, process_started_at, generation, owner_token, acquired_at, heartbeat_at, released_at)
- control_requests (request_id PK, job_id, command, created_at); control_receipts (request_id PK, job_id, receipt JSON)
- file_imports (job_id, sha256, source_key, imported_at, UNIQUE(job_id, sha256)) — постоянный журнал без каскадного удаления от jobs
- import_skips (source_key PK по sha256-имени namespace-каталога, reason, count, observed_at) — upsert только при изменении, без путей
- schema_migrations (version PK, applied_at)
- Колонок для токенов, cookies, Authorization, credentials, signed URL нет

**Files:**
- packages/persistence/src/sqlite-migrations.ts

### 6. SqliteManifestStore и SqliteLeaseSession

- read/list/create/readLeaseState с семантикой файлового store (decodeManifest, порядок jobId, unknown не превращается в inactive)
- acquire: lease → async probeLease вне транзакции → BEGIN IMMEDIATE: существование job и неизменность lease (generation/owner_token/heartbeat), запись lease generation+1 с новым ownerToken (CAS), COMMIT → recover вне транзакции → save; ошибка recover/save освобождает lease; правила reclaim как в ADR-004
- Опции конструктора только для тестов: {now?, leaseTimeoutMs?, beforeLeaseCas?} — beforeLeaseCas вызывается перед BEGIN IMMEDIATE в acquire и служит барьером детерминированного теста конкурентного reclaim; в production не задаются
- LeaseSession повторяет файловую: serial-очередь, progress-only save 250 мс, heartbeat 5 с, runOwned/closing, release; каждая запись сверяет owner_token+generation и user_version в той же транзакции; план неизменяем
- sendControl/waitControlAck/consumeControls/acknowledge через control_requests/control_receipts с той же семантикой lastControl
- Общую политику (observedLeaseFrom, isProgressOnly, reclaim) вынести в lease-policy.ts без изменения поведения FileManifestStore

**Files:**
- packages/persistence/src/sqlite-manifest-store.ts
- packages/persistence/src/lease-policy.ts
- packages/persistence/src/file-manifest-store.ts
- packages/persistence/src/index.ts

### 7. Импорт файловых manifest

- При открытии сначала дешёвые проверки по базе: уже импортирован ли (job_id, sha256), есть ли job_id в jobs или в file_imports с любым sha256 (skip conflict) — и только для оставшихся вызывать FileManifestStore.readLeaseState; для inactive — одна транзакция BEGIN IMMEDIATE со сверкой user_version: INSERT jobs + file_imports (ON CONFLICT DO NOTHING)
- active/unknown/чужой хост — skip до следующего открытия; повреждённые — skip corrupt; счётчики в import_skips
- Исходные файлы не менять и не удалять; FileManifestStore и его contract-тесты сохраняются
- file_imports без FK на jobs, чтобы будущее удаление записи истории (STEP-032) не блокировалось

**Files:**
- packages/persistence/src/sqlite-file-import.ts

### 8. Wiring в application и CLI

- composition-root: default store — SqliteManifestStore({stateDir}); adapters.manifestStore переопределяет; shutdown закрывает созданный default store
- diagnostics.ts: backend 'sqlite' для default store
- Тесты application, проверявшие файловый store, переводятся на проверку через порт; старение аренды — тестовые опции SqliteManifestStore через adapters.manifestStore
- CLI gate-тест и apps/cli/src/fixtures/headless-owner.mjs: crash-resume через реальное истечение heartbeat (30 с, увеличенный timeout), наблюдение через stdout-события и application API, PRN-002 — сканированием байтов state.sqlite3*; без импорта persistence в apps

**Files:**
- packages/application/src/composition-root.ts
- packages/application/src/diagnostics.ts
- packages/application/src/*.test.ts
- packages/application/src/fixtures/*.mjs
- apps/cli/src/headless.integration.test.ts
- apps/cli/src/fixtures/headless-owner.mjs

### 9. Тесты persistence и application

- runManifestStoreContract для SqliteManifestStore
- Двухпроцессные integration-тесты на built dist: второй живой владелец отклоняется; конкурентный reclaim с барьером beforeLeaseCas даёт ровно одного победителя; foreign lease только с force
- Миграции: production-список к v1-фикстуре с данными; тестовая v2 — данные сохранены, user_version=2, есть копия; ошибка шага → последняя успешная версия, повтор при существующей копии; одновременная миграция двумя процессами
- База новее: STATE_SCHEMA_UNSUPPORTED, основной файл неизменен, копий нет; через createApplication и CLI (обычный и --json) виден сигнал
- Соединение, открытое до миграции другим процессом, после неё не пишет; при тестовой v2, ломающей чтения v1, при чтении сообщает несовместимость
- Повреждённая/не-SQLite база: отказ, файл не изменён и не пересоздан
- POSIX-права 0700/0600 на stateDir, базу, WAL, SHM и копию
- Секреты: в persistence поле-маркер вне схемы manifest не попадает в state.sqlite3* включая копию после тестовой миграции v2; в application integration — fixture-токены не попадают в базу и WAL до checkpoint
- Импорт: inactive импортируется; active/unknown пропускается; изменённый после импорта исходник не перезаписывает jobs (conflict); конкурентный импорт идемпотентен; import_skips не растёт при повторах; исходники не изменены

**Files:**
- packages/persistence/src/sqlite-*.test.ts
- packages/persistence/src/fixtures/sqlite-owner.mjs
- packages/application/src/*.integration.test.ts

### 10. Самодостаточный набор платформенной проверки

- packages/persistence/platform-check/check.mjs: без vitest и сети, на built dist (модули SQLite store напрямую) и зависимостях набора; база только в os.tmpdir() на локальном диске (не в общей папке VirtualBox); сценарии: загрузка binding, миграции, CRUD, двухпроцессная аренда и конкурентный reclaim (process.execPath), отказ старого соединения после миграции, отказ новой версии, повреждённая база, POSIX-права, маркер не попадает в файлы базы; закрывает базу до удаления каталога; отчёт пишет рядом с набором (не в репозиторий при smoke — во временный каталог)
- Отчёт report-<platform>-<arch>[-rosetta].json только из разрешённых полей: platform, arch, proc_translated, binding (относительный идентификатор prebuild, например prebuilds/darwin-x64), версии Node/SQLite/better-sqlite3, статусы и коды проверок, kit-manifest (build-id, git HEAD, чистота дерева, sha256 dist и yarn.lock); без hostname, имени пользователя, путей и raw-сообщений
- packages/persistence/platform-check/build-kit.py (Python 3): два архива music-downloader-platform-check-windows-x64.zip (Node.js 24.21.0 win-x64) и music-downloader-platform-check-macos.zip (Node.js 24.21.0 darwin-arm64 и darwin-x64); Node с nodejs.org с проверкой SHASUMS256; внутрь — check.mjs, dist и package.json persistence/shared и полное транзитивное замыкание runtime dependencies (better-sqlite3 копируется без build/: только lib, package.json и prebuilds) всех модулей, загружаемых check.mjs, из установленного node_modules (better-sqlite3, fs-native-extensions, require-addon, bare-addon-resolve, bare-module-resolve, bare-semver, which-runtime и т. д.); +x на launcher и bin/node; run-windows.cmd с CRLF; вывод в .cache/platform-check/, копирование параметром --copy-to (владелец: /home/user/Документы/vbox_shared); sha256 архивов печатаются и фиксируются в Evidence
- Перед передачей каждый архив распаковывается во временный каталог вне репозитория (без node_modules выше по дереву) и check.mjs запускается локальным Node на Linux из распакованного дерева; передаётся только при PASS
- Launchers: run-macos.command — снимает quarantine с каталога, проверяет SHA-256 runtime, запускает arm64 нативно и x64 через arch -x86_64 при наличии Rosetta (Intel — x64); run-windows.cmd — проверяет SHA-256 через certutil; Node.js, Yarn и сеть не нужны
- README набора: распаковать в локальный каталог (для VM — не в общую папку), запуск двойным кликом, Gatekeeper «Открыть всё равно»/xattr, SmartScreen и Mark-of-the-Web на Windows, какие report-*.json прислать
- Принятые отчёты сохраняются в packages/persistence/platform-check/reports/ в формате, совместимом с Prettier, их sha256 — в Evidence; изменение src persistence/shared или yarn.lock после сборки требует пересборки и повторного прогона
- Vitest smoke запускает check.mjs текущим Node на Linux с отчётом во временный каталог; launcher-логика проверяется bash -n и веткой SHA-256
- check.mjs пишет JSON, который Prettier не меняет (объекты, перевод строки в конце), и указывает в отчёте, из какого prebuild загружен binding; в репозиторий кладётся побайтно полученный файл, sha256 в Evidence совпадает с закоммиченным

**Files:**
- packages/persistence/platform-check/**
- packages/persistence/src/platform-check.test.ts

**Risks:**
- macOS без Rosetta: x64 на Intel Mac или после установки Rosetta
- Gatekeeper/SmartScreen могут потребовать ручного подтверждения запуска

### 11. Проверка

- run-yarn install --immutable, lint, typecheck, test, validate.py
- Нижняя граница: Linux-прогон тестов persistence и check.mjs на официальном Node.js 22.14.0
- Собрать два архива, самопроверка распакованных архивов на Linux, копия в /home/user/Документы/vbox_shared; принять report-*.json Windows x64, macOS arm64, macOS x64 в Evidence

## Evidence

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.

### Windows x64 — Evidence зафиксировано 2026-10-17

- Пользователь передал [отчёт Windows x64](../../packages/persistence/platform-check/reports/report-win32-x64.json), сохранённый без изменения байтов. SHA-256: `ed4989280c4b0f462284b93b87adf46bdc0ff9613cdfd24df639e8e14504ee75`. Дата выше — дата фиксации Evidence; дата прогона, точная команда запуска и exit code в JSON не указаны.
- Итог отчёта — `PASS`: `platform=win32`, `arch=x64`, `proc_translated=false`, Node.js `24.21.0`, Node-API `10`, SQLite `3.53.4`, `better-sqlite3 13.0.3`, binding `prebuilds/win32-x64`. Все 9 применимых проверок — `PASS`: `binding`, `crud`, `migrations`, `lease_two_process`, `concurrent_reclaim`, `stale_connection`, `newer_schema`, `corrupt_database`, `secret_marker`; `posix_permissions=SKIP` ожидаемо для Windows.
- Идентичность набора из `kitManifest`: `buildId=20261016T180517Z-736c1a1279a2`, `gitHead=736c1a1279a244e54b601b8df5c995a7a89b1a7f`, `treeClean=true`; SHA-256 `dist`: `e234ccf4d6dddb6f96034e554ac085c54c9ea5d7384f95af1db231251822f280`, `yarn.lock`: `ad1cca929594ca580914e68e77bfdffc0ed1587da0ab6ea6fcf08292e81b944b`.
- Локальная сверка через Python `zipfile`/`hashlib` подтвердила совпадение `kitManifest` с Windows-архивом в `.cache/platform-check/`, пересчитанного хеша `dist` из `persistence` и `shared` в архиве и хеша `yarn.lock`. Команда `git diff --name-only 736c1a1279a244e54b601b8df5c995a7a89b1a7f HEAD -- packages/persistence/src packages/shared/src yarn.lock` не показала изменений. Это проверка соответствия переданного отчёта набору и текущим исходникам, а не повторный Windows-прогон.
- Ожидаются отчёты коллеги для macOS arm64 и macOS x64. Эта запись не завершает всю ручную Verification и не закрывает STEP.

## Blocker / Failure reason

—
