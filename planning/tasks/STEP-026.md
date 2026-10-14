---
schema: 1
id: STEP-026
status: completed
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
  revision: 2
  context_basis: sha256:1be6a12ba400671bb6557c264c02b3b4d5314f42342b2ac68ab1e7fd8e31e015
  content_hash: sha256:6a4f0847cf0678d8d6da57b52620952339fbac1864ee520552bd5ee29c586198
  reviewed_report: planning/plan-reviews/STEP-026/PLAN-REVIEW-20261013T203850Z.md
  planned_at: 2026-10-13T20:38:50+00:00
  execution_groups:
  context_components:
    - "ARCH@docs/architecture.md#reliability-observability=sha256:32d51a796240a2af1ee204e9c2f90f91f217a8e7ced4df0b4893217f98b6a6d2"
    - "ARCH@docs/architecture.md#основные-потоки=sha256:e7842c107b39127d5776d5575d975efcf69df8d05024b630a938e1dc510e7575"
    - "PRN@PRN-001=sha256:3b3801f207fafc3f77272f0e93570258a6d006964839d93a276accd814d548af"
    - "PRN@PRN-002=sha256:f29ee3fbdb9cf65cf9739d0907768bbf192ad88b8e443110d4d82f81c6b79ecb"
    - "PRN@PRN-003=sha256:16516d7d302fecda5f7615f9d55e29e04b588d671f8660640e1f61d1619e4ef8"
    - "REQ@REQ-005=sha256:132c5b89fda4c1ce731b1f83868e1b2fa608937489e1a3360de87ddafb859e46"
    - "REQ@REQ-020=sha256:93b4e91c7b271606530f1bafa07000f04d26e338e032ded633ab019958ec92dc"
    - "REQ@REQ-042=sha256:401263db29ff424588bd0dd6404896271a21b2d5d66d42da5f7a707889474124"
    - "STEP@STEP-019=sha256:48362e7f320bf7ef42460a0cb146b241e6eab5996d3ff8f29a69ec1360eb3a55"
    - "STEP@STEP-021=sha256:911ef92073238a5ab069bca22bf2cc26513be892540c6ce5f2f3681acd57f76a"
    - "STEP@STEP-022=sha256:ab0ef2b154065f298594564cb243a4e108290ad215b4bf750dda44155434f496"
    - "STEP@STEP-023=sha256:ad2af19f30b86b848e544b51df1cf514bf763224978a8c2c18f1ec40a1c141f2"
    - "STEP@STEP-025=sha256:d09938a32c6f1b55148503027dce3bebc541f7c3a0451d281d2d65217ee9c7b1"
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

### 1. Сверить текущее покрытие и зафиксировать матрицу

- Зависимости STEP-019/021/022/023/025 завершены; текущие createApplication(providerOverride) и runCli(host.createApplication) позволяют тестировать штатную composition без нового production seam. На IMPLEMENT сверить фактические assertions и закрывать только пробелы: существующий CLI lifecycle доказывает pause/resume нового ApplicationApi, но не аварийную смерть процесса; recovery и download-manager suites уже доказывают нижние уровни. PLAN не является runtime proof.
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

- Использовать существующий MockMusicProvider и test-only MusicProvider fixtures. Его supportsRange/failures/interruption/delays/unavailable покрывают часть сценариев; при необходимости добавить только минимальные управляемые тестовые настройки. Mock provider не повторяет запросы: retries остаются в production core. Для interruption нужен управляемый одноразовый отказ с последующим успешным открытием; для cancel — потоковый барьер после фактической записи prefix. Постоянный interruptedVariantKeys и задержка перед openAudioStream сами по себе этого не доказывают.
- Сквозная download-коллекция явно согласует каждый available track ID с variants и валидными audio bytes; metadata-only mockGenreTrack и другие fixtures не считать автоматически загружаемыми. Проверка partial failure должна воспроизводить выбранный сценарий, а не отсутствие variants в fixture.
- Для сквозных тестов взять существующий packages/core/validation/src/fixtures/sample.mp3, используемый playlist.integration.test.ts и cli.integration.test.ts, и валидную локальную обложку из fixtures metadata либо добавить безопасную копию в packages/testing. Согласовать duration metadata с реальным sample. Текущие mockAudioBytes=[1..6], mockArtworkBytes и payload [1,2,3] не пригодны для production validation/tag processing. Не ослаблять validation, не отключать processing и не менять lower-level helpers с произвольными байтами.
- Общий test-only capture проверяет каждый из восьми сценариев: serialized production logger output, публичные JobEvent/CommandResult, каждый успешно записанный manifest snapshot и итоговый manifest; для CLI также stdout/stderr обоих процессов. В application inject production createLogger({sink}) без конфликтующих logging.level/filePath; CLI fixture использует существующий logging.filePath и считывает файл. В application tests обернуть реальный FileManifestStore через существующий manifestStore adapter с делегированием всех операций, сохранив запись/lease/recovery; после мутаций фиксировать snapshots до следующего изменения, не заменять store in-memory реализацией. acquire должен возвращать обёрнутую реальную session: наблюдать session.save и другие операции записи, а не только store.create/read; assert подтверждает наличие промежуточных и terminal snapshots.
- В fault paths передать уникальные синтетические token и полный signed URL canary в приватный provider/error источник и положительно подтвердить вызов этого пути до production обработки; не помещать их в публичные source/track IDs. Свериться с logging.integration.test.ts: проверять реальную нормализацию ошибки, известные secret fields/values и очистку query штатного redactor, не предполагать универсальное распознавание произвольного token в тексте. Не очищать capture постфактум и не добавлять тестовую маскировку, скрывающую дефект. После сериализации ни token, ни полный signed URL не встречаются во всех capture surfaces; успешные сценарии тоже используют общий privacy assertion. Не хранить canaries в Evidence.
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
- Test-only fixture в apps/cli/src/fixtures/headless-owner.mjs динамически импортирует свой built runner и только публичные application entrypoint/contracts; создаёт локальный generic providerOverride без импорта provider/core/testing/persistence и без Yandex-specific знания. Аудио/обложку читает как локальные fixture bytes. Через host.createApplication передаёт runCli штатную composition с default FileManifestStore; аргументы logging от runner сохраняет, добавляет только stateDir/providerOverride. Для snapshots до dynamic import установить test-only wrapper на rename из default node:fs/promises и вызвать syncBuiltinESMExports; после успешного original rename, до возврата wrapper, считывать целевой manifest.json и фиксировать snapshot в приватной памяти/IPC. Реальные write/rename/lease/recovery не подменять; проверять наличие промежуточных и terminal snapshots, в cleanup восстановить builtin. Reviewer проверил этот приём на актуальном atomic-json writer и boundary lint; IMPLEMENT повторно проверяет его на CLI crash/resume. Не добавлять mock-флаг/env seam, новый export или mock storage в production bin/application.
- Запустить playlist с >=2 треками и настоящим FileManifestStore; дождаться IPC/barrier после completed первого и записанного prefix второго, аварийно завершить реальный owner process. Новый процесс с тем же stateDir выполняет runner argv resume <JOB_ID> --json. Для устаревания heartbeat использовать существующий test-only приём после подтверждённой смерти child, сохраняя реальную process identity.
- Проверить exit code успешного resume по STEP-019, конечные statuses/результаты, отсутствие повторного открытия completed, Range offset и побайтное продолжение до processing. После тегирования сравнить валидный итоговый контейнер, аудиосодержимое и ожидаемые теги/обложку; не сравнивать изменённый writer-ом файл напрямую с исходными raw bytes. Проверить manifest, отсутствие .part после успеха, освобождение lease; CLI NDJSON соответствует CliRecord. Privacy capture включает оба процесса и persisted snapshots. Existing suites дополнительно доказывают предусмотренный restart для неподдерживаемого Range.
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

<!-- VERIFICATION-EVIDENCE:START -->
- Verification run: 2026-10-13T21:02:39Z
- Status: PASS
- Automated resumed: false
- Git head: b57db587ca4d70173fba6a495fb4c76337250227
- Worktree hash: sha256:278aa0e959bd1a6731eb1b66bb146988dc16a54fce420ce0abf724f9aca13ae8
- Verification contract basis: sha256:15c341b218951eb99cfc1132bd149fe2c89e06b6558a4691bd51e349fd63ce5c
- Subject git head: b57db587ca4d70173fba6a495fb4c76337250227
- Subject worktree hash: sha256:d1baadeffb5b0f0d825cc2390d7929bc92adee3070e29b09d99e90da9396e325

### Automated verification
- Command: yarn build
  - Status: PASS
  - Exit code: 0
  - Duration ms: 364
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 0
  - stderr bytes: 0
- Command: node packages/testing/scripts/verify-step-026-coverage.mjs
  - Status: PASS
  - Exit code: 0
  - Duration ms: 31
  - stdout sha256: 174f8131fdad4e33968eaff63b4b341e99ba25557cd3db6a15af3a52040c2e3a
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 110
  - stderr bytes: 0
- Command: yarn test packages/application apps/cli packages/testing
  - Status: PASS
  - Exit code: 0
  - Duration ms: 6376
  - stdout sha256: 3bcebd85a9bd0f621a7ec42482c51f98f464cc676bceb51b3a91ad5ee5c76fee
  - stderr sha256: 492a7a10197090753ea11a7b58723a85ce0a3645e4e9965d558dbbe5df6c5e86
  - stdout bytes: 4153
  - stderr bytes: 2506
- Command: yarn lint
  - Status: PASS
  - Exit code: 0
  - Duration ms: 8028
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 0
  - stderr bytes: 0
- Command: yarn typecheck
  - Status: PASS
  - Exit code: 0
  - Duration ms: 3318
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 0
  - stderr bytes: 0
- Command: yarn format:check
  - Status: PASS
  - Exit code: 0
  - Duration ms: 2968
  - stdout sha256: 17aa973d3f004560237d9a95171210b0671deff23d61628eecf7322ff5938f20
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 66
  - stderr bytes: 0
- Command: yarn test
  - Status: PASS
  - Exit code: 0
  - Duration ms: 7190
  - stdout sha256: d155de1bb0813b03db493e558e3cc6bd41189753046f761f98c78b54d267f681
  - stderr sha256: 847b80597ad39fde06c29ae304fb663e2a37be62ad779704560541614754f081
  - stdout bytes: 11887
  - stderr bytes: 2506
- Command: python3 .harness/tools/validate.py --mode manual
  - Status: PASS
  - Exit code: 0
  - Duration ms: 4570
  - stdout sha256: 97963fd89bd0b8bed5486a437f5ba46b1b06c20632f2e54cabdada3441fffde9
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 2106
  - stderr bytes: 0

### Product verification
- none

### Manual verification
- none
<!-- VERIFICATION-EVIDENCE:END -->

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.

### Матрица интеграционных сценариев

Все новые сценарии используют локальный provider и настоящий application composition: scheduler, retry, файловую запись, validation, metadata и FileManifestStore. Guards для fetch и HTTP(S) подтверждают отсутствие сетевых обращений. Production-код, package boundaries и публичные exports не изменены.

| Сценарий | Автоматическое доказательство | Наблюдаемое поведение |
| --- | --- | --- |
| single track | `packages/application/src/headless.integration.test.ts`: `single track, album и playlist: track` | Один completed-файл, неизменные MPEG bytes после processing, записанные теги и artwork, отсутствие `.part`. |
| album | Там же: `single track, album и playlist: album` | Два completed-трека, одна загрузка общей обложки, embedded artwork и `cover.jpg`. |
| playlist | Там же: `single track, album и playlist: playlist` | Два файла, исходный ALBUM в тегах и UTF-8 `.m3u8` с относительными путями в порядке источника. |
| network interruption | Там же: `network interruption сохраняет prefix и продолжает Range без сети` | Ошибка внутри потока после подтверждённой записи prefix на диск; opens с offsets 0 и 32, `retry_wait`, одна неудачная попытка, целостные итоговые аудиобайты. |
| resume | `apps/cli/src/headless.integration.test.ts`: `CLI crash resume запускает новый process с реальным FileManifestStore` | SIGKILL после completed первого трека и prefix второго; новый процесс выполняет `resume <JOB_ID> --json`, открывает только второй трек с offset 32. Первый файл побайтно неизменен, оба трека completed, `.part` удалены, lease освобождена. |
| retry | `packages/application/src/headless.integration.test.ts`: `retry повторяет transient open без сети` | Первый open даёт transient-ошибку, второй проходит; два вызова с offset 0, `retry_wait` и один failed attempt в manifest. |
| partial failure | Там же: `partial failure сохраняет доступные позиции playlist` | Provider помечает второй трек unavailable и в коллекции, и в metadata. Его variants/stream не запрашиваются; позиции 1 и 3 completed, позиция 2 failed, `.m3u8` сохраняет исходную нумерацию. |
| cancel | Там же: `cancel удаляет незавершённый part после открытого потока` | Отмена после prefix на диске: terminal cancelled, `.part` и незавершённый result отсутствуют, lease inactive до shutdown теста. |

Дополнительные cases: application pause/resume с новым facade и отдельный достижимый provider fault для доказательства очистки тестовых секретов. Подробные round-trip гарантии поддерживаемых контейнеров остаются в `packages/metadata/src/index.test.ts`; lease/version/checkpoint/Range гарантии дополнительно проверяют существующие manifest, persistence и download-manager suites.

### Проверка секретов

Каждый application-case захватывает реальные logger records, сериализованные JobEvent/CommandResult и фактически записанные manifest snapshots. Прозрачный proxy подтверждает обращения к настоящей session.save; наблюдение успешного rename дополнительно охватывает create/recovery, отложенный progress и control receipts. Assertions требуют промежуточные и terminal состояния. Provider fault положительно подтверждён и даёт непустой production logger output; результат не маскируется тестовым redactor.

Оба CLI процесса проходят реальную ошибку account на локальном provider; проверяются stdout как CliRecord, stderr, непустой diagnostics-файл, каждый захваченный atomic manifest snapshot и итоговый manifest. Синтетический токен и полный signed URL отсутствуют на всех этих поверхностях. Значения тестовых секретов в Evidence не сохраняются.

### Матрица обязательных unit-модулей

Проверка списка: `node packages/testing/scripts/verify-step-026-coverage.mjs`. Она проверяет существование непустых unit-suites и деклараций integration cases; выполнение suites отдельно доказывает canonical `yarn test`.

| Модуль | Существующие test files |
| --- | --- |
| URL parser | `packages/providers/yandex-music/src/url/resolve-yandex-music-url.test.ts` |
| filename sanitizer | `packages/core/filesystem/src/sanitize.test.ts` |
| quality resolver | `packages/core/planner/src/quality.test.ts` |
| Download Planner | `packages/core/planner/src/plan.test.ts` |
| state machine | `packages/core/downloader/src/state/transitions.test.ts`, `aggregate.test.ts`, `control.test.ts` |
| retry policy | `packages/core/retry/src/classify.test.ts`, `decide.test.ts`, `backoff.test.ts` |
| manifest | `packages/core/manifest/src/recovery.test.ts`, `range.test.ts`, `finalization.test.ts`; `packages/persistence/src/file-manifest-store.test.ts`, `file-manifest-store.integration.test.ts` |
| path generator | `packages/core/filesystem/src/layout.test.ts`, `part-path.test.ts` |
| provider response mapping | `packages/providers/yandex-music/src/metadata/metadata.test.ts`, `packages/providers/yandex-music/src/audio/audio.test.ts` |

### Узкая проверка реализации

Узкие запуски `yarn vitest run packages/application/src/headless.integration.test.ts` (9 tests) и `yarn vitest run apps/cli/src/headless.integration.test.ts` (1 test) завершились с exit code 0. Tests typecheck и targeted ESLint также проходили при реализации. Окончательные проверки актуального subject фиксирует generated Verification Evidence; локальные результаты не объявляются результатами CI на Windows/macOS.

## Blocker / Failure reason

—
