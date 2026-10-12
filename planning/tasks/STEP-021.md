---
schema: 1
id: STEP-021
status: completed
type: implementation
priority: high
phase: hardening
depends_on:
  - STEP-020
  - STEP-017
requirements:
  - REQ-025
  - REQ-026
  - REQ-036
adrs:
  - ADR-001
  - ADR-004
  - ADR-006
  - ADR-012
architecture_refs:
  - "docs/architecture.md#основные-компоненты-границы"
  - "docs/architecture.md#основные-потоки"
risk_flags:
  - none
plan:
  status: ready
  revision: 1
  context_basis: sha256:fe46ab2bd63fe8b01fef4dc2788ed9a6815eea225dca2a2bb7314da15b94361c
  content_hash: sha256:0b8ce7bdeb03de4a35308e6b24f42f3655b0189f5dfc54a68bb0a793c69b5284
  reviewed_report: planning/plan-reviews/STEP-021/PLAN-REVIEW-20261012T090254Z.md
  planned_at: 2026-10-12T09:02:54+00:00
  execution_groups:
  context_components:
    - "ADR@ADR-001=sha256:0c9975737760fdee3b16ec2c99c8412cd98e81af5a0ce123cf70600a4a3200bc"
    - "ADR@ADR-004=sha256:4ad987cbdefdf1409c52fd01994ccca0d6941fad8ae0126d435745f3e727ca08"
    - "ADR@ADR-006=sha256:792115c4604a81dfd2d62950958470e1c1f1bad2b2f18e873d5743b9f9dc443d"
    - "ADR@ADR-012=sha256:c1dc292dd753c367e90518672d4327e99aeaec3fdf7c681c090aa20e9e37f32f"
    - "ARCH@docs/architecture.md#основные-компоненты-границы=sha256:fbdabff4c712b9793cdefe9ef7f14d27253ce04e554c0e2e1ab730cb5bfb5a91"
    - "ARCH@docs/architecture.md#основные-потоки=sha256:e7842c107b39127d5776d5575d975efcf69df8d05024b630a938e1dc510e7575"
    - "OQ@OQ-002=sha256:34d9adc4ff319cabf941aba6007a69ba6893fcf5783e9d66e89e7a73f0de2f15"
    - "OQ@OQ-004=sha256:707cf01cbd4100ea49b610139bcac8b5b199845514084b13fb50fcc3bc905634"
    - "PRN@PRN-001=sha256:3b3801f207fafc3f77272f0e93570258a6d006964839d93a276accd814d548af"
    - "PRN@PRN-002=sha256:f29ee3fbdb9cf65cf9739d0907768bbf192ad88b8e443110d4d82f81c6b79ecb"
    - "PRN@PRN-003=sha256:16516d7d302fecda5f7615f9d55e29e04b588d671f8660640e1f61d1619e4ef8"
    - "REQ@REQ-025=sha256:c1e745fbbe50cf4e86da643d69f86c422ecfd29d15127b8a0dd58c6eeecb4095"
    - "REQ@REQ-026=sha256:a45c0df64b9f89d0b955afb6c39461cdc7e02b087fa1240edf41e51929df349e"
    - "REQ@REQ-036=sha256:adc3026190b4b6714c911cbabcc7284ff56c2b2ed04372dd3ee6104a24945631"
    - "STEP@STEP-017=sha256:74d947c3ddfeab0bcb7930439ff7161e2273ea240add13300da208e9725b7245"
    - "STEP@STEP-020=sha256:83aa60c1e0090719822bc228b40d8175345b7f4ea1b7d8100b86b39a8f6bead9"
    - "STEP@STEP-021=sha256:dcf58019485190a3facdbc5c99bc07e1dc8eb77ab5dfa1800d40aac5cbef4867"
---

# STEP-021 — Теги, встроенная обложка и cover.jpg

## Goal

Реализовать `packages/metadata`: запись тегов и встроенной обложки, `cover.jpg` и кэш обложек в рамках операции, подключить к стадии processing менеджера.

## Context

STEP-020 выбрал `taglib-wasm 1.5.3` в ADR-012; OQ-002 определяет контейнеры. ADR-001 закрепляет единственный composition root в application: core получает writer через порт и не импортирует `packages/metadata`.

## Scope

- Запись тегов TITLE, ARTIST, ALBUM, ALBUMARTIST, TRACK, DISC, DATE/YEAR, GENRE.
- Встроенная обложка и опциональный `cover.jpg`; однократная загрузка общей обложки.
- Интеграция через порт `MetadataWriter` в processing: контейнер и уже полученные в стадии `resolving` байты обложки передаются явно; `processing` не обращается к сети.
- Регистрация штатного writer в application composition root с сохранением существующего `processing` override; библиотеки записи остаются в `packages/metadata`.
- Round-trip тесты чтения.

## Mutation policy

### Allowed

- `packages/metadata/**`, подключение в `packages/core/downloader/**`, тесты.

### Conditional

- `packages/application/src/composition-root.ts` — только регистрация штатного `MetadataWriter` и его подключение к существующему processing-порту. Зависимость на metadata и TypeScript project reference уже объявлены; изменение application API и других adapters не входит в scope.
- `yarn.lock` — только согласование зависимостей metadata-пакета и независимого reader для его round-trip тестов с ADR-012; без обновления несвязанных зависимостей.

### Forbidden

- Подмена ALBUM названием плейлиста, полная валидация аудиоконтейнера и длительности (STEP-023). Проверка соответствия распознанного формата явному контейнеру перед записью относится к writer по ADR-012.
- Реализация future/unrelated STEP «заодно».

## Out of scope

- m3u8 (STEP-022).

## Acceptance criteria

- Round-trip тест на каждом поддерживаемом контейнере совпадает по всем полям, включая кириллицу.
- При загрузке playlist тег ALBUM равен исходному альбому трека.
- Альбом из 12 треков с общей обложкой делает ровно один запрос обложки.
- Встроенная обложка совпадает по хэшу с исходной.

## Verification

- command: `npm run lint`
- command: `npm run typecheck`
- command: `npm test`
- command: `python3 .harness/tools/validate.py --mode manual`

## Deliverables

- Metadata package и интеграция.

## Implementation plan

### 1. Реализовать buffer MetadataWriter в metadata-пакете

- Добавить taglib-wasm 1.5.3 и независимый test reader music-metadata 12.1.0; согласовать только связанные записи yarn.lock.
- Writer принимает .part, явный mp3/mp4 container, provider-neutral теги и готовые ArtworkData. Открыть buffer, сверить getFormat до mutation, setProperties/setPictures/save/getFileBuffer, awaited запись и dispose в finally. Сетевые запросы и subprocess отсутствуют.
- TITLE/ARTIST/ALBUM берутся из исходного Track, artists соединяются в исходном порядке через ; . TRACKNUMBER/DISCNUMBER/DATE из доступных trackNumber/discNumber/year, GENRE при наличии. ALBUMARTIST допускается как package-local optional input для полного round-trip; application mapping не выдумывает его и полную дату и не расширяет shared DTO.
- Ошибки наружу отображать безопасным стабильным кодом без библиотечного текста с путём/данными. Учесть full Buffer/WASM/output стоимость памяти по ADR-012; не добавлять performance gate.

**Files:**
- packages/metadata/**
- yarn.lock

**Tests:**
- Независимый readback всех полей/Unicode, missing optional и artwork hash для MP3, AAC-in-MP4 и FLAC-in-MP4 на полных offline fixtures; wrong explicit container отклонён до mutation; освобождение ресурса при обычных ошибках.

### 2. Добавить независимое сохранение cover.jpg

- Metadata package сохраняет исходные artwork bytes в cover.jpg по готовому result path только для album/playlist и при включённом saveCoverFile.
- embedArtwork и saveCoverFile управляются независимо; отсутствие artwork не создаёт пустой sidecar. Не обещать JPEG transcoding, атомарность всей директории или новую recovery-механику.

**Files:**
- packages/metadata/**

**Tests:**
- Все комбинации флагов embedArtwork/saveCoverFile: independent readback встроенной обложки и фактические sidecar bytes; track source не создаёт album/playlist sidecar.

### 3. Передать snapshot и настройки через core processing-port

- Расширить internal MetadataWriter/ProcessingHooks trailing provider-neutral context с planned Track, source kind, result path и флагами artwork, сохранив совместимость existing трёхаргументных callbacks.
- Processing получает готовые artwork bytes из существующего resolving cache, не выполняет network; immutable snapshot поддерживает resume и сохраняет исходный album playlist tracks.
- Сохранить owned checkpoint/tagged guard до mutation, awaited writer и cancel check до rename. Общий pause/cancel abort не передавать writer как fatal processing abort: pause дожидается processing drain, cancel запрещает rename. Не менять state machine/manifest schema.

**Files:**
- packages/core/downloader/**

**Tests:**
- Pipeline тест доказывает context/ALBUM, processing без fetch, metadata.written после успешного hook и до финализации; existing lifecycle suite остаётся proof pause/cancel/recovery.

### 4. Подключить штатный writer в application composition root

- Зарегистрировать writer через существующий application dependency/reference на metadata и processing-port; сохранить adapters.processing override.
- Не изменять application public API/runtime adapters/shared/provider. Использовать package-local mapping planned Track и готовые context поля.

**Files:**
- packages/application/src/composition-root.ts

**Tests:**
- Интеграционные тесты в metadata/core допустимых tests подтверждают default composition writer на реальных offline аудиофайлах и existing processing override.

### 5. Доказать Acceptance и ограниченный parallel-use сценарий

- Загрузить offline album из 12 tracks с одной обложкой через real pipeline/composition: счётчик fetchArtwork равен 1; встроенные bytes читаются независимым reader и hash совпадает.
- Для playlist проверить исходный ALBUM, metadata.written jobId/trackKey/durationMs и порядок перед финализацией, без секретов.
- Если используется общий WASM instance, выполнить только bounded concurrent probe на двух файлах. Без confirmed проблемы не добавлять global mutex или hardening.
- Документировать mapping, отсутствие albumArtist/full DATE в shared, buffer memory cost и границы локального platform proof в metadata README. Запустить canonical Verification через dispatcher.

**Files:**
- packages/metadata/**
- packages/core/downloader/**

**Tests:**
- Физические fixtures и независимое чтение; album 12 requests counter; playlist tags/events; default writer/override integration.

## Evidence


<!-- VERIFICATION-EVIDENCE:START -->
- Verification run: 2026-10-12T09:38:04Z
- Status: PASS
- Automated resumed: false
- Git head: 3a740e4d11bcb846fb0929510657a12724d1f6cd
- Worktree hash: sha256:e6dd4c433ca11c39050d5491fe4f82a72f02e30c2b21bc4e7e7844aff998772a
- Verification contract basis: sha256:0daade76853affff17d9e8542208a6178d361ad01b01c40dbb4d103e96937ced
- Subject git head: 3a740e4d11bcb846fb0929510657a12724d1f6cd
- Subject worktree hash: sha256:8d615c31dd0e0a62706f026343177aa09f78baec1ec9e539808ff4d52ed6c324

### Automated verification
- Command: npm run lint
  - Status: PASS
  - Exit code: 0
  - Duration ms: 7577
  - stdout sha256: a9abc4bc51d6729860fb000bf87c02e5a80cc830999d05e640c5651c7e3daa6a
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 147
  - stderr bytes: 0
- Command: npm run typecheck
  - Status: PASS
  - Exit code: 0
  - Duration ms: 3619
  - stdout sha256: 73ad7967b0b62b903e0e14e90a6a3971d720cb1ab6b744714e6d2ef05dd89743
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 83
  - stderr bytes: 0
- Command: npm test
  - Status: PASS
  - Exit code: 0
  - Duration ms: 7442
  - stdout sha256: 6deac35b8496378e127d0cbf7f583012dc1ea879a596213e7b5eec2321335aa7
  - stderr sha256: 71e39658d13abb6d6189edf49c8d891f2a62febe9819575f0c064d7d9431b424
  - stdout bytes: 10742
  - stderr bytes: 2506
- Command: python3 .harness/tools/validate.py --mode manual
  - Status: PASS
  - Exit code: 0
  - Duration ms: 4771
  - stdout sha256: 6c59683a7a976eb4bd19afef7210544d9e3b1a2eaadca30992fc648e11f973e9
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 424
  - stderr bytes: 0

### Product verification
- none

### Manual verification
- none
<!-- VERIFICATION-EVIDENCE:END -->

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.

`PROJECT RECONCILE` 2026-10-12 согласовал Mutation policy с обязательным application wiring и обновлением lockfile по ADR-001/012; причина остановки предыдущего `STEP RUN STEP-021` устранена на уровне контракта. [Audit](../audits/AUDIT-20261012T083615Z.md) сохраняет источники и историю блокировки. Реализация не выполнялась; Ready-план и независимое review остаются обязательными.


## Blocker / Failure reason

—
