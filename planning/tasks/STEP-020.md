---
schema: 1
id: STEP-020
status: completed
type: adr
priority: high
phase: hardening
depends_on:
  - STEP-005
requirements:
  - REQ-025
  - REQ-016
adrs:
  - ADR-012
  - ADR-013
architecture_refs:
  - docs/architecture.md#external-dependencies-integrations
  - docs/architecture.md#deployment-runtime-assumptions
risk_flags:
  - architecture
plan:
  status: ready
  revision: 2
  context_basis: sha256:89a1e38d948bfffee4471966585dff7a7e725f5255ae76af0df2671fefe43208
  content_hash: sha256:59cddbab19f4e692a01dedb76ef96e4af76af9549da9539c46a945e968348ecc
  reviewed_report: planning/plan-reviews/STEP-020/PLAN-REVIEW-20261011T123349Z.md
  planned_at: 2026-10-11T12:33:50+00:00
  execution_groups:
  context_components:
    - "ADR@ADR-012=sha256:c1dc292dd753c367e90518672d4327e99aeaec3fdf7c681c090aa20e9e37f32f"
    - "ADR@ADR-013=sha256:fc94cb5f3c15f98c6ebddfdbbd51ea299cec970fb2ab8531b30fcdc2231ae8f0"
    - "ARCH@docs/architecture.md#deployment-runtime-assumptions=sha256:f301a436e0abeaf7aea31bffa46d170a9cde3219fb7d566834b3eb3ae57ac85a"
    - "ARCH@docs/architecture.md#external-dependencies-integrations=sha256:745b40d80b739a59467e156c30b839f7fb6c0cca9f347619f6856d1757324b1c"
    - "OQ@OQ-002=sha256:34d9adc4ff319cabf941aba6007a69ba6893fcf5783e9d66e89e7a73f0de2f15"
    - "PRN@PRN-001=sha256:3b3801f207fafc3f77272f0e93570258a6d006964839d93a276accd814d548af"
    - "PRN@PRN-002=sha256:f29ee3fbdb9cf65cf9739d0907768bbf192ad88b8e443110d4d82f81c6b79ecb"
    - "PRN@PRN-003=sha256:16516d7d302fecda5f7615f9d55e29e04b588d671f8660640e1f61d1619e4ef8"
    - "REQ@REQ-016=sha256:8c9328e7124607f8d857913ec6b4d446c9aa533d81ff65fd005e84e1d741567e"
    - "REQ@REQ-025=sha256:c1e745fbbe50cf4e86da643d69f86c422ecfd29d15127b8a0dd58c6eeecb4095"
    - "STEP@STEP-005=sha256:cb280369edd87e0a4560c9e2d78ddba902bebde1a9c1d20699cf193946b6838c"
    - "STEP@STEP-020=sha256:9911e952c1dfc7566739aa866a4077b4f4db6ea4f054b4d39866aebde24f97ef"
---

# STEP-020 — ADR: библиотека метаданных и использование FFmpeg

## Goal

Выбрать по результатам технического spike Node.js-библиотеку записи тегов/обложек и определить роль FFmpeg; закрыть OQ-004 и OQ-005.

## Context

Контейнеры/кодеки определены OQ-002 (STEP-005). Brief требует выбор библиотеки отдельным ADR после spike.

## Scope

- Сравнить кандидатов на реальных файлах (контейнеры из evidence): корректность Unicode, обложки, надёжность.
- ADR «Audio metadata library» и ADR «FFmpeg usage» (опциональность, bundled или нет).
- Проверить запись тегов с явным указанием контейнера (временный файл `*.part` без расширения формата).
- Перевести OQ-004 и OQ-005 в `resolved`/`deferred`.

## Mutation policy

### Allowed

- `docs/adr/**`, `docs/research/**`, `docs/open-questions/**`, одноразовые spike-скрипты вне `packages/**`.

### Conditional

- Нет.

### Forbidden

- Production-код в `packages/**`.
- Реализация future/unrelated STEP «заодно».

## Out of scope

- Реализация записи тегов (STEP-021).

## Acceptance criteria

- ADR accepted и ссылаются на результаты сравнения на реальных контейнерах.
- OQ-004 и OQ-005 имеют Resolution либо обоснованный `deferred`.
- Выбранная библиотека пишет теги по явному контейнеру, а не по расширению `.part`.
- Решение сохраняет FFmpeg опциональной зависимостью либо явно обосновывает иное через ADR.

## Verification

- command: `node docs/research/audio-metadata-spike/run.mjs --verify`
- command: `python3 .harness/tools/validate.py --mode manual`
- manual: Сверить два accepted ADR с матрицей сравнительного отчёта на полных физических файлах, версиями кандидатов и results.json; каждый обязательный tag/artwork/container критерий имеет независимое чтение. MP3 bytes и API-only AAC/FLAC-in-MP4 не смешаны; локальные образцы не объявлены evidence provider transport.
- manual: Проверить Resolution/deferred OQ-004/OQ-005 и handoff STEP-021/023/025/035: explicit-container .part и отсутствие обязательного FFmpeg/ffprobe; product runtime/doctor/duration tolerance/packaging не реализованы и не заявлены готовыми. PRN-001/002/003 и неизменность Accepted ADR соблюдены.

## Deliverables

- ADR, отчёт сравнения.

## Implementation plan

### 1. Зафиксировать матрицу сравнения и границы evidence

- В docs/research/audio-metadata-spike.md описать baseline Node.js >=22.13.0 <25 / ESM, ownership STEP-021 (MetadataWriter) и STEP-023 (validation и допуск duration), ограничения ADR-004/011 и PRN-001/002/003. Production packages, root dependency graph и существующие Accepted ADR не менять.
- На этапе выполнения найти кандидатов по актуальной первичной документации и сравнить минимум два доступных подхода записи тегов/обложки. Сохранить версии, лицензии, поддержку контейнеров и явного формата, Node/ESM, внешние binaries/native dependencies и стоимость установки. Не выбирать победителя по одному README.
- Из OQ-002 взять MP3 как формат с bytes evidence; aac-mp4 и flac-mp4 отмечать API-only до отдельного подтверждения физических файлов. MP4-контейнер и содержащийся codec учитывать раздельно; не добавлять Ogg/Opus/raw FLAC автоматически по открытому string AudioContainer.
- Задать обязательные критерии: все поля REQ-025, кириллица, точная встроенная обложка, корректный .part+явный контейнер, читаемый аудиопоток и работа без FFmpeg. Отсутствие выполнения критерия фиксировать как ограничение/отказ, а не PASS.

**Files:**
- docs/research/audio-metadata-spike.md

**Risks:**
- API-only сведения не подтверждают контейнер полного локального файла; выбор библиотеки остаётся результатом spike.

### 2. Подготовить воспроизводимый одноразовый spike на реальных файлах

- Создать docs/research/audio-metadata-spike/run.mjs и описание запуска; исследовательские зависимости изолировать от packages и корневых package.json/yarn.lock, закрепить версии в описании. Временные входы/копии и скачанные dependencies держать в .harness/local/** либо временном каталоге, в evidence сохранять только безопасные результаты.
- Подготовить полные физические audio fixtures для MP3 и отдельно исследовать AAC-in-MP4 / FLAC-in-MP4, с подтверждённым контейнером/codec, размером, хэшем, происхождением и условиями повторения. Допустимы самостоятельно созданные/разрешённые локальные образцы; они доказывают библиотеку, но не поддержку Yandex transport. Префикс STEP-005 не считать полным файлом.
- При использовании provider-контента ограничиться вариантами с подтверждённой доступностью текущему аккаунту; не реализовывать transport/расшифровку STEP-010 в spike и не сохранять секреты или signed URL. Недоступность provider-sample не подменять обещанием его поддержки.
- В corpus задать исходный альбом, отличающийся от названия playlist, все поля TITLE/ARTIST/ALBUM/ALBUMARTIST/TRACK/DISC/DATE или YEAR/GENRE, кириллицу, несколько артистов, отсутствующее optional поле и исходную обложку с известным хэшем. Объект входа опирать на provider-neutral shared metadata; сведения ALBUMARTIST/DATE, отсутствующие в текущем Track, явно отметить как требования к mapping STEP-021 без изменения shared типов.
- Для каждого образца использовать отдельную копию с суффиксом .part без расширения формата и передать контейнер явно. Spike обязан различать результаты по candidates/containers, недоступные образцы и ошибки и завершаться ненулевым кодом при невыполнении обязательств выбранного решения.

**Files:**
- docs/research/audio-metadata-spike/run.mjs
- docs/research/audio-metadata-spike.md

**Tests:**
- Воспроизводимая подготовка реальных полных файлов и безопасного corpus; byte/container provenance отдельно от API metadata.

### 3. Выполнить сравнение и проверить критические предпосылки H-001/H-002

- Для каждого кандидата на подготовленных копиях выполнить запись тегов и обложки с явным container; независимой от writer библиотекой/утилитой прочитать все поля и сравнить с ожидаемыми значениями, включая кириллицу, исходный ALBUM для playlist и отсутствие optional поля без пустой заглушки.
- Извлечь встроенную обложку независимым reader и сверить хэш исходных байтов. Проверить, что после тегирования формат/codec распознаются, длительность и аудиосодержимое не изменены; precision reader документировать без выбора production duration tolerance STEP-023.
- Для выбранного writer запустить проверку в отдельном процессе, где FFmpeg и ffprobe недоступны всем используемым путям обнаружения; подтвердить .part round-trip и минимальное распознавание/чтение duration независимым средством без этих бинарников. Зафиксировать фактические external dependencies; FFmpeg для подготовки fixture либо дополнительного диагностического чтения не считать runtime-зависимостью baseline.
- Документировать наблюдаемый способ изменения .part (in-place/внутренний временный файл), завершение/закрытие операции и известные ошибки, не вводя recovery-механику соседних STEP. Если появляется неподтверждённый риск прерывания, сначала ограниченный эксперимент на расходной копии подтверждает/опровергает preconditions; сама гипотеза не становится production работой или блокером.
- Реализовать режим node docs/research/audio-metadata-spike/run.mjs --verify: фактически повторяет checks для выбранного решения на заявленной матрице, проверяет .part explicit container, field/artwork equality, пригодность аудио и FFmpeg-absent baseline; сравнение минимум двух подходов фиксирует в отчёте. Полученные наблюдения хранить в docs/research/audio-metadata-spike/results.json и отчёте с командами, exit codes, версиями и ограничениями; summary отличать от буквального captured output.

**Files:**
- docs/research/audio-metadata-spike/run.mjs
- docs/research/audio-metadata-spike/results.json
- docs/research/audio-metadata-spike.md

**Tests:**
- H-001: explicit container + .part, independent Unicode/tag/artwork round-trip.
- H-002: выбранный путь и базовое распознавание без FFmpeg/ffprobe.

### 4. Принять два ADR по результатам исследования

- Создать новые ADR «Audio metadata library» и «FFmpeg usage» по действующему ADR workflow с уникальными незанятыми ID. ADR accepted ссылаются на фактический сравнительный отчёт/версии и описывают alternatives, последствия, ограничения, native/runtime dependencies, лицензии, compatibility и эксплуатацию на целевых ОС; проведённые проверки отделить от неподтверждённых платформенных обещаний.
- В metadata ADR выбрать доказанный writer и явный список проверенных контейнеров/codec combinations; зафиксировать explicit-container .part API, mapping обязательных тегов и обложки, источник album metadata, missing optional policy и известные ограничения. Непроверенные AAC/FLAC MP4 не объявлять поддержанными; для контейнера без проходящего решения не подменять Acceptance исключением из матрицы, а зафиксировать blocker выполнения и варианты дальнейшего решения.
- FFmpeg ADR сохраняет опциональность REQ-016: загрузка и базовая валидация без FFmpeg/ffprobe. Решение о bundled/system/отложенном bundling обосновать наблюдениями, лицензией, размером и целевыми ОС, не реализуя packaging STEP-035 и не делая бинарник обязательным из-за удобства writer.
- Указать handoff: STEP-021 реализует MetadataWriter с явными container/полученными artwork bytes, без сети в processing; STEP-023 реализует validation и выбирает tolerance; STEP-025 реализует doctor optional/not installed. Сохранить порядок ADR-004 до атомарного rename и shared границы ADR-011. Runtime migrations/API/manifest changes и транскодирование не входят в STEP-020.

**Files:**
- docs/adr/**
- docs/research/audio-metadata-spike.md

**Risks:**
- Если победителя с обязательными критериями нет, STEP-020 не объявляется завершённым; deferred OQ не заменяет выбор writer для STEP-021.

### 5. Закрыть owning OQ и оформить handoff без соседней реализации

- Записать Resolution OQ-004/OQ-005 с прямыми ссылками на новые ADR и результаты spike; resolved только при доказанном решении. Обоснованный deferred допустим для действительно нерешённого остаточного вопроса с причиной/владельцем, но не вместо выбранного writer либо решения об optional baseline.
- В ADR/отчёте явно перечислить последствия для STEP-021/023/025/035 и ограничения поддерживаемых контейнеров; не менять чужие STEP, packages, Accepted ADR или расширять product contract. Пересобрать проекции через sync-projections.py.
- Выполнить --verify и validator. Semantic проверкой подтвердить, что обе Acceptance ADR имеют accepted status и ссылки на реальные сравнения, OQ имеют решения/deferred обоснование, секреты не попали в evidence, а платформенные пробелы не выданы за доказательство. Сохранить Evidence выполнения по действующему workflow; independent review остаётся обязательным перед completed.

**Files:**
- docs/open-questions/OQ-004-metadata-lib.md
- docs/open-questions/OQ-005-ffmpeg.md
- docs/adr/**
- docs/research/audio-metadata-spike.md

**Tests:**
- Повторное выполнение spike verify и canonical validation; semantic проверка ADR/OQ/границ evidence.

## Evidence

<!-- VERIFICATION-EVIDENCE:START -->
- Verification run: 2026-10-11T12:34:06Z
- Status: PASS
- Automated resumed: false
- Git head: bd1a70afe569e7b26b302a422c6483e1ef0a2731
- Worktree hash: sha256:6d4b039918bdf110f8e08ba4e4939e377bd390a48c321524be7ecd706d25a38f
- Verification contract basis: sha256:70343b207586c5ea5a5b6552d3ecb0b0b130f85c16c09382fb91ba010b913504
- Subject git head: bd1a70afe569e7b26b302a422c6483e1ef0a2731
- Subject worktree hash: sha256:4962fc8a61f1a390489995f7b25309f28e93b41fa5582bcf0eed3018f23e7c30

### Automated verification
- Command: node docs/research/audio-metadata-spike/run.mjs --verify
  - Status: PASS
  - Exit code: 0
  - Duration ms: 214
  - stdout sha256: 721e76bb70cc209c3fb17eeb745668ed8be1364d61d523665cc0f75c0356708a
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 85
  - stderr bytes: 0
- Command: python3 .harness/tools/validate.py --mode manual
  - Status: PASS
  - Exit code: 0
  - Duration ms: 3968
  - stdout sha256: 100e9aadbbe31723cca50ba707ed4c3150f684bc2f8c8d7ab1d28f0593460d45
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 482
  - stderr bytes: 0

### Product verification
- none

### Manual verification
- Check: Сверить два accepted ADR с матрицей сравнительного отчёта на полных физических файлах, версиями кандидатов и results.json; каждый обязательный tag/artwork/container критерий имеет независимое чтение. MP3 bytes и API-only AAC/FLAC-in-MP4 не смешаны; локальные образцы не объявлены evidence provider transport.
  - Status: PASS
  - Observed: "ADR-012/013 accepted и ссылаются на docs/research/audio-metadata-spike.md/results.json. Проверены полные локальные MP3/AAC-MP4/FLAC-MP4 с hashes/provenance; taglib-wasm 1.5.3 и node-id3 0.2.9 реально сравнивались, music-metadata 12.1.0 независимо прочитал все обязательные поля и точные artwork bytes. Восемь roundtrips, восемь PCM равенств, Node22.13/24.21 PASS. MP4 transport остался API-only по OQ002; местные синтетические samples не выданы за provider bytes."
- Check: Проверить Resolution/deferred OQ-004/OQ-005 и handoff STEP-021/023/025/035: explicit-container .part и отсутствие обязательного FFmpeg/ffprobe; product runtime/doctor/duration tolerance/packaging не реализованы и не заявлены готовыми. PRN-001/002/003 и неизменность Accepted ADR соблюдены.
  - Status: PASS
  - Observed: "OQ004/005 resolved с прямыми ADR/evidence ссылками. ADR012 требует explicit-container adapter со сверкой bytes до mutation, buffer API без filename; ADR013 сохраняет optional system FFmpeg/ffprobe и baseline без bundling. Handoff STEP021/023/025/035 оставляет production writer, doctor, tolerance и packaging будущим владельцам. packages/root dependency graph и исторические accepted ADR не менялись; spike не использует provider network/SDK/секреты и соблюдает PRN001/002/003."
<!-- VERIFICATION-EVIDENCE:END -->

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.

## Blocker / Failure reason

—
