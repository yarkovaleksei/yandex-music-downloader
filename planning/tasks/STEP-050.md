---
schema: 1
id: STEP-050
status: completed
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
  revision: 2
  context_basis: sha256:d2204bfd40883884bdcceb5003efb0066c5d6aef3af5bb66974168bfea065cae
  content_hash: sha256:0f0d1dd6f47047836608c483c6ac16eeb9ce546bbb98446a6a264e4c30ec826a
  reviewed_report: planning/plan-reviews/STEP-050/PLAN-REVIEW-20261012T064646Z.md
  planned_at: 2026-10-12T06:46:46+00:00
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
    - "STEP@STEP-050=sha256:c4f21b35240fbd5f0549a4d21dbd96416fddaa9c6b5cbda50b7f48ad8a47cf94"
---

# STEP-050 — Диагностика PERMISSION_DENIED в Windows CI PR #17

## Goal

Завершить диагностический этап Windows CI: сохранить безопасную диагностику файлового отказа, проверить её совместимость с исходными integration-сценариями и зафиксировать успешный повтор CI. Причина прежнего PERMISSION_DENIED остаётся неизвестной и не объявляется исправленной.

## Context

PR #17, HEAD `a2a32d05af0336fb2611ab68b405907fc8f0e129`, CI run `38208350373`: Windows Node 22.13.0, job `114676742498`, провалил тест «различает отсутствие подтверждения cancel, сохраняя запрос в inbox». Девять остальных checks, включая Windows Node 24, Quality и Harness, прошли. Snapshot от 2026-10-12T05:38:40Z подтверждает тот же HEAD и состояние checks.

Readiness poll истёк через 30 секунд. Последняя безопасная диагностика: `resultKind=result`, `trackStatus=queued`, `leaseState=active`, `controlState=paused`, `pauseReason=PERMISSION_DENIED`. Ожидаемая готовность загрузки не достигнута; конкретная файловая операция и исходный errno пока не установлены. Симптом нельзя автоматически считать временным EPERM/EBUSY при rename или недостаточным timeout.

STEP-044 уже реализовал ограниченные Windows-повторы атомарного JSON rename. STEP-049 исправил отдельную гонку close/shutdown. Оба STEP завершены; их исторические plans/reviews не переписываются. Открытого дубликата этой диагностики нет; STEP-035 отвечает за дистрибутивы и release CI, а не текущий отказ загрузки.

2026-10-12 владелец продукта выбрал цель нового плана: «Завершить диагностический этап: проверить диагностику и успешный CI, явно сохранив причину как неизвестную». Это пересмотр owning STEP после успешного run `38211933446` для `fcb938da46f5cd8ee557375a63f5f683637f102d`; owning REQ и Accepted ADR сохраняют свои требования. Получение исходного trace и исправление неизвестной операции больше не являются условием завершения этого диагностического этапа. При новом подтверждённом отказе он разбирается отдельным corrective STEP по фактическому trace.

## Scope

- Проверка уже добавленного test-only capture: исходный error/cause преобразуется только в разрешённые errno/syscall и фиксированную роль файла.
- Scoped capture изолирован между STEP-045 fixtures; retry classification и реальные lease/control/inbox/privacy assertions сохраняются.
- Сопоставление опубликованного diagnostic diff и реального успешного Windows CI; фактический статус отделён от утверждения о причине отказа.
- Canonical Verification и независимый review диагностического изменения без поиска неподтверждённой production-причины.

## Mutation policy

### Allowed

- `packages/application/src/application.integration.test.ts` — только узкая коррекция диагностического capture и его проверок, если Verification или независимый review выявит подтверждённый дефект.
- STEP-050, его новые plan/review/evidence artifacts; generated projections только через tool.

### Conditional

- Новые test-only диагностические данные — только allowlisted errno/syscall и фиксированные роли файлов. Неизвестные значения остаются unknown; содержимое error/cause не сериализуется.
- Исправление замечаний review ограничено безопасностью и совместимостью текущей диагностики. Новый воспроизведённый production-отказ передаётся отдельному corrective STEP, а не скрыто расширяет этот этап.

### Forbidden

- Production-изменения, новые FS retries и изменение lifecycle, аренды, восстановления, API/schema, auth/provider или зависимостей.
- Raw paths, message, stack, cause, ownerToken, PID, hostname, credentials и signed URL в диагностических логах.
- Рост timeout, skip тестов, ослабление исходных assertions, отключение Windows/Node 22 или изменение CI matrix ради успешного результата.
- Поиск неподтверждённых соседних сценариев и изменение исторических reports завершённых STEP.

## Out of scope

Исправление неизвестной причины исходного отказа, повторные CI-прогоны до получения ошибки, новая FS retry-архитектура, общая оптимизация Windows и Git-публикация без отдельной команды пользователя.

## Acceptance criteria

- Readiness failure JSON содержит только разрешённые errno/syscall и фиксированную роль файла; direct native error и DomainError.cause корректно различаются, отсутствующие или неподдерживаемые поля остаются unknown. Контрольные секретные значения, raw paths, message, stack и cause не попадают в JSON.
- Capture сбрасывается до запуска пары application; собственный spy восстанавливается после shutdown/drain. Оригинальная decideRetry получает прежний input и возвращает прежнее решение; исходные STEP-045 lease/control/inbox/privacy assertions и проверки STEP-044/049 проходят без ослабления.
- Сохранены точный опубликованный HEAD diagnostic diff и ссылки на фактический успешный Windows CI для Node 22.13.0 и 24. Локальные и injected проверки не подменяют реальный Windows PASS; при смене production/test revision требуется новая применимая Windows-проверка.
- Evidence явно отделяет исходный PERMISSION_DENIED от успешного повтора: операция, исходный errno и причина отказа не установлены; production-исправление и устранение причины не заявляются. Решение владельца о завершении диагностического этапа записано в STEP.
- Canonical Verification и независимый schema-valid review проходят; постоянный запрет доступа, атомарность, прежний результат, single writer и подтверждённый release сохраняются существующим production-кодом и его тестами. STEP не получает completed только по зелёному CI.

## Verification

- command: `yarn test packages/core/filesystem packages/persistence packages/core/downloader packages/application apps/cli`
- command: `yarn format:check`
- command: `yarn lint`
- command: `yarn typecheck`
- command: `yarn test`
- command: `yarn build`
- command: `python3 .harness/tools/validate.py --mode manual`
- manual: Сверить опубликованный diagnostic production/test revision с успешным Windows CI Node 22.13.0/24 и сохранить ссылки/HEAD; проверить, что evidence явно сохраняет неизвестную причину прежнего отказа и не объявляет её исправленной. Изменения только STEP/docs не требуют нового Windows CI для неизменённого кода.

## Deliverables

Безопасная test-only диагностика, проверка её изоляции и совместимости, factual evidence успешного Windows CI и неизвестной причины прежнего отказа, canonical Verification и независимый report.

## Implementation plan

### 1. Проверить существующую безопасную диагностику и изоляцию fixture

- Использовать уже реализованный diagnostic diff fcb938d; не повторять готовую реализацию и не менять production-код. Сопоставить локальный diagnostic subject с опубликованным production/test revision.
- H-001: проверить existing canary DomainError.cause trace test и structural allowlists: наружу только разрешённые errno/syscall/роль; direct native error и cause обрабатываются без raw сериализации, отсутствующие/неподдерживаемые поля остаются unknown. Обязательство закрывается fresh exact focused Verification command и independent review; новый узкий test только при подтверждённом gap в текущей диагностике.
- H-002 revision2: проверить reset перед application pair, original decideRetry input/result и restore только собственного spy после shutdown/drain. Исходные STEP045 lease/control/inbox/privacy и STEP044/049 retry/release assertions не ослаблять; доказательство тем же fresh focused Verification command. Прежний H002 revision1 о fix неизвестной операции не объявлять proven.
- Если проверки выявят подтверждённый diagnostic defect, исправить только integration fixture и его необходимые проверки. Новый production-отказ или architecture/public-contract вопрос передать отдельному corrective STEP; не добавить blanket retry, timeout, skip или поиск неподтверждённых причин.

**Files:**
- packages/application/src/application.integration.test.ts
- planning/tasks/STEP-050.md

**Tests:**
- yarn test packages/core/filesystem packages/persistence packages/core/downloader packages/application apps/cli
- Existing STEP050 H001 canary и STEP045/044/049 integration assertions

**Risks:**
- Scoped module spy способен нарушить соседний fixture: тесты и review проверяют forwarding/restore, а не считают их доказанными по зелёному предыдущему CI.

### 2. Получить полную Verification и связать её с реальным Windows evidence

- После проверки диагностического scope передать IMPLEMENT SUCCESS dispatcher для всех семи canonical Verification commands. Предыдущий локальный PASS не заменяет generated fresh evidence текущего subject.
- В manual check сверить CI38211933446 и Windows22job114687825889/Windows24job114687825923 с fcb938da46f5cd8ee557375a63f5f683637f102d; сохранить фактические conclusion, ссылки и кодовую привязку. HarnessIntegrity38211933423 учитывать отдельно. Проверка CI logs/API не требует полного PR-file snapshot, который достиг provider limit.
- Если production/test code не изменён после fcb938d, подтверждённый Windows PASS применим; изменения только canonical STEP/docs этого proof не отменяют. Если diagnostic code был исправлен, получить новый реальный Windows evidence после отдельной разрешённой Git-публикации; pending evidence возвращает BLOCKED, не false PASS.
- Зафиксировать решение владельца и outcome: исходная операция/errno неизвестны, failure-only trace в успешном run отсутствует. Диагностический этап не утверждает root cause, production-fix или доказанную невозможность повторения.

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
- Сверить опубликованный diagnostic production/test revision с успешным Windows CI Node 22.13.0/24 и сохранить ссылки/HEAD; проверить, что evidence явно сохраняет неизвестную причину прежнего отказа и не объявляет её исправленной. Изменения только STEP/docs не требуют нового Windows CI для неизменённого кода.

**Risks:**
- Успешный повтор CI не является доказательством причины; при повторном подтверждённом отказе новый corrective STEP использует фактический trace.

### 3. Передать диагностический subject независимому review и завершить по новому контракту

- Передать exact revision и generated Verification evidence независимому lead reviewer и required специализированным reviewers из deterministic review gates; production безопасность оценивается как сохранённый contract и существующие executable regression proofs.
- Для required REVIEW blast выполнить fresh grounding и proof H001/H002 revision2 с exact focused command; current subject safety не выдавать за proof прежнего H002 production-fix.
- Применить статус completed только после schema-valid independent PASS и completion proof новой Acceptance. Сохранить исторический failed Windows run и unknown cause; не переписывать прежние immutable plan/review reports.

**Files:**
- planning/tasks/STEP-050.md
- planning/reviews/STEP-050/

**Tests:**
- Independent schema-valid review PASS
- Fresh REVIEW blast H001/H002 proof

**Risks:**
- Новый контракт утверждает завершение диагностики; отчёты должны сохранять это ограничение без заявления об исправлении исходной причины.

## Evidence


<!-- VERIFICATION-EVIDENCE:START -->
- Verification run: 2026-10-12T06:51:29Z
- Status: PASS
- Automated resumed: false
- Git head: fcb938da46f5cd8ee557375a63f5f683637f102d
- Worktree hash: sha256:7e68156a8f22909a3f675754b679d5ea14bf76c9b03ac3adfbaf44581fc3d6e1
- Verification contract basis: sha256:3ad08a0bf40dfe840e8d033739634fcbd365b77fd402cc055f9da1ecd19301e9
- Subject git head: fcb938da46f5cd8ee557375a63f5f683637f102d
- Subject worktree hash: sha256:92c04e5352b2a953563add2adedf2303317ff1287aa580104e81e8f0497876c4

### Automated verification
- Command: yarn test packages/core/filesystem packages/persistence packages/core/downloader packages/application apps/cli
  - Status: PASS
  - Exit code: 0
  - Duration ms: 6580
  - stdout sha256: 40ae017e0e42bd08e6bc895c23b861c4e672e3a7abb0754dfd672b5b0bc0f782
  - stderr sha256: 234cf6319895c21eeed385e1ba147ee31916b4599cf996b90a0da6c022f74f06
  - stdout bytes: 4931
  - stderr bytes: 2506
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
  - Duration ms: 7727
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 0
  - stderr bytes: 0
- Command: yarn typecheck
  - Status: PASS
  - Exit code: 0
  - Duration ms: 3068
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 0
  - stderr bytes: 0
- Command: yarn test
  - Status: PASS
  - Exit code: 0
  - Duration ms: 7439
  - stdout sha256: ca3db844d53554938c79ce83894826abb543d182ef6ecbef96f594752ab9d678
  - stderr sha256: 85fd6107b941f4049ed4f5213685c784e75bc1e8a478a12e6b75ef3a79429414
  - stdout bytes: 10228
  - stderr bytes: 2506
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
  - Duration ms: 4620
  - stdout sha256: 5de798794afd5e637551e17623dbb63cd1c968d50843542d11c4810c790b3a2f
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 424
  - stderr bytes: 0

### Product verification
- none

### Manual verification
- Check: Сверить опубликованный diagnostic production/test revision с успешным Windows CI Node 22.13.0/24 и сохранить ссылки/HEAD; проверить, что evidence явно сохраняет неизвестную причину прежнего отказа и не объявляет её исправленной. Изменения только STEP/docs не требуют нового Windows CI для неизменённого кода.
  - Status: PASS
  - Observed: "Read-only GitHub Actions API: CI run 38211933446 completed/success для HEAD fcb938da46f5cd8ee557375a63f5f683637f102d; Windows Node22.13.0 job114687825889 и Node24 job114687825923 success. URL https://github.com/yarkovaleksei/yandex-music-downloader/actions/runs/38211933446 . Snapshot .harness/local/step050-run2-ci.json. Локальный HEAD тот же; git diff --name-only -- apps packages пустой, текущие изменения только STEP/docs/plan-review. STEP Context содержит явное решение владельца завершить диагностику; Goal/Acceptance/Evidence сохраняют неизвестную операцию/errno/причину, production-fix не заявлен. Неизменённый код связывает реальный Windows PASS с диагностическим subject."
<!-- VERIFICATION-EVIDENCE:END -->

- [PR #17](https://github.com/yarkovaleksei/yandex-music-downloader/pull/17).
- [Упавший Windows Node 22 job](https://github.com/yarkovaleksei/yandex-music-downloader/actions/runs/38208350373/job/114676742498): startOwner, readiness timeout 30_000ms; observed fields перечислены в Context.
- Захваченный job log: `/tmp/pr17-ci/a2a32d0-windows22.log`. Свежий provider snapshot: `.harness/local/git/pr17-step050-snapshot.json`.
- [Успешный GitHub Actions run](https://github.com/yarkovaleksei/yandex-music-downloader/actions/runs/38211933446) завершён со статусом `success`: Quality и Test на `ubuntu-24.04`, `macos-15` и `windows-2025` с Node `22.13.0` и `24`; все семь jobs успешны. Factual snapshot: `.harness/local/git/step050-ci-success.json`.
- Harness Integrity run `38211933423` завершён со статусом `success`.
- Windows Node 22 job `114687825889` завершён со статусом `success`; сохранённый лог `/tmp/step050-windows22-success.log` содержит `src/application.integration.test.ts`: 17 tests PASS и полный job: 85 test files passed. `NativeTrace` в успешном логе отсутствует, поскольку он печатается только при readiness failure.
- Git HEAD и snapshots сверены при STEP ADD; production-код не изменялся.
- При STEP RUN свежий snapshot `.harness/local/git/pr17-step050-run-snapshot.json` от 2026-10-12T06:04:49Z подтвердил тот же HEAD и единственный failed Windows Node 22 check. Ready plan revision 1 прошёл независимые architecture и planning review: [PLAN-REVIEW-20261012T060547Z](../plan-reviews/STEP-050/PLAN-REVIEW-20261012T060547Z.md).
- Первый unit реализован только в `packages/application/src/application.integration.test.ts`: scoped spy сохраняет allowlisted `errno`, `syscall`, `targetRole` в readiness failure JSON; оригинальная `decideRetry` вызывается без изменения input или результата. После shutdown/drain восстанавливается только собственный spy. Paths, message, stack, cause и данные владельца не сериализуются.
- H-001: synthetic DomainError.cause с контрольными секретными значениями даёт только `{errno: EPERM, syscall: rename, targetRole: temp}`; тест проверяет отсутствие контрольных данных и прежнюю retry classification. Этот synthetic пример не устанавливает причину исходного Windows failure.
- Локальные проверки диагностического unit: `yarn test packages/application/src/application.integration.test.ts` — exit 0, 17/17 tests PASS; `yarn format:check`, `yarn typecheck`, `yarn lint` — exit 0. Здесь сохранены observed facts, а не восстановленная terminal quote.
- По прежнему плану revision 1 точная операция, исходный `errno` и условия исходного Windows отказа не получены; прежний H-002 не доказан. Успешный повтор после диагностического diff не доказывает root cause или исправление. Производственное исправление не заявляется; новую Acceptance диагностического этапа определяет записанное решение владельца от 2026-10-12.


## Blocker / Failure reason

Решением владельца от 2026-10-12 прежнее требование установить и исправить неизвестную причину заменено завершением диагностического этапа. Новых contract/prerequisite blockers нет. Статус остаётся in_progress до canonical Verification и независимого review; неизвестная причина сохраняется в evidence, а повторный подтверждённый отказ требует отдельного corrective STEP.
