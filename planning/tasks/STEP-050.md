---
schema: 1
id: STEP-050
status: in_progress
type: bugfix
priority: critical
phase: core
depends_on:
  - STEP-044
  - STEP-045
  - STEP-049
requirements:
  - REQ-012
  - REQ-032
  - REQ-041
  - REQ-042
adrs:
  - ADR-004
  - ADR-006
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
  context_basis: sha256:8dce1359b2cb776c7c02e39d7342489bdb84df3cdae15d0b31e5bc2eaac7a10d
  content_hash: sha256:abd095e897a64afa97d9dd1c0579ce2f50caf263d06fd27aa1ad9d6f4ac3196e
  reviewed_report: planning/plan-reviews/STEP-050/PLAN-REVIEW-20261012T060547Z.md
  planned_at: 2026-10-12T06:05:47+00:00
  execution_groups:
  context_components:
    - "ADR@ADR-004=sha256:4ad987cbdefdf1409c52fd01994ccca0d6941fad8ae0126d435745f3e727ca08"
    - "ADR@ADR-006=sha256:792115c4604a81dfd2d62950958470e1c1f1bad2b2f18e873d5743b9f9dc443d"
    - "ADR@ADR-007=sha256:04d6b08c651797508a14cb298d43f539d5364b851981d6d9064800f288b6b42c"
    - "ARCH@docs/architecture.md#data-state-model=sha256:a16465c45f16a8f41fd3e876e764be3e05d852017bd62457799b7dba138bf6c6"
    - "ARCH@docs/architecture.md#reliability-observability=sha256:a9c337102c2ed62fdaca7173e8e2c05ffe6d68a1d99140fe986a552b3cc636d4"
    - "PRN@PRN-001=sha256:3b3801f207fafc3f77272f0e93570258a6d006964839d93a276accd814d548af"
    - "PRN@PRN-002=sha256:f29ee3fbdb9cf65cf9739d0907768bbf192ad88b8e443110d4d82f81c6b79ecb"
    - "PRN@PRN-003=sha256:16516d7d302fecda5f7615f9d55e29e04b588d671f8660640e1f61d1619e4ef8"
    - "REQ@REQ-012=sha256:bfb0f858590695dbd81594733f5820f59b4b788fa514b57212695534543047ab"
    - "REQ@REQ-032=sha256:141594b0d5a0491e6b067c2b5e88401f29ee3bb610908f423be87ebe6d30e30c"
    - "REQ@REQ-041=sha256:3377964ccb5091ec60e76e524a7148b5b938460ece7ef181d4bbc44f5fc8e102"
    - "REQ@REQ-042=sha256:401263db29ff424588bd0dd6404896271a21b2d5d66d42da5f7a707889474124"
    - "STEP@STEP-044=sha256:6daf5224ca09eda42e0b5b57ae141cd8e928876b7cc4dee2f550f9b51a1ada38"
    - "STEP@STEP-045=sha256:33ef17464cb0c23a467f3704acd7c4604ead4e886391b265c86cba31e426c667"
    - "STEP@STEP-049=sha256:c85845562e8cdc9bdd379bb2a0a2aff8877c3d3d855f623f825fa3ff83186d90"
    - "STEP@STEP-050=sha256:7c8039e6498ccd6622a491d9b781a492c5e15f8b155cfbee57548fc98f999e9b"
---

# STEP-050 — Причина PERMISSION_DENIED в Windows CI PR #17

## Goal

Установить и исправить конкретную причину преждевременной паузы PERMISSION_DENIED в Windows integration-сценарии STEP-045, сохранив безопасность файлов, владение job и явный отказ при настоящем запрете доступа.

## Context

PR #17, HEAD `a2a32d05af0336fb2611ab68b405907fc8f0e129`, CI run `38208350373`: Windows Node 22.13.0, job `114676742498`, провалил тест «различает отсутствие подтверждения cancel, сохраняя запрос в inbox». Девять остальных checks, включая Windows Node 24, Quality и Harness, прошли. Snapshot от 2026-10-12T05:38:40Z подтверждает тот же HEAD и состояние checks.

Readiness poll истёк через 30 секунд. Последняя безопасная диагностика: `resultKind=result`, `trackStatus=queued`, `leaseState=active`, `controlState=paused`, `pauseReason=PERMISSION_DENIED`. Ожидаемая готовность загрузки не достигнута; конкретная файловая операция и исходный errno пока не установлены. Симптом нельзя автоматически считать временным EPERM/EBUSY при rename или недостаточным timeout.

STEP-044 уже реализовал ограниченные Windows-повторы атомарного JSON rename. STEP-049 исправил отдельную гонку close/shutdown. Оба STEP завершены; их исторические plans/reviews не переписываются. Открытого дубликата этой диагностики нет; STEP-035 отвечает за дистрибутивы и release CI, а не текущий отказ загрузки.

## Scope

- Безопасная локализация отказа: стадия, операция и errno, связь с текущим Windows-сценарием и минимальный воспроизводитель.
- Узкое исправление только подтверждённой причины в существующей файловой операции или её тестовом адаптере.
- Регрессия через реальный FileManifestStore и публичный createApplication; существующие lease/control/privacy assertions сохраняются.
- Проверка успешного пути и настоящего постоянного запрета доступа без ложного completed или освобождения аренды.

## Mutation policy

### Allowed

- `packages/application/src/application.integration.test.ts` — диагностика и регрессия подтверждённого Windows-отказа.
- Тесты и узкие test fixtures в `packages/core/filesystem/src/`, `packages/persistence/src/`, `packages/core/downloader/src/` для локализации и воспроизведения конкретной операции.
- STEP-050, его новые plan/review/evidence artifacts и обратные ссылки owning REQ/ADR; generated projections только через tool.

### Conditional

- Production-файлы в `packages/core/filesystem/src/` и `packages/persistence/src/` — только после доказательства операции, errno и причины отказа; исправление ограничивается этим путём.
- `packages/core/downloader/src/pipeline.ts`, `job-owner.ts`, `manager.ts` — только необходимая коррекция доказанной ошибки взаимодействия с этой операцией или безопасная внутренняя диагностика. Lifecycle, публичные DTO и правила владения сохраняются.
- Новые диагностические данные — только безопасные названия стадий/операций и коды ошибок; без raw cause, абсолютных runtime paths, ownerToken, PID, hostname, credentials и signed URL.
- Если требуется изменить Accepted ADR, публичный контракт или lease/recovery policy, сначала отдельный canonical prerequisite; текущий STEP такого изменения не разрешает.

### Forbidden

- Retry всех файловых ошибок, бесконечный retry, игнорирование EACCES/EPERM, ложный success или удаление прежнего конечного файла ради обхода отказа.
- Изменение API/schema, credentials/auth/provider, native ownership и lease/recovery policy.
- Рост глобальных/production timeout, отключение Windows/Node 22, ослабление assertions, skip тестов или переписывание CI matrix ради зелёного результата.
- Исправление неподтверждённых соседних сценариев и исторических reports завершённых STEP.

## Out of scope

Новая FS retry-архитектура, общая оптимизация Windows, новые зависимости, будущие CLI/UI возможности и Git-публикация без отдельной команды пользователя.

## Acceptance criteria

- До production-исправления evidence устанавливает точную операцию, исходный код ошибки и необходимые условия отказа; минимальный воспроизводитель подтверждает связь с Windows-сценарием STEP-045. Один pauseReason PERMISSION_DENIED не считается достаточным доказательством причины.
- После исправления тот же воспроизводитель достигает downloading при active lease и сценарий cancel сохраняет исходные control/inbox/privacy assertions без преждевременного PERMISSION_DENIED.
- Настоящий постоянный запрет доступа сохраняет явный отказ; атомарность manifest и конечного файла, целостность прежнего результата и единственный владелец job не нарушены. Timeout или ошибка не подтверждают release.
- Регрессия фиксирует подтверждённую причину, а не маскирует её задержкой или skip; существующие Windows retry-бюджеты и классификация других ошибок не расширены без прямого evidence необходимости.
- Локальная Verification и независимый review проходят. Результат нового реального Windows CI после отдельно разрешённой публикации фиксируется отдельно; Linux/injected proof не объявляется Windows CI PASS.

## Verification

- command: `yarn test packages/core/filesystem packages/persistence packages/core/downloader packages/application apps/cli`
- command: `yarn format:check`
- command: `yarn lint`
- command: `yarn typecheck`
- command: `yarn test`
- command: `yarn build`
- command: `python3 .harness/tools/validate.py --mode manual`
- manual: Сопоставить подтверждённую операцию/errno с текущим Windows CI и воспроизводителем; сохранить безопасное evidence причины, отличающее временную блокировку от настоящего отказа доступа.

## Deliverables

- Безопасное evidence причины и минимальное исправление в доказанном scope.
- Регрессионный proof, canonical Verification и независимый report; отдельный factual статус remote Windows CI.

## Implementation plan

### 1. Собрать безопасный native trace первой ошибки

- В application integration fixture STEP045 использовать существующий decideRetry spy seam: original error приходит без потери cause. До запуска каждой пары application сбрасывать scoped capture, после drain/shutdown восстанавливать только собственный spy. Решение retry возвращать через неизменённую оригинальную функцию.
- Извлекать только allowlisted errno/syscall и фиксированный target role (manifest/lease/temp/other), включая native cause когда он есть. Не копировать message, stack, raw path/cause, job/owner identifiers. Неизвестное поле обозначать unknown; не восстанавливать отсутствующий errno догадкой. Добавить trace в существующее безопасное readiness failure message.
- H-001: целевая проверка diagnostic capture на permission error с известными syscall/errno и canary raw fields; capture содержит только safe enums, исходная retry classification/проверки active lease и control остаются. Это проверка новой диагностики PRN002, а не production regression на ещё неизвестную файловую причину.
- Получить trace оригинального Windows failure либо равноценный подтверждённый project-specific воспроизводитель. Если локальный runtime не воспроизводит исходный syscall/errno, подготовить reviewable diagnostic diff и factual handoff; STEP RUN не даёт самостоятельного разрешения на Git publication. До source proof никаких production retries/timeout изменений.

**Files:**
- packages/application/src/application.integration.test.ts

**Tests:**
- yarn test packages/core/filesystem packages/persistence packages/core/downloader packages/application apps/cli
- Безопасный trace/неизменённая classification и существующие STEP045/049 integration assertions

**Risks:**
- Native Windows отсутствует локально: может потребоваться отдельная разрешённая публикация диагностики; неизвестная причина не объявляется исправленной.

### 2. Исправить только установленную файловую причину

- Сопоставить trace с pipeline queued→resolving → JobOwner.save → session.assertOwner/saveSnapshot. До production patch установить operation/errno/target role и необходимые условия, воспроизвести именно этот отказ; источник может оказаться read или write, поэтому rename не предполагать.
- Только после подтверждения выбрать минимальное исправление существующей операции/адаптера в разрешённом scope. Сохранить atomic snapshot/final rename, прежний результат, lane/native writer capability, lease/recovery/DTO и пять Windows EPERM/EBUSY rename attempts STEP044. Расширение поведения допускается только при прямом evidence и согласии Accepted contracts.
- H-002: тот же confirmed reproducer должен стать downloading/active и пройти исходный cancel/inbox/privacy сценарий; постоянный отказ остаётся failure, без false completed/release. Добавить узкую regression для фактически установленной операции и провести исходный Windows scenario; не создавать production regression/hardening для неподтверждённого errno.
- Если trace не получен, hypothesis invalidated или требуется новый public/architecture/lease contract, вернуть BLOCKED с конкретным owner/prerequisite, не выбирать подменяющий retry/skip/timeout.

**Files:**
- packages/core/filesystem/src/
- packages/persistence/src/
- packages/core/downloader/src/pipeline.ts
- packages/core/downloader/src/job-owner.ts
- packages/core/downloader/src/manager.ts
- packages/application/src/application.integration.test.ts

**Tests:**
- yarn test packages/core/filesystem packages/persistence packages/core/downloader packages/application apps/cli
- H002 same confirmed fault before/after и permanent access denial/atomic ownership assertions

**Risks:**
- Конкретный production файл выбирается только после operation proof; это conditional mutation текущего STEP, не предварительное разрешение на blanket retry.

### 3. Подтвердить полный scope и передать независимому review

- После выполнения всей Acceptance передать IMPLEMENT SUCCESS dispatcher для seven-command Verification и manual operation/errno сопоставления. Partial diagnostic tests не заменяют completion всего STEP.
- Получить required exact revision independent reviews и REVIEW blast PASS, включая H001/H002 fresh exact focused command proof. Сохранить фактический Windows статус отдельно после явно разрешённой публикации; Linux/injected PASS не заменяет remote CI.

**Files:**
- planning/tasks/STEP-050.md

**Tests:**
- yarn test packages/core/filesystem packages/persistence packages/core/downloader packages/application apps/cli
- yarn format:check
- yarn lint
- yarn typecheck
- yarn test
- yarn build
- python3 .harness/tools/validate.py --mode manual

## Evidence

- [PR #17](https://github.com/yarkovaleksei/yandex-music-downloader/pull/17).
- [Упавший Windows Node 22 job](https://github.com/yarkovaleksei/yandex-music-downloader/actions/runs/38208350373/job/114676742498): startOwner, readiness timeout 30_000ms; observed fields перечислены в Context.
- Захваченный job log: `/tmp/pr17-ci/a2a32d0-windows22.log`. Свежий provider snapshot: `.harness/local/git/pr17-step050-snapshot.json`.
- Git HEAD и snapshots сверены при STEP ADD; production-код не изменялся.
- При STEP RUN свежий snapshot `.harness/local/git/pr17-step050-run-snapshot.json` от 2026-10-12T06:04:49Z подтвердил тот же HEAD и единственный failed Windows Node 22 check. Ready plan revision 1 прошёл независимые architecture и planning review: [PLAN-REVIEW-20261012T060547Z](../plan-reviews/STEP-050/PLAN-REVIEW-20261012T060547Z.md).
- Первый unit реализован только в `packages/application/src/application.integration.test.ts`: scoped spy сохраняет allowlisted `errno`, `syscall`, `targetRole` в readiness failure JSON; оригинальная `decideRetry` вызывается без изменения input или результата. После shutdown/drain восстанавливается только собственный spy. Paths, message, stack, cause и данные владельца не сериализуются.
- H-001: synthetic DomainError.cause с контрольными секретными значениями даёт только `{errno: EPERM, syscall: rename, targetRole: temp}`; тест проверяет отсутствие контрольных данных и прежнюю retry classification. Этот synthetic пример не устанавливает причину исходного Windows failure.
- Локальные проверки диагностического unit: `yarn test packages/application/src/application.integration.test.ts` — exit 0, 17/17 tests PASS; `yarn format:check`, `yarn typecheck`, `yarn lint` — exit 0. Здесь сохранены observed facts, а не восстановленная terminal quote.
- Точная операция, исходный errno и условия исходного Windows отказа не получены. H-002 и полная Acceptance не выполнены; production-исправление, canonical completion Verification и implementation review PASS не заявлены.

## Blocker / Failure reason

STEP RUN остановлен после проверенного диагностического unit: необходим исходный Windows trace операции/errno. Native Windows runtime локально недоступен, а текущий опубликованный HEAD не содержит новой диагностики. Owning artifact — STEP-050; contract/ADR менять не требуется.

Следующий prerequisite — отдельно разрешённая Git-публикация диагностического diff командой `GIT CHECK > COMMIT > PUSH`, затем фактический новый Windows CI trace и продолжение `STEP RUN STEP-050`. До trace production-исправление не разрешено. Status остаётся `in_progress`; execution result — BLOCKED, STEP не завершён.
