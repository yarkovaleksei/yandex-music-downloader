---
schema: 1
id: STEP-019
status: planned
type: implementation
priority: critical
phase: core
depends_on:
  - STEP-018
  - STEP-004
requirements:
  - REQ-029
  - REQ-030
  - REQ-031
  - REQ-013
  - REQ-001
  - REQ-002
  - REQ-003
  - REQ-009
  - REQ-017
  - REQ-037
adrs:
  - ADR-010
  - ADR-001
  - ADR-007
  - ADR-006
architecture_refs:
  - "docs/architecture.md#основные-компоненты-границы"
  - "docs/architecture.md#основные-потоки"
risk_flags:
  - public-api
plan:
  status: ready
  revision: 1
  context_basis: sha256:df9231cda2208d2a52f1239c2cd0d0e9b64125d10311444b468519abb6508b72
  content_hash: sha256:169af693036b7067245dc1437a673cf22f7a11e4621d3671584050da2e90cb0a
  reviewed_report: planning/plan-reviews/STEP-019/PLAN-REVIEW-20261011T065502Z.md
  planned_at: 2026-10-11T06:55:02+00:00
  execution_groups:
  context_components:
    - "ADR@ADR-001=sha256:0c9975737760fdee3b16ec2c99c8412cd98e81af5a0ce123cf70600a4a3200bc"
    - "ADR@ADR-006=sha256:792115c4604a81dfd2d62950958470e1c1f1bad2b2f18e873d5743b9f9dc443d"
    - "ADR@ADR-007=sha256:04d6b08c651797508a14cb298d43f539d5364b851981d6d9064800f288b6b42c"
    - "ADR@ADR-010=sha256:1b537392c517e85d1b83cd757d0c2b26e88587c82e3e48c42c2802be5e33a75a"
    - "ARCH@docs/architecture.md#основные-компоненты-границы=sha256:fbdabff4c712b9793cdefe9ef7f14d27253ce04e554c0e2e1ab730cb5bfb5a91"
    - "ARCH@docs/architecture.md#основные-потоки=sha256:e7842c107b39127d5776d5575d975efcf69df8d05024b630a938e1dc510e7575"
    - "PRN@PRN-001=sha256:3b3801f207fafc3f77272f0e93570258a6d006964839d93a276accd814d548af"
    - "PRN@PRN-002=sha256:f29ee3fbdb9cf65cf9739d0907768bbf192ad88b8e443110d4d82f81c6b79ecb"
    - "PRN@PRN-003=sha256:16516d7d302fecda5f7615f9d55e29e04b588d671f8660640e1f61d1619e4ef8"
    - "REQ@REQ-001=sha256:bc1700aedb2e43628cae048a8e61f544c0e0d7093b399cf2729420aaab626d85"
    - "REQ@REQ-002=sha256:57b2efdb8feefc31d5701a6d4be255b8905908c1704d2b7f171a1022fe6e0629"
    - "REQ@REQ-003=sha256:42d546ded1413585e1802a22330255b27299822fa66238583a5f86f6a35e3036"
    - "REQ@REQ-009=sha256:d757e12491f060a00d6265bb48aa8cc963fe62e1db09680d1724c6b09585e684"
    - "REQ@REQ-013=sha256:147b5b93930e0d8e1ede0c0e23fdc92c045be95fbfb43e2df639db56d1da4453"
    - "REQ@REQ-017=sha256:d5edc8e72418dda2a839250cfd22e9be6d86d1eb25f1ef2c33fc73c67d9204bb"
    - "REQ@REQ-029=sha256:91fdcfde9528026cacf957648d67f4b4600ce76f11c66590e1452aeff5a95485"
    - "REQ@REQ-030=sha256:bed9c954699827ba80998c4b00d3d5ce1fa6a8c5b42bf137fecec8e51703fbe2"
    - "REQ@REQ-031=sha256:80a8f3757da8dcef57f9f1ba5d17758363e06a91cc4b03c1d54b42b30a24fa74"
    - "REQ@REQ-037=sha256:d8eb802392cf51c348fe77e4e83e439685ef78c39806df0b1a1bf9888fb7ef4d"
    - "STEP@STEP-004=sha256:eeb3c1c0af282136ed1585f49e27773d6cf44db8d5f02d4271138dc0fafdf4e7"
    - "STEP@STEP-018=sha256:febf27d443b99ddcf211444b7757436b95307dcce8a4eacc19bd84dcb78c7238"
    - "STEP@STEP-019=sha256:50da98896eebcaca3e997a13178b5889a2d4d842282e84c583a414400ceda9cc"
---

# STEP-019 — CLI: команды, опции и режим --json

## Goal

Реализовать `apps/cli` с командами auth, account, download/track/album/playlist, jobs, resume, retry, cancel, опциями и NDJSON-режимом.

## Context

CLI — обязательный продукт первого этапа; doctor добавляется отдельным STEP-025.

## Scope

- Команды и разбор аргументов, коды завершения.
- Человекочитаемый вывод и прогресс; `--json` NDJSON — проекция `CliRecord` application layer (CLI собственную схему не определяет).
- Ctrl+C: корректная пауза через application API; коды завершения различают `completed`, `completed_with_errors`, ошибку использования и ошибку выполнения.
- Опции output/quality/concurrency/overwrite/skip-existing.
- Smoke-тесты на mock application.

## Mutation policy

### Allowed

- `apps/cli/**`, тесты.

### Conditional

- Нет.

### Forbidden

- Импорт provider/core напрямую, определение собственной схемы событий, команда doctor.
- Реализация future/unrelated STEP «заодно».

## Out of scope

- doctor (STEP-025).

## Acceptance criteria

- Команды auth, account, download/track/album/playlist, jobs, resume, retry, cancel и logout присутствуют в `--help` и покрыты smoke-тестами; doctor реализуется STEP-025.
- Каждая строка stdout в `--json` валидна по union `CliRecord` из `packages/shared`.
- Некорректные значения опций дают ошибку использования с ненулевым кодом.
- Статическая проверка: `apps/cli` не импортирует provider/core напрямую.

## Verification

- command: `yarn test apps/cli`
- command: `yarn lint`
- command: `yarn typecheck`
- command: `yarn test`
- command: `yarn build`
- command: `node apps/cli/dist/index.js --help`
- command: `python3 .harness/tools/validate.py --mode manual`
- manual: После готовности provider выполнить music-downloader download на доступном реальном треке: зафиксировать команду без секретных URL, наблюдаемый итог и exit code; подтвердить работу реального CLI/application и системного secure storage. Mock-тесты не заменяют этот прогон.

## Deliverables

- CLI, тесты.

## Implementation plan

### 1. Согласовать CLI с завершённым application API и подготовить запуск music-downloader

- После выполнения prerequisite STEP-018 сверить публичные exports createApplication, auth/account/logout, resolve/preview/createDownload, listJobs/getJob, pause/resume/retry/cancel, subscribe и завершения экземпляра с его реализованным контрактом. Точные сигнатуры брать из application, а не придумывать в CLI. Если обязательная операция или lifecycle отсутствуют, остановить реализацию и передать проблему владельцу STEP-018; core/provider не подменять локальной реализацией.
- Создать Node ESM entrypoint с shebang и bin music-downloader в apps/cli/package.json; вынести тестируемый runner с injection mock application, argv/env, stdout/stderr и signal source. Production вызывает только application composition root; конкретные store, logger, browser и core остаются за его API. Использовать встроенные Node средства вместо новых внешних dependencies.
- Типы результатов брать из публичного application API/его реэкспортов; разрешённые shared types использовать только без новых runtime зависимостей. Изменения ограничить apps/cli, не менять root lockfile/tooling или пакеты prerequisite. Добавить краткие русские комментарии со ссылками @link на REQ/ADR в местах решений по stdout, exit codes и signal lifecycle.

**Files:**
- apps/cli/package.json
- apps/cli/src/index.ts
- apps/cli/src/runner.ts
- apps/cli/src/runner.test.ts

**Tests:**
- Сборка entrypoint и запуск --help через дочерний Node-процесс; mock application вызывается через тот же runner.

**Risks:**
- Публичный application entrypoint сейчас заглушка; план опирается на explicit prerequisite STEP-018. Его смысловые изменения потребуют повторного PLAN.

### 2. Разобрать команды, опции и конфигурацию с понятными ошибками использования

- Реализовать auth, account, logout, download <URL>, track/album/playlist <URL>, jobs, resume/retry/cancel <JOB_ID>; --help описывает синтаксис и опции, doctor остаётся STEP-025.
- Для --output, --quality, --concurrency, --overwrite, --skip-existing и --json определить эффективные настройки в порядке explicit CLI flags → MUSIC_DOWNLOADER_* env → локальный settings.json → defaults. Имена переменных, расположение settings.json и способ выбора файла документировать в apps/cli/README.md и help; JSON содержит только настройки загрузки, credentials/challenge не читаются и не записываются. Default output — музыкальный каталог пользователя ОС (XDG на Linux, Music в home при отсутствии настройки), quality=best, concurrency=4.
- Проверять required positional args, неизвестные команды/опции, значения quality best|lossless|high|normal, целое concurrency 1–8, непустой output и корректность прочитанной конфигурации. Выбранный режим overwrite/skip-existing передавать application без собственной проверки аудиофайлов; если оба явно включены, вернуть ошибку использования. Валидировать эффективное значение после применения приоритета.
- Ошибки разбора и конфигурации выводить безопасно: без echo содержимого произвольного config, токенов, полного пользовательского URL с security query или raw exception. В --json использовать существующий CommandResult error contract, не вводить локальную схему.

**Files:**
- apps/cli/src/arguments.ts
- apps/cli/src/configuration.ts
- apps/cli/src/arguments.test.ts
- apps/cli/src/configuration.test.ts
- apps/cli/README.md

**Tests:**
- Таблица всех команд и arity; неизвестные команды/флаги; quality и concurrency (1,8 принимаются; 0,9,дробное и мусор отвергаются).
- Приоритет flags/env/config/defaults, default output/quality/concurrency и передача опций mock application без потерь.

### 3. Подключить непотоковые команды и загрузку к application

- auth/account/logout/jobs и управление job делегировать соответствующим application операциям; account без авторизации возвращает ненулевой код и понятное состояние, AUTH_ERROR сопровождается инструкцией music-downloader auth. Logout не управляет credentials напрямую; auth не запрашивает пароль и не показывает приватный challenge.
- download автоматически разрешает тип URL через application; track/album/playlist проверяют тип по возвращённому MediaReference/preview и отвергают несоответствие. Создание job и передача output/quality/concurrency/overwrite/skip-existing выполняются через application; CLI не разбирает Yandex endpoint/ID и не реализует queue/retry/recovery.
- Подписаться на JobEvent до запуска операции, чтобы сохранить job.created и быстрые terminal events; связывать вывод с jobId операции, а не с чужими job. Дождаться результата/snapshot через application и завершения операции, освобождая подписку и application lifecycle в finally.
- Для resume/retry заранее выбрать поведение: если application операция запускает выполнение, CLI наблюдает её job-поток до итогового состояния; cancel и остальные непотоковые операции выводят один CommandResult. Невалидный JOB_ID и отказ живой аренды показываются как безопасные ошибки application, без захвата чужой аренды и автоматического повтора.

**Files:**
- apps/cli/src/runner.ts
- apps/cli/src/commands.ts
- apps/cli/src/commands.test.ts

**Tests:**
- Smoke каждой команды на mock application; варианты track/album/playlist, несовпадение типа URL, jobs с jobId/источником/статусом, отсутствующий jobId.
- Успех/отказ auth, account без авторизации, logout, отсутствие password prompt; subscription устанавливается до синхронного job.created.

### 4. Реализовать вывод и таблицу exit codes по общим DTO

- NDJSON сериализует полученные JobEvent/CommandResult из общего CliRecord без изменения schemaVersion/seq/payload и без дополнительного CLI envelope. Команды без потока печатают ровно один CommandResult; поток загрузки — только JobEvent. Если создание job не удалось до возникновения потока, вывести один безопасный CommandResult error по существующему union.
- Человекочитаемый режим показывает результат, job/track progress и безопасные доменные сообщения; в --json human progress/auth notifications/logs направлять только в stderr через разрешённые application механизмы. Не импортировать logger напрямую и не печатать raw native/provider exception. Обычный вывод не содержит stack trace; debug-диагностика использует только доступный безопасный application механизм централизованной редакции по REQ-037/PRN-002.
- Зафиксировать exit-code table в help и apps/cli/README.md: completed, включая все skipped, и успешный CommandResult → 0; completed_with_errors → 1; usage → 2; failed/ошибка выполнения/неавторизованный account/interrupted → 3; paused (SIGINT/AUTH_REQUIRED) → 4; cancelled → 5; отказ чужой живой аренды → 6. Определять по application результату/status/code, не по тексту сообщений и не пересчитывая состояние треков.
- Проверку строк NDJSON выполнить по каноническому shared union: typed fixtures/ожидания из публичных типов application и структурные проверки распарсенных записей для обеих веток CommandResult и JobEvent. Если prerequisite предоставляет общий runtime validator, применять его; собственную production transport schema в CLI не создавать.

**Files:**
- apps/cli/src/output.ts
- apps/cli/src/exit-code.ts
- apps/cli/src/output.test.ts
- apps/cli/src/exit-code.test.ts
- apps/cli/README.md

**Tests:**
- H-001: каждую stdout строку JSON.parse, сверить обязательные поля и discriminator общего CliRecord; account/jobs/auth/logout и непотоковое управление дают одну запись. Проверить последовательность job/track, монотонный seq и сохранение payload.
- Проверить отсутствие известных test tokens, Authorization, cookies, signed URL и auth challenge в захваченном stdout/stderr, отсутствие примесей human output в NDJSON; источник DTO — mock application с безопасным контрактом, а CLI ошибки/уведомления — собственные входные поверхности.
- Таблица всех exit codes, failed и AUTH_REQUIRED, все skipped, lease conflict; обычная доменная ошибка без stack trace.

### 5. Обработать Ctrl+C через подтверждённую application pause

- SIGINT во время загрузки один раз вызывает pause текущего job через application и дожидается подтверждённого результата/статуса paused перед выходом 4. Если SIGINT пришёл до получения jobId, запомнить запрос и применить его после создания job; не терять job.created и не заявлять паузу заранее.
- Application/core владеют bounded pause timeout, сохранением manifest и освобождением аренды по ADR-006; CLI не вводит второй таймаут/recovery и не завершает процесс жёстко до результата. Отказ pause отображать как безопасную ошибку и соответствующий exit code, без заявления успешного освобождения аренды.
- При завершении удалить SIGINT handlers и subscription, дождаться разрешённого application shutdown и завершения записи stdout/stderr; использовать process.exitCode после cleanup. Авторизация не получает нового публичного signal API: приватная отмена/lifetime остаются provider по ADR-010.

**Files:**
- apps/cli/src/signals.ts
- apps/cli/src/signals.test.ts
- apps/cli/src/runner.ts

**Tests:**
- H-002: SIGINT при активном job и до возврата jobId, повторный SIGINT без дублированной pause, подтверждение pause до выхода, ошибка pause без ложного успеха.
- AUTH_REQUIRED завершается paused с инструкцией auth; handlers/subscription удалены, NDJSON завершён и коды соответствуют authoritative application результату.

### 6. Доказать CLI acceptance через smoke и проверить границы

- Запустить весь CLI smoke suite на injected mock application и process smoke built entrypoint (help/usage); там, где STEP-018 предоставляет providerOverride, добавить загрузку через реальный application с mock provider, не импортируя provider/testing/core в CLI.
- Покрыть H-001/H-002 командой yarn test apps/cli до completion: общий NDJSON contract, порядок вывода, отсутствие секретов, SIGINT и exit codes. Эти proofs пока planned, а не выполнены на этапе PLAN.
- Пройти штатные lint с boundary rules, typecheck, полный test и build; проверить bin music-downloader в apps/cli/package.json. Ручной реальный download сохранить обязательным отдельным evidence после готовности provider и среды; mock smoke его не заменяет.

**Files:**
- apps/cli/src/cli.smoke.test.ts
- apps/cli/src/fixtures/**
- apps/cli/README.md

**Tests:**
- yarn test apps/cli
- yarn lint
- yarn typecheck
- yarn test
- yarn build

**Risks:**
- Изменения application/shared prerequisite после Ready могут сделать planning context устаревшим. Реальная загрузка требует доступного аккаунта, provider и системного secure storage; незавершённую ручную проверку нельзя объявлять PASS.

## Evidence

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.

## Blocker / Failure reason

—
