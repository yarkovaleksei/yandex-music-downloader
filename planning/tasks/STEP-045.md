---
schema: 1
id: STEP-045
status: completed
type: implementation
priority: high
phase: core
depends_on:
  - STEP-018
  - STEP-043
requirements:
  - REQ-030
  - REQ-032
  - REQ-044
adrs:
  - ADR-004
  - ADR-006
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
  context_basis: sha256:307c03ccda87e4e55c8fd47e4985be66c65436ebffd611f4729191551ce45eaf
  content_hash: sha256:4753c73cd95472688cc8da743b8f68de265aa0ca49c60379b79e3074f9ef5fc9
  reviewed_report: planning/plan-reviews/STEP-045/PLAN-REVIEW-20261011T165642Z.md
  planned_at: 2026-10-11T16:56:42+00:00
  execution_groups:
  context_components:
    - "ADR@ADR-004=sha256:4ad987cbdefdf1409c52fd01994ccca0d6941fad8ae0126d435745f3e727ca08"
    - "ADR@ADR-006=sha256:792115c4604a81dfd2d62950958470e1c1f1bad2b2f18e873d5743b9f9dc443d"
    - "ADR@ADR-007=sha256:04d6b08c651797508a14cb298d43f539d5364b851981d6d9064800f288b6b42c"
    - "ARCH@docs/architecture.md#data-state-model=sha256:a16465c45f16a8f41fd3e876e764be3e05d852017bd62457799b7dba138bf6c6"
    - "ARCH@docs/architecture.md#основные-компоненты-границы=sha256:fbdabff4c712b9793cdefe9ef7f14d27253ce04e554c0e2e1ab730cb5bfb5a91"
    - "PRN@PRN-001=sha256:3b3801f207fafc3f77272f0e93570258a6d006964839d93a276accd814d548af"
    - "PRN@PRN-002=sha256:f29ee3fbdb9cf65cf9739d0907768bbf192ad88b8e443110d4d82f81c6b79ecb"
    - "PRN@PRN-003=sha256:16516d7d302fecda5f7615f9d55e29e04b588d671f8660640e1f61d1619e4ef8"
    - "REQ@REQ-030=sha256:bed9c954699827ba80998c4b00d3d5ce1fa6a8c5b42bf137fecec8e51703fbe2"
    - "REQ@REQ-032=sha256:141594b0d5a0491e6b067c2b5e88401f29ee3bb610908f423be87ebe6d30e30c"
    - "REQ@REQ-044=sha256:54427009756971c5fd75791bae02f1df9fb15781afc1501f3e9f4bb88c879749"
    - "STEP@STEP-018=sha256:ef554746f2dd587e4003775194675c6948f4b905d548119bfb60e491e7ec4659"
    - "STEP@STEP-043=sha256:a46086dfc7f32fef4cef159aaf545ce286313772b0b39aeb82e346158075012e"
    - "STEP@STEP-045=sha256:c6fce820a2de0ec3cf4fe840df282f7be6006940b7a6cc37d3dcb8e6a5e8db68"
---

# STEP-045 — Application: признак отказа из-за чужой живой аренды

## Goal

Application возвращает стабильный машиночитаемый признак отказа команды `resume/retry/cancel` из-за живой аренды другого владельца и таймаута подтверждения владельцем, отличимый от ошибки несуществующего job, чтобы клиенты (CLI, UI) сопоставляли его с отдельным кодом REQ-030 без разбора текста.

## Context

Основание — пользовательское решение после блокировки `STEP PLAN STEP-019`. Эксперимент reviewer на текущем коде: `resume` при живом владельце и `resume/cancel` несуществующего `JOB_ID` дают одинаковый `VALIDATION_ERROR` с `retryable=false`; таймаут подтверждения владельца даёт общий `DOWNLOAD_ERROR` (`packages/core/downloader/src/job-owner.ts`), `serializeError` не заполняет `details`. Команды `pause/cancel/retry` при живом владельце передаются ему через inbox (ADR-004), а не отклоняются.

Проверка пересечений: STEP-018 владеет application DTO и завершён; STEP-043 владеет наблюдением аренды и завершён; STEP-019 (CLI) только потребляет признак и ему не принадлежит изменение application/core. Новый product contract не нужен: требование «отказ из-за чужой живой аренды — отдельный код» уже есть в REQ-030.

## Scope

- Определить стабильный признак (отдельный `code` либо `details.reason` в существующем `CommandErrorDto`) для двух случаев: отказ из-за живой аренды другого владельца и отсутствие подтверждения владельца в ограниченное время. Конкретную форму закрепить в плане без нового envelope и без изменения `schemaVersion` существующих CommandResult/JobEvent.
- Убедиться, что отсутствующий job различим: `getJob` → `data: null`, а команды над отсутствующим job возвращают собственный признак, не совпадающий с признаком аренды.
- Тесты на двух экземплярах `createApplication` с общим `stateDir` и `providerOverride`; задокументировать признак в `packages/application/README.md`.
- Признак не раскрывает `ownerToken`, PID, hostname, пути и raw OS данные (PRN-002).

## Mutation policy

### Allowed

- `packages/application/**`, `packages/shared/src/errors.ts`, `packages/shared/src/events.ts` и связанные тесты — только DTO признака и его сериализация.

### Conditional

- `packages/core/downloader/src/job-owner.ts`, `manager.ts` и тесты — только если признак невозможно отличить на уровне application, без изменения правил захвата, TTL, heartbeat, recovery и state machine.

### Forbidden

- CLI, UI, provider, persistence-форматы; изменение lease format и алгоритмов acquire/release/recovery.
- Реализация future/unrelated work «заодно».

## Out of scope

- Отображение признака и exit code в CLI — STEP-019.
- Гонка `pause` до захвата аренды и сохранение `overwrite` при resume — отдельные вопросы владельца application.

## Acceptance criteria

- Для отказа из-за живой аренды и таймаута подтверждения владельца клиент получает различимый стабильный `code` или `details.reason`; признак не совпадает с ошибкой несуществующего `JOB_ID`.
- Тесты на двух экземплярах `createApplication` подтверждают оба случая и несуществующий job; в DTO нет `ownerToken`, PID, hostname, путей и raw ошибок.
- Существующие CommandResult/JobEvent v1 остаются совместимыми; проверки application/shared/downloader проходят.

## Verification

- command: `yarn test packages/application packages/shared packages/core/downloader`
- command: `yarn lint`
- command: `yarn typecheck`
- command: `yarn test`
- command: `yarn build`
- command: `python3 .harness/tools/validate.py --mode manual`

## Deliverables

- Признак отказа аренды в application DTO, тесты, документация в `packages/application/README.md`.

## Implementation plan

### 1. Shared: CommandRefusalError и закрытый union reason

- В packages/shared/src/errors.ts добавить экспортируемый закрытый union CommandRefusalReason = 'JOB_NOT_FOUND' | 'LEASE_HELD_BY_OTHER_OWNER' | 'OWNER_ACK_TIMEOUT' и класс CommandRefusalError extends DomainError (readonly reason; code из существующего allowlist, по умолчанию VALIDATION_ERROR для JOB_NOT_FOUND/LEASE_HELD_BY_OTHER_OWNER и DOWNLOAD_ERROR для OWNER_ACK_TIMEOUT; retryable=false для всех; cause не принимается).
- toJSON, DomainErrorJson, schemaVersion CommandResult/JobEvent не менять. В packages/shared/src/events.ts уточнить только тип CommandErrorDto.details как объект с независимыми необязательными ключами (пока единственный ключ reason?: CommandRefusalReason); тип остаётся совместимым с JsonValue. Формат details расширяемый: другие STEP (STEP-046) добавляют свои ключи, не заменяя чужие; клиенты игнорируют неизвестные ключи и reason и всегда могут опираться на code.
- Новые символы попадают в публичный API shared через существующий export * из errors.js/events.js; index.ts не менять.

**Files:**
- packages/shared/src/errors.ts
- packages/shared/src/events.ts

**Tests:**
- Unit shared: CommandRefusalError — instanceof DomainError, code/retryable по умолчанию и с override code, toJSON не содержит reason/cause.

**Risks:**
- Additive-расширение публичного экспорта и типа details; совместимо с ADR-007 (details? уже в DTO).

### 2. Core (Conditional): пометить только подтверждённые отказы в foreign-owner ветке manager.command

- Обоснование размещения в core: только DownloadManager знает, что acquire не удался и путь ушёл к чужому владельцу, и только там различимы отказ владельца и истечение ожидания; Jobs.managers кэширует managers и для job, которыми экземпляр не владеет.
- В packages/core/downloader/src/manager.ts в catch блока acquire (после проверки manifest !== undefined) читать store.readLeaseState(jobId) (read-only порт STEP-043; исключение → 'unknown'). Если command==='resume' && manifest.control.state==='running' && lease==='active' — не пересылать владельцу и бросить CommandRefusalError('LEASE_HELD_BY_OTHER_OWNER') (матрица ADR-004: «уже выполняется»; code VALIDATION_ERROR, как раньше при отклонении владельцем). Это единственный случай LEASE_HELD; resume при control 'paused' по ADR-004 по-прежнему пересылается владельцу.
- Иначе пересылка владельцу как сейчас. Отклонённый receipt (!accepted) возвращает исходный receipt.error.code без reason (pause/cancel/retry-отказы, AUTH_ERROR, drain DOWNLOAD_ERROR остаются прежними). Если lease==='inactive' или 'unknown' (acquire упал не из-за аренды либо чужой host) — поведение прежнее, reason не ставится, в том числе при отсутствии подтверждения (DownloadError как раньше).
- В packages/core/downloader/src/job-owner.ts requestJobControl получает необязательный параметр leaseObserved (по умолчанию false); при receipt===undefined и leaseObserved===true бросает CommandRefusalError('OWNER_ACK_TIMEOUT'), иначе DomainError('DOWNLOAD_ERROR', false) как раньше. Request из inbox отправитель не удаляет (ADR-004: только держатель аренды). Правила acquire/release/TTL/heartbeat/recovery, ControlReceipt/manifest/inbox-форматы и state machine не менять.
- Предупреждение для README/тестов: timeout означает «подтверждение не получено»; запрос остаётся в inbox и может быть применён текущим или следующим владельцем.

**Files:**
- packages/core/downloader/src/manager.ts
- packages/core/downloader/src/job-owner.ts

**Tests:**
- Unit manager: acquire бросает PermissionError, manifest читаем, waitControlAck→undefined, readLeaseState→'inactive' ⇒ ошибка без reason (DownloadError, как прежде).
- Unit manager: readLeaseState→'unknown' ⇒ без reason.
- Unit manager: resume + control running + lease active ⇒ CommandRefusalError LEASE_HELD, запрос в inbox не отправлялся.
- Unit manager (негативная ветка): resume при control 'paused', readLeaseState 'active' и принятом receipt ⇒ sendControl вызван, CommandRefusalError нет, возвращается обновлённый manifest; при отсутствии receipt ⇒ OWNER_ACK_TIMEOUT. Тест падает, если реализация убирает проверку control.state.
- Unit manager: pause/cancel/retry + lease active + receipt rejected ⇒ исходный code без reason; lease active + нет receipt ⇒ OWNER_ACK_TIMEOUT.
- Существующие тесты downloader проходят без изменения ожиданий code.

**Risks:**
- Concurrency: readLeaseState — независимый снимок без транзакции с acquire; ошибка классификации ведёт только к отсутствию reason (безопасная деградация), а не к лишнему признаку. Порядок операций inbox/ack не меняется.

### 3. Application: JOB_NOT_FOUND и details.reason в результате

- В packages/application/src/jobs.ts в начале Jobs.command (до ветки pause/ownedManager) читать this.store.read(jobId); при undefined бросать CommandRefusalError('JOB_NOT_FOUND') — покрывает все четыре команды и не создаёт каталог job через acquire. getJob для отсутствующего job остаётся data: null.
- В packages/application/src/results.ts при normalized instanceof CommandRefusalError дополнять (а не заменять) CommandErrorDto полем details: { reason }; для остальных ошибок details не добавляется. Использовать только константу reason, без cause и данных из receipt. В logger.warn добавить reason.
- Не исправлять в этом STEP кэширование чужих manager в Jobs.managers (pause после пересылки из того же экземпляра) — передать владельцу application.

**Files:**
- packages/application/src/jobs.ts
- packages/application/src/results.ts

**Tests:**
- Contract-тест: CommandRefusalError даёт details.reason, обычный DomainError — без details; в DTO нет ownerToken/PID/hostname/путей/cause.

**Risks:**
- Сериализация публичных данных не должна вырезать details.reason; проверяется contract-тестом.

### 4. Интеграционные тесты на двух экземплярах createApplication

- В application.integration.test.ts: общий stateDir и providerOverride; appA владеет running job (блокирующий stream mock; готовность владельца доказывается через getJob/readLeaseState==='active' без sleep). appB.resume(jobId) ⇒ kind 'error', code VALIDATION_ERROR, details.reason==='LEASE_HELD_BY_OTHER_OWNER'.
- Таймаут: appB создаётся с manifestStore-обёрткой над FileManifestStore, у которой waitControlAck сразу возвращает undefined; appB.cancel (не resume) ⇒ details.reason==='OWNER_ACK_TIMEOUT'. Тест НЕ утверждает, что команда не применена (владелец A может её применить); повторный pause из appB после пересылки не используется (кэш manager в Jobs.managers вне scope).
- Отсутствующий job: resume/retry/cancel/pause с несуществующим JOB_ID ⇒ details.reason==='JOB_NOT_FOUND', отличен от двух lease-признаков; getJob ⇒ data: null; каталог job в stateDir не создан.
- Не-регрессия: appB.pause пересылается владельцу и принимается (lease остаётся 'active', job paused); затем appB.resume даёт kind 'result' без error/details.reason и status 'running' (путь paused→resume не получает LEASE_HELD). Отклонённые владельцем receipt (pause на уже paused, retry, AUTH_ERROR) покрыты unit-тестами manager, не integration.
- Во всех сценариях JSON результата не содержит ownerToken, pid, hostname, stateDir/путей и текста raw ошибки. Cleanup: appA.shutdown и удаление tmp stateDir в afterEach.

**Files:**
- packages/application/src/application.integration.test.ts

**Tests:**
- Сценарии выше.

**Risks:**
- Flaky при гонке за владение — ожидание условия вместо sleep; ограниченный timeout теста.

### 5. Документация и совместимость

- В packages/application/README.md описать details.reason: три значения, code каждого, что reason только дополняет code (клиенты игнорируют неизвестные reason/ключи details), что LEASE_HELD ставится только для resume запущенного job при живой аренде; OWNER_ACK_TIMEOUT = «подтверждение не получено», запрос не отозван и может быть применён позже — проверяйте getJob; отображение и exit code остаются за клиентами (STEP-019).
- Проверить, что существующие contract-тесты и client-contract fixture проходят без правок (CommandResult/JobEvent v1).
- Handoff без правок чужих STEP: STEP-046 расширяет тот же CommandErrorDto — ему нужна зависимость от STEP-045 либо ссылка на соглашение о details (независимые необязательные ключи); STEP-019 при перепланировании должен читать error.details.reason, а не только error.code, и не писать «команда не выполнена» для OWNER_ACK_TIMEOUT; кэш чужих manager в Jobs.managers требует отдельного STEP/QUICK FIX.

**Files:**
- packages/application/README.md

## Evidence


<!-- VERIFICATION-EVIDENCE:START -->
- Verification run: 2026-10-11T17:14:44Z
- Status: PASS
- Automated resumed: false
- Git head: a448cb4a4e1daf01d6a0cd75159f387639bcbd14
- Worktree hash: sha256:648cfe934be361bf0a5c4dca254ccdb4c9e8d7486a56e2047e59cd3134db810b
- Verification contract basis: sha256:4c022bce2e434476f0665870246f93c5cb49ab4d68ed381df26abf7d7eb9123b
- Subject git head: a448cb4a4e1daf01d6a0cd75159f387639bcbd14
- Subject worktree hash: sha256:7362f95d7f88a30025fbe9af986498d248fb6d5279907ad008620bffd4cc0987

### Automated verification
- Command: yarn test packages/application packages/shared packages/core/downloader
  - Status: PASS
  - Exit code: 0
  - Duration ms: 6128
  - stdout sha256: bd1628e7c0da670208cec1a5b0b367b0f08a8726234fe704611f0b289948e76a
  - stderr sha256: 9795deb6d41d2f0b27f77bc85b5fd219331c9523fa9f5454474670116f8ab223
  - stdout bytes: 2673
  - stderr bytes: 2506
- Command: yarn lint
  - Status: PASS
  - Exit code: 0
  - Duration ms: 7426
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 0
  - stderr bytes: 0
- Command: yarn typecheck
  - Status: PASS
  - Exit code: 0
  - Duration ms: 3018
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 0
  - stderr bytes: 0
- Command: yarn test
  - Status: PASS
  - Exit code: 0
  - Duration ms: 7445
  - stdout sha256: a311ab40f023f4b94d269fcc494cc00f978a1210e9047cae56402dd0caa5bdf7
  - stderr sha256: bffcd1f5e084a777eadac4ff154ae40cb740bcd89a12bb27f5933cf17376fd3e
  - stdout bytes: 9127
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
  - Duration ms: 4170
  - stdout sha256: c4ed02565671ad03d74cacdad254acc3db5de59fceaf32100faae0defce4a07b
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 424
  - stderr bytes: 0

### Product verification
- none

### Manual verification
- none
<!-- VERIFICATION-EVIDENCE:END -->

Generated verification block записывает deterministic runner.


## Blocker / Failure reason

—
