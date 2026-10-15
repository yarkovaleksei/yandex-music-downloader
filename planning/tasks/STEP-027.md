---
schema: 1
id: STEP-027
status: completed
type: audit
priority: critical
phase: hardening
depends_on:
  - STEP-026
  - STEP-011
requirements:
  - REQ-043
adrs: []
architecture_refs:
  - docs/architecture.md#system-context
  - docs/architecture.md#reliability-observability
risk_flags:
  - release-critical
plan:
  status: ready
  revision: 3
  context_basis: sha256:a51bc4f77a4018b8c5bf3d0005e16c4680805d0f0ecbcd2644b1353d2381de00
  content_hash: sha256:30c2fd1d6d922b03dfce33a055c887337a7d0d316fb8743cdd847591dc418eff
  reviewed_report: planning/plan-reviews/STEP-027/PLAN-REVIEW-20261013T212158Z.md
  planned_at: 2026-10-13T21:21:58+00:00
  execution_groups:
  context_components:
    - "ARCH@docs/architecture.md#reliability-observability=sha256:32d51a796240a2af1ee204e9c2f90f91f217a8e7ced4df0b4893217f98b6a6d2"
    - "ARCH@docs/architecture.md#system-context=sha256:24edf9c39d2006aa32e18bdef2a2ae31e5ab04e9ca7402e89d71ab7145cf3aba"
    - "PRN@PRN-001=sha256:3b3801f207fafc3f77272f0e93570258a6d006964839d93a276accd814d548af"
    - "PRN@PRN-002=sha256:f29ee3fbdb9cf65cf9739d0907768bbf192ad88b8e443110d4d82f81c6b79ecb"
    - "PRN@PRN-003=sha256:16516d7d302fecda5f7615f9d55e29e04b588d671f8660640e1f61d1619e4ef8"
    - "REQ@REQ-043=sha256:25b24d5d4547a9aa170d94bf0046a74a82ad5a817296f8d9f168295399286484"
    - "STEP@STEP-011=sha256:41c08ce3e6527815954bffc6b84f1a5583ce99716da76a1d531c8660a1a512f4"
    - "STEP@STEP-026=sha256:0c5cc608966d02e44fcfbdc70599b40eb4a676427ab51a168da389b559a4966f"
    - "STEP@STEP-027=sha256:b867da35179b822ea7f337467bf710c0d8368c85672a25543902b436b19aac68"
---

# STEP-027 — Приёмка headless MVP и gate перехода к UI

## Goal

Документально подтвердить критерий готовности headless MVP и перехода к desktop UI, включая реальные прогоны на Linux, macOS и Windows.

## Context

Brief §47–§48 запрещает начинать UI до подтверждённой жизнеспособности headless core; ответственность за решение остаётся у пользователя.

## Scope

- Прогнать сценарии track/album/playlist, auth, retry, resume, metadata, doctor на Linux, macOS и Windows.
- Проверить критерии brief §47 (НЕ готов, если…).
- Записать отчёт приёмки с evidence по каждому пункту критерия и решением go/no-go.

## Mutation policy

### Allowed

- `planning/audits/**`, `docs/research/**`, фиксация дефектов как новые STEP через STEP ADD.

### Conditional

- Нет.

### Forbidden

- Исправление дефектов внутри STEP; начало работ desktop.
- Реализация future/unrelated STEP «заодно».

## Out of scope

- Любая реализация.

## Acceptance criteria

- `completed` допустим только при выполнении каждого критерия REQ-043 и явном решении `go`; `no-go` или любой незакрытый blocker перехода означает, что STEP остаётся не completed и desktop не начинается.
- Отчёт приёмки содержит evidence по каждому пункту brief §48 и не менее трёх последовательных успешных реальных прогонов track, album и playlist (включая interruption/resume) на Linux, macOS и Windows.
- Для каждого невыполненного пункта создан blocker/STEP/OQ; до его закрытия решение `go` запрещено.

## Verification

- command: `node packages/testing/scripts/run-yarn.mjs run lint`
- command: `node packages/testing/scripts/run-yarn.mjs run typecheck`
- command: `node packages/testing/scripts/run-yarn.mjs test`
- command: `node packages/testing/scripts/run-yarn.mjs build`
- command: `node apps/cli/dist/index.js --help`
- command: `node packages/testing/scripts/verify-step-026-coverage.mjs`
- command: `node --test packages/providers/yandex-music/test-live/runner.test.mjs`
- command: `python3 .harness/tools/validate.py --mode manual`
- manual: Матрица REQ-043: на одной принятой ревизии выполнить на реальных Linux, macOS и Windows по три последовательных успешных CLI end-to-end прогона каждого track/album/playlist, каждый с interruption и resume. Проверить конечные файлы, validation, metadata, quality, terminal status и сохранение completed при resume; зафиксировать ОС, runtime, безопасные команды, порядок, exit codes, результаты и классификацию сбоев. Отсутствие платформы, mock/CI build или старый provider smoke не заменяет реальную ячейку.
- manual: Покрытие brief §47–48: отдельное актуальное evidence auth/quality/retry/resume/metadata, provider abstraction/queue/validation/mock и doctor API incompatibility без runtime crash; healthy doctor на каждой ОС. Проверить отсутствие токена/cookies/Authorization/ключей/signed URL в сохраняемых logs/events/manifest/отчёте. Существующие offline тесты не заменяют обязательную real CLI матрицу; no-token test:provider SKIP не является real API PASS.
- manual: Отчёт STEP-027: каждый пункт brief §47–48 и REQ-043 связан с актуальным evidence; H-001 реальная матрица и H-002 полнота go/no-go проверены. Все дефекты приложения и незакрытые пункты имеют blocker/корректирующий STEP/OQ; явное решение пользователя go с датой и принятой ревизией допускается только при отсутствии blockers. No-go или pending сохраняет STEP не completed и запрет desktop.

## Deliverables

- Отчёт приёмки в `planning/audits/`.

## Implementation plan

### 1. Зафиксировать предмет приёмки и доступность сред

- STEP-026 и STEP-011 завершены. В начале RUN проверить их текущую Evidence и subject identity: STEP-026 даёт offline/file/privacy proof, STEP-011 — историческую live проверку metadata/variants на прежнем subject. Они не подтверждают физическое скачивание через штатный CLI на трёх ОС; фактические результаты приёмки сохраняются в отчёте STEP-027.
- Создать отчёт planning/audits/STEP-027-headless-acceptance.md с датой, проверяемым HEAD/build и существенными изменениями worktree, версиями Node/Yarn/SDK/provider schema, ОС/архитектурами, списком критериев и матрицей 3 ОС × 3 сценария × 3 последовательных успеха. До evidence каждый пункт pending, решение no-go. Принятая ревизия означает один source subject: HEAD, digest существенных tracked/untracked product исходников и lockfile; build identity отдельно фиксируется для каждой ОС. Текущие новые файлы STEP-026 ещё не входят в HEAD; перед реальными прогонами обеспечить одинаковые product исходники и lockfile на всех ОС, зафиксировать их digest и platform-specific build identity, не выполнять commit/push автоматически.
- Проверить доступ к реальным Linux/macOS/Windows, native credential backend, разрешённому аккаунту и доступным ему track/album/playlist. Использовать штатный built bin: node apps/cli/dist/index.js --help; auth --json; account --json; doctor --json --output <OUTPUT_DIR>; track|album|playlist <URL> --json --quality <QUALITY> --output <OUTPUT_DIR>; jobs --json; resume <JOB_ID> --json; retry <JOB_ID> --json. Эти argv выполнять отдельными вызовами без shell operators; placeholders заменяются только безопасными ресурсами. Авторизация идёт через существующий auth/native storage; не придумывать login, --token, providerOverride или test-only IPC для реальных циклов. Недоступная среда или CLI фиксируется как blocker RUN, без implementation. Download и resume выполняются от того же пользователя с тем же profile/state directory; resume использует persisted quality/output, новые --output/--quality к нему не добавлять.
- Зафиксировать безопасный способ передачи credentials существующей CLI и хранения только отредактированного evidence. Не записывать токен/cookies/Authorization/ключи/signed URL, account IDs или raw DTO/Error в отчёт; полные секретные команды/снимки не прикладывать.

**Files:**
- planning/audits/STEP-027-headless-acceptance.md

**Tests:**
- Проверка доступности всех ячеек матрицы и соответствия проверяемой ревизии.

**Risks:**
- Недоступная ОС или аккаунт означает pending/BLOCKED для RUN, а не готовность MVP.

### 2. Собрать доказательства каждого условия готовности

- В отчёте каждому пункту brief §48/REQ-043 назначить конкретное evidence: track, album, playlist — реальные CLI прогоны следующего этапа; auth — реальный вход и повторное использование существующего native storage; quality — запрос/фактически выбранный variant и контейнер конечного файла; metadata — прочитанные теги/обложка конечного файла. Не требовать нового quality policy или FFmpeg packaging decision внутри audit.
- Retry/interruption/recovery подтвердить актуальными offline suites STEP-026: отдельные network interruption с физическим prefix и Range, transient retry, partial failure, cancel и process crash/resume. Это supporting evidence для соответствующего условия, а каждый real resume дополнительно доказывается полной CLI матрицей. Doctor API incompatibility подтверждают текущие packages/application/src/doctor.integration.test.ts и apps/cli/src/doctor.integration.test.ts с безопасными status/code и exit; healthy doctor отдельно проходит на каждой реальной ОС. Успешный обычный download не является доказательством retry/API_CHANGED.
- Отдельно покрыть каждый негативный критерий brief §47: восстановление, отсутствие provider API в core/CLI, отсутствие секретов в logs/events/manifest, queue abstraction playlist, validation, контролируемая ошибка при несовместимости API без runtime crash, тестируемость через mock. Использовать существующие code/config и тесты владельцев, boundary lint и unit traceability STEP-026; отсутствие доказательства записать как blocker.
- Выполнить root lint/typecheck/offline test/build и Node offline guard suite test:provider; сохранённое STEP-011 real API evidence указать с датой и ограничениями. При необходимости актуализации выполнить существующий test:provider с токеном только в окружении; отсутствие токена/SKIP не является real PASS. Provider metadata/variants suite не заменяет полное скачивание или матрицу ОС. Добавленные CLI --help и verify-step-026-coverage.mjs доказывают доступность bin и inventory, а не факт real matrix. Старый STEP-011 PASS сохраняется как исторический; приёмка опирается на текущие real auth/doctor/download результаты.
- Для каждого утверждения сохранять команду без секретов, exit code, дату, предмет проверки и фактически наблюдаемый результат. Старый PASS не выдавать за проверку текущей ревизии; существенные изменения владельца требуют актуального доказательства. Отчёт не должен делать новые ADR/REQ решения.

**Files:**
- planning/audits/STEP-027-headless-acceptance.md

**Tests:**
- Существующие lint/typecheck/test/build, test-live/runner.test.mjs и предметные проверки владельцев критериев.

**Risks:**
- Отсутствующие проверки diagnostics/retry/privacy нельзя создавать внутри STEP-027; они маршрутизируются владельцу через corrective STEP.

### 3. Выполнить реальную матрицу track/album/playlist с interruption/resume

- H-001: Матрица REQ-043: на одной принятой ревизии выполнить на реальных Linux, macOS и Windows по три последовательных успешных CLI end-to-end прогона каждого track/album/playlist, каждый с interruption и resume. Проверить конечные файлы, validation, metadata, quality, terminal status и сохранение completed при resume; зафиксировать ОС, runtime, безопасные команды, порядок, exit codes, результаты и классификацию сбоев. Отсутствие платформы, mock/CI build или старый provider smoke не заменяет реальную ячейку.
- Для каждой ОС и каждого сценария выполнить три последовательных успешных цикла: фактический download доступного контента → реальное прерывание до завершения → существующая команда resume → завершение. Использовать независимые output/job для повторов, чтобы skipped старого результата не заменял новый download. Выбирать доступную коллекцию/момент прерывания, позволяющие наблюдать незавершённые треки; credentials и доступность provider не подменять. Для штатного interruption нажать Ctrl+C во время реально начатого download, дождаться exit 4 и persisted paused, затем запустить новый node apps/cli/dist/index.js resume <JOB_ID> --json и дождаться exit 0. Completed или skipped до прерывания не считается требуемым циклом; если прерывание пропущено, выполнить новый цикл с новым output/job. При реальной аварии использовать штатное stale-lease recovery без правки lease/manifest/heartbeat, не переносить test-only ускорение из STEP-026 в audit.
- Проверить содержимое и валидность итогового аудио, выбранные codec/container/quality, metadata, полный доступный состав album/playlist и согласованные terminal состояния job/manifest. На resume подтвердить сохранение completed треков и отсутствие повторной загрузки/перезаписи завершённых результатов; сверить финальные файлы/manifest после атомарной финализации. Существующие недоступные позиции не должны приводить к обходу PRN-003 или выдуманному успеху.
- Для каждой попытки записать порядковый номер, CLI команды с безопасными аргументами, exit codes, до/после interruption, итоговые counts/status и проверку файлов. Ошибки сети/аккаунта фиксировать отдельно с причиной и повтором; их не считать успешными прогонами. Дефект приложения аннулирует успешную серию затронутой ячейки; после исправления владельцем повторить три последовательных успеха на принятой ревизии.
- При изменении проверяемого приложения по результатам дефекта привязать final evidence к новой ревизии и повторить затронутые сценарии/условия; до go обеспечить полную матрицу на единой принятой ревизии. Не выдавать Linux container/эмуляцию за реальный macOS/Windows E2E.

**Files:**
- planning/audits/STEP-027-headless-acceptance.md

**Tests:**
- 27 реальных успешных CLI end-to-end циклов; healthy doctor и auth на каждой ОС.

**Risks:**
- Отказы API/сети/аккаунта записываются отдельно, но отсутствующая успешная ячейка всё равно исключает go.

### 4. Оформить дефекты и отчёт go/no-go

- Сверить матрицу и checklist brief §47–48/REQ-043: в каждой строке должны быть evidence, наблюдение и PASS либо объяснённый pending/failure. H-002: Отчёт STEP-027: каждый пункт brief §47–48 и REQ-043 связан с актуальным evidence; H-001 реальная матрица и H-002 полнота go/no-go проверены. Все дефекты приложения и незакрытые пункты имеют blocker/корректирующий STEP/OQ; явное решение пользователя go с датой и принятой ревизией допускается только при отсутствии blockers. No-go или pending сохраняет STEP не completed и запрет desktop.
- Каждый дефект приложения или невыполненный критерий оформить как blocker с воспроизводимым безопасным сценарием и owning областью; необходимую corrective работу зарегистрировать canonical STEP ADD. OQ использовать только при реальном неразрешённом product/architecture решении, не вместо дефекта. Не исправлять production, тесты или Harness в этом audit.
- После исправления владельцем заново выполнить затронутую приёмку; не удалять неудачные попытки из evidence. Отчёт сохраняет историю revision/попыток и классификацию внешних отказов. Если prerequisite/среда/доказательство отсутствует, завершить текущий audit execution BLOCKED/no-go, сохранив STEP не completed.
- Когда все критерии доказаны и blockers закрыты, предъявить пользователю конкретный отчёт для явного go/no-go. Записать его фактическое решение с датой и принятой ревизией: ответа по умолчанию нет, автоматический go запрещён. No-go даже при зелёных проверках не позволяет завершить STEP или начать desktop.

**Files:**
- planning/audits/STEP-027-headless-acceptance.md

**Tests:**
- Семантическая проверка полного checklist, реальной матрицы и фактического решения владельца.

**Risks:**
- Пользовательское go необходимо для completion и не может заменить невыполненный критерий.

### 5. Провести финальную Verification и завершить audit через dispatcher

- Проверить редакцию всех сохраняемых evidence, связь результатов с final subject revision и отсутствие production/desktop mutations. Выполнить canonical Verification STEP-027, включая manual proof H-001/H-002, без реконструкции отсутствующего terminal output.
- Проверить integrity Harness через validate.py --mode manual и пересобрать deterministic projections штатным sync-projections.py. Type-specific audit completion подтверждается отчётом, всеми критериями и явным go; не ставить completed вручную и не обходить требования dispatcher/completion gate.
- Передать dispatcher factual SUCCESS только при доказанном acceptance и go; при no-go/pending/blocker передать BLOCKED и сохранить причины/ссылки на corrective работу. STEP-028/desktop может стартовать только после canonical completed STEP-027.

**Files:**
- planning/audits/STEP-027-headless-acceptance.md
- planning/tasks/STEP-027.md

**Tests:**
- Canonical автоматическая и manual Verification; отсутствие незакрытых критериев перед completion.

**Risks:**
- Validated Semantic Blast Radius PLAN: INCONCLUSIVE. H-001 (реальная единая матрица) и H-002 (полный отчёт и фактическое go) перенесены в manual Verification/план как будущие обязательства; current PLAN не заявляет выполненную приёмку. Отдельный Arena preflight — SKIP.

## Evidence








<!-- VERIFICATION-EVIDENCE:START -->
- Verification run: 2026-10-15T17:27:49Z
- Status: PASS
- Automated resumed: false
- Git head: 8837b4b20b6205a9ef6b591965cdc9275dd736bf
- Worktree hash: sha256:022395ec8992380c75c0c0a6a9405095d018cff4fed12b469c60fd3c5b0033ea
- Verification contract basis: sha256:5d0cee68c1ded438de858f1d963bb66aefcf4b0283187dd52ac2646943c30b5a
- Subject git head: 8837b4b20b6205a9ef6b591965cdc9275dd736bf
- Subject worktree hash: sha256:5c67f32505e3d025374f0250f88861b7c5633f42dde5f3aa8b3f8141ef86c11d

### Automated verification
- Command: node packages/testing/scripts/run-yarn.mjs run lint
  - Status: PASS
  - Exit code: 0
  - Duration ms: 10387
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: f59ba696a15507a8febe0f9ea94ac75ccc5411952df61ee4cb3c971b47b6bc12
  - stdout bytes: 0
  - stderr bytes: 25
- Command: node packages/testing/scripts/run-yarn.mjs run typecheck
  - Status: PASS
  - Exit code: 0
  - Duration ms: 4172
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: ffbfd8ec2bfcf3e8f0e99a93f081f695da2de832eba56c5ae6943a4052680411
  - stdout bytes: 0
  - stderr bytes: 30
- Command: node packages/testing/scripts/run-yarn.mjs test
  - Status: PASS
  - Exit code: 0
  - Duration ms: 9029
  - stdout sha256: 8ed5b0ef3f2c45c4e7aec7c26d29b8aae52c45703cd794005c4e5194abd72306
  - stderr sha256: 5f70aa703cfbd4583b59ce30c815778233780f0a11654b237759b703d2040805
  - stdout bytes: 12275
  - stderr bytes: 2527
- Command: node packages/testing/scripts/run-yarn.mjs build
  - Status: PASS
  - Exit code: 0
  - Duration ms: 465
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: 0157d8afc3a7265ca4e7c585e12c0dad6c6e3b575b60dd6b58851567da7c61d3
  - stdout bytes: 0
  - stderr bytes: 22
- Command: node apps/cli/dist/index.js --help
  - Status: PASS
  - Exit code: 0
  - Duration ms: 264
  - stdout sha256: 400aa5447ee89a5a5398de2bbca18e1a6003fb07fa4dbed02a7a1405a7315751
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 627
  - stderr bytes: 0
- Command: node packages/testing/scripts/verify-step-026-coverage.mjs
  - Status: PASS
  - Exit code: 0
  - Duration ms: 64
  - stdout sha256: 174f8131fdad4e33968eaff63b4b341e99ba25557cd3db6a15af3a52040c2e3a
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 110
  - stderr bytes: 0
- Command: node --test packages/providers/yandex-music/test-live/runner.test.mjs
  - Status: PASS
  - Exit code: 0
  - Duration ms: 164
  - stdout sha256: 14ca994df33e0fbc1685ae9cfbabdd78e2794cc775bb2418172c49dc4a7fc9bc
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 681
  - stderr bytes: 0
- Command: python3 .harness/tools/validate.py --mode manual
  - Status: PASS
  - Exit code: 0
  - Duration ms: 6027
  - stdout sha256: 8fc6b6196515f46af156ddfbc23d00aab37a69a3dd1f5ae89976e552f9ce3a26
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 2049
  - stderr bytes: 0

### Product verification
- none

### Manual verification
- Check: Матрица REQ-043: на одной принятой ревизии выполнить на реальных Linux, macOS и Windows по три последовательных успешных CLI end-to-end прогона каждого track/album/playlist, каждый с interruption и resume. Проверить конечные файлы, validation, metadata, quality, terminal status и сохранение completed при resume; зафиксировать ОС, runtime, безопасные команды, порядок, exit codes, результаты и классификацию сбоев. Отсутствие платформы, mock/CI build или старый provider smoke не заменяет реальную ячейку.
  - Status: PASS
  - Observed: "Одна product source revision25a6 и одинаковые CLI/provider builds: Linux9/9, Windows9/9, macOS9/9, 96 validated файлов. Финальные исходные reports и программная проверка каждого partial/pause/resume/preservation/privacy/sidecar: planning/audits/AUDIT-20261015T171627Z.md."
- Check: Покрытие brief §47–48: отдельное актуальное evidence auth/quality/retry/resume/metadata, provider abstraction/queue/validation/mock и doctor API incompatibility без runtime crash; healthy doctor на каждой ОС. Проверить отсутствие токена/cookies/Authorization/ключей/signed URL в сохраняемых logs/events/manifest/отчёте. Существующие offline тесты не заменяют обязательную real CLI матрицу; no-token test:provider SKIP не является real API PASS.
  - Status: PASS
  - Observed: "Все brief47–48 критерии сопоставлены с актуальным real evidence трёх ОС и existing offline cases того же product subject. Auth/native-keyring/healthy doctor/quality/metadata/validation/privacy подтверждены reports; retry и API incompatibility — supporting integration tests. Таблица: planning/audits/AUDIT-20261015T171627Z.md."
- Check: Отчёт STEP-027: каждый пункт brief §47–48 и REQ-043 связан с актуальным evidence; H-001 реальная матрица и H-002 полнота go/no-go проверены. Все дефекты приложения и незакрытые пункты имеют blocker/корректирующий STEP/OQ; явное решение пользователя go с датой и принятой ревизией допускается только при отсутствии blockers. No-go или pending сохраняет STEP не completed и запрет desktop.
  - Status: PASS
  - Observed: "Полный checklist brief47–48/REQ043 и матрица27/27 подтверждены; технических blockers нет. 2026-10-15 Europe/Moscow пользователь прямо подтвердил: Go — принять и разрешить переход к desktop. Приняты source25a6 и одинаковые CLI/provider builds. Итоговый PASS report planning/audits/AUDIT-20261015T172147Z.md; технический checklist planning/audits/AUDIT-20261015T171627Z.md."
<!-- VERIFICATION-EVIDENCE:END -->

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.

В предыдущем RUN пользователь 2026-10-14 (Europe/Moscow) отложил ручную приёмку: 8/8 автоматических PASS, real matrix 0/27. Исторический отчёт: [AUDIT-20261013T213918Z](../audits/AUDIT-20261013T213918Z.md).

Последующий RUN 2026-10-14: пользователь разрешил агенту самостоятельно выполнить Linux-проверки на существующей авторизации и предоставил track/album/playlist ссылки. Подтверждены три последовательных реальных track-цикла и три album-цикла с SIGINT/paused/exit 4 и новым resume/completed/exit 0. Все 36 файлов проходят validation и содержат metadata/artwork; completed-файл альбома сохраняет SHA-256, mtimeNs и inode, повторных download/metadata событий для него нет. Source/build digest соответствует предыдущему предмету проверки. Автоматические проверки повторены: 8/8 PASS. Матрица: Linux track 3/3, album 3/3, playlist 0/3; всего 6/27.

Предоставленная playlist-ссылка коллекции «Мне нравится» с lk.UUID возвращает CLI UNSUPPORTED_URL. Отдельное read-only исследование подтвердило существующий SDK playlist(lk.UUID), 148 доступных треков в том же порядке, что usersLikesTracks; текущие raw schema/mapper принимают ответ. Удаление lk даёт NotFoundError. Исправление зарегистрировано в [STEP-051](STEP-051.md); production в audit не менялся. Новый отчёт: [AUDIT-20261014T071038Z](../audits/AUDIT-20261014T071038Z.md). Решение владельца go отсутствует; STEP не completed, desktop gate закрыт.

Текущий RUN после STEP-051 (2026-10-14): admission lk.UUID исправлен завершённым STEP-051 с независимым lead/security/tests PASS. Linux-матрица на новой единой source revision подтверждена полностью: track 3/3, album 3/3, playlist «Мне нравится» 3/3; всего 9/27. Все девять циклов имеют реальный SIGINT/paused/exit 4 и новый resume/completed/exit 0. Проверены 480 конечных файлов, metadata/artwork/quality/validation; completed в каждой коллекции сохранил SHA-256/mtimeNs/inode, повторных download/metadata событий нет, собственных part/candidate после завершения нет. Первый playlist-цикл переиспользован из STEP-051 по совпадающим source/CLI/provider digests; остальные восемь выполнены в этом RUN. Старые шесть циклов до исправления выше остаются историческим evidence и в текущие девять не добавляются.

Source `sha256:5c90380eae10221e52a38e324dd55a1e4d1cce19fd0246c20bb616b2308a6ed2`, CLI `sha256:baf25c74bd54a0198b182a947cab7907f7e338a3a340ce92b0062e179abb0484`, provider `sha256:5735d8e8a815af0cd697ff31852b30eda7d7383a42084a02ac5e96db00329c0a`; повторная финальная проверка идентичности PASS. Автоматический Verification текущей версии: 8/8 PASS, общий MANUAL_REQUIRED; native account и Linux doctor PASS. Privacy проверена на наблюдавшихся CLI streams и manifest без сохранения credentials. Новый [отчёт](../audits/AUDIT-20261014T081648Z.md) и [durable evidence](../../docs/research/step-027-linux-current-2026-10-14.json) связывают все критерии brief §47–48 с актуальными доказательствами и их границами. macOS/Windows отложены пользователем, owner go pending; STEP не completed, desktop gate закрыт.


По запросу владельца подготовлен [переносимый инструментарий Windows/macOS](../../docs/research/step-027-acceptance/README.md): одна команда, собственные ссылки проверяющего через вопросы/config, штатный auth, автоматические install/checks/build/doctor, девять real pause/resume циклов и один безопасный report.json. В архиве default sources пусты; упаковщик запрещает заполненные ссылки. Приложение/lockfile не менялись, source digest Linux-приёмки сохранён. Семь offline tests инструмента PASS; в чистой распакованной копии preparation commands PASS и real track smoke PASS; интерактивный ввод и bounded doctor network retry подтверждены. Новый [audit](../audits/AUDIT-20261014T084954Z.md) и [evidence подготовки](../../docs/research/step-027-acceptance-preparation-2026-10-14.json). Smoke не добавляется к матрице: остаётся 9/27, Windows helper/macOS runtime и owner go pending.


Владелец лично передал Windows report.json от 2026-10-14: Windows x64/release 10.0.26200, Node v24.21.0; source/tool digests совпали с поставленным комплектом runner 1. Результат full FAIL до музыкальных циклов: install --immutable exit 1, без timeout; Windows 0/9. Владелец подтвердил Corepack 0.36.0. Причина не определяется по старым hashes; отсутствующая программа/сеть/файловая система не объявляются доказанной причиной. В research-инструментарии runner 2 добавлены безопасные preparation codes и короткий --diagnose-install без ссылок/auth/загрузок; 12 tests PASS и реальный Linux install diagnostic PASS. Update ZIP сохраняет config. [Windows attempt](../../docs/research/step-027-windows-attempt-2026-10-14.json), [обновление/проверка диагностики](../../docs/research/step-027-windows-install-diagnostics-2026-10-14.json), [новый audit](../audits/AUDIT-20261014T093042Z.md). Матрица остаётся 9/27; product/lockfile/Git не менялись.


Следующая лично выполненная Windows-попытка после переноса с Z: на локальный диск: install --immutable/lint/typecheck exit 0; test exit 1 без timeout, observedCodes EBUSY/EPERM, конкретные failed cases/операции/stack не captured. Source digest совпадает с Linux, Windows реальные циклы ещё не запускались (0/9); матрица остаётся 9/27. Стадия install в новой попытке прошла. [Новая сводка](../../docs/research/step-027-windows-tests-attempt-2026-10-14.json) и [audit](../audits/AUDIT-20261014T095900Z.md). Следующий диагностический шаг — test --reporter=verbose и конкретные Failed Tests/Failed Suites; product/test code не менялся.

Новый verbose Windows output уточнил четыре failures: 1200/1204 tests PASS, 94/95 suites PASS; три native M3U8 tests получают абсолютные строки из-за POSIX default writer, четвёртый смешивает Windows root с linux layout. Application adapter явно передаёт host platform; его реальный Windows output не признан дефектным по unit failures. [Evidence](../../docs/research/step-027-windows-m3u8-failures-2026-10-14.json) и [audit](../audits/AUDIT-20261014T101030Z.md); создан STEP-052. Общие EBUSY/EPERM не являются установленной причиной. Код в audit не исправлялся, текущая квалифицированная матрица остаётся 9/27 прежнего subject.

- Текущий RUN после завершённого STEP-052 принял Windows report9/9/source25a6/toolddde и самостоятельно выполнил новые Linux9/9 на том же subject. CLI/provider build digests совпали на обеих ОС; validated30+30files, pause4/resume0, parts0, completed preservation/privacy PASS. [Актуальный audit](../audits/AUDIT-20261014T130622Z.md), [сводный отчёт приёмки](../../docs/research/step-027-headless-acceptance.md), [исходный Linux report](../../docs/research/step-027-linux-pass-2026-10-14.json), [исходный Windows report](../../docs/research/step-052-windows-pass-2026-10-14.json). Матрица текущей версии18/27; прежний Linux9/9 предыдущего digest не переносился.
- Сохранена [первая ограниченная Linux-попытка](../../docs/research/step-027-linux-restricted-attempt-2026-10-14.json): семь preparation checks exit0, но DOWNLOAD_ERROR/exit3 до начала загрузки; отдельная diagnostic попытка NETWORK_ERROR/exit3. Запуск с доступом к штатному native profile/сети дал последовательную live серию9/9 без product fixes. Native errno первой ошибки не captured, она не объявляется доказанным дефектом приложения. Media/report scratch в .cache/checks внутри текущего проекта. На macOS real циклы не предоставлены; полный подготовленный ZIP остаётся с пустыми default sources. OwnerGo не запрашивался до закрытия macOS blocker.



- По явному поручению владельца подготовлен отдельный `STEP-027-macos.zip` в корне, с инструкцией и launcher без системного Node: официальные Node24.21.0 darwin-arm64/x64 уже внутри, checksum проверяется перед извлечением, private runtime/кеши/отчёты внутри комплекта. [Audit подготовки](../audits/AUDIT-20261014T134419Z.md), [полные факты](../../docs/research/step-027-macos-package-2026-10-14.json). 28 helper/launcher tests PASS; чистая распаковка в Unicode/space path дала real private-Corepack immutable install и lint/typecheck/test/build PASS на Linux. OS adapters и Mach-O→Linux Node подмена использованы только в тестовой копии; native macOS не заявляется. Source25a6/toolddde и прежние18/27 остаются актуальны; реальные macOS9/9 и owner go pending.


- Финальная приёмка 2026-10-15: [macOS report](../../docs/research/step-027-macos-pass-2026-10-15.json) подтвердил track/album/playlist по 3/3 на том же source25a6, с совпадающими CLI/provider builds и source до/после. Итоговая матрица Linux9/9 + Windows9/9 + macOS9/9 = 27/27, 96 проверенных файлов, physical interruption/resume, completed preservation, validation/metadata/artwork/privacy/M3U8 PASS. [Полный технический checklist](../audits/AUDIT-20261015T171627Z.md) покрывает brief §47–48; supporting preparation macOS 7/7 и canonical automated Verification 8/8 PASS. Domain-only исправление research runner проверено 34/34 helper/launcher tests; product sources и lockfile не менялись.
- После предъявления полного результата владелец явно ответил «Go — принять и разрешить переход к desktop» 2026-10-15 (Europe/Moscow). [Итоговый PASS audit и решение GO](../audits/AUDIT-20261015T172147Z.md) закрывают прежние MACOS_REAL_MATRIX_PENDING и OWNER_GO_PENDING. Предыдущие failed/partial attempts сохранены как история и не добавляются к итоговым 27 циклам.
- При записи последнего manual proof повторная каноническая проверка дала один непостоянный failure playlist retry/M3U8: [исходный результат](../../docs/research/step-027-canonical-verification-attempt-2026-10-15.json). Предыдущий полный test был PASS; диагностический неизменённый запуск `node packages/testing/scripts/run-yarn.mjs test --project @music-downloader/application src/playlist.integration.test.ts --no-file-parallelism --reporter=verbose` завершился exit 0, 5/5 PASS. Тест читает M3U8 после наблюдения `getJob().status=completed`, тогда как manager пишет playlist после terminal track states и до отдельного `job.completed`; различие границ допускает окно чтения старого sidecar и является вероятной причиной непостоянного assertion. Product/test code и таймауты не менялись, исправление неизвестной причины не заявляется. Итоговый канонический результат задаёт generated Verification выше; failed попытка не скрывается и не считается PASS.



## Blocker / Failure reason

Нет. Реальная матрица 27/27 PASS на принятом source sha256:25a6a43bde2aa78ac3f5d74f533cec434ff0173d87859dbf0dfcaf78c0fdea07; владелец дал явное go 2026-10-15 (Europe/Moscow). Итоговый report: planning/audits/AUDIT-20261015T172147Z.md.
