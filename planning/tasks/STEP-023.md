---
schema: 1
id: STEP-023
status: completed
type: implementation
priority: high
phase: hardening
depends_on:
  - STEP-020
  - STEP-015
  - STEP-017
requirements:
  - REQ-016
  - REQ-036
adrs:
  - ADR-004
architecture_refs:
  - docs/architecture.md#reliability-observability
  - docs/architecture.md#deployment-runtime-assumptions
risk_flags:
  - none
plan:
  status: ready
  revision: 1
  context_basis: sha256:21f27c03ec3454d1439d0974cb8b40782e3a0363f7bdb820ea9ba7aca9e50050
  content_hash: sha256:39288eb84085a73b00814095048b49a05807183b62fc8c3e1686f10a40ae45ad
  reviewed_report: planning/plan-reviews/STEP-023/PLAN-REVIEW-20261011T133658Z.md
  planned_at: 2026-10-11T13:36:58+00:00
  execution_groups:
  context_components:
    - "ADR@ADR-004=sha256:4ad987cbdefdf1409c52fd01994ccca0d6941fad8ae0126d435745f3e727ca08"
    - "ARCH@docs/architecture.md#deployment-runtime-assumptions=sha256:f301a436e0abeaf7aea31bffa46d170a9cde3219fb7d566834b3eb3ae57ac85a"
    - "ARCH@docs/architecture.md#reliability-observability=sha256:a9c337102c2ed62fdaca7173e8e2c05ffe6d68a1d99140fe986a552b3cc636d4"
    - "OQ@OQ-002=sha256:34d9adc4ff319cabf941aba6007a69ba6893fcf5783e9d66e89e7a73f0de2f15"
    - "OQ@OQ-005=sha256:adde005210499e79a47d34b2489ba132e01a55a31b89d66254a6496878cd9c63"
    - "PRN@PRN-001=sha256:3b3801f207fafc3f77272f0e93570258a6d006964839d93a276accd814d548af"
    - "PRN@PRN-002=sha256:f29ee3fbdb9cf65cf9739d0907768bbf192ad88b8e443110d4d82f81c6b79ecb"
    - "PRN@PRN-003=sha256:16516d7d302fecda5f7615f9d55e29e04b588d671f8660640e1f61d1619e4ef8"
    - "REQ@REQ-016=sha256:8c9328e7124607f8d857913ec6b4d446c9aa533d81ff65fd005e84e1d741567e"
    - "REQ@REQ-036=sha256:adc3026190b4b6714c911cbabcc7284ff56c2b2ed04372dd3ee6104a24945631"
    - "STEP@STEP-015=sha256:3aba0387696f8552692c27d3f61bdd34e950556e7dc7f3c74f7f2c39e44990ca"
    - "STEP@STEP-017=sha256:74d947c3ddfeab0bcb7930439ff7161e2273ea240add13300da208e9725b7245"
    - "STEP@STEP-020=sha256:83aa60c1e0090719822bc228b40d8175345b7f4ea1b7d8100b86b39a8f6bead9"
    - "STEP@STEP-023=sha256:99dd735198e02a600b41262ebd73fdc1a2e899716ea1d602108a0b1e8b7d8a5c"
---

# STEP-023 — Валидация файлов и опциональный FFmpeg

## Goal

Реализовать post-download validation (existence, size, stream completion, container, duration) и опциональную расширенную проверку через FFmpeg.

## Context

Допуск duration определяется этим STEP как implementation decision; FFmpeg не обязателен.

## Scope

- Базовые проверки без FFmpeg.
- Проверка длительности с документированным допуском.
- Опциональный FFmpeg-адаптер (если ADR STEP-020 это подтверждает).
- Интеграция в стадию processing до rename.

## Mutation policy

### Allowed

- `packages/core/validation/**`, интеграция в downloader, тесты.

### Conditional

- Bundled FFmpeg — только если разрешено ADR STEP-020.

### Forbidden

- Обязательная зависимость от FFmpeg для базовой загрузки.
- Реализация future/unrelated STEP «заодно».

## Out of scope

- Транскодирование.

## Acceptance criteria

- Отказ на пустом, обрезанном, нераспознанном и со значительным расхождением длительности файле.
- Допуск duration зафиксирован в документации и покрыт граничными тестами.
- Без FFmpeg загрузка и базовая валидация проходят.

## Verification

- command: `npm run lint`
- command: `npm run typecheck`
- command: `npm test`
- command: `python3 .harness/tools/validate.py --mode manual`

## Deliverables

- Validation package и тесты.

## Implementation plan

### 1. Обязательная базовая validation локального аудио

- Реализовать provider-neutral validator в packages/core/validation: существующий обычный файл, размер > 0, подтверждённое завершение download и совпадение transport bytes с известным ожидаемым размером до metadata. Для уже существующего итогового файла transport evidence неприменим; проверять локальную целостность отдельно.
- Добавить music-metadata 12.1.0 как зависимость validation, использовать content-based parsing с duration:true и skipCovers:true, не определять формат по .part. Проверить распознанный container против явного выбранного variant (MP3 и MP4/AAC, MP4/FLAC из ADR-012); неизвестный/несовместимый формат отвергать безопасной ValidationError.
- На полном локальном corpus и его обрезанных копиях проверить cheapest proof: parser success и заявленная duration сами по себе не гарантируют целостность. При подтверждённом пропуске truncation добавить минимальную структурную проверку соответствующего контейнера; доказать отказ и с отсутствующей expected duration. Не добавлять поддержку иных codecs или decoder/transcoding.
- Ожидаемую duration брать из Track.durationMs. При её наличии требовать конечную положительную измеренную duration; принимать abs(actual-expected) <= max(1000 ms, expected*0.01), без ожидаемой duration не выдумывать значение. Зафиксировать правило и его смысл в README validation и комментарии с @link к REQ-016; покрыть ниже/ровно/выше обеих веток порога.
- Нормализовать ошибки parser/ФС без raw paths, binary stdout/stderr, signed URL и секретов; сохранить существующие DiskFull/Permission error semantics при доступе к файлу.

**Files:**
- packages/core/validation/**
- yarn.lock

**Tests:**
- Unit: missing/empty/non-audio/mismatched container, полный и обрезанный MP3/MP4, duration boundary и отсутствие expected duration.
- Полные маленькие синтетические fixtures сохраняются в tests; runtime tests не генерируют corpus через FFmpeg.

**Risks:**
- Внедрять только подтверждённые parser gaps для contract truncation; исследовательский corpus не доказывает Yandex transport.

### 2. Validation в Download Manager до rename

- Добавить dependency core-validation в core-downloader и вызывать baseline validator обязательно, даже без processing hooks: initial до metadata и final после awaited metadata, до checkpoint rename. Дополнительные custom validate hooks сохраняются и не отключают baseline.
- Передать ожидаемую duration из immutable manifest.plan.tracks по trackKey. Внутренний validation request передаёт stream completion/полученные bytes/ожидаемый transport size; сохранить их из реально завершённого writer/range path, а не из partial.expectedSize после stream_complete. Resumed Range проверяет полный файл/полный expected total. Final после metadata проверяет текущий локальный файл без сравнения с исходным transport size. Не менять shared DTO/manifest schema или lease/state ownership.
- Использовать базовый validator для existing-file inspection перед skip-existing в downloader (через текущие file ports без изменения application adapter): не считать invalid audio valid только из-за размера; ошибки validation допускают существующую replace policy, ошибки Permission не маскируются.
- На final success опубликовать validation.completed через существующий context.emit ровно один раз, с jobId/trackKey/durationMs; failure не публикует success, не вызывает rename и не заменяет прежний файл. Сохранить pause/cancel и commit semantics ADR-004.
- Обновить текущие downloader tests с заведомо валидным audio вместо произвольных bytes там, где проверяется успешный production flow; допускается injection parser/validation port в unit isolation, но отдельная real-files интеграция обязательно вызывает production validator.

**Files:**
- packages/core/downloader/**
- packages/core/validation/**
- yarn.lock

**Tests:**
- Интеграция через real files + production validator: valid download без hooks; initial invalid отказ до metadata/rename; повреждение после metadata отказ до rename и прежний result сохранён.
- Unknown contentLength и truncated local file; known contentLength mismatch и обрыв stream; resumed Range соответствует полному размеру.
- Existing valid skip, invalid existing replace по существующей policy; validation.completed ordering и безопасные поля.

**Risks:**
- Не сравнивать размер после тегирования с transport size; не переносить orchestration в application и не реализовывать metadata owner STEP-021.

### 3. Опциональная расширенная проверка системным FFmpeg

- Добавить отдельный opt-in adapter в core-validation для полного декодирования локального файла системным FFmpeg: явно переданный путь инструмента, spawn/execFile без shell, без download/bundling/PATH discovery или изменения doctor. Baseline не запускает child_process.
- Опциональная проверка выполняется только по явному запросу; отсутствие инструмента не делает базовую validation ошибочной и возвращается как optional unavailable; реальный decode failure при запрошенной проверке даёт нормализованную ValidationError. Ограничить время выполнения и корректно завершать процесс при отмене средствами существующего Node lifecycle; не выводить raw stderr в события/errors.
- Покрыть контракт adapter посредством контролируемого test executable/process port: success, decode failure, инструмент отсутствует, timeout/abort. Реальный установленный FFmpeg допускается дополнительной локальной проверкой, но не обязателен для npm test.

**Files:**
- packages/core/validation/**

**Tests:**
- Opt-in failure/success/unavailable и baseline без вызовов subprocess.

**Risks:**
- Diagnostics discovery и doctor optional / not installed принадлежат STEP-025, packaging STEP-035; здесь не изменять их.

### 4. Контрактные проверки и документация

- Добавить README validation: границы baseline/optional decode, поддерживаемые container/codec, duration tolerance и источники stream proof; не обещать проверку целого Yandex MP4 transport только на локальном corpus.
- Запустить targeted unit/integration tests и общие Verification; зафиксировать фактический output/exit codes и ограничения platforms. Доказать baseline успешный real download с запретом child_process/FFmpeg, а не только подменой PATH.
- Проверить существующие retry/finalization tests; independent review и canonical dispatcher завершают lifecycle, автор не выставляет completed самостоятельно.

**Files:**
- packages/core/validation/**
- packages/core/downloader/**

**Tests:**
- Все Acceptance STEP-023 доказываются автоматическими tests; doctor и полная playlist observability остаются своим owners.

## Evidence





<!-- VERIFICATION-EVIDENCE:START -->
- Verification run: 2026-10-11T14:37:51Z
- Status: PASS
- Automated resumed: false
- Git head: fddea61f9895bc7ec5727376d813dd4925b3b96d
- Worktree hash: sha256:ef77ed0e045bab2a389ef4dc46a40f4727caf147789768c36aa85ad27a5cf9d6
- Verification contract basis: sha256:0daade76853affff17d9e8542208a6178d361ad01b01c40dbb4d103e96937ced
- Subject git head: fddea61f9895bc7ec5727376d813dd4925b3b96d
- Subject worktree hash: sha256:866cca90708fc2947ff10f56cee7a2f5917568d31bb828b6c6c3e5000a6dcf19

### Automated verification
- Command: npm run lint
  - Status: PASS
  - Exit code: 0
  - Duration ms: 7879
  - stdout sha256: a9abc4bc51d6729860fb000bf87c02e5a80cc830999d05e640c5651c7e3daa6a
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 147
  - stderr bytes: 0
- Command: npm run typecheck
  - Status: PASS
  - Exit code: 0
  - Duration ms: 2919
  - stdout sha256: 73ad7967b0b62b903e0e14e90a6a3971d720cb1ab6b744714e6d2ef05dd89743
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 83
  - stderr bytes: 0
- Command: npm test
  - Status: PASS
  - Exit code: 0
  - Duration ms: 7691
  - stdout sha256: 99840a90cad37eddba09ac066e3969ac2ee98e0a19d5b34aae6063b6900fe368
  - stderr sha256: 8015db773da4cb64f454536f0358f0a6739b0677a7ff2dcbc41da3404e8115cb
  - stdout bytes: 9022
  - stderr bytes: 1168
- Command: python3 .harness/tools/validate.py --mode manual
  - Status: PASS
  - Exit code: 0
  - Duration ms: 4170
  - stdout sha256: b0ea14fbf333d5cb5e21b53e8fcdafbd5e953bbc1a5fcc18e823e8c7dd664a43
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 424
  - stderr bytes: 0

### Product verification
- none

### Manual verification
- none
<!-- VERIFICATION-EVIDENCE:END -->

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.





## Blocker / Failure reason

—
