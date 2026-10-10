---
schema: 1
id: STEP-013
status: completed
type: implementation
priority: critical
phase: core
depends_on:
  - STEP-003
  - STEP-005
requirements:
  - REQ-011
  - REQ-010
adrs:
  - ADR-004
architecture_refs:
  - "docs/architecture.md#основные-компоненты-границы"
  - docs/architecture.md#data-state-model
risk_flags:
  - none
plan:
  status: ready
  revision: 1
  context_basis: sha256:7eba11e47a4621f1c13fa54a360bf5ecd4daf63270e40132bd43c539c8c1cf3f
  content_hash: sha256:73e695e8ab5176b7492331c67ad6fd60c5e4417ac11e2150029994133be111c8
  reviewed_report: planning/plan-reviews/STEP-013/PLAN-REVIEW-20261010T055938Z.md
  planned_at: 2026-10-10T05:59:38+00:00
  execution_groups:
  context_components:
    - "ADR@ADR-004=sha256:4ad987cbdefdf1409c52fd01994ccca0d6941fad8ae0126d435745f3e727ca08"
    - "ARCH@docs/architecture.md#data-state-model=sha256:a16465c45f16a8f41fd3e876e764be3e05d852017bd62457799b7dba138bf6c6"
    - "ARCH@docs/architecture.md#основные-компоненты-границы=sha256:fbdabff4c712b9793cdefe9ef7f14d27253ce04e554c0e2e1ab730cb5bfb5a91"
    - "OQ@OQ-011=sha256:3e6c929f1ac2a8d91faab83d3f3b4661c81385612ad1a4735a7cae4c5a168aaf"
    - "OQ@OQ-012=sha256:e45e0c4002305f92d43591fa4b154c4707f104e6792a0979516f6b0c7f97f79b"
    - "PRN@PRN-001=sha256:3b3801f207fafc3f77272f0e93570258a6d006964839d93a276accd814d548af"
    - "PRN@PRN-002=sha256:f29ee3fbdb9cf65cf9739d0907768bbf192ad88b8e443110d4d82f81c6b79ecb"
    - "PRN@PRN-003=sha256:16516d7d302fecda5f7615f9d55e29e04b588d671f8660640e1f61d1619e4ef8"
    - "REQ@REQ-010=sha256:94ce1ccb83cb76656b9018157b7fa972212242070ab4b85a3b877ec4fbc96233"
    - "REQ@REQ-011=sha256:ae43bdda1373eb96562e951a2f49be9f4e698ba3685d42b0d7ffbacfdd217ff1"
    - "STEP@STEP-003=sha256:d44b1efab2bcb4a844c3ac708626a1569e846fb6034b4aae8b752fa91b7e7405"
    - "STEP@STEP-005=sha256:cb280369edd87e0a4560c9e2d78ddba902bebde1a9c1d20699cf193946b6838c"
    - "STEP@STEP-013=sha256:72604a460c9a9db5fefea44d08c7bbe92cf1110fa6c0dbd5294164fa5a39603a"
---

# STEP-013 — Download Planner и quality resolver

## Goal

Реализовать построение immutable `DownloadPlan` и resolver качества на фактических `AudioVariant`.

## Context

Политика недоступной настройки решена владельцем продукта (ошибка без снижения); OQ-011 остаётся открытым в части ранжирования `high`/`normal`, а OQ-012 — в части допустимости зашифрованных вариантов; без resolution STEP не стартует.

## Scope

- Planner для track/album/playlist (без сетевой загрузки аудио).
- Quality resolver по ранжированию реальных вариантов и правилам OQ-011; фильтр поддерживаемых вариантов — внедряемый предикат `supports(variant)` (наполняется решениями STEP-020; preview-варианты исключены решением OQ-012).
- Запись выбранного variant в job.
- Unit-тесты на наборах вариантов разных аккаунтов.

## Mutation policy

### Allowed

- `packages/core/planner/**`, тесты, минимальные типы в shared.

### Conditional

- Дополнение `QualityPreference` — только по решению OQ-011.

### Forbidden

- Фиксированные соответствия подписка→кодек и пресет→битрейт, загрузка файлов.
- Реализация future/unrelated STEP «заодно».

## Out of scope

- UI выбора качества.

## Acceptance criteria

- План неизменяем (compile-time и runtime) и содержит позиции 1..N.
- `best` и `lossless` дают ожидаемые варианты на тестовых наборах; при недоступной настройке `lossless`/`high`/`normal` трек получает `QualityUnavailableError` без тихого снижения, остальные треки продолжаются; ранжирование `high`/`normal` соответствует resolution OQ-011.
- В коде нет констант Premium=FLAC/High=320.

## Verification

- command: `node packages/testing/scripts/run-yarn.mjs run lint`
- command: `node packages/testing/scripts/run-yarn.mjs run typecheck`
- command: `node packages/testing/scripts/run-yarn.mjs test`
- command: `node packages/testing/scripts/run-yarn.mjs run build`
- command: `node packages/testing/scripts/run-yarn.mjs run format:check`
- command: `python3 .harness/tools/validate.py --mode manual`

## Deliverables

- Planner, quality resolver, тесты.

## Implementation plan

### 1. Типы DownloadPlan в shared

- Добавить packages/shared/src/plan.ts с минимальными типами: PlannedTrack { position (целое ≥ 1), trackKey (строка от позиции, как в DownloadTrackJob), track: Track } и DownloadPlan { source: MediaReference, title: string, tracks: readonly PlannedTrack[] }. Все поля readonly; тип сериализуем в JSON без изменений (для manifest, STEP-016).
- Экспортировать типы из packages/shared/src/index.ts. Без Node-модулей, ввода-вывода и сторонних типов (ADR-001 п.5). QualityPreference не меняется: OQ-011 решён без новых значений.

**Files:**
- packages/shared/src/plan.ts
- packages/shared/src/index.ts

**Tests:**
- Compile-time: импорт типов через общий экспорт; существующие проверки exports shared остаются зелёными.

### 2. Planner: immutable DownloadPlan

- В packages/core/planner/src/plan.ts реализовать buildTrackPlan(source, track), buildAlbumPlan(source, album), buildPlaylistPlan(source, playlist) → DownloadPlan. Чистые функции, без сети и загрузки аудио. Несоответствие source.kind типу сущности даёт ValidationError из shared.
- Позиции 1..N присваиваются по порядку в списке (index + 1), trackKey = String(position). Повторы одного трека в playlist получают разные позиции. Недоступные и unknown-треки остаются в плане: нумерация не сдвигается, их обработка (ошибка трека, completed_with_errors) принадлежит job. Одиночный трек — единственная позиция 1; пустой альбом или playlist — план без треков.
- title плана: название альбома или playlist; для трека — его title, а при отсутствии пустая строка.
- Неизменяемость: тип readonly (compile-time) и runtime: план собирается из глубокой копии входных данных (собственный рекурсивный clone простых JSON-данных, без Node API), которая рекурсивно замораживается Object.freeze. Мутация входных объектов после построения плана на план не влияет; попытка изменить план в strict-режиме ESM бросает TypeError.
- Дополнительно createTrackJobs(plan) → DownloadTrackJob[] (trackKey, trackId, status 'queued') как исходное состояние job, и withSelectedVariant(job, variant) → новый DownloadTrackJob с записанным variant (исходный объект не меняется). Переходы статусов остаются за STEP-014/017.

**Files:**
- packages/core/planner/src/plan.ts
- packages/core/planner/src/jobs.ts
- packages/core/planner/src/plan.test.ts

**Tests:**
- Планы track/album/playlist: позиции 1..N без пропусков, trackKey, повторы в playlist, недоступный трек сохраняет позицию, пустой список, несоответствие kind → ValidationError.
- Неизменяемость: Object.isFrozen на всех уровнях, присваивание и push в strict-режиме бросают TypeError, мутация исходного альбома после построения плана на план не влияет; ts-expect-error для compile-time readonly.
- Resume-инвариант: JSON.parse(JSON.stringify(plan)) совпадает с планом по позициям, trackKey и порядку.
- createTrackJobs и withSelectedVariant: статусы queued, variant записан в новом объекте, исходный job не изменён.

**Risks:**
- Позиции playlist берутся по порядку списка, а не из provider-поля position; если provider вернёт неупорядоченный список, STEP-009/provider отвечает за порядок.

### 3. Quality resolver по правилам OQ-011

- В packages/core/planner/src/quality.ts реализовать resolveVariant(variants, quality, options) → { ok: true, variant } | { ok: false, error: QualityUnavailableError } (без исключений). options: supports?(variant) — внедряемый предикат (по умолчанию принимает всё; наполняется STEP-020), codecRank?(codec) — внедряемое ранжирование codec (по умолчанию не задано).
- Шаги: оставить только supported-варианты. Preview-варианты исключает provider (Zod-схема и variants.ts отбрасывают всё, кроме preview === false), в AudioVariant признака preview нет; resolver ничего о preview не выбирает (REQ-010/OQ-012).
- lossless: лучший из supported lossless-вариантов. best: если есть supported lossless — лучший lossless, иначе лучший lossy. high: лучший lossy, normal: худший lossy. Нет подходящего варианта — QualityUnavailableError без снижения на другой пресет (решение владельца, OQ-011).
- Группа сравнения — один codec. Группы идут в порядке первого появления в списке provider; если задан codecRank, группы упорядочиваются им (устойчиво). Группа выбирается первой в этом порядке среди подходящих для пресета. Bitrate разных codec не сравнивается. Внутри группы: high/best — максимальный bitrate, normal — минимальный; при равенстве — первый в порядке provider; один вариант — его получают и high, и normal.
- Вариант без bitrate: пока в группе есть варианты с известным bitrate, они ранжируются, а безбитрейтные не выбираются; если известного bitrate нет ни у одного — первый в порядке provider. Так сравнение остаётся полной функцией без выдуманных чисел.
- resolvePlanVariants(plan, variantsByPosition, quality, options) → результат по каждой позиции плана; отсутствие записи по позиции — QualityUnavailableError для неё. Один трек с ошибкой не прерывает остальные. Запрос вариантов у provider выполняет вызывающий слой (STEP-017).
- Источник правил не содержит констант «подписка → codec» и «пресет → bitrate» (в коде нет числовых порогов и имён кодеков).

**Files:**
- packages/core/planner/src/quality.ts
- packages/core/planner/src/quality.test.ts
- packages/core/planner/src/index.ts

**Tests:**
- Наборы вариантов разных аккаунтов (только MP3 192/320; MP3 + AAC + FLAC; только lossy; только lossless; один вариант; без bitrate): best, lossless, high, normal дают ожидаемый вариант, включая равный bitrate и порядок provider.
- lossless/high/normal при отсутствии подходящего варианта → QualityUnavailableError, выбор не снижается на другой пресет; пустой список и пустой результат supports() → ошибка.
- supports() отфильтровывает вариант; codecRank меняет выбранную группу, но не сравнивает bitrate между codec.
- resolvePlanVariants: ошибка одного трека не мешает остальным, план не изменяется.
- Регрессия по явному Acceptance: тест читает файлы src планировщика без тестов и проверяет отсутствие числовых порогов bitrate, имён кодеков и слов подписки.

**Risks:**
- Правило групп и безбитрейтных вариантов закреплено решением владельца в OQ-011 и уточнением REQ-010; изменение потребует нового решения владельца.

### 4. Экспорт и каноническая проверка

- Экспортировать API planner из packages/core/planner/src/index.ts, сохранив package marker; границы слоёв: planner зависит только от shared (ADR-001, PRN-001).
- Выполнить lint, typecheck, test, build, format:check и Harness validator; форматировать только затронутые файлы. Синхронизировать projections перед completion; результат SUCCESS передать dispatcher для canonical Verification и независимого REVIEW.

**Files:**
- packages/core/planner/src/index.ts
- packages/core/planner/src/index.test.ts

**Tests:**
- Существующий тест marker остаётся зелёным.

## Evidence


<!-- VERIFICATION-EVIDENCE:START -->
- Verification run: 2026-10-10T06:43:42Z
- Status: PASS
- Automated resumed: false
- Git head: 689573951a428231a7abc74aa19772d3f2688af3
- Worktree hash: sha256:caf0af80ae35c99bcc84a2b6d28396449d857291bbc295e9831dba2c0d23b921
- Verification contract basis: sha256:75b598e33fd70ff9f5316d777967dc0391cde0d8e4a85a0ea979e02b7ae8a559
- Subject git head: 689573951a428231a7abc74aa19772d3f2688af3
- Subject worktree hash: sha256:f468c2ec68fa453c9b8d232a439f3dc44ba651e69aae39208167b0895923a12c

### Automated verification
- Command: node packages/testing/scripts/run-yarn.mjs run lint
  - Status: PASS
  - Exit code: 0
  - Duration ms: 5674
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: f59ba696a15507a8febe0f9ea94ac75ccc5411952df61ee4cb3c971b47b6bc12
  - stdout bytes: 0
  - stderr bytes: 25
- Command: node packages/testing/scripts/run-yarn.mjs run typecheck
  - Status: PASS
  - Exit code: 0
  - Duration ms: 2368
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: ffbfd8ec2bfcf3e8f0e99a93f081f695da2de832eba56c5ae6943a4052680411
  - stdout bytes: 0
  - stderr bytes: 30
- Command: node packages/testing/scripts/run-yarn.mjs test
  - Status: PASS
  - Exit code: 0
  - Duration ms: 4176
  - stdout sha256: 939cdfae12c06bc168ab5162ca8f5e65940adc147a49812fa55ed3eb688f8767
  - stderr sha256: f969fafb7bc32ecc492c8343f56269c9c47161d893e83a0d8b9b27fcf57b9aee
  - stdout bytes: 5012
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
  - Duration ms: 1866
  - stdout sha256: 17aa973d3f004560237d9a95171210b0671deff23d61628eecf7322ff5938f20
  - stderr sha256: 25e162fe1196016bd51a2c9644b6820f880082561abce757f808502fb7895ebb
  - stdout bytes: 66
  - stderr bytes: 33
- Command: python3 .harness/tools/validate.py --mode manual
  - Status: PASS
  - Exit code: 0
  - Duration ms: 2767
  - stdout sha256: 6071542c8e9d0783374057b32b1e7ec2b7454ada40f8efe7265ac43c7c1fc7b4
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 366
  - stderr bytes: 0

### Product verification
- none

### Manual verification
- none
<!-- VERIFICATION-EVIDENCE:END -->

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.


## Blocker / Failure reason

—
