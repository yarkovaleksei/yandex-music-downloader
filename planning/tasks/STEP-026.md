---
schema: 1
id: STEP-026
status: planned
type: hardening
priority: high
phase: hardening
depends_on:
  - STEP-019
  - STEP-022
  - STEP-021
  - STEP-023
  - STEP-025
requirements:
  - REQ-042
  - REQ-005
  - REQ-020
adrs: []
architecture_refs:
  - "docs/architecture.md#основные-потоки"
  - docs/architecture.md#reliability-observability
risk_flags:
  - none
plan:
  status: ready
  revision: 1
  context_basis: sha256:2f3ee7fef70e94cf774c1ba6955d4fe7bdd839b5549f6685f83fda4f422f5e3e
  content_hash: sha256:9874e3e41292e78eee103f52dfc17c8c0f213d07d9c5fa10b85fddc9f1cfc581
  reviewed_report: planning/plan-reviews/STEP-026/PLAN-REVIEW-20261011T120511Z.md
  planned_at: 2026-10-11T12:05:11+00:00
  execution_groups:
  context_components:
    - "ARCH@docs/architecture.md#reliability-observability=sha256:a9c337102c2ed62fdaca7173e8e2c05ffe6d68a1d99140fe986a552b3cc636d4"
    - "ARCH@docs/architecture.md#основные-потоки=sha256:e7842c107b39127d5776d5575d975efcf69df8d05024b630a938e1dc510e7575"
    - "PRN@PRN-001=sha256:3b3801f207fafc3f77272f0e93570258a6d006964839d93a276accd814d548af"
    - "PRN@PRN-002=sha256:f29ee3fbdb9cf65cf9739d0907768bbf192ad88b8e443110d4d82f81c6b79ecb"
    - "PRN@PRN-003=sha256:16516d7d302fecda5f7615f9d55e29e04b588d671f8660640e1f61d1619e4ef8"
    - "REQ@REQ-005=sha256:132c5b89fda4c1ce731b1f83868e1b2fa608937489e1a3360de87ddafb859e46"
    - "REQ@REQ-020=sha256:93b4e91c7b271606530f1bafa07000f04d26e338e032ded633ab019958ec92dc"
    - "REQ@REQ-042=sha256:401263db29ff424588bd0dd6404896271a21b2d5d66d42da5f7a707889474124"
    - "STEP@STEP-019=sha256:17ee352a32d61d9b65f607b1f238154f2915897603089b972516216f2457d3a5"
    - "STEP@STEP-021=sha256:0d1263cb69edf96769759848ad8ff2906d656b82277c63ae471077c0823692a1"
    - "STEP@STEP-022=sha256:94ae74c975c93a1635d8cf5844e6198613d2b89593b772758d733d289cda138e"
    - "STEP@STEP-023=sha256:ad2af19f30b86b848e544b51df1cf514bf763224978a8c2c18f1ec40a1c141f2"
    - "STEP@STEP-025=sha256:6f3b60bb2973318ee72d6229a7ace3da8e0592ff89eb635ea88cce54385db865"
    - "STEP@STEP-026=sha256:4aa69fc838535219f3bb4df169a367d777fa0332d777cbce7a8825ee86834c63"
---

# STEP-026 — Интеграционный набор headless-сценариев

## Goal

Собрать и дополнить интеграционные тесты на mock provider по всем обязательным сценариям и подтвердить обязательные unit-наборы.

## Context

Тесты частично создаются в предыдущих STEP; этот STEP закрывает пробелы по brief §41.

## Scope

- Сценарии: single track, album, playlist, network interruption, resume, retry, partial failure, cancel.
- Проверка наличия unit-наборов URL parser, sanitizer, quality resolver, planner, state machine, retry policy, manifest, path generator, provider mapping.
- Проверка отсутствия утечки секретов во всех сценариях.

## Mutation policy

### Allowed

- `packages/testing/**`, тестовые каталоги пакетов и `apps/cli`.

### Conditional

- Исправление найденных дефектов — минимально необходимое, с отдельным пояснением в Evidence.

### Forbidden

- Новая функциональность.
- Реализация future/unrelated STEP «заодно».

## Out of scope

- E2E desktop (STEP-033).

## Acceptance criteria

- Все перечисленные интеграционные сценарии существуют и проходят без сети.
- Автоматическая проверка подтверждает отсутствие токена и signed URL во всех логах/событиях/manifest сценариев.
- Traceability: для каждого обязательного unit-модуля существует набор тестов (проверка списком в Evidence).

## Verification

- command: `yarn build`
- command: `node packages/testing/scripts/verify-step-026-coverage.mjs`
- command: `yarn test packages/application apps/cli packages/testing`
- command: `yarn lint`
- command: `yarn typecheck`
- command: `yarn format:check`
- command: `yarn test`
- command: `python3 .harness/tools/validate.py --mode manual`

## Deliverables

- Интеграционный suite.

## Implementation plan

### 1. Сверить готовые зависимости и зафиксировать матрицу покрытия

- После canonical допуска к IMPLEMENT сверить реализацию STEP-019/021/022/023/025, публичный ApplicationApi и CLI runner injection; PLAN не доказывает их готовность. Недостающую production-функцию передать её владельцу, не заменять заглушкой и не реализовывать в STEP-026.
- Составить в Evidence таблицу восьми integration-сценариев → точные test file/case → проверяемый observable результат и девяти unit-модулей → реальные test files. Уже достаточные тесты оставить; добавлять только пробелы REQ-042 и STEP-026.
- Unit inventory: URL parser — providers/yandex-music/src/url/resolve-yandex-music-url.test.ts; sanitizer/path generator — core/filesystem/src/sanitize.test.ts и layout.test.ts/part-path.test.ts; quality/planner — core/planner/src/quality.test.ts и plan.test.ts; state machine — core/downloader/src/state/*.test.ts; retry — core/retry/src/{classify,decide,backoff}.test.ts; manifest — core/manifest/src/*.test.ts и persistence/src/file-manifest-store*.test.ts; provider mapping — providers/yandex-music/src/metadata/metadata.test.ts и audio/audio.test.ts. Все пути относительно packages. Проверить фактические assertions и попадание в npm test/Vitest; один placeholder index.test.ts не доказывает покрытие.
- Создать packages/testing/scripts/verify-step-026-coverage.mjs с явным списком девяти модулей и существующих непустых наборов и восьми сценариев/case в suite; отсутствие записи/файла/кейса завершает проверку ненулевым кодом. Список не заменяет выполнение tests; отсутствующий unit proof дополнить в тестовом каталоге владельца только для существующего поведения. Не менять boundary rule: действующий eslint/boundaries.test.ts уже проверяет REQ-005.
- Mutation policy: shared fixtures/helpers — packages/testing; production composition integration — тестовые каталоги application; CLI runner/process fixtures — apps/cli. Testing production не импортирует application/core; CLI не импортирует provider/core/testing. Корневые tooling/CI и канонические контракты соседей не расширять.

**Files:**
- packages/testing/scripts/verify-step-026-coverage.mjs
- planning/tasks/STEP-026.md

**Tests:**
- node packages/testing/scripts/verify-step-026-coverage.mjs

### 2. Подготовить минимальные offline fixtures и общую проверку секретов

- Использовать существующий MockMusicProvider и test-only MusicProvider fixtures. Его supportsRange/failures/interruption/delays/unavailable покрывают часть сценариев; при необходимости добавить только минимальные управляемые тестовые настройки. Mock provider не повторяет запросы: retries остаются в production core.
- Сквозная download-коллекция явно согласует каждый available track ID с variants и валидными audio bytes; metadata-only mockGenreTrack и другие fixtures не считать автоматически загружаемыми. Проверка partial failure должна воспроизводить выбранный сценарий, а не отсутствие variants в fixture.
- Для сквозных тестов после STEP-021/023 взять валидные маленькие аудио/обложки из fixtures этих владельцев или добавить безопасный локальный fixture поддерживаемого контейнера в packages/testing. Текущие mockAudioBytes=[1..6] и payload [1,2,3] не пригодны для реальной container validation/tag processing. Не ослаблять существующий validation и не отключать production processing ради PASS; helper тесты с произвольными байтами сохраняются для своего уровня.
- Общий test-only capture проверяет каждый из восьми сценариев: serialized production logger output, публичные JobEvent/CommandResult, каждый записанный manifest snapshot и итоговый manifest; для CLI также stdout/stderr. Обернуть реальный FileManifestStore для наблюдения snapshots, сохранив его запись/lease/recovery, не подменять in-memory store.
- Передать уникальные синтетические token и полный signed URL canary только в приватный тестовый provider/error источник; иметь положительное утверждение, что canary действительно достигал входа production обработки ошибок/логирования в проверяемом fault path. После сериализации ни token, ни полный signed URL не встречаются во всех capture surfaces. В успешных сценариях тоже выполнить общий privacy assertion; fixtures не используют настоящие credentials.
- Все операции идут через providerOverride/локальные байты без HTTP, OAuth, keyring и сети; в headless suite проверять отсутствие обращений к сетевому transport. Использовать изолированные временные state/output directories; finally дожидается shutdown, снимает subscriptions, останавливает child и удаляет fixtures. Краткие русские комментарии привязать к REQ-042/REQ-020/PRN-002.

**Files:**
- packages/testing/src/mock-provider.ts
- packages/testing/src/fixtures.ts
- packages/testing/src/headless-fixtures.ts
- packages/application/src/headless.integration.test.ts

**Tests:**
- yarn test packages/testing packages/application

### 3. Закрыть happy path, interruption, retry, partial failure и cancel через реальную composition

- Новый либо дополненный packages/application/src/headless.integration.test.ts использует createApplication(providerOverride) и production planner, manager, filesystem, manifest, обработку/валидацию, реализованные prerequisites; избегать дублирования существующих достаточных cases.
- Single track: completed, один валидный результат, точный ожидаемый audio payload с учётом реального тегирования, manifest completed и отсутствие .part. Album/playlist: несколько разных треков, правильное количество/порядок файлов; playlist проверяет относительные UTF-8 .m3u8 записи в порядке источника, исходную нумерацию и cover.jpg по реализованному STEP-022, альбом — согласованность общей обложки/тегов по STEP-021.
- Network interruption: provider отдаёт prefix и NETWORK_ERROR внутри stream; дождаться подтверждённого сохранения prefix/transition без sleep как единственного барьера. После восстановления проверить содержимое результата, manifest и ожидаемые offset/attempts, исключающие пропуск/дублирование байтов.
- Retry: отдельный transient отказ перед открытием stream затем успех; наблюдать retry_wait, попытки и вызовы provider в пределах действующей core retry policy. Ожидание синхронизировать событием/барьером; не вводить вторую retry policy и не подменять manager/filesystem.
- Partial failure: многотрековый playlist с одним non-retryable/unavailable треком сохраняет успешные результаты, completed_with_errors и точные track statuses, не загружает запрещённый трек и не повторяет постоянную ошибку. .m3u8 содержит только успешные треки с исходными позициями без сдвига.
- Cancel: отменить при реально открытом потоке после подтверждения progress, дождаться terminal cancelled; .part удалён, отменённый трек не опубликован, completed файлы сохраняются согласно действующему контракту и lease освобождена. Все перечисленные cases используют общий privacy capture/assertion и тестовый offline provider.

**Files:**
- packages/application/src/headless.integration.test.ts
- packages/application/src/application.integration.test.ts

**Tests:**
- yarn test packages/application

### 4. Доказать resume после аварии через CLI и настоящее хранилище

- Сохранить existing download-manager/manifest recovery tests как lower-level proof, не объявлять прямой recoverJob аналогом CLI resume. Добавить в apps/cli/src/headless.integration.test.ts process fixture с готовым CLI runner STEP-019 и реальным createApplication.
- Test-only fixture в apps/cli/src/fixtures/headless-owner.mjs импортирует свой built runner и только публичный application entrypoint; создаёт локальный generic providerOverride без импорта provider/core/testing и Yandex-specific знания. Он передаёт ApplicationApi в предусмотренный runner injection. Не добавлять mock-флаг/env seam в production bin.
- Запустить playlist с >=2 треками и настоящим FileManifestStore; дождаться IPC/barrier после completed первого и записанного prefix второго, аварийно завершить реальный owner process. Новый процесс с тем же stateDir выполняет runner argv resume <JOB_ID> --json. Для устаревания heartbeat использовать существующий test-only приём после подтверждённой смерти child, сохраняя реальную process identity.
- Проверить exit code по STEP-019, конечные statuses/результаты, отсутствие повторного открытия completed, Range offset и побайтное продолжение либо предусмотренный restart для неподдерживаемого Range. Сравнить целостный ожидаемый файл, manifest и отсутствие .part после успеха, освобождение lease; новые CLI NDJSON строки соответствуют CliRecord. Общая privacy проверка включает capture первого и второго процессов и persisted snapshots.
- REQ-020 дополнительные гарантии сверить с existing manifest/persistence suites: newer version rejection без перезаписи, competing owner не меняет manifest/.part, уникальные .part по job/position, processing checkpoint после rename. Повторить нужные tests, а не создавать новую lease/schema/recovery архитектуру. Кроссплатформенную остановку/cleanup взять из existing process helpers; не делать PASS через skip либо замену child на mock process.

**Files:**
- apps/cli/src/headless.integration.test.ts
- apps/cli/src/fixtures/headless-owner.mjs
- packages/application/src/download-manager.integration.test.ts
- packages/application/src/manifest-recovery.integration.test.ts

**Tests:**
- yarn build
- yarn test packages/application apps/cli packages/testing

### 5. Пройти Verification и сохранить traceability без расширения scope

- После каждого блока пройти focused tests; ошибка останавливает переход. Финальный запуск списка unit/integration coverage и всех Verification commands обязателен на текущем subject; отсутствие CLI/prerequisite или невыполненный mandatory case не маскировать manual PASS.
- Найденный воспроизводимый дефект исправлять только минимально в рамках Conditional mutation: Evidence описывает наблюдаемое поведение, причину, точные затронутые production файлы и regression proof. Новая functionality/API/schema/architecture и работа другого STEP остаются у владельца; если без неё Acceptance невозможен, остановиться с конкретным blocker.
- В Evidence сохранить matrix девяти unit-модулей и восьми scenarios с file/case, команды/exit codes и факты, список захваченных privacy surfaces и результат канарей. Не сохранять raw canaries/credentials/signed URL в Evidence. Локальный запуск отличать от результатов CI на других ОС.
- Передать итоговый тестовый diff и Verification independent STEP REVIEW; Ready plan означает готовность плана, не completion реализации. Production сейчас не менять, git commit/push не выполнять.

**Files:**
- planning/tasks/STEP-026.md

**Tests:**
- node packages/testing/scripts/verify-step-026-coverage.mjs
- yarn lint
- yarn typecheck
- yarn format:check
- yarn test
- yarn build
- python3 .harness/tools/validate.py --mode manual

## Evidence

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.

## Blocker / Failure reason

—
