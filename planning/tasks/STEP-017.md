---
schema: 1
id: STEP-017
status: completed
type: implementation
priority: critical
phase: core
depends_on:
  - STEP-016
  - STEP-010
  - STEP-004
  - STEP-014
  - STEP-013
  - STEP-015
requirements:
  - REQ-017
  - REQ-018
  - REQ-019
  - REQ-015
  - REQ-036
  - REQ-020
  - REQ-024
  - REQ-026
  - REQ-014
  - REQ-003
adrs:
  - ADR-006
  - ADR-004
  - ADR-007
architecture_refs:
  - "docs/architecture.md#основные-компоненты-границы"
  - "docs/architecture.md#основные-потоки"
  - docs/architecture.md#reliability-observability
risk_flags:
  - concurrency
  - performance-critical
plan:
  status: ready
  revision: 1
  context_basis: sha256:77c20ca292db3489298c354b4b28eb6aa7fed23b4ee64a9b156895a5527d7217
  content_hash: sha256:1e61d20f9db76564e9af23dc6c85c42858539202010a20445b048a950f1465b2
  reviewed_report: planning/plan-reviews/STEP-017/PLAN-REVIEW-20261011T054016Z.md
  planned_at: 2026-10-11T05:40:16+00:00
  execution_groups:
  context_components:
    - "ADR@ADR-004=sha256:4ad987cbdefdf1409c52fd01994ccca0d6941fad8ae0126d435745f3e727ca08"
    - "ADR@ADR-006=sha256:792115c4604a81dfd2d62950958470e1c1f1bad2b2f18e873d5743b9f9dc443d"
    - "ADR@ADR-007=sha256:04d6b08c651797508a14cb298d43f539d5364b851981d6d9064800f288b6b42c"
    - "ARCH@docs/architecture.md#reliability-observability=sha256:a9c337102c2ed62fdaca7173e8e2c05ffe6d68a1d99140fe986a552b3cc636d4"
    - "ARCH@docs/architecture.md#основные-компоненты-границы=sha256:fbdabff4c712b9793cdefe9ef7f14d27253ce04e554c0e2e1ab730cb5bfb5a91"
    - "ARCH@docs/architecture.md#основные-потоки=sha256:e7842c107b39127d5776d5575d975efcf69df8d05024b630a938e1dc510e7575"
    - "OQ@OQ-009=sha256:8a6b1f2a309a07d634f989fd2e1b428d059691e00b54ad76c096743ab98eb8c2"
    - "PRN@PRN-001=sha256:3b3801f207fafc3f77272f0e93570258a6d006964839d93a276accd814d548af"
    - "PRN@PRN-002=sha256:f29ee3fbdb9cf65cf9739d0907768bbf192ad88b8e443110d4d82f81c6b79ecb"
    - "PRN@PRN-003=sha256:16516d7d302fecda5f7615f9d55e29e04b588d671f8660640e1f61d1619e4ef8"
    - "REQ@REQ-003=sha256:42d546ded1413585e1802a22330255b27299822fa66238583a5f86f6a35e3036"
    - "REQ@REQ-014=sha256:b345f1c0fd577276b7130cbf59e8de0433c99252667bc3ff3fb74749e808688e"
    - "REQ@REQ-015=sha256:154edca0807abb77d56c39b6e708659307f97ac6e851e0c33869c6d4c9b6ba59"
    - "REQ@REQ-017=sha256:d5edc8e72418dda2a839250cfd22e9be6d86d1eb25f1ef2c33fc73c67d9204bb"
    - "REQ@REQ-018=sha256:b17f1d948a0dd108437921d109862e5028ab32ec52e3ab5c8396c6a355640d55"
    - "REQ@REQ-019=sha256:1ae6ea987eee7ec6b138d0fb6bd7f292fbba6b219d9f088ef49c210f3181e56c"
    - "REQ@REQ-020=sha256:93b4e91c7b271606530f1bafa07000f04d26e338e032ded633ab019958ec92dc"
    - "REQ@REQ-024=sha256:db58f69677b462e41432055aef95868b73d7f4ef035b5d1ce797a25521d5701c"
    - "REQ@REQ-026=sha256:a45c0df64b9f89d0b955afb6c39461cdc7e02b087fa1240edf41e51929df349e"
    - "REQ@REQ-036=sha256:adc3026190b4b6714c911cbabcc7284ff56c2b2ed04372dd3ee6104a24945631"
    - "STEP@STEP-004=sha256:eeb3c1c0af282136ed1585f49e27773d6cf44db8d5f02d4271138dc0fafdf4e7"
    - "STEP@STEP-010=sha256:6fed6a2d97223ed471806457a7e90cbc9a4abaaedf94d476c7e4ba385da09425"
    - "STEP@STEP-013=sha256:549833df7b4ba273e58be9c29bc7b5213b51d2ccee139f9bd50b0403403da557"
    - "STEP@STEP-014=sha256:1ab3c2db93b38e61bae7b8a5cdf72e8e4b29368a570697b137411e647af9a259"
    - "STEP@STEP-015=sha256:3aba0387696f8552692c27d3f61bdd34e950556e7dc7f3c74f7f2c39e44990ca"
    - "STEP@STEP-016=sha256:5e6164a15320a1fef677cd4fbd9a40772ae4686105e1790ffeebaa9051b036fb"
    - "STEP@STEP-017=sha256:509f5ab8681390665db84b7d7a68790684ee22ca0a38128d38c313aa1012b539"
---

# STEP-017 — Download Manager: очередь, concurrency и управление

## Goal

Реализовать Download Manager с очередью, ограничением параллелизма, pause/resume/cancel/retry, событиями прогресса и обновлением истёкших ссылок.

## Context

OQ-008/OQ-009 влияют на обновление ссылок и безопасные значения concurrency.

## Scope

- Очередь и пул воркеров (default 4, диапазон 1–8).
- Оркестрация: resolving (включая безопасное получение artwork) → variant selection → download → processing через интерфейсы; transient-ошибка artwork использует retry `resolving` по ADR-006.
- Pause/resume/cancel/retry по ADR-006; AbortSignal.
- Публикация progress/observability событий.
- Повторный запрос потока при `STREAM_EXPIRED` в пределах maxAttempts.
- Владение job через аренду manifest; применение control-запросов других процессов; SIGINT = `pause` job: активные треки в `paused`, шаги `resolving`/`processing` дожидаются с таймаутом; глобальные non-retryable ошибки ставят job на паузу с причиной.
- Общий лимит concurrency на экземпляр приложения; обработка состояния `skipped`.

## Mutation policy

### Allowed

- `packages/core/downloader/**`, `packages/core/queue/**`, тесты.

### Conditional

- Нет.

### Forbidden

- Прямые обращения к Yandex API, CLI/UI, запись тегов и m3u8.
- Реализация future/unrelated STEP «заодно».

## Out of scope

- Метаданные, m3u8, validation (STEP-021..023).

## Acceptance criteria

- Тест с 20 mock-треками и concurrency=3 подтверждает не более 3 одновременных загрузок.
- Cancel удаляет `.part`, pause сохраняет; retry перезапускает только failed.
- Истёкшая ссылка обновляется через повторный `openAudioStream` без бесконечного цикла.
- Progress-события монотонны; speed/ETA отсутствуют при недостатке данных.
- Значения concurrency вне 1–8 отвергаются; лимит общий для всех job экземпляра.
- SIGINT оставляет `.part` и manifest в состоянии, из которого `resume` продолжает работу; control-запрос `cancel` от другого процесса применяется владельцем всегда, даже при частой записи прогресса; `resume` живого `running` job отклоняется ошибкой.
- При `control=paused` треки в `retry_wait` не возобновляются после backoff.

## Verification

- command: `yarn lint`
- command: `yarn typecheck`
- command: `yarn test --project @music-downloader/core-downloader --project @music-downloader/core-queue`
- command: `yarn test --project @music-downloader/application`
- command: `yarn test`
- command: `python3 .harness/tools/validate.py --mode manual`

## Deliverables

- Download Manager и тесты на mock provider.

## Implementation plan

### 1. Задать узкие seams Download Manager и очередь экземпляра

- Реализовать manager factory с отдельным состоянием экземпляра и job; принимать MusicProvider/ManifestStore и узкие structural ports для scheduler, retry decision, quality selection, recovery, filesystem и checkpoint. Использовать существующие exports downloader/state напрямую; не копировать алгоритмы соседних пакетов. Сборку конкретных реализаций оставить createApplication в STEP-018 по ADR-007.
- Сохранить production dependencies на shared: новые package imports, root yarn.lock и изменения чужих tsconfig/package.json не нужны. Local ports описывают только реальные вызовы, без универсального pipeline framework; runtime hooks и AudioStream не сериализовать.
- Реализовать общий scheduler всех job одного manager: default=4, целое 1..8, ValidationError для 0/9/дробных/non-finite; считать слот на весь активный track flow resolving→processing, освобождать на terminal/pause/retry_wait. Перед получением слота и началом каждой фазы проверять свежий control; queued/ready/retry_wait paused job не стартуют.

**Files:**
- packages/core/downloader/src/manager.ts
- packages/core/downloader/src/ports.ts
- packages/core/downloader/src/index.ts
- packages/core/queue/src/index.ts
- packages/core/queue/src/scheduler.ts

**Tests:**
- 20 mock-треков, concurrency=3: все завершены, peak active<=3; два одновременно работающих job разделяют один бюджет; default=4 и границы 1/8, отказ 0/9 и нецелым.

### 2. Сделать owner-сессию и управление job последовательными

- Acquire выполнять через внедрённый openRecoveredJob/recovery callback до любых provider/filesystem действий. Хранить актуальную session.manifest, сериализовать read-modify-save всех треков job, переходы и coalesced progress; ни один callback не сохраняет устаревший snapshot. Heartbeat и независимый polling consumeControls работают весь период владения, включая paused/retry_wait.
- Применить матрицу ADR-004: running живого владельца отклоняет resume; прочие команды живому владельцу отправляются sendControl и ждут waitControlAck с конечным таймаутом (default 5000 ms). Если собственной owner-session нет, читать job и пробовать acquire; занятая аренда означает отправку control, свободная — recovery+применение команды владельцем. Не определять lease liveness по одному control.state.
- Команды преобразовывать существующими transitionJobControl/resumeJob/transitionTrack/aggregateJobStatus. Retry переводит только failed→queued, не меняет control и не трогает completed/skipped/cancelled. Cancel имеет высший приоритет; receipt публиковать после durable применения, без прямой записи manifest не-владельцем.
- Control намерение немедленно останавливает scheduling и отменяет доступный stream; persistent переходы и ack сериализуются с filesystem checkpoint. Не держать общий manifest mutex на протяжении сетевой загрузки или ожидания backoff.

**Files:**
- packages/core/downloader/src/job-owner.ts
- packages/core/downloader/src/control.ts

**Tests:**
- Owner/remote command matrix, resume running rejection без изменения part/manifest; retry failed-only; paused retry_wait не стартует после backoff; progress другой track не затирает status/control.

### 3. Связать resolving, artwork, качество и bounded retry

- По immutable plan работать с trackKey позиции, а не trackId. Не открывать stream для unavailable/unknown metadata; подтверждать доступность через provider.getTrack и фактические варианты. QualityUnavailableError/TrackUnavailableError завершает только соответствующий трек.
- Resolving получает metadata, variants и artwork, выбирает variant через внедрённый existing quality resolver. Дедуплицировать fetchArtwork по artwork key/size в пределах job, включая in-flight Promise: 12 общих обложек дают один успешный запрос. Отклонённый cache entry удалить; transient failure идёт resolving→retry_wait, не в processing.
- На каждой неудачной попытке обновлять attempts/history/error, вызвать existing decideRetry с injected clock/random и maxAttempts default=5. STREAM_EXPIRED повторяет openAudioStream в том же общем бюджете, без автоматического refresh auth и без сохранения URL. Таймер backoff возвращает только разрешённую retryPhase после повторной проверки control; processing не получает сетевой retry.
- AUTH_ERROR/DISK_FULL/PERMISSION_DENIED сохраняет failed первого затронутого track, control=paused и причину; прекращает запуск остальных и согласованно останавливает их активные streams. Перед AUTH_REQUIRED-resume проверить успешный getAccount; requeue только pauseTrackKey по auth_resume, остальные failed не трогать.

**Files:**
- packages/core/downloader/src/resolve.ts
- packages/core/downloader/src/attempts.ts
- packages/core/downloader/src/artwork.ts

**Tests:**
- Expired stream один раз→успех, постоянный STREAM_EXPIRED→failed на maxAttempts; retries/history и отсутствие auth replay; AUTH_REQUIRED last-track pause и selective resume; artwork single-fetch и resolving retry; non-retryable isolated/global errors.

### 4. Оркестрировать part, Range и checkpoint финализации

- До openAudioStream проверять итоговый файл через injected inspectExisting+validate hook: valid default→skipped с resultPath, invalid→replacement через уникальный part, overwrite сохраняет старый файл до commit. Построение пути и уникального part получать existing filesystem seam; запрещено писать один part для двух позиций/job.
- Открывать provider stream с signal/offset. Range допускается только для untagged partial с совпавшими variantKey/expectedSize и подтверждёнными acceptsRanges/startOffset/полным contentLength. Связать existing prepareRangeCandidate с writer через adapter; несовместимый suffix закрыть, reopenAtZero без обхода maxAttempts для STREAM_EXPIRED.
- При pause/cancel остановить reader и дождаться close/flush: pause оставляет canonical prefix, cancel удаляет все part/candidate этого трека. Adapter Range должен сохранить реально полученный prefix при прерывании candidate и нормализовать actual size в partial; помеченный tagged part перезапускается с нуля. Не менять implementation соседнего range/writer.
- Processing получает готовую artwork, явный container и injected validation/metadata hooks без сетевого I/O; реализации STEP-021/023 и m3u8 вне scope. Использовать finalizeWithManifestCheckpoint через owned adapter, сериализуя его snapshot/save критическую секцию с остальными save данного job, включая progress и controls. До rename повторно проверить cancel/pause намерение; после выполненного rename фиксировать completed независимо от cancel.
- Не держать serialized save lane при скачивании. Существующий checkpoint helper захватывает processing snapshot: adapter не допускает interleaving с другими save до окончания processing/rename; bounded stop устанавливает control intent сразу, persistent ack выполняется после согласованной финализации.
- Сохранить completed|skipped результат filesystem.finalizePart в result-aware local seam: поздний skip-existing не выдаётся за rename/completed. Callback rename существующего checkpoint helper используется только при фактическом rename; skipped ветка получает явный state transition и resultPath без фиктивного commit. Проверить этот стык отдельным интеграционным case.

**Files:**
- packages/core/downloader/src/download.ts
- packages/core/downloader/src/processing.ts

**Tests:**
- Real temporary files: pause сохраняет prefix, cancel удаляет part/candidate и прекращает чтение; Range append/restart/tagged cases; skipped без stream; failed overwrite сохраняет прежний файл; параллельные треки не затирают snapshots; cancel до/после rename и rename-gap recovery.
- Файл появился после предварительной проверки: finalizePart→skipped остаётся skipped, а void checkpoint callback не превращает его в completed.

### 5. Реализовать ограниченную остановку и безопасное продолжение

- Дать host-facing manager.pause/shutdown seam: SIGINT host вызывает его в STEP-018/019; process signal handler и CLI здесь не создавать. Job control=paused сохраняется до остановки streams, downloading→paused; retry_wait downloading также paused, resolving retry_wait остаётся ожидающим при paused control.
- Для resolving дождаться текущего шага до ready, для processing — согласованного результата/commit; не добавлять невозможные resolving/processing→paused переходы. Quiescence deadline default=5000 ms с injectable clock: успешная остановка сохраняет всё и разрешает release только после завершения owned operations, flush и pending saves.
- Если resolving/processing/owned save не завершился за deadline, вернуть безопасную диагностируемую ошибку остановки и не вызвать session.release. Живой процесс продолжает подтверждать аренду до окончания своей работы; после завершения процесса recovery доступен только по существующему stale lease protocol.
- При новом захвате использовать recovery существующего STEP-016, completed/skipped обходить, failed запускать лишь retry либо selective AUTH_REQUIRED. Для released paused track с partial использовать resume→downloading и заново открыть provider stream по безопасному variantKey.

**Files:**
- packages/core/downloader/src/shutdown.ts
- packages/core/downloader/src/control.ts

**Tests:**
- Paused job агрегируется paused даже на последнем треке; managed SIGINT-pause через core seam; hanging resolving/processing timeout без ложного release; crash subprocess и resume завершают только pending.

### 6. Публиковать достоверные progress и lifecycle events

- Использовать существующий JobEvent envelope: schemaVersion=1, jobId, trackKey/trackId, единый монотонный seq на job, durationMs для observability. Emit через injected safe publisher/redactor, нормализовать ошибки; исключить raw provider data, tokens и signed URL из events/manifest.
- Зафиксировать owned события track.started→variant.selected→download.started→download.completed; processing hooks подтверждают metadata.written/validation.completed только после фактического успешного действия. Job created/entity/plan события принадлежат application до manager start, а manager получает publisher/sequence source для общего порядка; интеграционный test harness воспроизводит этот стык без реализации application production.
- Track fraction хранить как high-water mark в рамках выполнения job: при retry/restart не уменьшать, но не сообщать 1 до commit или skipped; actual bytes отражают текущий файл и используются для Range. Job N/total считает completed+skipped; retry уже failed не создаёт ложного уменьшения N.
- Speed измерять по фактическим bytes текущей попытки, minimum window=1000 ms; после pause/retry/restart сбросить окно, до достаточных данных speed/eta отсутствуют. ETA допустима только при известном totalSize и положительной скорости. Progress manifest coalesce=200 ms, каждый state transition и завершение pause принудительно сохраняет актуальные данные; интервалы injectable для deterministic tests.

**Files:**
- packages/core/downloader/src/progress.ts
- packages/core/downloader/src/events.ts

**Tests:**
- Монотонность fraction/seq при retries/restart и повторном trackId на двух позициях; отсутствие speed/eta до окна/при unknown size; event order/duration; canary secrets отсутствуют в captured events/errors/manifest.

### 7. Доказать интеграцию реальными файлами и процессами

- Unit/component tests размещать в downloader/queue. Cross-package integration только тестами в application: существующие FileManifestStore/retry/planner/filesystem/logging/MockMusicProvider связываются test harness через local ports manager; application production и соседние adapters не менять. Fixtures — только test scope.
- Child owner с real FileManifestStore пишет progress; другой процесс sends cancel при частых saves, дождаться receipt и проверить cancelled+удалённый part. Проверить real lease acquire и running-resume rejection, pause/timeout/crash/recovery с actual filesystem, а не только mocked release. SIGINT fixture вызывает тот же core pause seam.
- Перенести обязательства Semantic Blast Radius: H-001 доказывается командой core-downloader/core-queue tests, H-002 — application integration tests. Benchmark не требуется: contract содержит верхнюю границу concurrency и достоверность измерения speed, но не заявляет улучшение throughput/latency; не выводить rate-limit из OQ-009 и не проводить live нагрузку.
- Запустить lint/typecheck/full tests и manual Harness validation, записать fresh Verification на окончательном subject перед IMPLEMENT completion; независимый implementation review остаётся обязательным отдельным шагом. Комментарии новых seams кратко объясняют invariant и ссылаются на ADR/REQ.

**Files:**
- packages/core/downloader/src/**/*.test.ts
- packages/core/queue/src/**/*.test.ts
- packages/application/src/download-manager.integration.test.ts
- packages/application/src/fixtures/download-manager-owner.mjs

**Tests:**
- Обе critical proof-команды должны быть PASS с непустыми целевыми integration cases; полный yarn test ловит регрессии существующих state/recovery/filesystem.

## Evidence




<!-- VERIFICATION-EVIDENCE:START -->
- Verification run: 2026-10-11T06:19:45Z
- Status: PASS
- Automated resumed: false
- Git head: bba79a721498b250270cc7219e7f0aaf2c3fb350
- Worktree hash: sha256:ed8ea74db189abad601c2ea284dd9e3fb39720f80479c2fab701a742db59b959
- Verification contract basis: sha256:c32178a3cd989f8bf569f3b2f5a23882cfc54ea3fcbefe2fcecf5b2ffcf84b37
- Subject git head: bba79a721498b250270cc7219e7f0aaf2c3fb350
- Subject worktree hash: sha256:25a449d33302559e8e7eb326aa657c9c538cbef57d8b825592558cbc0bd253d9

### Automated verification
- Command: yarn lint
  - Status: PASS
  - Exit code: 0
  - Duration ms: 6824
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 0
  - stderr bytes: 0
- Command: yarn typecheck
  - Status: PASS
  - Exit code: 0
  - Duration ms: 2717
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 0
  - stderr bytes: 0
- Command: yarn test --project @music-downloader/core-downloader --project @music-downloader/core-queue
  - Status: PASS
  - Exit code: 0
  - Duration ms: 1421
  - stdout sha256: 2a678bfe273ee26c892146a3ea0a0f5e5b9879f31402d16c914ab13887e60a67
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 883
  - stderr bytes: 0
- Command: yarn test --project @music-downloader/application
  - Status: PASS
  - Exit code: 0
  - Duration ms: 7676
  - stdout sha256: 89462f88cf62253611a488e4441d0b9b00ddeda5b46acb535f832d36bccf15f5
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 1106
  - stderr bytes: 0
- Command: yarn test
  - Status: PASS
  - Exit code: 0
  - Duration ms: 9389
  - stdout sha256: dac80c8cf6f146803c4110f9ebc55310c133927f09faebb212ddab9c2b0688fc
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 7741
  - stderr bytes: 0
- Command: python3 .harness/tools/validate.py --mode manual
  - Status: PASS
  - Exit code: 0
  - Duration ms: 3518
  - stdout sha256: 7003d0fe6f51338cb24728b575f2da56b35e55daa81d23ecd4ce50a39f0cf55d
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
