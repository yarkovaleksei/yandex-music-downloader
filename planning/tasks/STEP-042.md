---
schema: 1
id: STEP-042
status: completed
type: implementation
priority: high
phase: core
depends_on:
  - STEP-016
requirements:
  - REQ-032
  - REQ-044
adrs:
  - ADR-004
  - ADR-007
architecture_refs:
  - docs/architecture.md#data-state-model
  - "docs/architecture.md#основные-компоненты-границы"
risk_flags:
  - public-api
  - concurrency
plan:
  status: ready
  revision: 1
  context_basis: sha256:3bf2567d1589b5df102bf33b6a9aa57faae783a73c1dc7a14b0bf2a1612a2d24
  content_hash: sha256:095cee31ddd435cf1fce74a5253e38b8666b6e49b1c8c984b98bb2bfee9cc5fe
  reviewed_report: planning/plan-reviews/STEP-042/PLAN-REVIEW-20261011T074616Z.md
  planned_at: 2026-10-11T07:46:16+00:00
  execution_groups:
  context_components:
    - "ADR@ADR-004=sha256:4ad987cbdefdf1409c52fd01994ccca0d6941fad8ae0126d435745f3e727ca08"
    - "ADR@ADR-007=sha256:04d6b08c651797508a14cb298d43f539d5364b851981d6d9064800f288b6b42c"
    - "ARCH@docs/architecture.md#data-state-model=sha256:a16465c45f16a8f41fd3e876e764be3e05d852017bd62457799b7dba138bf6c6"
    - "ARCH@docs/architecture.md#основные-компоненты-границы=sha256:fbdabff4c712b9793cdefe9ef7f14d27253ce04e554c0e2e1ab730cb5bfb5a91"
    - "PRN@PRN-001=sha256:3b3801f207fafc3f77272f0e93570258a6d006964839d93a276accd814d548af"
    - "PRN@PRN-002=sha256:f29ee3fbdb9cf65cf9739d0907768bbf192ad88b8e443110d4d82f81c6b79ecb"
    - "PRN@PRN-003=sha256:16516d7d302fecda5f7615f9d55e29e04b588d671f8660640e1f61d1619e4ef8"
    - "REQ@REQ-032=sha256:141594b0d5a0491e6b067c2b5e88401f29ee3bb610908f423be87ebe6d30e30c"
    - "REQ@REQ-044=sha256:54427009756971c5fd75791bae02f1df9fb15781afc1501f3e9f4bb88c879749"
    - "STEP@STEP-016=sha256:5e6164a15320a1fef677cd4fbd9a40772ae4686105e1790ffeebaa9051b036fb"
    - "STEP@STEP-042=sha256:f248d021b7ee4d656302e5ab4e2127d88b820c7581cae7f8ed75053f0fd4678f"
---

# STEP-042 — Перечисление сохранённых заданий через ManifestStore

## Goal

Предоставить через `ManifestStore` чтение всех сохранённых заданий, включая созданные до перезапуска, чтобы application `listJobs` мог получать историю независимо от реализации хранилища.

## Context

Основание — пользовательский `STEP ADD` после блокировки `STEP RUN STEP-018`. В `packages/shared/src/manifest.ts` порт предоставляет `read/create/acquire/sendControl/waitControlAck`, но не перечисление заданий. `FileManifestStore` хранит manifest в отдельных namespace по SHA-256 от `jobId` и также не предоставляет публичного перечисления. Application не должен разбирать внутренние каталоги persistence или подменять сохранённую историю списком текущего экземпляра.

Проверка пересечений: STEP-016 завершён и владеет существующими manifest v1, lease и recovery; STEP-018 владеет application API и подключением `listJobs`, но его Mutation policy не разрешает изменение persistence. STEP-029 реализует SQLite на этапе desktop, STEP-032 — UI истории; эти задачи не реализуются здесь. Нового product contract или архитектурного решения нет: операция обеспечивает уже принятую историю через заменяемое хранилище по REQ-032/044 и ADR-004/007.

STEP-042 зависит только от завершённого STEP-016. STEP-018 получает STEP-042 как prerequisite, сохраняет блокировку и исторический Ready-план revision 2; после выполнения STEP-042 для STEP-018 нужны актуализация плана и проверка снятия блокера штатным workflow.

## Scope

- Добавить обязательную переносимую операцию `ManifestStore.list(): Promise<readonly JobManifestV1[]>` и её реализацию в `FileManifestStore`.
- Возвращать все сохранённые manifest настроенного хранилища независимо от control/status и текущего владельца, без дубликатов `jobId`, в детерминированном порядке по `jobId`. Отсутствующее или пустое хранилище возвращает пустой массив без создания каталогов.
- Перечисление только читает данные: не захватывает аренду, не запускает recovery, не отправляет control и не изменяет manifest, lease, `.part` или control inbox. Каждый результат — полностью декодированный снимок manifest v1; общая транзакционная согласованность всех job при параллельных обновлениях не обещается.
- Использовать существующие namespace, чтение и decoder. Служебные записи, временные файлы и каталоги без `manifest.json` не являются заданиями. Ошибка чтения существующего manifest, некорректный manifest или более новая версия приводят к явной ошибке по действующему контракту чтения; повреждение нельзя скрывать пустой историей. Формат manifest и структура каталогов не мигрируют.
- Расширить общий contract-набор `ManifestStore` и тесты файлового adapter; обновить существующие тестовые реализации порта для обязательного метода. Документировать семантику чтения и ссылку на владельца application integration STEP-018.

## Mutation policy

### Allowed

- `packages/shared/src/manifest.ts`, `packages/shared/src/manifest-store.contract.ts` и связанные shared-тесты — операция перечисления и её общий contract, без изменения схемы manifest v1.
- `packages/persistence/**` — только файловый `ManifestStore`, документация и необходимые тесты перечисления; credential storage не меняется.
- Evidence текущего STEP и детерминированные projections.

### Conditional

- Существующие тестовые реализации `ManifestStore` в других packages, включая `packages/core/downloader/src/fixtures/manager-fixture.ts`, — только приведение fixture к обязательному методу `list`, если typecheck выявит необходимость. Поведение production core/application не меняется.

### Forbidden

- Реализация application `listJobs`, composition root, CLI, desktop UI или IPC; эти операции принадлежат STEP-018 и последующим задачам.
- SQLite, новый индекс/отдельная база истории, миграция manifest, изменение lease/recovery/control semantics или автоматическое исправление повреждённых данных.
- Изменение provider, credential storage, Accepted ADR decisions, исторических планов и review-отчётов; future/unrelated work.

## Out of scope

- Фильтры, пагинация, сортировка по пользовательским параметрам, удаление истории и транзакционный снимок всех job.
- Подключение операции к клиентским DTO/events и определение агрегированного статуса job в application.
- Audio validation, metadata, загрузка контента и desktop persistence.

## Acceptance criteria

- Обязательный `list()` доступен через переносимый интерфейс `ManifestStore`, без Node built-ins в контракте; файловый adapter проходит расширенный общий contract-набор.
- Несколько сохранённых job с разными status/control перечисляются ровно один раз в порядке `jobId`; результаты соответствуют сохранённым snapshot и не зависят от экземпляра, создавшего job. Новый `FileManifestStore` с тем же каталогом видит их после перезапуска.
- Пустой или отсутствующий каталог возвращает `[]` без записи на диск; временные/служебные записи и namespace без manifest не попадают в результат.
- Перечисление доступно при живой аренде и параллельном атомарном сохранении: наблюдается целый декодируемый снимок каждого прочитанного job. `list()` не вызывает acquire/recovery, не меняет содержимое manifest/lease/control inbox и не освобождает владельца.
- Некорректный manifest и manifest более новой версии дают явную ошибку и остаются неизменными. Ошибки чтения не подменяются успешным пустым результатом; секреты, lease owner token и служебные данные не добавляются в возвращаемый manifest.
- Существующие shared/persistence/downloader проверки проходят после добавления обязательного метода; production application и клиентские приложения не изменены.

## Verification

- command: `yarn test packages/shared packages/persistence packages/core/downloader`
- command: `yarn lint`
- command: `yarn typecheck`
- command: `yarn test`
- command: `yarn build`
- command: `python3 .harness/tools/validate.py --mode manual`

## Deliverables

- Расширенный порт `ManifestStore` и общий contract-набор перечисления.
- Реальная файловая реализация, тесты перезапуска/чтения при владельце и краткая документация семантики `list()`.
- Подтверждённая возможность STEP-018 читать сохранённые задания через публичный порт без разбора каталогов persistence в application.

## Implementation plan

### 1. Расширить переносимый порт и общий contract-набор перечисления

- В packages/shared/src/manifest.ts добавить обязательный list(): Promise<readonly JobManifestV1[]> без Node built-ins. Кратким русским JSDoc с @link на STEP-042 описать чтение всех сохранённых job, порядок по jobId и отсутствие аренды/recovery/записи; integration listJobs относится к STEP-018.
- Расширить runManifestStoreContract без зависимости от файловой структуры: пустое хранилище, несколько job с разными control/status, обратный порядок создания, отсутствие дубликатов, полное соответствие list() и сохранённых snapshot/read(). Сортировка по строковым jobId детерминирована независимо от locale.
- В общем contract-наборе проверить list() при удерживаемой lease: сохранённый snapshot доступен, recovery callback не вызван повторно и исходный owner может продолжить save. Освобождать lease в cleanup; файловые byte-level проверки отдельно принадлежат adapter.
- Сохранить manifest v1 и decoder без изменения схемы, существующие проверки read/acquire и immutable plan.

**Files:**
- packages/shared/src/manifest.ts
- packages/shared/src/manifest-store.contract.ts

**Tests:**
- Расширенный ManifestStore contract выполняется на FileManifestStore; список пустого store равен [], несколько job возвращаются один раз в порядке jobId со всеми сохранёнными полями.

### 2. Реализовать чистое перечисление в FileManifestStore

- В packages/persistence/src/file-manifest-store.ts перечислить непосредственные namespace существующего stateDir. Читать только manifest.json в существующих SHA-256 каталогах через существующую логику readJsonIfPresent/decodeManifest; при необходимости вынести общий приватный read helper внутри adapter без изменения поведения read(jobId). Не добавлять индекс и не менять layout.
- Отсутствующий root/manifest трактовать по действующей ENOENT-семантике; пустой root возвращает []. Служебные файлы, temporary и namespace без manifest пропускать. Не создавать каталоги; остальные ошибки чтения и ValidationError decoder пробрасывать, включая mixed список корректных и повреждённых job, без успешного частичного результата.
- Вернуть только декодированные JobManifestV1, обеспечить уникальность jobId и сортировку по jobId обычным строковым сравнением. Не фильтровать по control/status/owner и не читать lease/control для построения результата.
- Не вызывать acquire/recover/control, не брать owner-lock и не менять manifest/lease/.part/inbox. Каждый job читать как один атомарно опубликованный snapshot; общий транзакционный snapshot всех job не обещать. Русский комментарий объясняет эту границу со ссылкой @link на STEP-042.

**Files:**
- packages/persistence/src/file-manifest-store.ts

**Tests:**
- Файловые тесты: отсутствующий stateDir остаётся отсутствующим; пустой существующий stateDir не изменяется; служебные/temporary записи и namespace без manifest пропускаются.
- Несколько сохранённых job с разными status/control полностью доступны новому FileManifestStore с тем же stateDir, включая завершённые и отменённые задания; порядок не зависит от порядка создания или readdir.
- Неверный JSON, некорректный v1 и future version отвергаются явной ошибкой с сохранением исходных bytes. Не-ENOENT I/O error воспроизводится переносимым контролируемым failure в существующей точке чтения и не становится [].
- Возвращаемая проекция не добавляет служебные lease поля/ownerToken, runtime token или signed URL; используется действующий decoder без его расширения.

### 3. Доказать отсутствие побочных эффектов и целостность при владельце

- Добавить непосредственные тесты H-001 и H-002 в существующие persistence test suites с реальным временным каталогом и отдельными экземплярами FileManifestStore. Переиспользовать существующие fixture/helpers; не менять семантику lease, recovery, control и atomic writer.
- H-001: после исходного acquire создать ожидающий control request и sentinel .part, зафиксировать bytes manifest/lease/inbox/.part, вызвать list() со второго экземпляра. Удержать автоматический heartbeat средствами теста, чтобы сравнивать эффекты listing. Проверить отсутствие дополнительных acquire/recovery/control вызовов, неизменность файлов, сохранение запрета второго owner и возможность исходного owner продолжить save; release выполнить только cleanup.
- H-002: одновременно выполнять конечную серию owner save и list() второго экземпляра на одном job с согласованно меняющимися полями. Проверить каждый snapshot целиком как один из заранее заданных старых/новых manifest, а не только успешный JSON parse. Использовать управление порядком/barrier в тесте вместо sleep; сохранить отсутствие общего snapshot разных job.
- Обязательства H-001/H-002 пока имеют planned proof, Semantic Blast Radius = INCONCLUSIVE. До реализации это не доказанный PASS; прямое доказательство обеих обязанностей даёт exact Verification command yarn test packages/shared packages/persistence packages/core/downloader.

**Files:**
- packages/persistence/src/file-manifest-store.test.ts
- packages/persistence/src/file-manifest-store.integration.test.ts

**Tests:**
- H-001: история читается при живом owner, listing ничего не меняет и owner продолжает работу.
- H-002: list/save всегда наблюдают один полный snapshot job; malformed/future/I/O ошибки не скрываются.

### 4. Сохранить совместимость fixtures и подтвердить границу интеграции

- Выполнить yarn typecheck после введения обязательного метода. Если требуется, обновить только существующие тестовые реализации ManifestStore, начиная с packages/core/downloader/src/fixtures/manager-fixture.ts: list возвращает сохранённые snapshots Map без изменения production core/application. Другие fixtures менять только при фактической typecheck ошибке и в пределах Conditional Mutation policy.
- Зафиксировать краткую семантику list в комментариях порта/adapter или документации packages/persistence: история после перезапуска, jobId порядок, ошибки, отсутствие side effects и общей транзакции; ссылка на владельца application integration STEP-018. Accepted ADR, исторические Ready-планы/review и production application не менять.
- Выполнить все Verification commands; записать реальные результаты через canonical verification workflow. Review реализации обязателен до completion STEP-042. После его выполнения для STEP-018 требуются актуальный STEP PLAN и штатная проверка блокера; в текущей PLAN execution соседний STEP не изменять.

**Files:**
- packages/core/downloader/src/fixtures/manager-fixture.ts

**Tests:**
- yarn lint, yarn typecheck, yarn test, yarn build и Harness validation; production application/client diff отсутствует.

## Evidence


<!-- VERIFICATION-EVIDENCE:START -->
- Verification run: 2026-10-11T07:51:50Z
- Status: PASS
- Automated resumed: false
- Git head: 70563057c42f7b1d8b38e228f2671237a4cf2190
- Worktree hash: sha256:601cbe2e80f1e0c20d0975375939f582f9572b90287a64b70ed5f8f8d849b56c
- Verification contract basis: sha256:38f9b2ff52b0937b819a23e1bd010b63c187ea449074cda49906e2e64b15ae47
- Subject git head: 70563057c42f7b1d8b38e228f2671237a4cf2190
- Subject worktree hash: sha256:e2724e51cae0451bebc3ca3dc1ef876c058a27a5930d76c6adb120ce41f191dd

### Automated verification
- Command: yarn test packages/shared packages/persistence packages/core/downloader
  - Status: PASS
  - Exit code: 0
  - Duration ms: 2519
  - stdout sha256: 531b7d362bf3937a5ff11f7db114df77750073636a42b49a3af4f161105ffb49
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 1808
  - stderr bytes: 0
- Command: yarn lint
  - Status: PASS
  - Exit code: 0
  - Duration ms: 6826
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 0
  - stderr bytes: 0
- Command: yarn typecheck
  - Status: PASS
  - Exit code: 0
  - Duration ms: 2869
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 0
  - stderr bytes: 0
- Command: yarn test
  - Status: PASS
  - Exit code: 0
  - Duration ms: 9845
  - stdout sha256: b491305024f0b0f5192758fd29cde0d9825e938ebb2b29a393a118c810eb8e72
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 7744
  - stderr bytes: 0
- Command: yarn build
  - Status: PASS
  - Exit code: 0
  - Duration ms: 414
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 0
  - stderr bytes: 0
- Command: python3 .harness/tools/validate.py --mode manual
  - Status: PASS
  - Exit code: 0
  - Duration ms: 3770
  - stdout sha256: 7945339bd0e1b40feb46056e24db7c921802505b244cecf46fbf2060137942e4
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 482
  - stderr bytes: 0

### Product verification
- none

### Manual verification
- none
<!-- VERIFICATION-EVIDENCE:END -->

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.


## Blocker / Failure reason

—
