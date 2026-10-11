---
schema: 1
id: STEP-027
status: planned
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
  revision: 2
  context_basis: sha256:8b12ee1de9c3a798a11f0666c9fd03dc2693edc2fa5cf49450dec3680faad90a
  content_hash: sha256:fb9458d28f460e5774a4163fc5da4f6dbcc5eb2175fd0ae272b4502c4d044990
  reviewed_report: planning/plan-reviews/STEP-027/PLAN-REVIEW-20261011T130310Z.md
  planned_at: 2026-10-11T13:03:10+00:00
  execution_groups:
  context_components:
    - "ARCH@docs/architecture.md#reliability-observability=sha256:a9c337102c2ed62fdaca7173e8e2c05ffe6d68a1d99140fe986a552b3cc636d4"
    - "ARCH@docs/architecture.md#system-context=sha256:24edf9c39d2006aa32e18bdef2a2ae31e5ab04e9ca7402e89d71ab7145cf3aba"
    - "PRN@PRN-001=sha256:3b3801f207fafc3f77272f0e93570258a6d006964839d93a276accd814d548af"
    - "PRN@PRN-002=sha256:f29ee3fbdb9cf65cf9739d0907768bbf192ad88b8e443110d4d82f81c6b79ecb"
    - "PRN@PRN-003=sha256:16516d7d302fecda5f7615f9d55e29e04b588d671f8660640e1f61d1619e4ef8"
    - "REQ@REQ-043=sha256:25b24d5d4547a9aa170d94bf0046a74a82ad5a817296f8d9f168295399286484"
    - "STEP@STEP-011=sha256:41c08ce3e6527815954bffc6b84f1a5583ce99716da76a1d531c8660a1a512f4"
    - "STEP@STEP-026=sha256:0c5cc608966d02e44fcfbdc70599b40eb4a676427ab51a168da389b559a4966f"
    - "STEP@STEP-027=sha256:1314cbedb634cb7a8f6034a9fd2309c1427c15a3d1c71b69f7efecf489b76831"
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
- command: `node --test packages/providers/yandex-music/test-live/runner.test.mjs`
- command: `python3 .harness/tools/validate.py --mode manual`
- manual: Матрица REQ-043: на одной принятой ревизии выполнить на реальных Linux, macOS и Windows по три последовательных успешных CLI end-to-end прогона каждого track/album/playlist, каждый с interruption и resume. Проверить конечные файлы, validation, metadata, quality, terminal status и сохранение completed при resume; зафиксировать ОС, runtime, безопасные команды, порядок, exit codes, результаты и классификацию сбоев. Отсутствие платформы, mock/CI build или старый provider smoke не заменяет реальную ячейку.
- manual: Покрытие brief §47–48: отдельное актуальное evidence auth/quality/retry/resume/metadata, provider abstraction/queue/validation/mock и doctor API incompatibility без runtime crash; healthy doctor на каждой ОС. Проверить отсутствие токена/cookies/Authorization/ключей/signed URL в сохраняемых logs/events/manifest/отчёте. Существующие offline тесты не заменяют обязательную real CLI матрицу; no-token test:provider SKIP не является real API PASS.
- manual: Отчёт STEP-027: каждый пункт brief §47–48 и REQ-043 связан с актуальным evidence; H-001 реальная матрица и H-002 полнота go/no-go проверены. Все дефекты приложения и незакрытые пункты имеют blocker/корректирующий STEP/OQ; явное решение пользователя go с датой и принятой ревизией допускается только при отсутствии blockers. No-go или pending сохраняет STEP не completed и запрет desktop.

## Deliverables

- Отчёт приёмки в `planning/audits/`.

## Implementation plan

### 1. Зафиксировать предмет приёмки и доступность сред

- После разрешения RUN deterministic dispatcher проверить актуальную Verification и acceptance evidence STEP-026/STEP-011. Ready plan не означает завершение зависимостей: при их непрохождении не запускать приёмку через обход gates.
- Создать отчёт planning/audits/STEP-027-headless-acceptance.md с датой, проверяемым HEAD/build и существенными изменениями worktree, версиями Node/Yarn/SDK/provider schema, ОС/архитектурами, списком критериев и матрицей 3 ОС × 3 сценария × 3 последовательных успеха. До evidence каждый пункт pending, решение no-go.
- Проверить доступ к реальным Linux/macOS/Windows, native credential backend, разрешённому аккаунту и доступным ему track/album/playlist. Использовать готовую CLI из предыдущих STEP; зафиксировать точные команды по её фактическому --help и docs/development.md, включая login/download/resume/doctor и параметры quality/output. Если CLI или среда отсутствует, записать blocker, не добавлять реализацию и не подменять платформу mock/CI build.
- Зафиксировать безопасный способ передачи credentials существующей CLI и хранения только отредактированного evidence. Не записывать токен/cookies/Authorization/ключи/signed URL, account IDs или raw DTO/Error в отчёт; полные секретные команды/снимки не прикладывать.

**Files:**
- planning/audits/STEP-027-headless-acceptance.md

**Tests:**
- Проверка доступности всех ячеек матрицы и соответствия проверяемой ревизии.

**Risks:**
- Недоступная ОС или аккаунт означает pending/BLOCKED для RUN, а не готовность MVP.

### 2. Собрать доказательства каждого условия готовности

- В отчёте каждому пункту brief §48/REQ-043 назначить конкретное evidence: track, album, playlist — реальные CLI прогоны следующего этапа; auth — реальный вход и повторное использование существующего native storage; quality — запрос/фактически выбранный variant и контейнер конечного файла; metadata — прочитанные теги/обложка конечного файла. Не требовать нового quality policy или FFmpeg packaging decision внутри audit.
- Retry и interruption/recovery подтвердить существующими актуальными offline сценариями STEP-026 с наблюдаемыми попытками/terminal state, а resume дополнительно реальной CLI матрицей. Doctor API incompatibility подтвердить существующей проверкой владельца diagnostics с несовместимым provider response и безопасным доменным результатом; healthy doctor отдельно прогнать на каждой реальной ОС. Успешный обычный download не является доказательством retry/API_CHANGED.
- Отдельно покрыть каждый негативный критерий brief §47: восстановление, отсутствие provider API в core/CLI, отсутствие секретов в logs/events/manifest, queue abstraction playlist, validation, контролируемая ошибка при несовместимости API без runtime crash, тестируемость через mock. Использовать существующие code/config и тесты владельцев, boundary lint и unit traceability STEP-026; отсутствие доказательства записать как blocker.
- Выполнить root lint/typecheck/offline test/build и Node offline guard suite test:provider; сохранённое STEP-011 real API evidence указать с датой и ограничениями. При необходимости актуализации выполнить существующий test:provider с токеном только в окружении; отсутствие токена/SKIP не является real PASS. Provider metadata/variants suite не заменяет полное скачивание или матрицу ОС.
- Для каждого утверждения сохранять команду без секретов, exit code, дату, предмет проверки и фактически наблюдаемый результат. Старый PASS не выдавать за проверку текущей ревизии; существенные изменения владельца требуют актуального доказательства. Отчёт не должен делать новые ADR/REQ решения.

**Files:**
- planning/audits/STEP-027-headless-acceptance.md

**Tests:**
- Существующие lint/typecheck/test/build, test-live/runner.test.mjs и предметные проверки владельцев критериев.

**Risks:**
- Отсутствующие проверки diagnostics/retry/privacy нельзя создавать внутри STEP-027; они маршрутизируются владельцу через corrective STEP.

### 3. Выполнить реальную матрицу track/album/playlist с interruption/resume

- H-001: Матрица REQ-043: на одной принятой ревизии выполнить на реальных Linux, macOS и Windows по три последовательных успешных CLI end-to-end прогона каждого track/album/playlist, каждый с interruption и resume. Проверить конечные файлы, validation, metadata, quality, terminal status и сохранение completed при resume; зафиксировать ОС, runtime, безопасные команды, порядок, exit codes, результаты и классификацию сбоев. Отсутствие платформы, mock/CI build или старый provider smoke не заменяет реальную ячейку.
- Для каждой ОС и каждого сценария выполнить три последовательных успешных цикла: фактический download доступного контента → реальное прерывание до завершения → существующая команда resume → завершение. Использовать независимые output/job для повторов, чтобы skipped старого результата не заменял новый download. Выбирать доступную коллекцию/момент прерывания, позволяющие наблюдать незавершённые треки; credentials и доступность provider не подменять.
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
- Semantic Blast Radius PLAN: INCONCLUSIVE, H-001/H-002 — будущие обязательства проверки, не пройденная приёмка.

## Evidence

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.

## Blocker / Failure reason

—
