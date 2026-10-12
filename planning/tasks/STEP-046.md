---
schema: 1
id: STEP-046
status: completed
type: implementation
priority: high
phase: core
depends_on:
  - STEP-018
  - STEP-004
requirements:
  - REQ-035
  - REQ-037
  - REQ-029
adrs:
  - ADR-007
  - ADR-010
architecture_refs:
  - "docs/architecture.md#основные-компоненты-границы"
  - docs/architecture.md#reliability-observability
risk_flags:
  - public-api
  - security-sensitive
plan:
  status: ready
  revision: 1
  context_basis: sha256:636efb998352d0bea59bca57446ec3575065a75da4ec13c934363d73550b0711
  content_hash: sha256:3e1a21c5bd51627d59821e04fdfe6a5b682087c40ff417ea4438d8422f540a9e
  reviewed_report: planning/plan-reviews/STEP-046/PLAN-REVIEW-20261011T174134Z.md
  planned_at: 2026-10-11T17:41:34+00:00
  execution_groups:
  context_components:
    - "ADR@ADR-007=sha256:04d6b08c651797508a14cb298d43f539d5364b851981d6d9064800f288b6b42c"
    - "ADR@ADR-010=sha256:1b537392c517e85d1b83cd757d0c2b26e88587c82e3e48c42c2802be5e33a75a"
    - "ARCH@docs/architecture.md#reliability-observability=sha256:a9c337102c2ed62fdaca7173e8e2c05ffe6d68a1d99140fe986a552b3cc636d4"
    - "ARCH@docs/architecture.md#основные-компоненты-границы=sha256:fbdabff4c712b9793cdefe9ef7f14d27253ce04e554c0e2e1ab730cb5bfb5a91"
    - "PRN@PRN-001=sha256:3b3801f207fafc3f77272f0e93570258a6d006964839d93a276accd814d548af"
    - "PRN@PRN-002=sha256:f29ee3fbdb9cf65cf9739d0907768bbf192ad88b8e443110d4d82f81c6b79ecb"
    - "PRN@PRN-003=sha256:16516d7d302fecda5f7615f9d55e29e04b588d671f8660640e1f61d1619e4ef8"
    - "REQ@REQ-029=sha256:91fdcfde9528026cacf957648d67f4b4600ce76f11c66590e1452aeff5a95485"
    - "REQ@REQ-035=sha256:b1130cc7a26791488a178048ec4f352de0119a36e185ed1c5eee0761adbdf1fc"
    - "REQ@REQ-037=sha256:d8eb802392cf51c348fe77e4e83e439685ef78c39806df0b1a1bf9888fb7ef4d"
    - "STEP@STEP-004=sha256:eeb3c1c0af282136ed1585f49e27773d6cf44db8d5f02d4271138dc0fafdf4e7"
    - "STEP@STEP-018=sha256:ef554746f2dd587e4003775194675c6948f4b905d548119bfb60e491e7ec4659"
    - "STEP@STEP-046=sha256:4aba971783099e00d07655b1b04f4589ff9e9f2ddd8513ca502897029f88b3ea"
---

# STEP-046 — Application: уровень логирования, файловый sink и debug-диагностика

## Goal

Application принимает от хоста уровень логирования, необязательный путь файла логов и режим debug, применяет централизованную редакцию секретов и в debug отдаёт клиентам диагностику ошибки со stack, чтобы CLI выполнил REQ-029 (логи в stderr и при настройке в файл) и REQ-037 (stack в debug) без собственного logger.

## Context

Основание — пользовательское решение после блокировки `STEP PLAN STEP-019`. `RuntimeAdapters` принимает только готовый `Logger` из `@music-downloader/logging`, а `apps/*` не могут импортировать этот пакет (PRN-001, eslint boundaries). `createApplication` возвращает DTO ошибки только с `code/message/retryable`, а application логирует `{command, code}`. STEP-004 запретил запись логов в файлы в своей области, поэтому файловый sink требует нового владельца.

Проверка пересечений: STEP-004 (logging) завершён; STEP-018 владеет application API и завершён; STEP-019 только передаёт флаги. Если файловый sink или политика stack затрагивает durable decision (хранение логов, ротация, retention), planner обязан остановиться на ADR/OQ, а не выбирать локально.

## Scope

- Добавить в host-конфигурацию application (`RuntimeAdapters` или его переносимый аналог) уровень логирования `error|warn|info|debug|trace` (по умолчанию `info`, REQ-035), необязательный путь файла логов и режим debug; приём этих параметров без импорта logging в клиентах.
- Файловый sink использует существующую централизованную редакцию (PRN-002): в файл и stderr не попадают токены, Authorization, cookies, signed URL, auth challenge. Уровень по умолчанию и поведение без настройки не меняются; stdout не используется для логов.
- В debug-режиме публичная диагностика ошибки может включать stack только в отдельном явно помеченном поле, прошедшем централизованную редакцию; в обычном режиме stack в DTO, событиях и stderr нет (REQ-037). Форма поля и её совместимость с CommandResult v1 закрепляются в плане без нового envelope.
- Тесты H-001: известные тестовые секреты отсутствуют в файле логов, stderr и DTO; поведение по умолчанию неизменно.

## Mutation policy

### Allowed

- `packages/application/**`, при необходимости `packages/logging/**` и `packages/shared/src/errors.ts`/`events.ts` и связанные тесты и документация.

### Conditional

- ADR/OQ для ротации, retention и расположения лог-файлов — только если planner подтвердит durable decision.

### Forbidden

- CLI, UI, provider; собственный logger/redactor в клиентах; запись секретов открытым текстом.
- Реализация future/unrelated work «заодно».

## Out of scope

- Флаги `--debug`/`--log-file` и переменные окружения CLI — STEP-019; Diagnostics UI — STEP-032; `doctor` — STEP-025.

## Acceptance criteria

- Host задаёт уровень, файл логов и debug через application без импорта logging в клиент; без настройки поведение прежнее (info, stderr).
- В файле логов, stderr и DTO нет известных тестовых секретов (токены, Authorization, cookies, signed URL, challenge).
- В debug stack доступен в явно помеченном поле, в обычном режиме stack отсутствует; CommandResult/JobEvent v1 остаются совместимыми.

## Verification

- command: `yarn test packages/application packages/logging packages/shared`
- command: `yarn exec tsc -p packages/application/tsconfig.client-contract.json`
- command: `yarn lint`
- command: `yarn typecheck`
- command: `yarn test`
- command: `yarn build`
- command: `python3 .harness/tools/validate.py --mode manual`

## Deliverables

- Конфигурация логирования и debug в application, файловый sink, тесты, документация.

## Implementation plan

### 1. Добавить host-конфигурацию application и файловый sink

- Добавить RuntimeAdapters.logging с level?: error|warn|info|debug|trace, filePath?: string и debug?: boolean; экспортировать host тип через application без импорта logging в клиентах. Default level info, debug false; debug управляет только stack, явный level задаёт фильтр.
- Сохранить injected logger без изменения при отсутствии logging; logging.debug допускается с injected logger, сочетание logger с level/filePath отклонять безопасной ValidationError до side effects. Неверный уровень/пустой путь также отклонять безопасно.
- Реализовать в logging append sink только для явного host filePath: каждый уже отредактированный JSON с newline идёт в stderr и файл; stdout не используется. Использовать синхронный append без удерживаемого descriptor, проверить доступность при настройке; ошибки нормализовать через existing DomainError mapping, raw path/native exception наружу не передавать. Не выбирать default location, retention, rotation или автосоздание parent directories.

**Files:**
- packages/application/src/runtime-adapters.ts
- packages/application/src/index.ts
- packages/application/src/composition-root.ts
- packages/logging/src/file-sink.ts
- packages/logging/src/index.ts

**Tests:**
- Уровни error..trace, default info/stderr; реальный временный файл append без перезаписи, stderr/file равны; stdout отсутствует.
- Неверная host config и недоступный файл дают безопасную DomainError; logger override сохраняется, сочетание level/file с override отклоняется.

### 2. Добавить безопасный debug stack в существующий error DTO

- Расширить только CommandErrorDto.details независимым необязательным debug?: {stack:string}, совместно с reason; CommandResult/JobEvent остаются schemaVersion 1, DomainError.toJSON неизменен.
- serializeError получает optional debug-настройку; stack строить из безопасного header code/message и только call frames нормализованной DomainError, централизованно редактировать финальный DTO; raw cause/исходный library error.stack не копировать. Default сериализатор не содержит stack.
- Передать debug в command boundary ApplicationFacade; error.details.debug и error.details.reason объединять без потери ключей; в debug логировать тот же безопасный DTO. При ошибке sink внутри обработки ошибки вернуть безопасную DTO, без raw rejection/рекурсивного логирования. Обычный режим сохраняет прежние данные логирования и отсутствие stack.
- Не добавлять stack в JobEvent и не менять provider/auth lifecycle; редакцию auth challenge полей централизовать в logging только в пределах H-001.

**Files:**
- packages/shared/src/events.ts
- packages/logging/src/serializers.ts
- packages/logging/src/redactor.ts
- packages/application/src/results.ts
- packages/application/src/application.ts
- packages/application/src/composition-root.ts

**Tests:**
- Debug DTO содержит помеченный stack; default DTO, stderr и события не содержат stack; raw cause/текст библиотек отсутствуют.
- reason и debug сосуществуют; isCommandResult и isJobEvent принимают прежние DTO v1.

### 3. Доказать H-001/H-002 через реальный application и сохранить документацию

- Добавить integration тесты createApplication с providerOverride и временным файловым sink: известные tokens, Authorization, cookies, signed URL, challenge в тестовых ошибках/структурированных данных отсутствуют в stderr, файле и DTO. Проверять включённый/выключенный debug, согласованную редакцию и отсутствие stdout. Это direct proof H-001.
- Сохранить проверки уровней/default behavior, injected logger, reason и совместимости v1 как direct proof H-002; обновить client fixture чтобы host конфигурация задавалась только импортом application без logging imports.
- Обновить packages/application/README.md: поля и precedence, append host файла, safe failure, debug stack policy, отсутствие retention/rotation/default location; связанные изменения пользовательских STEP сохранить.
- Выполнить exact Verification и независимое review. Не реализовывать флаги CLI, UI или provider изменения.

**Files:**
- packages/application/src/logging.integration.test.ts
- packages/logging/src/file-sink.test.ts
- packages/logging/src/serializers.test.ts
- packages/application/src/results.test.ts
- packages/application/src/client-contract.fixture.ts
- packages/application/README.md

**Tests:**
- yarn test packages/application packages/logging packages/shared
- yarn exec tsc -p packages/application/tsconfig.client-contract.json
- yarn lint
- yarn typecheck
- yarn test
- yarn build
- python3 .harness/tools/validate.py --mode manual

## Evidence


<!-- VERIFICATION-EVIDENCE:START -->
- Verification run: 2026-10-11T18:04:58Z
- Status: PASS
- Automated resumed: false
- Git head: a448cb4a4e1daf01d6a0cd75159f387639bcbd14
- Worktree hash: sha256:2c6a32bb92903ad13587448c54c6a528036bb133a14576c0ac697cb1a5ab601a
- Verification contract basis: sha256:65b1cfdfeec986a6a76b98b17ee3c7a4c7893b61a7375a048c458c255edee027
- Subject git head: a448cb4a4e1daf01d6a0cd75159f387639bcbd14
- Subject worktree hash: sha256:f0a62cd3640e26302c299938af1929724f711a20a1e6531284d0e0c6ad479615

### Automated verification
- Command: yarn test packages/application packages/logging packages/shared
  - Status: PASS
  - Exit code: 0
  - Duration ms: 6128
  - stdout sha256: 1029b0663eed3322720a8767636d86c5309c2acb8b50460c68656644e3abcac9
  - stderr sha256: d28fbc9c0a8a28471c483609977baa63dfa6ed07fb5cfc907191b5d4e61c20a4
  - stdout bytes: 2532
  - stderr bytes: 2506
- Command: yarn exec tsc -p packages/application/tsconfig.client-contract.json
  - Status: PASS
  - Exit code: 0
  - Duration ms: 715
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 0
  - stderr bytes: 0
- Command: yarn lint
  - Status: PASS
  - Exit code: 0
  - Duration ms: 7276
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 0
  - stderr bytes: 0
- Command: yarn typecheck
  - Status: PASS
  - Exit code: 0
  - Duration ms: 2918
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 0
  - stderr bytes: 0
- Command: yarn test
  - Status: PASS
  - Exit code: 0
  - Duration ms: 7291
  - stdout sha256: b0045ae6ea77aa6636184442fa8f0568f687f525facd5a67f7538b878269a5ff
  - stderr sha256: 45b35270aa864dee8479b845cf67ade30522cc29ff63dd2cdb22c6ddaec3502c
  - stdout bytes: 9284
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
  - Duration ms: 4220
  - stdout sha256: d63e32db48a602aaf059ac3afe2292c7af5e5bcc62c63399e2a775a785fd20d0
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 482
  - stderr bytes: 0

### Product verification
- none

### Manual verification
- none
<!-- VERIFICATION-EVIDENCE:END -->

Generated verification block записывает deterministic runner.


## Blocker / Failure reason

—
