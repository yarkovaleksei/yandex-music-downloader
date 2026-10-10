---
schema: 1
id: STEP-014
status: completed
type: implementation
priority: critical
phase: core
depends_on:
  - STEP-003
  - STEP-005
requirements:
  - REQ-013
  - REQ-014
adrs:
  - ADR-006
architecture_refs:
  - docs/architecture.md#data-state-model
  - docs/architecture.md#reliability-observability
risk_flags:
  - concurrency
plan:
  status: ready
  revision: 1
  context_basis: sha256:2874535938863b69ccc5ba851d546bbcff6669328ab96d6b40cabe2cae2fdd4d
  content_hash: sha256:f767d6d8bdb350942de6159af5e7b0eadc95bfcee5c847fe00e7d82a33042b50
  reviewed_report: planning/plan-reviews/STEP-014/PLAN-REVIEW-20261009T210721Z.md
  planned_at: 2026-10-09T21:07:21+00:00
  execution_groups:
  context_components:
    - "ADR@ADR-006=sha256:792115c4604a81dfd2d62950958470e1c1f1bad2b2f18e873d5743b9f9dc443d"
    - "ARCH@docs/architecture.md#data-state-model=sha256:a16465c45f16a8f41fd3e876e764be3e05d852017bd62457799b7dba138bf6c6"
    - "ARCH@docs/architecture.md#reliability-observability=sha256:a9c337102c2ed62fdaca7173e8e2c05ffe6d68a1d99140fe986a552b3cc636d4"
    - "OQ@OQ-009=sha256:8a6b1f2a309a07d634f989fd2e1b428d059691e00b54ad76c096743ab98eb8c2"
    - "PRN@PRN-001=sha256:3b3801f207fafc3f77272f0e93570258a6d006964839d93a276accd814d548af"
    - "PRN@PRN-002=sha256:f29ee3fbdb9cf65cf9739d0907768bbf192ad88b8e443110d4d82f81c6b79ecb"
    - "PRN@PRN-003=sha256:16516d7d302fecda5f7615f9d55e29e04b588d671f8660640e1f61d1619e4ef8"
    - "REQ@REQ-013=sha256:147b5b93930e0d8e1ede0c0e23fdc92c045be95fbfb43e2df639db56d1da4453"
    - "REQ@REQ-014=sha256:b345f1c0fd577276b7130cbf59e8de0433c99252667bc3ff3fb74749e808688e"
    - "STEP@STEP-003=sha256:d44b1efab2bcb4a844c3ac708626a1569e846fb6034b4aae8b752fa91b7e7405"
    - "STEP@STEP-005=sha256:cb280369edd87e0a4560c9e2d78ddba902bebde1a9c1d20699cf193946b6838c"
    - "STEP@STEP-014=sha256:66eea12d3f966a7fc50b01d9b23cd3600d388af50fa5001017ed08afad303134"
---

# STEP-014 — State machine задания и retry policy

## Goal

Реализовать формальную state machine по ADR-006 и retry policy с backoff+jitter.

## Context

OQ-009 (rate limits) влияет на значения backoff по умолчанию.

## Scope

- Таблица переходов ADR-006 как данные + функция перехода с отказом на недопустимых (включая `skipped`, `retry_wait` с `retryPhase`, control job).
- Детерминированная агрегация статуса job (`completed_with_errors`, `interrupted`, `paused`, `cancelled`).
- Классификация ошибок retryable/non-retryable (включая `STREAM_EXPIRED`), backoff, jitter, `maxAttempts`; повторы выполняет только core.
- Unit-тесты на все переходы.

## Mutation policy

### Allowed

- `packages/core/retry/**`, `packages/core/downloader/src/state/**`, `packages/core/downloader/src/index.ts` (только реэкспорт), тесты.

### Conditional

- Нет.

### Forbidden

- Сетевые вызовы, очередь и файловая запись.
- Реализация future/unrelated STEP «заодно».

## Out of scope

- Очередь и менеджер (STEP-017).

## Acceptance criteria

- Каждый разрешённый переход таблицы ADR покрыт тестом, каждый недопустимый отвергается; агрегация статуса job покрыта тестами на наборах статусов треков.
- Классификация кодов по REQ download-retry покрыта тестами.
- Backoff детерминирован при инжектируемых часах и random; ограничен сверху.

## Verification

- command: `node packages/testing/scripts/run-yarn.mjs run lint`
- command: `node packages/testing/scripts/run-yarn.mjs run typecheck`
- command: `node packages/testing/scripts/run-yarn.mjs test`
- command: `node packages/testing/scripts/run-yarn.mjs run build`
- command: `node packages/testing/scripts/run-yarn.mjs run format:check`
- command: `python3 .harness/tools/validate.py --mode manual`

## Deliverables

- State machine, retry policy, тесты.

## Implementation plan

### 1. Классификация ошибок и решение о повторе (packages/core/retry)

- Ввести чистую classifyError(error: unknown) → { code, retryable, action, scope }. action ∈ 'retry' | 'reopen_stream' | 'fail' | 'pause_job'; scope ∈ 'track' | 'job'.
- Для DomainError: код STREAM_EXPIRED → action 'reopen_stream' (retryable, расходует бюджет попыток, не отказ авторизации — REQ-014); AUTH_ERROR, DISK_FULL, PERMISSION_DENIED → 'pause_job' со scope 'job' (ADR-003/ADR-006: job в control=paused с причиной, затронутый трек failed); остальные — по полю retryable ('retry' или 'fail'). Список HTTP-статусов для уже нормализованных DomainError принадлежит provider: core доверяет полю retryable и не восстанавливает status.
- Для сырых ошибок без DomainError собственная allowlist по REQ-014, без normalizeDomainError: retryable только таймаут (ETIMEDOUT), connection reset (ECONNRESET) и HTTP 429/500/502/503/504. 401/403 → AUTH_ERROR (pause_job); 404, invalid URL, unsupported codec, прочее неизвестное → 'fail'; EACCES/EPERM → PERMISSION_DENIED, ENOSPC → DISK_FULL (pause_job). Из cause/сообщений ничего не публикуется (PRN-002).
- Ввести RetryConfig { maxAttempts = 5, baseDelayMs, factor, maxDelayMs } с валидацией: maxAttempts — целое ≥ 1; baseDelayMs и maxDelayMs — конечные положительные числа, maxDelayMs ≥ baseDelayMs; factor — конечное число > 1 (экспоненциальный рост); иначе ValidationError из shared. Значения задержек по умолчанию (1000 мс, множитель 2, потолок 30000 мс) объявить provisional: OQ-009 отложен, лимиты Яндекса не измерены; значения настраиваются и не выдаются за измеренные.
- computeBackoffMs(attempt, config, random): потолок = min(maxDelayMs, baseDelayMs × factor^(attempt−1)); задержка = потолок × (0.5 + 0.5 × random()) — экспоненциальный рост, jitter, жёсткий верхний предел. random и часы (now) инжектируются, глобальный Math.random/Date не используются.
- decideRetry({ error, failedAttempts, config, random, now }) → { action: 'retry' | 'reopen_stream', delayMs, retryAt, retryPhase? } | { action: 'fail' } | { action: 'pause_job', reason }. После failedAttempts ≥ maxAttempts возвращается 'fail' с последней причиной (REQ-014: после 5-й неудачной попытки трек в failed). Возвращаемая AttemptRecord { attempt, code, retryable, delayMs } — данные для записи в manifest; сама запись принадлежит STEP-016.
- Повторы только описываются; цикл, ожидание, запросы и таймеры не реализуются (запрет сетевых вызовов; менеджер — STEP-017).

**Files:**
- packages/core/retry/src/classify.ts
- packages/core/retry/src/backoff.ts
- packages/core/retry/src/decide.ts
- packages/core/retry/src/classify.test.ts
- packages/core/retry/src/backoff.test.ts
- packages/core/retry/src/decide.test.ts
- packages/core/retry/src/index.ts

**Tests:**
- Таблица классификации REQ-014: для сырых ошибок ETIMEDOUT, ECONNRESET, 429, 500, 502, 503, 504 → retry; 401, 403, 404, invalid URL, unsupported codec, EACCES, ENOSPC → не повторять; для DomainError — ветка по retryable (retryable=true → retry, false → fail), STREAM_EXPIRED → reopen_stream и не равен AUTH_ERROR. Тесты сырых входов не выдаются за доказательство поведения provider.
- Backoff с фиксированным random (0, 0.5, 1): задержки возрастают с номером попытки, не превышают maxDelayMs, нижняя граница положительна, результат детерминирован; ValidationError для NaN, Infinity, отрицательных и нулевых задержек, factor ≤ 1, maxDelayMs < baseDelayMs, нецелого или нулевого maxAttempts.
- decideRetry: 4 повтора и fail на 5-й неудаче при maxAttempts=5, настраиваемый maxAttempts, retryAt = now + delayMs, AttemptRecord не содержит cause/сообщений.

**Risks:**
- Задержки по умолчанию provisional (OQ-009); ошибочная настройка ограничена валидацией и потолком, измерение лимитов вне этого STEP.
- Функции чистые и не делят изменяемое состояние (CRP-005): random и now передаются явно.
- Provider сейчас помечает retryable любые HTTP ≥ 500 и сетевые сбои (packages/providers/yandex-music/src/audio/transport.ts), тогда как REQ-014 перечисляет 500/502/503/504. Сужение маппинга — работа provider, вне mutation policy STEP-014; в STEP-014 не меняется и не закрывается. Если владелец продукта захочет строгий список, потребуется отдельный QUICK FIX provider.

### 2. Таблица переходов трека и control job (packages/core/downloader/src/state)

- Описать переходы ADR-003/ADR-006 как неизменяемые данные (Object.freeze, readonly): записи { from, event, to }. События: start_resolving, variant_selected, skip_existing, start_download, stream_complete, commit, transient_error, backoff_elapsed, pause, resume, fatal_error, attempts_exhausted, cancel, retry, auth_resume, recover, recover_committed. Никакого модульного изменяемого состояния.
- transitionTrack(state: { status, retryPhase? }, event) → { ok: true, state } | { ok: false, reason }. retry_wait входит только вместе с retryPhase ('resolving' из resolving, 'downloading' из downloading); backoff_elapsed возвращает в фазу из retryPhase; pause из retry_wait допустим только при retryPhase='downloading'; выход из retry_wait очищает retryPhase. Недопустимые пары (включая выход из completed, skipped, cancelled и обычный resume из failed) отвергаются без исключений.
- skip_existing допустим из ready и processing; cancel — из queued, resolving, ready, downloading, paused, retry_wait и processing (до точки фиксации; после commit трек терминален); retry возвращает failed→queued; auth_resume возвращает failed→queued только для трека, остановившего job (выбор трека — на вызывающем, проверка причины в control job).
- Recovery-события (recover: resolving, ready, downloading, retry_wait, processing → queued; recover_committed: processing → completed только при флаге resultVerified=true) помечены actor='recovery' и отвергаются для других actor; paused остаётся paused, completed и skipped не меняются, failed возвращается только retry. Единственный источник истины таблицы — packages/core/downloader/src/state. Так как core/manifest не может импортировать core/downloader (ADR-001 п.3), STEP-016 получает recovery-нормализацию через внедрённую функцию (DI/callback), а применяет её композиция в STEP-017; STEP-014 экспортирует recoverTrack как чистую функцию для такого внедрения. Копия таблицы в core/manifest не создаётся.
- Control job: JobControlState { control, pauseReason?, pauseTrackKey? }. running⇄paused, running|paused→cancelled (терминально); resume и retry для cancelled job отвергаются. pauseJobOnFatalError(reason: 'AUTH_REQUIRED' | 'DISK_FULL' | 'PERMISSION_DENIED', trackKey) допустим только при control=running и ставит control=paused с причиной; повтор на уже paused job отвергается, чтобы сохранился первый остановивший трек. resumeJob снимает причину и для AUTH_REQUIRED возвращает единственный trackKey для события auth_resume, остальные failed-треки не затрагивает (ADR-006).
- Реэкспорт API из packages/core/downloader/src/index.ts (только реэкспорт, маркер пакета сохраняется). Зависимость downloader→retry не добавляется: state machine не использует retry; ребро разрешено boundary rules, если понадобится STEP-017.

**Files:**
- packages/core/downloader/src/state/transitions.ts
- packages/core/downloader/src/state/control.ts
- packages/core/downloader/src/state/transitions.test.ts
- packages/core/downloader/src/state/control.test.ts
- packages/core/downloader/src/index.ts

**Tests:**
- Независимая ожидаемая таблица в тесте, выписанная вручную из ADR-003/ADR-006: для каждой пары (12 исходных состояний: 10 статусов и retry_wait × {retryPhase=resolving, retryPhase=downloading}, × все события) результат ok совпадает с ожидаемым; разрешённые пары проверяются по целевому статусу и retryPhase, остальные обязаны вернуть ok=false (полная матрица, а не выборка). Отдельно: pause из retry_wait(resolving) отвергается, из retry_wait(downloading) допускается; backoff_elapsed возвращает в фазу из retryPhase; retryPhase ставится при входе в retry_wait и очищается при выходе.
- Инварианты: completed, skipped, cancelled не имеют исходящих переходов; failed выходит только через retry и auth_resume; recover* отвергаются для не-recovery actor; recover_committed без resultVerified отвергается.
- Control job: допустимые переходы, отказ resume/retry у cancelled, пауза по AUTH_REQUIRED/DISK_FULL/PERMISSION_DENIED, resume после AUTH_REQUIRED возвращает ровно один trackKey, прочие причины его не возвращают.

**Risks:**
- ADR-006 ссылается на таблицу ADR-003; источник таблицы — ADR-003 (Superseded по ADR-006 только в части перечисленных правил). Любое расхождение ловит независимая матрица ожиданий.
- Реализация только описывает переходы; запись в manifest, аренда и порядок применения событий — STEP-016/017.
- Распределение recovery между STEP-016 (аренда, сверка файла, данные resultVerified) и STEP-017 (композиция и вызов recoverTrack) и запись AttemptRecord в manifest должны быть зафиксированы в планах STEP-016/017; STEP-014 только поставляет чистые функции и тип AttemptRecord, STEP-016/017 не меняет.

### 3. Детерминированная агрегация статуса job

- aggregateJobStatus({ control, leaseAlive, tracks: DownloadTrackStatus[] }) → DownloadJobStatus; порядок правил строго по ADR-003/ADR-006: cancelled (control=cancelled) → paused (control=paused, безусловно) → interrupted (control=running, есть нетерминальные треки, аренды нет) → completed (все completed|skipped) → completed_with_errors (нет активных и ожидающих, есть completed|skipped и есть failed) → failed (нет активных и ожидающих, нет completed|skipped, есть failed) → running (аренда жива) | queued (ни один трек не начат).
- Активные и ожидающие статусы: queued, resolving, ready, downloading, processing, retry_wait, paused. failed, completed, skipped и cancelled — не активные.
- Заполнение пробела ADR для комбинаций с cancelled-треками при control=running (ADR их не описывает; сценарий возможен только при отмене отдельного трека, в контрактах не заявленной): cancelled-трек считается неуспешным терминальным. Нет активных и failed, только cancelled → cancelled; есть completed|skipped вместе с cancelled → completed_with_errors. Пустой список треков следует правилам ADR буквально (все треки completed|skipped → completed), отдельной ветки не вводится. Заполнение помечено в коде как защитное и закреплено тестом.
- Агрегат — чистая функция без часов: признак leaseAlive вычисляет вызывающий слой (ADR-004, STEP-016).

**Files:**
- packages/core/downloader/src/state/aggregate.ts
- packages/core/downloader/src/state/aggregate.test.ts
- packages/core/downloader/src/index.ts

**Tests:**
- Таблица наборов статусов: все правила ADR в порядке приоритета (cancelled > paused > interrupted > …), последний трек failed при control=paused остаётся paused, completed_with_errors с недоступными треками, interrupted при устаревшей аренде, queued (ни один трек не начат) и running, пустой список → completed, ветви с cancelled-треками.
- Детерминизм: результат не зависит от порядка треков (перебор перестановок небольшого набора).

**Risks:**
- Правило для cancelled-треков при control=running — заполнение пробела ADR; если владелец продукта решит иначе, это отдельное изменение через ADR.

### 4. Каноническая проверка

- Выполнить lint, typecheck, test, build, format:check и Harness validator через существующие скрипты; форматировать только затронутые файлы; правки ограничены packages/core/retry и packages/core/downloader/src.
- Синхронизировать projections перед completion; результат SUCCESS передать dispatcher для canonical Verification и независимого REVIEW.

**Files:**
- packages/core/retry/src/index.test.ts
- packages/core/downloader/src/index.test.ts

**Tests:**
- Существующие тесты маркеров пакетов остаются зелёными вместе с новыми.

## Evidence


<!-- VERIFICATION-EVIDENCE:START -->
- Verification run: 2026-10-10T04:26:14Z
- Status: PASS
- Automated resumed: false
- Git head: 24cf440d722cff4ed53eaca90ca7a9581d46b398
- Worktree hash: sha256:37d23e11ebe3d463bf9a2c1a1e89df0923e972fc442077ee42c06e318f3a4b0e
- Verification contract basis: sha256:75b598e33fd70ff9f5316d777967dc0391cde0d8e4a85a0ea979e02b7ae8a559
- Subject git head: 24cf440d722cff4ed53eaca90ca7a9581d46b398
- Subject worktree hash: sha256:13359cb7f878b7ef366785968951694f19d81604f2999e4c6d593c7acc28aa04

### Automated verification
- Command: node packages/testing/scripts/run-yarn.mjs run lint
  - Status: PASS
  - Exit code: 0
  - Duration ms: 5922
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: f59ba696a15507a8febe0f9ea94ac75ccc5411952df61ee4cb3c971b47b6bc12
  - stdout bytes: 0
  - stderr bytes: 25
- Command: node packages/testing/scripts/run-yarn.mjs run typecheck
  - Status: PASS
  - Exit code: 0
  - Duration ms: 2818
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: ffbfd8ec2bfcf3e8f0e99a93f081f695da2de832eba56c5ae6943a4052680411
  - stdout bytes: 0
  - stderr bytes: 30
- Command: node packages/testing/scripts/run-yarn.mjs test
  - Status: PASS
  - Exit code: 0
  - Duration ms: 4077
  - stdout sha256: 96bcbdb72ffd89c260acc61e122cf8a8059c1427a523033129aa6f9e81c7338b
  - stderr sha256: f969fafb7bc32ecc492c8343f56269c9c47161d893e83a0d8b9b27fcf57b9aee
  - stdout bytes: 4869
  - stderr bytes: 21
- Command: node packages/testing/scripts/run-yarn.mjs run build
  - Status: PASS
  - Exit code: 0
  - Duration ms: 414
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: a0b5ebe8b7786637f56a665a03d6d27f3d6a927d0669b1870beb1307702b651a
  - stdout bytes: 0
  - stderr bytes: 26
- Command: node packages/testing/scripts/run-yarn.mjs run format:check
  - Status: PASS
  - Exit code: 0
  - Duration ms: 1766
  - stdout sha256: 17aa973d3f004560237d9a95171210b0671deff23d61628eecf7322ff5938f20
  - stderr sha256: 25e162fe1196016bd51a2c9644b6820f880082561abce757f808502fb7895ebb
  - stdout bytes: 66
  - stderr bytes: 33
- Command: python3 .harness/tools/validate.py --mode manual
  - Status: PASS
  - Exit code: 0
  - Duration ms: 2717
  - stdout sha256: 989693f8deb8bd80e5ede0780188c428b84215dcf5fc28b3a8b640b3fa3e1d34
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 308
  - stderr bytes: 0

### Product verification
- none

### Manual verification
- none
<!-- VERIFICATION-EVIDENCE:END -->

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.


## Blocker / Failure reason

—
