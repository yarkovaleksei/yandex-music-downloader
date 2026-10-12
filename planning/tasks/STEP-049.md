---
schema: 1
id: STEP-049
status: completed
type: bugfix
priority: critical
phase: core
depends_on:
  - STEP-019
  - STEP-045
requirements:
  - REQ-018
  - REQ-030
  - REQ-042
adrs:
  - ADR-004
  - ADR-006
  - ADR-007
architecture_refs:
  - "docs/architecture.md#основные-потоки"
risk_flags:
  - concurrency
plan:
  status: ready
  revision: 1
  context_basis: sha256:c33f889ff6d502beba11d5b1c1356d9f97ef9a0c69289fa1d23373c93bfd929f
  content_hash: sha256:18106cf511c018eb3497bd0df7b8eb2b7ae71088aa8920d0f26b952d1a027eed
  reviewed_report: planning/plan-reviews/STEP-049/PLAN-REVIEW-20261012T045527Z.md
  planned_at: 2026-10-12T04:55:28+00:00
  execution_groups:
  context_components:
    - "ADR@ADR-004=sha256:4ad987cbdefdf1409c52fd01994ccca0d6941fad8ae0126d435745f3e727ca08"
    - "ADR@ADR-006=sha256:792115c4604a81dfd2d62950958470e1c1f1bad2b2f18e873d5743b9f9dc443d"
    - "ADR@ADR-007=sha256:04d6b08c651797508a14cb298d43f539d5364b851981d6d9064800f288b6b42c"
    - "ARCH@docs/architecture.md#основные-потоки=sha256:e7842c107b39127d5776d5575d975efcf69df8d05024b630a938e1dc510e7575"
    - "PRN@PRN-001=sha256:3b3801f207fafc3f77272f0e93570258a6d006964839d93a276accd814d548af"
    - "PRN@PRN-002=sha256:f29ee3fbdb9cf65cf9739d0907768bbf192ad88b8e443110d4d82f81c6b79ecb"
    - "PRN@PRN-003=sha256:16516d7d302fecda5f7615f9d55e29e04b588d671f8660640e1f61d1619e4ef8"
    - "REQ@REQ-018=sha256:b17f1d948a0dd108437921d109862e5028ab32ec52e3ab5c8396c6a355640d55"
    - "REQ@REQ-030=sha256:bed9c954699827ba80998c4b00d3d5ce1fa6a8c5b42bf137fecec8e51703fbe2"
    - "REQ@REQ-042=sha256:401263db29ff424588bd0dd6404896271a21b2d5d66d42da5f7a707889474124"
    - "STEP@STEP-019=sha256:48362e7f320bf7ef42460a0cb146b241e6eab5996d3ff8f29a69ec1360eb3a55"
    - "STEP@STEP-045=sha256:33ef17464cb0c23a467f3704acd7c4604ead4e886391b265c86cba31e426c667"
    - "STEP@STEP-049=sha256:c2bd11cfcec8741e81a7605f2663652d9f3d8c014239f20c14d5a4441dc6ef6b"
---

# STEP-049 — Закрытие manager и подтверждённые сбои CI PR #17

## Goal

Устранить воспроизведённый отказ shutdown после успешного resume и подтверждённые ошибки тестов/форматирования CI PR #17 без изменения публичных контрактов.

## Context

PR #17, HEAD `00c57b1123fcca05139f9332d3ee7e769e61c56b`, run `38204418347`: Quality check `114664617776` остановился на форматировании `apps/cli/src/cli.smoke.test.ts`; обе Windows jobs `114664617935`/`114664617893` не прочитали POSIX fixture повреждённых settings. Node 24 также превысил default 5s timeout двух новых application tests; Node 22 получил exit 3 вместо 0 после resume, с `shutdown/VALIDATION_ERROR`. Другие checks прошли.

Локальный public ApplicationApi reproducer `/tmp/pr17-ci/reproduce-shutdown.mjs` подтвердил первичный production-дефект: если удержать окончание session.release после начала закрытия manager, resume возвращает completed, а параллельный shutdown пытается записать pause в уже закрывающуюся session и возвращает VALIDATION_ERROR. Задержка — тестовый контроль окна, не изменение production. Логи CI захвачены в `/tmp/pr17-ci/failed.log`, runtime credentials не использовались.

Существующие STEP-017/018/019/045/044 завершены; их immutable plans/reviews и исторический Verification не переписываются. Новый STEP исправляет конкретный race core и переносимость текущих тестов.

## Scope

- Общий ожидаемый результат закрытия manager: shutdown, пришедший во время close/release, ожидает тот же release вместо нового pause.
- Детерминированная регрессия на удерживаемом release через реальный manager/public application seam.
- Явный выбор платформы settings fixture и разумный локальный budget двух подтверждённо долгих integration tests.
- Форматирование одного подтверждённого smoke-файла.

## Mutation policy

### Allowed

- `packages/core/downloader/src/manager.ts` — только координация close/shutdown.
- `packages/core/downloader/src/manager.test.ts`, `packages/application/src/application.integration.test.ts` — регрессия закрытия и timeout подтверждённых STEP-045 сценариев.
- `apps/cli/src/configuration.test.ts`, `apps/cli/src/cli.smoke.test.ts` — переносимость fixture и форматирование.

### Conditional

- Новый узкий test-файл в `packages/core/downloader/src/` или `packages/application/src/` для регрессии, если существующий fixture недостаточен.

### Forbidden

- Изменение application/shared API, формата manifest, provider/auth и production таймаутов/lease/recovery policy.
- Изменение CI matrix, глобальных test timeout, assertions, skip тестов или обход проверок ради зелёного CI.
- Изменение product Acceptance/Accepted ADR/REQ и исправление неподтверждённых соседних сценариев.

## Out of scope

- Новые возможности CLI, повторная реализация завершённых STEP, общая оптимизация Windows filesystem/process probes.

## Acceptance criteria

- При закрывающемся manager после terminal resume shutdown не отправляет pause в закрывающуюся session, не возвращает VALIDATION_ERROR и не завершается до подтверждённого release; после release результат успешен.
- Существующие bounded shutdown и ошибка release сохраняют отказ без ложного подтверждения освобождения аренды; pause/resume/cancel lifecycle продолжает проходить.
- Тесты повреждённого settings.json читают созданный fixture на Windows и POSIX и сохраняют исходные assertions об отказе повреждённого файла.
- Два STEP-045 integration tests имеют явный локальный budget, покрывающий ожидание готовности/контроля; production timeout и CI matrix неизменны, тесты не пропущены.
- `yarn format:check` проходит после форматирования cli.smoke.test.ts; CLI и application regression tests, typecheck, lint и общие тесты проходят.

## Verification

- command: `yarn test packages/core/downloader/src/manager.test.ts packages/application/src/application.integration.test.ts apps/cli`
- command: `yarn format:check`
- command: `yarn lint`
- command: `yarn typecheck`
- command: `yarn test`
- command: `yarn build`
- command: `python3 .harness/tools/validate.py --mode manual`

## Deliverables

- Исправление координации закрытия manager, регрессионное доказательство и переносимые тесты.
- Canonical Verification и независимый PASS review; remote Windows CI проверяется отдельно после явно разрешённой публикации.

## Implementation plan

### 1. Исправить координацию close и shutdown manager

- Закрепить один Promise закрытия на LiveJob: closed запрещает новую работу, но не означает завершённый release. Повторные close/shutdown ждут общий результат через существующий bounded путь. Не писать pause в closing session.
- Сохранять порядок drain/release, production stopTimeoutMs, ошибку release и timeout. Не менять форматы/API, lease/recovery policy и state machine. Короткий русский комментарий с @link STEP-049 описывает окно гонки.
- H-001: детерминированная регрессия через реальный manager/public application, удерживающая release после terminal snapshot. Проверить, что shutdown не settled до gate, после gate success, release единственный; failure сохраняется. Покрыть contract-required rejection/timeout минимальным существующим fixture, без новых предположений.

**Files:**
- packages/core/downloader/src/manager.ts
- packages/core/downloader/src/manager.test.ts
- packages/application/src/application.integration.test.ts

**Tests:**
- yarn test packages/core/downloader/src/manager.test.ts packages/application/src/application.integration.test.ts apps/cli
- H-001: bounded gated-release regression, существующий pause/resume/cancel и отсутствие false release

**Risks:**
- Terminal snapshot/job.completed не являются подтверждением release; close failure нельзя маскировать.

### 2. Исправить подтверждённые причины CI в тестах

- В двух settings сценариях с .config fixture явно выбрать platform linux через существующий host injection; Windows APPDATA scenario сохранить. Исходные assertions на invalid JSON/debug и flags/env/config priority не ослаблять.
- У двух STEP045 integration tests задать локальный test timeout больше readiness5s+control5s budget (например15s), с коротким комментарием о Windows process probe. Не менять global/production timeout, не добавлять sleep или skip.
- Отформатировать только apps/cli/src/cli.smoke.test.ts существующим Prettier; запустить yarn format:check.

**Files:**
- apps/cli/src/configuration.test.ts
- packages/application/src/application.integration.test.ts
- apps/cli/src/cli.smoke.test.ts

**Tests:**
- yarn test packages/core/downloader/src/manager.test.ts packages/application/src/application.integration.test.ts apps/cli
- yarn format:check

**Risks:**
- Локальный Linux PASS не доказывает Windows CI; исходные assertions и матрица остаются.

### 3. Выполнить Verification и независимый review точного исправления

- Выполнить через dispatcher весь Verification, включая H-001 exact test command, formatter, lint/typecheck и общий test. Подтверждения пишутся canonical runner, без изменения исторических STEP019/045 reports.
- Получить обязательные независимые reviews на точной revision; production scope только manager close/shutdown, tests/formatting только подтверждённые CI причины.
- После отдельно явно разрешённого GIT COMMIT/PUSH проверить PR17 snapshot и Windows jobs; до этого remote CI failure не объявлять исправленным.

**Files:**
- planning/tasks/STEP-049.md

**Tests:**
- yarn test packages/core/downloader/src/manager.test.ts packages/application/src/application.integration.test.ts apps/cli
- yarn format:check
- yarn lint
- yarn typecheck
- yarn test
- yarn build
- python3 .harness/tools/validate.py --mode manual

## Evidence


<!-- VERIFICATION-EVIDENCE:START -->
- Verification run: 2026-10-12T05:04:36Z
- Status: PASS
- Automated resumed: false
- Git head: 00c57b1123fcca05139f9332d3ee7e769e61c56b
- Worktree hash: sha256:75c4e2248471a6266b593a43e497239bb2e41505f2f32df207aeedfe6f205b6a
- Verification contract basis: sha256:0547c835bdc7f97c7d565145e4bf2a9ca085804f4bf5c0a9f5a8a03b6e5f5ae9
- Subject git head: 00c57b1123fcca05139f9332d3ee7e769e61c56b
- Subject worktree hash: sha256:6b67783a1898b9ad696c13d61fb17ee28ccb6c474e396fa46e25bcf24b82bfb7

### Automated verification
- Command: yarn test packages/core/downloader/src/manager.test.ts packages/application/src/application.integration.test.ts apps/cli
  - Status: PASS
  - Exit code: 0
  - Duration ms: 3620
  - stdout sha256: 53ce169e06d32e73770ea763cbe8230d296fbba8bfd858cd959cbb0fcb1a6185
  - stderr sha256: c4920acd0c510f26d62e2841cbf2944b8551fe50279d167b57f5def882726549
  - stdout bytes: 1195
  - stderr bytes: 1338
- Command: yarn format:check
  - Status: PASS
  - Exit code: 0
  - Duration ms: 2667
  - stdout sha256: 17aa973d3f004560237d9a95171210b0671deff23d61628eecf7322ff5938f20
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 66
  - stderr bytes: 0
- Command: yarn lint
  - Status: PASS
  - Exit code: 0
  - Duration ms: 7575
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 0
  - stderr bytes: 0
- Command: yarn typecheck
  - Status: PASS
  - Exit code: 0
  - Duration ms: 3118
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 0
  - stderr bytes: 0
- Command: yarn test
  - Status: PASS
  - Exit code: 0
  - Duration ms: 7641
  - stdout sha256: 0ae0a9531152a3e5624b5c6773f5ca8edeaaf5e0067361208e12348e2c2f5c21
  - stderr sha256: 7d26a96b58af207ee57138cbac340ce6d6ef3593a8c87a12b8ae1230f8bb7dff
  - stdout bytes: 10228
  - stderr bytes: 2506
- Command: yarn build
  - Status: PASS
  - Exit code: 0
  - Duration ms: 364
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 0
  - stderr bytes: 0
- Command: python3 .harness/tools/validate.py --mode manual
  - Status: PASS
  - Exit code: 0
  - Duration ms: 4520
  - stdout sha256: 6893d122761366c2479de75e70d64bdbff19041cbe44a89408cfaab308785d1e
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 424
  - stderr bytes: 0

### Product verification
- none

### Manual verification
- none
<!-- VERIFICATION-EVIDENCE:END -->

- До исправления: public facade reproducer вернул `resume=completed`, `shutdownKind=error`, `shutdownCode=VALIDATION_ERROR`, exit 0 самого diagnostic script. Это наблюдаемые поля, не реконструированный terminal quote.


## Blocker / Failure reason

Нет известных contract/prerequisite blockers. Windows runtime локально недоступен; локальный PASS не объявляется доказательством remote Windows CI.
