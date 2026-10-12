---
schema: 1
id: STEP-019
status: completed
type: implementation
priority: critical
phase: core
depends_on:
  - STEP-018
  - STEP-004
  - STEP-045
  - STEP-046
  - STEP-047
  - STEP-048
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
  revision: 4
  context_basis: sha256:ee7ccb92222d34ee3fcf328a1b305396f83950e05d841dfb553eed165014e7c1
  content_hash: sha256:8c6364f097baa8c97e2698485085864645a763a319a332b0a0715ec50e7150ec
  reviewed_report: planning/plan-reviews/STEP-019/PLAN-REVIEW-20261011T200142Z.md
  planned_at: 2026-10-11T20:01:43+00:00
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
    - "STEP@STEP-018=sha256:ef554746f2dd587e4003775194675c6948f4b905d548119bfb60e491e7ec4659"
    - "STEP@STEP-019=sha256:2ae5cb7b9f7a57c8630874ee9ea235f7515e367c0ce7849b590cafd1669aa91f"
    - "STEP@STEP-045=sha256:33ef17464cb0c23a467f3704acd7c4604ead4e886391b265c86cba31e426c667"
    - "STEP@STEP-046=sha256:07d36e40a073f5e3280535f1ca9086c0ff288814ea9609ea0f0f408b658ff159"
    - "STEP@STEP-047=sha256:73141407cfbe67a7bee3f8f7ef913e2ebd22faa6320db3b126fcb01990bf32c0"
    - "STEP@STEP-048=sha256:2933bce8ea857d290855dc5513b6fa2e74948e2ee5e353fb068f55b0b6e41b13"
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

- Корневой `yarn.lock` — только детерминированное обновление записи workspace `@music-downloader/cli` (поле `bin`) командой `yarn install`; других изменений lockfile и tooling нет.

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
- command: `yarn install --immutable`
- command: `yarn build`
- command: `node apps/cli/dist/index.js --help`
- command: `python3 .harness/tools/validate.py --mode manual`
- manual: После готовности provider выполнить music-downloader download на доступном реальном треке: зафиксировать команду без секретных URL, наблюдаемый итог и exit code; подтвердить работу реального CLI/application и системного secure storage. Mock-тесты не заменяют этот прогон.

## Deliverables

- CLI, тесты.

## Implementation plan

### 1. Проверить существующий entrypoint и актуальные публичные контракты

- CLI уже реализован; новый RUN проверяет и завершает существующую реализацию, без повторного создания модулей. STEP-047 устранил ложный lint-запрет application/contracts; STEP-048 исправил artwork default и доказал реальный download. Все шесть dependencies завершены; их code/evidence не изменять в STEP-019.
- Использовать актуальные публичные exports @music-downloader/application и @music-downloader/application/contracts. STEP-045/046 завершены: host logging уже доступен как RuntimeAdapters.logging={level?,filePath?,debug?}, безопасный stack — error.details.debug.stack; причины отказа — error.details.reason. Не реализовывать logger, файловый sink или debug DTO внутри CLI.
- Проверить существующие bin music-downloader → dist/index.js, ESM entrypoint с shebang и export cliPackage. Сборка — существующий yarn build (tsc -b), без новых зависимостей/корневого tooling.
- Runner инъецирует argv/env/homedir/stdout/stderr, сигналы и фабрику ApplicationApi. --help и ошибки синтаксиса обрабатывать до создания application. RuntimeAdapters.concurrency передавать при сборке application после разбора настроек.
- Проверить существующую bin-запись workspace @music-downloader/cli в yarn.lock командой yarn install --immutable. Исправлять её только при подтверждённом рассогласовании и только через yarn install; другие lockfile/tooling изменения запрещены. Сохранять короткие русские комментарии с @link на REQ/ADR для stdout, exit codes и signal lifecycle.

**Files:**
- apps/cli/package.json
- apps/cli/src/index.ts
- apps/cli/src/runner.ts
- apps/cli/src/runner.test.ts
- yarn.lock

**Tests:**
- Process smoke собранного entrypoint --help и ошибка синтаксиса → 2; help не создаёт application/provider/store.

**Risks:**
- Изменение upstream application/shared API после PLAN stale-ит Ready fingerprints; перед IMPLEMENT использовать dispatcher.

### 2. Проверить команды, конфигурацию и передачу host logging

- Команды: auth, account, logout, download <URL>, track|album|playlist <URL>, jobs, resume|retry|cancel <JOB_ID>. doctor отсутствует до STEP-025. Парсер — Node parseArgs либо локальный разбор без внешних зависимостей.
- Опции загрузки --output/--quality/--concurrency/--overwrite/--skip-existing; общие --json/--log-level/--log-file/--debug. Документировать MUSIC_DOWNLOADER_OUTPUT/QUALITY/CONCURRENCY/OVERWRITE/SKIP_EXISTING/JSON/LOG_LEVEL/LOG_FILE/DEBUG и приоритет flags → env → settings.json → defaults.
- settings.json содержит только настройки загрузки и логирования, без credentials. Путь: POSIX $XDG_CONFIG_HOME/music-downloader/settings.json либо ~/.config/music-downloader/settings.json; Windows %APPDATA%/music-downloader/settings.json (при отсутствии APPDATA — пользовательский fallback, явно описанный в README). Файл необязателен; ошибки чтения/JSON — безопасный результат без содержимого файла.
- Defaults: quality=best, concurrency=4, overwrite=false, json/debug=false, log level/info и отсутствие log file — контракт STEP-046. output — музыкальный каталог ОС: для Linux прочитать XDG user-dirs.dirs без выполнения shell; иначе ~/Music. Для Windows/macOS использовать Music под homedir; paths/env инъецируются в тестах.
- Проверять quality∈best|lossless|high|normal, concurrency целое 1–8, булевы env/config значения и уровень error|warn|info|debug|trace. Неизвестный флаг/команда, arity, пустые output/log-file → usage 2. Для режима overwrite/skip-existing выбирать первое явно заданное правило на самом высоком уровне приоритета; одновременные true на одном уровне — usage 2.
- Матрица применимости: --output/--quality/--overwrite/--skip-existing только download/track/album/playlist; --concurrency также resume/retry; --json и logging/debug общие. Явные неприменимые флаги отвергать usage 2; загрузочные defaults/env/config не подменяют persisted параметры resume/retry.
- Передать эффективные --log-level/--log-file/--debug в createApplication({logging:{level,filePath,debug}}) через публичный RuntimeLoggingOptions без импорта logging. Debug не меняет выбранный log level: default level info и debug false. filePath необязателен, default файла нет; приложение добавляет очищенные JSONL в stderr и файл, не создаёт parent-каталоги. Ошибки bootstrap/sink показывать фиксированным безопасным CommandResult без raw path/exception; описать эти поля и ограничения в README.

**Files:**
- apps/cli/src/arguments.ts
- apps/cli/src/configuration.ts
- apps/cli/src/arguments.test.ts
- apps/cli/src/configuration.test.ts
- apps/cli/README.md

**Tests:**
- Таблица arity/флагов/применимости; границы concurrency 1/8 и отказ 0/9/1.5/мусора; quality и bool/log level; overwrite/skip-existing с приоритетом.
- Приоритет flags/env/config/defaults; отсутствующий/невалидный config; XDG/homedir через injection; RuntimeAdapters и DownloadRequest получают значения без потерь.
- Mock factory получает точные logging.level/filePath/debug; debug не подменяет level. Real application с временным log file: stderr/file без известных секретов, stdout остаётся CliRecord; bootstrap отказ файла — безопасная ошибка.

### 3. Проверить делегирование команд и наблюдение окончательного job

- auth/account/logout/jobs/cancel вызывают authenticate/account/logout/listJobs/cancel и выводят один исходный ApplicationResult. account data:null → состояние «не авторизован» и exit 3; AUTH_ERROR — безопасная инструкция music-downloader auth в human stderr. Пароль/challenge/URL auth CLI не обрабатывает.
- download/track/album/playlist: resolve(url) → проверка kind alias → createDownload({source,quality,destination,overwrite}). preview не нужен для принятия ссылки и не становится обязательной точкой отказа. Разбор Yandex URL/ID находится за application.
- subscribe до createDownload/resume/retry; для новой загрузки связать поток с jobId первого job.created данной операции. Выводить только события целевого job. createDownload Promise возвращает окончательный snapshot; event job.completed не заменяет результат/shutdown.
- resume/retry продолжают наблюдение после успешного queued/running snapshot. subscribe используется для локального прогресса, плюс последовательный getJob с небольшим интервалом наблюдения: подписка экземпляра не доставляет события другого процесса и pause/cancel не обязаны создавать job.completed. Завершение — completed/completed_with_errors/failed/cancelled/paused либо подтверждённый interrupted после запуска; queued/running никогда не считаются итогом. При ошибке getJob/исчезновении job вернуть безопасную ошибку, не зависать.
- JOB_NOT_FOUND — понятная ошибка выполнения; LEASE_HELD_BY_OTHER_OWNER и OWNER_ACK_TIMEOUT распознавать по error.details.reason, не по тексту/code в одиночку. Таймаут означает отсутствие подтверждения, команда может быть применена позднее; не повторять автоматически.

**Files:**
- apps/cli/src/commands.ts
- apps/cli/src/job-observer.ts
- apps/cli/src/commands.test.ts
- apps/cli/src/job-observer.test.ts
- apps/cli/src/runner.ts

**Tests:**
- Smoke каждой команды на mock ApplicationApi, несовпадение kind, неизвестный JOB_ID, account:null, auth/logout.
- Resume/retry: queued→running→completed, paused/cancelled без job.completed; remote job наблюдается getJob; ошибки snapshot и неизвестные details не приводят к ложному успеху.

### 4. Подтвердить CliRecord и коды завершения

- --json stdout: исходные JobEvent в потоке загрузки и один исходный CommandResult для не-потоковых команд; без CLI-envelope/схемы. Ошибки до создания job и ошибки команд — существующий CommandResult error. Human результат/прогресс, auth notify и логи — stderr; никакого stack/raw exception в обычном режиме.
- Для локальных usage/ошибок bootstrap сформировать существующий CommandResult с фиксированными безопасными code/message/retryable; не вставлять raw argv, URL с query, env, config, исключения. При debug выводить в human stderr только уже отредактированный error.details.debug.stack от application; не строить собственный stack. В NDJSON сохранять исходный DTO v1 целиком, включая независимые reason/debug и неизвестные безопасные details.
- Таблица в help/README: успех/completed (все skipped тоже) → 0; completed_with_errors → 1; usage → 2; failed/ошибка выполнения/account:null/interrupted → 3; подтверждённый paused (SIGINT/AUTH_REQUIRED) → 4; cancelled → 5; details.reason LEASE_HELD_BY_OTHER_OWNER или OWNER_ACK_TIMEOUT → 6. JOB_NOT_FOUND → 3. Неизвестные details сохраняют обработку по code; API отказ не объявляется paused.
- H-001: валидировать каждую строку JSON.parse + isJobEvent||isCommandResult из application/contracts; seq монотонен в пределах job, исходные payload/data/error сохранены; тестовые токены, Authorization, cookies, signed URL и challenge отсутствуют в stdout/stderr.

**Files:**
- apps/cli/src/output.ts
- apps/cli/src/exit-code.ts
- apps/cli/src/output.test.ts
- apps/cli/src/exit-code.test.ts
- apps/cli/README.md

**Tests:**
- Все exit codes по snapshot/code/details.reason; по одной записи account/jobs/auth/logout/cancel; NDJSON без human-примесей.
- H-001 на mock ApplicationApi и real createApplication с локальным mock provider, включая поток job/track от job.created до завершения и отсутствие тестовых секретов.
- Default ошибки не показывают stack, debug показывает только error.details.debug.stack; reason и debug сосуществуют без потерь, exit code определяется reason независимо от debug и неизвестных ключей.

### 5. Подтвердить Ctrl+C, pause и освобождение ресурсов

- Если SIGINT пришёл до вызова createDownload/resume/retry, не начинать новую работу и вернуть прерывание (3). Если операция уже вызвана, но jobId ещё не появился, запомнить запрос и применить к полученному jobId.
- job.created не доказывает active run/захват аренды. Pending pause выполнять после наблюдаемого начала работы (getJob статус running/активные track состояния либо track.started), не вызывать pause вслепую в job.created. Если job успел завершиться, вернуть его настоящий конечный статус вместо ложного paused.
- Для активного job один запрос pause(jobId), повторный SIGINT не дублирует команды. Успех pause подтверждается paused/конечным snapshot, плюс ожиданием результата запуска и shutdown. queued/interrupted результат раннего pause не выдавать за успешную паузу; при подтверждённой гонке, не разрешимой через публичный API, остановить реализацию и передать конкретный reproduced scenario владельцу STEP-018.
- CLI не вводит собственный release/ack timeout — bounded shutdown владеет application/core ADR-006. Ошибка pause/shutdown выводится безопасно с кодом ошибки и без утверждения об освобождении аренды; не скрывать ошибку cleanup под exit 0/4.
- finally: снять SIGINT handlers, отписаться, дождаться shutdown и flush stdout/stderr, установить process.exitCode. process.exit до cleanup не использовать.
- H-002: повторно проверить существующим yarn test apps/cli сценарий job.created до lease и безопасный pending pause через публичный ApplicationApi. Для Ready это proof obligation; факт наличия tests и исторический PASS не заменяют свежий Verification. При reproduced defect исправлять только CLI; неразрешимую через facade гонку передавать владельцу application/core.

**Files:**
- apps/cli/src/signals.ts
- apps/cli/src/signals.test.ts
- apps/cli/src/runner.ts
- apps/cli/src/cli.integration.test.ts

**Tests:**
- H-002: SIGINT до invocation/до jobId/в job.created/на gated активном потоке; повторный SIGINT; pause failure; completed в гонке; shutdown failure; cleanup handlers/subscription.
- H-002 real createApplication+providerOverride: resume/retry дожидаются конечного состояния, Ctrl+C → paused, shutdown завершается и следующий application читает согласованное состояние.

### 6. Выполнить актуальную Verification и передать реализацию на независимый REVIEW

- Mock ApplicationApi smoke проверяет все команды/опции. Использовать существующие integration tests с настоящим createApplication({stateDir,providerOverride}) и локальным MusicProvider fixture в apps/cli/src/cli.integration.test.ts из публичных application/contracts. Не переносить fixture ради структуры и не добавлять прямые импорты provider/core/persistence/logging/testing; logging проверять только через host config.
- Создавать paused/failed job через public API с gated fixture, возобновлять той же или новой application; тесты real resume/retry/signal покрывают lifecycle, mock unit tests покрывают формат вывода и все exit branches. Реальный fixture поток не требует private токенов/Yandex сети.
- Process smoke собранного bin: --help и ошибка использования, плюс проверка package bin music-downloader. Статические boundary проверки — существующий yarn lint; root tooling не изменять.
- В README описать команды, матрицу опций, env/config, logging/debug handoff, NDJSON, exit codes и secure storage prerequisite. doctor оставить STEP-025.
- Выполнить все автоматические Verification. Обязательный реальный download доступного трека через CLI/application и системный secure storage — отдельное manual evidence, с безопасной командой без секретного URL, результатом и exit code; mock не заменяет live proof. Если доступного аккаунта/secure storage нет — completion BLOCKED, без объявления PASS.
- Подтвердить H-001 и H-002 exact командой yarn test apps/cli и выполнить остальные восемь записей Verification. Результаты старого FAIL/PENDING сохранить как историю; новый generated evidence записывает только canonical runner.
- Обязательный manual check повторить на текущем собранном CLI без providerOverride/обхода fetchArtwork: публичный track URL, системный keyring, completed/exit 0, итоговый файл и отсутствие .part. Успешный прогон STEP-048 — prerequisite evidence, а не свежая Verification STEP-019; не переносить его в generated PASS. При отказе за границами CLI остановиться с конкретным owner handoff без unrelated fixes.
- После актуального Verification передать точную revision независимому STEP REVIEW STEP-019 по dispatcher. Только schema-valid PASS и canonical completion gate допускают completed; PLAN не изменяет lifecycle на completed и не запускает production mutations.

**Files:**
- apps/cli/src/cli.smoke.test.ts
- apps/cli/src/cli.integration.test.ts
- apps/cli/README.md

**Tests:**
- yarn test apps/cli (H-001/H-002 и smoke), yarn lint, yarn typecheck, yarn test, yarn install --immutable, yarn build, process --help.

**Risks:**
- Live download требует действующего аккаунта/системного store; секретные данные не выводятся и не сохраняются в evidence.

## Evidence






<!-- VERIFICATION-EVIDENCE:START -->
- Verification run: 2026-10-11T20:17:51Z
- Status: PASS
- Automated resumed: true
- Git head: a448cb4a4e1daf01d6a0cd75159f387639bcbd14
- Worktree hash: sha256:1de32e52bc6b74acf26aa5d736c49186a536c90e720fc51a0ac243544ff0a4a1
- Verification contract basis: sha256:3ef5637be2da281b8c9c29636eab30040f0b550b081211c6443c48ac33643f74
- Subject git head: a448cb4a4e1daf01d6a0cd75159f387639bcbd14
- Subject worktree hash: sha256:2f3fbe4d5edc519a27b3d64ec9c1293d1c921ee2310893e23a429bfb6d804a82

### Automated verification
- Command: yarn test apps/cli
  - Status: PASS
  - Exit code: 0
  - Duration ms: 2021
  - stdout sha256: fabb292d45194f0bcd6f37c2e4276c9630da9d34b3a3f36a1cde32c593e26451
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 1023
  - stderr bytes: 0
- Command: yarn lint
  - Status: PASS
  - Exit code: 0
  - Duration ms: 7272
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 0
  - stderr bytes: 0
- Command: yarn typecheck
  - Status: PASS
  - Exit code: 0
  - Duration ms: 3017
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 0
  - stderr bytes: 0
- Command: yarn test
  - Status: PASS
  - Exit code: 0
  - Duration ms: 7135
  - stdout sha256: 067013518d4fc185c1b0f3c6ee504624684fa99e57cd9c126baffa25b0a6186e
  - stderr sha256: cef43f2795f2e9b582fd70e0b8ccbbfd3fab5d8e141ea0e1e0d38822a96b3527
  - stdout bytes: 10062
  - stderr bytes: 2506
- Command: yarn install --immutable
  - Status: PASS
  - Exit code: 0
  - Duration ms: 564
  - stdout sha256: e91eb9ecbd43df695bdd444698cf7fa909c4268e44a98ecf1120f9c2bb72b8a5
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 222
  - stderr bytes: 0
- Command: yarn build
  - Status: PASS
  - Exit code: 0
  - Duration ms: 364
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 0
  - stderr bytes: 0
- Command: node apps/cli/dist/index.js --help
  - Status: PASS
  - Exit code: 0
  - Duration ms: 214
  - stdout sha256: bc75dcd0f43dad7c7622b32e71f9da908feeac475a48a5fc921c9d0d7a4c0e8b
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 595
  - stderr bytes: 0
- Command: python3 .harness/tools/validate.py --mode manual
  - Status: PASS
  - Exit code: 0
  - Duration ms: 4318
  - stdout sha256: c4ed02565671ad03d74cacdad254acc3db5de59fceaf32100faae0defce4a07b
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 424
  - stderr bytes: 0

### Product verification
- none

### Manual verification
- Check: После готовности provider выполнить music-downloader download на доступном реальном треке: зафиксировать команду без секретных URL, наблюдаемый итог и exit code; подтвердить работу реального CLI/application и системного secure storage. Mock-тесты не заменяют этот прогон.
  - Status: PASS
  - Observed: "2026-10-11T20:17:11.284Z: после FIX настоящий новый CLI процесс без providerOverride/core-подмены: node apps/cli/dist/index.js download https://music.yandex.ru/track/2224197 --quality normal --output /tmp/step019-live-fixed/audio --json; exit code 0. Сессия системного keyring доступна; отдельный новый createApplication подтвердил accountAuthorized=true, job 6d7fc71f-1156-4c41-be18-ea239dcb237a completed, единственный track completed. Новый MP3 5 650 599 bytes; .part нет. Все 356 строк stdout валидны isJobEvent||isCommandResult (CliRecord), stderr 0 bytes. Wrapper только наблюдал CLI и сохранил allowlisted summary /tmp/step019-live-fixed/summary.json; raw stdout/stderr, credentials/challenge/signed URL не сохранялись."
<!-- VERIFICATION-EVIDENCE:END -->

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.

### Ручной прогон CLI: авторизация

- 2026-10-11, две попытки `node apps/cli/dist/index.js auth --json` через настоящий composition root и системный secure storage: обе завершились exit code `3`, с безопасным `CommandResult` ошибки `SERVICE_UNAVAILABLE`. Наблюдения захвачены в 18:24:26 и 18:26:20 UTC; stdout содержал валидный JSON без человекочитаемых примесей. Credentials и сырой вывод логов не записывались.
- Проверка `account` до прогона вернула `kind: result`, `data: null`: сохранённой авторизации не было. Отдельный запрос доступности OAuth endpoint вернул HTTP `405`; это не подтверждает успешность Device Authorization.
- 18:29:57 UTC: `node apps/cli/dist/index.js download https://music.yandex.ru/track/2224197 --quality normal --output /tmp/step019-live-UPsAsT/audio --json` завершился exit code `3` с `AUTH_ERROR`. Stdout содержал один валидный JSON `CommandResult`, аудиофайлы не созданы. Ссылка публичная, секретные URL не использовались.
- Успешный реальный download и работу авторизованной CLI-сессии этот результат не доказывает. Обязательный ручной check остаётся незакрытым.

### Диагностика реального прогона после подтверждения входа

- 2026-10-11, повторный `node --import /tmp/yandex-auth-diagnostic-20261011/fetch-probe.mjs apps/cli/dist/index.js auth --json` завершился exit code `0` после подтверждения пользователем. Выдача device code, обмен токена и account/status вернули HTTP `200`; два предшествующих ответа token HTTP `400` с `authorization_pending` означали ожидание подтверждения. Credentials сохранились только в системном keyring; challenge и токены не записывались в evidence. Прежний `SERVICE_UNAVAILABLE` не повторился, его первоначальная причина остаётся неустановленной.
- Новый процесс CLI успешно прочитал сессию и запросил metadata. Первый download в sandbox остановился на `mkdir` штатного `/home/user/.local/state/music-downloader` с errno `ENOENT`. Повтор с разрешением на штатную запись устранил этот отказ: job создан, provider metadata/variants запросы дали HTTP `200`.
- Команда `node --import /tmp/yandex-auth-diagnostic-20261011/fetch-probe.mjs apps/cli/dist/index.js download https://music.yandex.ru/track/2224197 --quality normal --output /tmp/yandex-auth-diagnostic-20261011/audio --json` вне ограничения штатной записи завершилась exit code `3`. Job `85d6ec12-4a21-41cd-8101-1cf5b2aeec1e`: track `failed`, последняя history error `DOWNLOAD_ERROR`; конечных аудиофайлов нет. Событие `job.completed` само по себе не означает успешный трек.
- Подтверждённая причина текущего отказа: `pipeline.ts` передаёт `artworkSize ?? 500` в `provider.fetchArtwork`. Публичный ресурс обложки из metadata трека 2224197 возвращает HTTP `404` для `500x500`; тот же ресурс возвращает HTTP `200` и image MIME для `200x200`, `400x400`, `600x600`. Проверка production `fetchPublicArtwork` с исходным ArtworkRef и size=500 отдельно воспроизвела `DOWNLOAD_ERROR`, exit `3`. Другой разрешённый host с тем же `500x500` также дал `404`; это не доказательство общей недоступности CDN или отсутствия самой обложки.
- Ошибка возникает в `resolving`, до `variant.selected` и открытия audio stream. Выбор поддерживаемого размера/политика обработки отказа обложки требуют отдельного owner scope: `packages/core/downloader/src/pipeline.ts` и provider artwork находятся вне Mutation policy STEP-019. Production-код не изменялся; обход fetchArtwork и подмена результата ради PASS не выполнялись. Успешный реальный download по-прежнему не доказан, статус остаётся `blocked`.
- Диагностические scripts и безопасные NDJSON observations находятся в `/tmp/yandex-auth-diagnostic-20261011`; runtime probe выводит только phase/status, allowlisted OAuth errors и filesystem errno, не request body/credentials/challenge. Generated Verification и historical reports сохранены.

### Успешный реальный download после STEP-048

- `STEP-048` завершён с independent PASS review `planning/reviews/STEP-048/REVIEW-20261011T194724Z.md`. Его canonical manual evidence фиксирует реальный новый процесс CLI с системным keyring: `node --import /tmp/step048-live/fetch-observer.mjs apps/cli/dist/index.js download https://music.yandex.ru/track/2224197 --quality normal --output /tmp/step048-live/audio --json`, exit `0`. Observer только наблюдал ответы; provider/core не подменялись, секретные URL не записывались.
- Обложка `400x400` получена с HTTP `200`/image; job `e750d356-1fd3-485c-b0f5-ae9054893ca2`, единственный track `completed`, итоговый MP3 `5 650 599` bytes, `.part` отсутствует. Это observation из Verification STEP-048, а не новый прогон в RECONCILE и не подмена generated Verification STEP-019.






## Blocker / Failure reason

### Актуальное состояние после STEP-048 и PROJECT RECONCILE

- Прежние внешние блокеры устранены: lint исправлен STEP-047, отказ размера обложки исправлен и проверен STEP-048; успешные авторизация и реальный download зафиксированы выше. Все шесть dependencies завершены. Lifecycle возвращён из `blocked` в `in_progress`, поскольку реализация CLI уже существует, но ещё требует своих completion gates.
- Deterministic impact-analysis: план revision 3 stale — изменён STEP@STEP-019, добавлены STEP@STEP-047 и STEP@STEP-048. Следующая команда `STEP PLAN STEP-019`. Plan/fingerprints и исторический planning-review сохранены; актуальность старого Ready-плана не заявляется.
- После нового плана требуется `STEP RUN STEP-019`: полная Verification текущего CLI, точное manual evidence и независимый implementation review. Старый generated блок FAIL/PENDING сохранён как история и должен обновляться только canonical runner; `completed` не выставлен.

### Исторический результат PROJECT RECONCILE до STEP-048

- `STEP-047` завершён; запрет публичного `@music-downloader/application/contracts` исправлен в его scope. Повторный `yarn lint` 2026-10-11 прошёл, прежний lint blocker снят. Все пять dependencies завершены.
- `impact-analysis.py --step STEP-019 --json` обнаружил stale plan: изменён `STEP@STEP-019`, добавлен `STEP@STEP-047`; требуется новый `STEP PLAN STEP-019`. Ready-план revision 3, его fingerprints и immutable planning-review сохранены как история, а не объявлены актуальными.
- Успешная авторизация и реальный download через CLI/application с системным secure storage по-прежнему не подтверждены. Результаты `SERVICE_UNAVAILABLE`/`AUTH_ERROR` ниже — исторические наблюдения, а не проверка текущей доступности сервиса. До появления успешного manual evidence статус остаётся `blocked`; повторная полная Verification и независимый REVIEW также ещё необходимы.

### Историческая причина остановки IMPLEMENT

- Canonical Verification: `yarn lint` завершился exit code `1` с 17 ошибками `boundaries/dependency`: публичный `@music-downloader/application/contracts` классифицируется как запрещённый deep import. Export существует в `packages/application/package.json` и прямо предписан Ready plan revision 3. В `eslint/boundaries-plugin.mjs` правило безусловно запрещает `target.deep`, включая объявленные package exports. Изменение этого правила и его тестов находится вне Allowed/Conditional Scope STEP-019; обход через относительный/динамический импорт или снятие ESLint запрещён. Owner handoff: свежий `STEP PLAN STEP-019` должен определить разрешённый объём исправления архитектурного enforcement для публичного contract export.
- Ручная Verification: две попытки CLI `auth` дали `SERVICE_UNAVAILABLE`, затем реальный `download` дал `AUTH_ERROR`; успешный download и авторизованная сессия системного secure storage не доказаны. Нужен успешный повторный реальный прогон после восстановления авторизации.
- Остальные семь автоматических Verification commands прошли, включая CLI 70 tests, общий `yarn test`, typecheck, immutable install, build, process help и Harness validation. Independent REVIEW не начат: IMPLEMENT не прошёл обязательную Verification. Реализация сохранена, `completed` не выставлен.
