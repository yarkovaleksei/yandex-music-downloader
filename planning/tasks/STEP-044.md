---
schema: 1
id: STEP-044
status: completed
type: bugfix
priority: high
phase: core
depends_on:
  - STEP-016
  - STEP-018
  - STEP-002
requirements:
  - REQ-032
  - REQ-044
  - REQ-041
  - REQ-042
adrs:
  - ADR-004
  - ADR-007
architecture_refs:
  - docs/architecture.md#data-state-model
  - docs/architecture.md#reliability-observability
risk_flags:
  - concurrency
  - release-critical
plan:
  status: ready
  revision: 1
  context_basis: sha256:4458fe33071ef187486322bad4c0168183494027f06ab8b0ea38e72b5e3dabae
  content_hash: sha256:95f5960e6eca1061c502049436dc32cab162bf15c7a7163e853904c70625051f
  reviewed_report: planning/plan-reviews/STEP-044/PLAN-REVIEW-20261011T112316Z.md
  planned_at: 2026-10-11T11:23:16+00:00
  execution_groups:
  context_components:
    - "ADR@ADR-004=sha256:4ad987cbdefdf1409c52fd01994ccca0d6941fad8ae0126d435745f3e727ca08"
    - "ADR@ADR-007=sha256:04d6b08c651797508a14cb298d43f539d5364b851981d6d9064800f288b6b42c"
    - "ARCH@docs/architecture.md#data-state-model=sha256:a16465c45f16a8f41fd3e876e764be3e05d852017bd62457799b7dba138bf6c6"
    - "ARCH@docs/architecture.md#reliability-observability=sha256:a9c337102c2ed62fdaca7173e8e2c05ffe6d68a1d99140fe986a552b3cc636d4"
    - "PRN@PRN-001=sha256:3b3801f207fafc3f77272f0e93570258a6d006964839d93a276accd814d548af"
    - "PRN@PRN-002=sha256:f29ee3fbdb9cf65cf9739d0907768bbf192ad88b8e443110d4d82f81c6b79ecb"
    - "PRN@PRN-003=sha256:16516d7d302fecda5f7615f9d55e29e04b588d671f8660640e1f61d1619e4ef8"
    - "REQ@REQ-032=sha256:141594b0d5a0491e6b067c2b5e88401f29ee3bb610908f423be87ebe6d30e30c"
    - "REQ@REQ-041=sha256:3377964ccb5091ec60e76e524a7148b5b938460ece7ef181d4bbc44f5fc8e102"
    - "REQ@REQ-042=sha256:401263db29ff424588bd0dd6404896271a21b2d5d66d42da5f7a707889474124"
    - "REQ@REQ-044=sha256:54427009756971c5fd75791bae02f1df9fb15781afc1501f3e9f4bb88c879749"
    - "STEP@STEP-002=sha256:9f43502fd6485b6532f596cbb4bf5df62fef4f1736db427e99501cbc9df6fd01"
    - "STEP@STEP-016=sha256:5e6164a15320a1fef677cd4fbd9a40772ae4686105e1790ffeebaa9051b036fb"
    - "STEP@STEP-018=sha256:ef554746f2dd587e4003775194675c6948f4b905d548119bfb60e491e7ec4659"
    - "STEP@STEP-044=sha256:59bef6109014446aae544ae3bc838530beac33bb0d8545b88025cc9bcd316782"
---

# STEP-044 — Временные Windows-блокировки записи состояния и CI

## Goal

Краткая блокировка атомарного rename JSON на Windows не останавливает загрузку, если следующий ограниченный повтор успешен; постоянные ошибки сохраняют явный отказ. Исправить подтверждённые ограничения времени Windows-тестов без ослабления их проверок.

## Context

PR #14, head `2a5c01cf90a4fca39c1ae61c68799501cba53f56`, CI run `38133868783`: Windows Node 24 — pause/resume и AUTH_REQUIRED-resume остаются paused; Windows Node 22 — AUTH_REQUIRED-resume paused, два persistence-теста и auth-browser превышают 5000 ms. Linux/macOS и quality/Harness — SUCCESS. Предыдущие snapshot EBUSY и гонка чанков устранены отдельным QUICK FIX.

Read-only probe на собранном production createApplication с настоящим FileManifestStore и mock provider: одна injected EPERM при замене manifest.json после выбора variant даёт paused/PERMISSION_DENIED вместо продолжения. Probe exit 0, observed injected=1, track failed. Это доказанный дефект обработки временной блокировки, воспроизводящий симптом CI; конкретный errno исходных paused-результатов CI не сохранён. Логи — /tmp/pr14-ci-second.log. Файловый finalizer уже повторяет EPERM/EBUSY на win32 ограниченно; writeAtomicJson делает единственную попытку.

## Scope

- Ограниченные Windows-повторы rename того же подготовленного и fsync-нутого JSON snapshot при EPERM/EBUSY; до пяти попыток с паузами 50/100/200/400 ms, как у существующей финализации audio.
- Regression proof временной блокировки, исчерпания бюджета и отсутствия retry для других ошибок/ОС.
- Application regression через публичный createApplication, реальное файловое хранилище и injected временный отказ JSON rename: загрузка завершается, аренда освобождается.
- Подтверждённые Windows-тесты получают достаточный bounded budget для реального process probe до 10 секунд; при необходимости ограничить параллелизм Windows CI.

## Mutation policy

### Allowed

- packages/persistence/src/atomic-json.ts и его regression-тесты.
- packages/application/src/application.integration.test.ts: proof JSON contention и безопасные diagnostics без raw paths/errors/secrets.
- packages/persistence/src/file-manifest-store.test.ts и packages/providers/yandex-music/src/auth-browser.test.ts: bounded test budgets для сценариев, упавших в указанном CI.
- STEP-044, его новые plan/review/evidence artifacts и обратные ссылки REQ/ADR; generated projections через tool.

### Conditional

- vitest.config.ts или .github/workflows/ci.yml только при подтверждённой необходимости ограничить Windows test concurrency; CI matrix и все проверки сохраняются.
- Безопасные test fixtures для имитации Windows платформы и transient rename без подмены writer, native ownership или retry-классификации production.

### Forbidden

- Изменение API/schema/credentials/lease policy/recovery алгоритмов и core lifecycle.
- Переписывание historical Ready-планов и immutable reports завершённых STEP.
- Retry всех ошибок, бесконечный retry, unlink target перед rename, снижение coverage, skip Windows или отключение test assertions.

## Out of scope

- Новая архитектура хранения, общая FS retry-библиотека, новые dependencies, auth behavior и provider/network retry.
- Metadata/validation/CLI/UI будущих STEP.
- Git commit/push и заявление Windows CI PASS без нового реального прогона.

## Acceptance criteria

- Windows EPERM/EBUSY, завершившийся успехом в пределах пяти rename attempts, публикует целый новый JSON; старый snapshot остаётся целым до успешного rename, временный файл не переписывается для каждого повтора.
- Постоянный EPERM/EBUSY после пяти attempts отвергается с исходным отказом; прежний JSON не удаляется. Другие ошибки и другие платформы отвергаются после одной попытки.
- Публичная загрузка с одной временной Windows-блокировкой JSON rename заканчивается completed с точными audio bytes; после shutdown readLeaseState inactive. Без исправления тот же probe воспроизводит paused/PERMISSION_DENIED.
- Упавшие тесты сохраняют terminal/lease/privacy assertions; их ограниченный budget согласован с настоящим Windows process probe. Windows CI matrix остаётся 3 ОС × 2 версии Node.
- Локальная Verification и independent review PASS; отсутствие реального Windows-прогона явно раскрыто и не подменено injected proof.

## Verification

- command: `yarn test packages/persistence packages/application packages/providers/yandex-music/src/auth-browser.test.ts`
- command: `yarn lint`
- command: `yarn typecheck`
- command: `yarn format:check`
- command: `yarn test`
- command: `yarn build`
- command: `python3 .harness/tools/validate.py --mode manual`

## Deliverables

- Ограниченные повторы атомарного JSON rename и regression-тесты.
- Исправленные bounded Windows test budgets с неизменными assertions.
- План, independent review и фактическое Evidence STEP-044.

## Implementation plan

### 1. Ограничить повтор точки публикации JSON и доказать атомарность

- По Scope и Acceptance STEP-044 добавить private renameWithRetry в packages/persistence/src/atomic-json.ts после текущих writeFile → fsync → close. На win32 повторять только EPERM/EBUSY: максимум пять attempts и четыре паузы 50/100/200/400 ms, как existing filesystem finalizer. Не добавлять options/public API, общую FS библиотеку, зависимости или изменения caller-ов.
- Во всех attempts использовать один подготовленный temporary и target; не открывать/не переписывать snapshot повторно, не удалять target. По исчерпании или при другом errno/платформе пробрасывать исходный error без новой классификации. Текущие права, форматы и поведение оставшегося temporary сохраняются; краткий русский комментарий с @link на STEP-044 объясняет повтор публикации.
- Добавить прямые real-I/O regression-тесты writeAtomicJson: transient EPERM и EBUSY с успешной пятой попыткой, обе ошибки с исчерпанием пяти attempts, other errno без повторов и EPERM/EBUSY на non-Windows без повторов. Обёртка rename вызывает настоящий rename при успехе; mkdtemp/write/fsync/read остаются реальными.
- В каждом transient сценарии проверить целый прежний target до успешного rename и целый новый JSON после него, одинаковые temporary/target на всех attempts, одну запись/fsync/close snapshot, точные delays/attempt count. Exhaustion сохраняет прежний JSON и сам error. Изоляцию platform/rename и временный каталог восстановить в finally. Это executable proof H-001 из validated Semantic Blast Radius.

**Files:**
- packages/persistence/src/atomic-json.ts
- packages/persistence/src/atomic-json.test.ts

**Tests:**
- yarn test packages/persistence

**Risks:**
- Общий writer обслуживает также lease.json, control requests и acknowledgements; retry остаётся внутри существующих очередей и не меняет native ownership/lease/recovery. Новый код ограничен helper-ом.

### 2. Доказать публичную загрузку при одном временном Windows rename отказе

- В application.integration.test.ts использовать публичный createApplication с providerOverride, настоящий FileManifestStore, production files/Jobs и отдельный реальный каталог. Targeted FS обёртка после выбора variant инжектирует ровно один EPERM при публикации manifest.json, затем делегирует настоящему rename; writer и retry classification не подменяются.
- Для Linux simulation заранее загрузить native binding и определить identity настоящей host-платформы; через существующий AcquireOptions.identity port wrapper передать fixture в настоящий acquire. Native lock/session/recovery остаются production. Только тест переключает Windows branch writer, затем в finally восстанавливает descriptor платформы и FS обёртку. Не запускать PowerShell на Linux и не менять production process identity/lease semantics.
- Проверить injected=1, terminal completed и точное содержимое полученного audio файла; вызвать shutdown и через реальный observer FileManifestStore проверить readLeaseState(jobId)=inactive. Diagnostic assertion использует безопасные status/code/counters без raw errors, абсолютных paths или секретов. Это executable proof H-002.
- Сохранить воспроизведение до исправления как factual command/exit/observed facts: прежний helper даёт paused/PERMISSION_DENIED. После исправления тот же targeted transient proof должен стать completed. Отдельно раскрыть, что injected Windows simulation не является реальным Windows CI run и исходный CI errno неизвестен.

**Files:**
- packages/application/src/application.integration.test.ts

**Tests:**
- yarn test packages/application/src/application.integration.test.ts

**Risks:**
- Глобальная имитация platform не должна подменять native ownership или случайно тестировать отказ host process probe; supported identity seam и загрузка binding до stub обязательны.

### 3. Согласовать бюджеты только упавших Windows-тестов

- В file-manifest-store.test.ts задать bounded budget 20000 ms только H-001 list при живом owner и 25000 ms только recovery previously released paused. Эти тесты выполняют соответственно один и два настоящих acquire с Windows process probe до 10000 ms каждый; все snapshot/native owner/recovery/assertions оставить.
- В auth-browser.test.ts задать bounded budget 15000 ms только первому loopback/cache/privacy/cancel тесту, который превышал 5000 ms в CI. Сохранить assertions и challenge.close cleanup. Причина keepalive остаётся неподтверждённой гипотезой; auth-browser production и auth behavior не менять.
- На текущем evidence не менять vitest.config.ts или CI concurrency. Матрица 3 ОС × 2 версии Node и все quality/test/build/Harness checks сохраняются; остальные тестовые бюджеты не расширять.

**Files:**
- packages/persistence/src/file-manifest-store.test.ts
- packages/providers/yandex-music/src/auth-browser.test.ts

**Tests:**
- yarn test packages/persistence packages/application packages/providers/yandex-music/src/auth-browser.test.ts

### 4. Провести Verification и передать bounded результат независимому review

- После focused regression выполнить все команды Verification на текущем subject, сохранить factual результаты и generated evidence штатными tools. Полный yarn test покрывает indirect manifest/lease/control consumers общего writer и существующие pause/resume/AUTH_REQUIRED сценарии.
- Проверить diff в пределах Mutation policy: только atomic-json production helper и перечисленные regression/budget тесты; API/schema/credentials/lease/recovery/core lifecycle/CI matrix не меняются. H-001 и H-002 остаются planned до fresh PASS exact focused Verification command.
- Передать изменённый scope и текущую Verification независимому STEP review. В итоговом evidence явно разделить локальный/injected proof и remote Windows CI; отсутствие нового Windows run раскрыть, не делать его prerequisite локального completion. Commit/push не выполнять.

**Files:**
- planning/tasks/STEP-044.md

**Tests:**
- yarn test packages/persistence packages/application packages/providers/yandex-music/src/auth-browser.test.ts
- yarn lint
- yarn typecheck
- yarn format:check
- yarn test
- yarn build
- python3 .harness/tools/validate.py --mode manual

## Evidence


<!-- VERIFICATION-EVIDENCE:START -->
- Verification run: 2026-10-11T11:35:01Z
- Status: PASS
- Automated resumed: false
- Git head: 2a5c01cf90a4fca39c1ae61c68799501cba53f56
- Worktree hash: sha256:90609b0354f8912e97347d2cc823f64bcbb9cbf388ca2cd7e5f87e1d9fb805e9
- Verification contract basis: sha256:72557368be9c81f2ab7f51ef2004855999da859a7c56819b27422b9d136c1eb4
- Subject git head: 2a5c01cf90a4fca39c1ae61c68799501cba53f56
- Subject worktree hash: sha256:f9b8baee9487a319ec684552f3c42651f5d6b1d088e3ffeb2c9f1c2f3845d59f

### Automated verification
- Command: yarn test packages/persistence packages/application packages/providers/yandex-music/src/auth-browser.test.ts
  - Status: PASS
  - Exit code: 0
  - Duration ms: 8183
  - stdout sha256: 2dc6eceb8c4bb9aec851a05c36b830663bd76a2f5874802a3d224cf3477cd65d
  - stderr sha256: 459e430d407e6955fed3d3ce6d3fff27c8f30586336e9df9a5ff079e325b3f6e
  - stdout bytes: 2825
  - stderr bytes: 1168
- Command: yarn lint
  - Status: PASS
  - Exit code: 0
  - Duration ms: 7328
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 0
  - stderr bytes: 0
- Command: yarn typecheck
  - Status: PASS
  - Exit code: 0
  - Duration ms: 2919
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 0
  - stderr bytes: 0
- Command: yarn format:check
  - Status: PASS
  - Exit code: 0
  - Duration ms: 2468
  - stdout sha256: 17aa973d3f004560237d9a95171210b0671deff23d61628eecf7322ff5938f20
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 66
  - stderr bytes: 0
- Command: yarn test
  - Status: PASS
  - Exit code: 0
  - Duration ms: 9545
  - stdout sha256: a2a8a9140f8dd99dee7e9d71387e0f5ca46d167ea0fad5e30b5e32636e8b383b
  - stderr sha256: 8dc81ccbb126ee0a11714f0c570db67a2404ba0bddef4fa461f9f633c904853d
  - stdout bytes: 8599
  - stderr bytes: 1168
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
  - Duration ms: 3970
  - stdout sha256: 4e99ef91219a74d20d053363d26d70e7381c0cbc54ee30a956dc866cf6a6996b
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 424
  - stderr bytes: 0

### Product verification
- none

### Manual verification
- none
<!-- VERIFICATION-EVIDENCE:END -->

Логи CI и reproduction summary приведены в Context. Canonical Verification выполняется при реализации, не объявлена PASS на этапе ADD.


## Blocker / Failure reason

—
