---
schema: 1
id: STEP-048
status: completed
type: bugfix
priority: critical
phase: core
depends_on:
  - STEP-009
  - STEP-017
  - STEP-018
  - STEP-023
requirements:
  - REQ-004
  - REQ-026
adrs:
  - ADR-002
  - ADR-006
architecture_refs:
  - "docs/architecture.md#основные-потоки"
  - "docs/architecture.md#основные-компоненты-границы"
risk_flags:
  - external-integration
plan:
  status: ready
  revision: 1
  context_basis: sha256:5259117fa018b48b6f697785793c585e46b5e584ef843a4b0d3ca7cd2da15ff8
  content_hash: sha256:8f55610b4295a34b76c21db21333950e8b08fcbed10c3565ec056cb08e694168
  reviewed_report: planning/plan-reviews/STEP-048/PLAN-REVIEW-20261011T193815Z.md
  planned_at: 2026-10-11T19:38:15+00:00
  execution_groups:
  context_components:
    - "ADR@ADR-002=sha256:9603d7e711e02ee4bc36d447b5397e944f34d00f15a3d773c4fec36cce4e4d17"
    - "ADR@ADR-006=sha256:792115c4604a81dfd2d62950958470e1c1f1bad2b2f18e873d5743b9f9dc443d"
    - "ARCH@docs/architecture.md#основные-компоненты-границы=sha256:fbdabff4c712b9793cdefe9ef7f14d27253ce04e554c0e2e1ab730cb5bfb5a91"
    - "ARCH@docs/architecture.md#основные-потоки=sha256:e7842c107b39127d5776d5575d975efcf69df8d05024b630a938e1dc510e7575"
    - "PRN@PRN-001=sha256:3b3801f207fafc3f77272f0e93570258a6d006964839d93a276accd814d548af"
    - "PRN@PRN-002=sha256:f29ee3fbdb9cf65cf9739d0907768bbf192ad88b8e443110d4d82f81c6b79ecb"
    - "PRN@PRN-003=sha256:16516d7d302fecda5f7615f9d55e29e04b588d671f8660640e1f61d1619e4ef8"
    - "REQ@REQ-004=sha256:0ebb58f4b7ce2c424b53147885d2e5d1d352ad3ebc3510fa267574f9d6edbb6a"
    - "REQ@REQ-026=sha256:a45c0df64b9f89d0b955afb6c39461cdc7e02b087fa1240edf41e51929df349e"
    - "STEP@STEP-009=sha256:eb191ddce635810bb63fbeddbdf905bc7796ff7a6e9fe3ccf0055393c7ca3cc3"
    - "STEP@STEP-017=sha256:74d947c3ddfeab0bcb7930439ff7161e2273ea240add13300da208e9725b7245"
    - "STEP@STEP-018=sha256:ef554746f2dd587e4003775194675c6948f4b905d548119bfb60e491e7ec4659"
    - "STEP@STEP-023=sha256:ad2af19f30b86b848e544b51df1cf514bf763224978a8c2c18f1ec40a1c141f2"
    - "STEP@STEP-048=sha256:5dfe6362d197bd4182ec88ef88b78930a959cb78b0dcf642a181dc1ec2f4feda"
---

# STEP-048 — Поддерживаемый размер обложки при загрузке

## Goal

Устранить подтверждённый HTTP 404 обложки при штатном download: размер по умолчанию передаётся через MusicProvider и поддерживается ресурсом реального контрольного трека.

## Context

Диагностика STEP-019 2026-10-11: после успешной авторизации metadata и variants возвращают HTTP 200, но обложка трека 2224197 в размере 500x500 возвращает HTTP 404. Та же обложка в размерах 200x200, 400x400 и 600x600 возвращает HTTP 200 с image MIME. Production `fetchPublicArtwork` отдельно воспроизводит DOWNLOAD_ERROR при size=500. Downloader pipeline использует `artworkSize ?? 500` для cache key и provider.fetchArtwork; отказ происходит в resolving до variant.selected и audio stream.

Отдельного corrective STEP по этому дефекту нет. STEP-019 разрешает изменять только CLI, а STEP-021 владеет будущим тегированием и cover.jpg; их scope не подходит для исправления значения по умолчанию в downloader. Новый product contract или architecture decision не требуется.

## Scope

- Заменить размер обложки по умолчанию на подтверждённый 400, использовать одно эффективное значение для cache key и provider.fetchArtwork.
- Сохранить явный DownloadManagerOptions.artworkSize: передавать его без подмены или скрытых fallback/retry.
- Добавить regression proof на уровне настоящего DownloadManager: provider отклоняет 500, принимает 400; job завершается, общая обложка запрашивается один раз. Проверить передачу явного размера.
- Повторить собранный реальный CLI download контрольного трека и зафиксировать результат загрузки обложки, итог job, exit code и конечные файлы без секретов.

## Mutation policy

### Allowed

- `packages/core/downloader/src/pipeline.ts` — только эффективный размер обложки, согласованный cache key и краткий комментарий о причине.
- `packages/core/downloader/src/manager.test.ts` — регрессионные сценарии default/explicit size и однократного получения общей обложки.
- Evidence текущего STEP и deterministic projections.

### Conditional

- Нет.

### Forbidden

- Изменения MusicProvider/shared DTO, provider production-кода, application/CLI, REQ/Accepted ADR/OQ semantics, dependencies/lockfile/CI.
- Прямой HTTP/CDN доступ из core, Yandex-specific URL/host/SDK в core.
- Fallback по hosts/размерам, скрытые повторы, подавление ошибки обложки или её отключение ради PASS.
- Исправление иных ошибок реального download и реализация будущего STEP-021/025/026.

## Out of scope

- Запись тегов/встроенной обложки/cover.jpg; это STEP-021.
- Исходный SERVICE_UNAVAILABLE авторизации, диагностика doctor и изменение retry/error contracts.
- Общая capability discovery размеров для любых ресурсов/provider; наблюдение одного ресурса не считается универсальной гарантией CDN.
- Завершение STEP-019: его полная Verification и независимый REVIEW остаются у владельца CLI.

## Acceptance criteria

- Без явного artworkSize DownloadManager запрашивает обложку через MusicProvider ровно с size=400; cache key использует тот же размер.
- Regression provider, возвращающий DOWNLOAD_ERROR для 500 и bytes для 400, позволяет job из нескольких треков с общей обложкой завершиться с completed; fetchArtwork вызван один раз.
- Явный artworkSize=600 передаётся provider без изменения; дефолт его не подменяет.
- В реальном CLI-прогоне трека 2224197 штатный запрос обложки 400x400 получает HTTP 200 с image MIME и проходит стадию resolving. Итог download и exit code зафиксированы отдельно; иной отказ не объявляется успешной загрузкой и не исправляется за пределами scope.
- Core остаётся provider-neutral; ошибка реально отсутствующей обложки и retry budget сохраняют действующие контракты.

## Verification

- command: `yarn test packages/core/downloader`
- command: `yarn lint`
- command: `yarn typecheck`
- command: `yarn test`
- command: `yarn build`
- command: `yarn format:check`
- command: `python3 .harness/tools/validate.py --mode manual`
- manual: Выполнить собранный реальный CLI download трека 2224197 с --quality normal в новый временный каталог и системным secure storage; подтвердить HTTP 200/image для штатной обложки 400x400 и прохождение resolving, зафиксировать безопасную команду, итог job, exit code и конечные файлы. При ином отказе отделить его от исправленного 404, без ложного успешного download.

## Deliverables

- Исправленный default size/cache key, regression tests, безопасное live evidence и независимый PASS review.

## Implementation plan

### 1. Единый эффективный размер в resolving

- В packages/core/downloader/src/pipeline.ts вычислять effective artworkSize один раз как options.artworkSize ?? 400 и использовать его в cacheKey и provider.fetchArtwork. Исходное 500 вызывает воспроизведённый HTTP 404; 400 подтверждён live probe контрольного ресурса.
- Сохранить explicit override, существующий ArtworkRef/provider API, cache/dedup, lifecycle и retry/error semantics. Не вводить fallback или Yandex URL/SDK в core.
- Добавить короткий русский комментарий с @link на planning/tasks/STEP-048.md, объясняющий воспроизведённый отказ размера 500.

**Files:**
- packages/core/downloader/src/pipeline.ts

**Tests:**
- Regression настоящего DownloadManager с default400/explicit600 в следующем пункте

**Risks:**
- 400 подтверждён для контрольного ресурса, а не всех ресурсов/provider; новый discovery/fallback не входит в scope.

### 2. Регрессия default, override и dedup через DownloadManager

- В manager.test.ts использовать existing managerFixture с несколькими треками и общей обложкой. Обернуть provider.fetchArtwork: size500 даёт DownloadError как воспроизведённый отказ, size400 возвращает исходные fixture bytes. Проверить completed всех треков, вызванный размер400 и один fetchArtwork. Старый default500 должен ломать этот сценарий.
- Отдельный explicit artworkSize600 scenario проверяет передачу600, completed и один запрос общей обложки; не расширять fixture production контракты.
- H-001 из validated Semantic Blast Radius: command yarn test packages/core/downloader обязан доказать успешный default, сохранение explicit override и dedup. Это proof obligation по воспроизведённому отказу, а не повод менять API/cache persistence.

**Files:**
- packages/core/downloader/src/manager.test.ts

**Tests:**
- yarn test packages/core/downloader

### 3. Canonical проверки и реальный CLI прогон

- Выполнить все автоматические Verification, не изменяя чужие dirty files и не расширяя scope по новым unrelated ошибкам. Сборка реального CLI использует existing реализации STEP-019/018.
- Через штатный системный secure storage запустить node apps/cli/dist/index.js download https://music.yandex.ru/track/2224197 --quality normal --output <новый /tmp каталог> --json. При sandbox отказе штатной записи запросить разрешённое исполнение вне ограничения.
- Диагностический fetch observer из /tmp может фиксировать только stage/status/image MIME и выбранный size400 без headers/body/credentials/challenge/signed URL; он не подменяет response, provider или core. Подтвердить HTTP200/image штатной обложки400 и прохождение resolving; отдельно записать реальный terminal status/exit code/размер и наличие final files.
- Иной отказ audio или validation классифицировать как отдельное наблюдение без ложного successful download и без out-of-scope исправления. Evidence текущего STEP, затем independent review; STEP-019 не закрывать в рамках этого RUN.

**Files:**
- planning/tasks/STEP-048.md

**Tests:**
- yarn test packages/core/downloader
- yarn lint
- yarn typecheck
- yarn test
- yarn build
- yarn format:check
- python3 .harness/tools/validate.py --mode manual
- Выполнить собранный реальный CLI download трека 2224197 с --quality normal в новый временный каталог и системным secure storage; подтвердить HTTP 200/image для штатной обложки 400x400 и прохождение resolving, зафиксировать безопасную команду, итог job, exit code и конечные файлы. При ином отказе отделить его от исправленного 404, без ложного успешного download.

**Risks:**
- Сессия авторизации и remote CDN могут измениться; отсутствие live evidence нельзя заменить mock PASS.

## Evidence


<!-- VERIFICATION-EVIDENCE:START -->
- Verification run: 2026-10-11T19:42:39Z
- Status: PASS
- Automated resumed: false
- Git head: a448cb4a4e1daf01d6a0cd75159f387639bcbd14
- Worktree hash: sha256:c56f6732f0f8ae81130e9ce992c041b670b956cc2ed43d7cd3b51c8f3917d16a
- Verification contract basis: sha256:0453554ba6615c5134f144d4ad1dc6c528f20404c60a1e981e9d58bf8ce180dd
- Subject git head: a448cb4a4e1daf01d6a0cd75159f387639bcbd14
- Subject worktree hash: sha256:acb218b9b1ed8b9ac38d21ef39bd97fe04c8eeecd5ef9e3325aacc078713b045

### Automated verification
- Command: yarn test packages/core/downloader
  - Status: PASS
  - Exit code: 0
  - Duration ms: 1516
  - stdout sha256: da7b9c4b499be7de3773297e761a8e378f055f977469cacf576250d9ff0a4286
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 828
  - stderr bytes: 0
- Command: yarn lint
  - Status: PASS
  - Exit code: 0
  - Duration ms: 7424
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
  - Duration ms: 7284
  - stdout sha256: a4a530820c3b6bc98a4919114b1af7eb785c662fb908ba112b8287885a12636a
  - stderr sha256: e859c1952dfb6daf3c3acc46769dc0fd38f826bd85334c2700470ba3cd398d52
  - stdout bytes: 9982
  - stderr bytes: 2506
- Command: yarn build
  - Status: PASS
  - Exit code: 0
  - Duration ms: 364
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 0
  - stderr bytes: 0
- Command: yarn format:check
  - Status: PASS
  - Exit code: 0
  - Duration ms: 2717
  - stdout sha256: 17aa973d3f004560237d9a95171210b0671deff23d61628eecf7322ff5938f20
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 66
  - stderr bytes: 0
- Command: python3 .harness/tools/validate.py --mode manual
  - Status: PASS
  - Exit code: 0
  - Duration ms: 4369
  - stdout sha256: d63e32db48a602aaf059ac3afe2292c7af5e5bcc62c63399e2a775a785fd20d0
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 482
  - stderr bytes: 0

### Product verification
- none

### Manual verification
- Check: Выполнить собранный реальный CLI download трека 2224197 с --quality normal в новый временный каталог и системным secure storage; подтвердить HTTP 200/image для штатной обложки 400x400 и прохождение resolving, зафиксировать безопасную команду, итог job, exit code и конечные файлы. При ином отказе отделить его от исправленного 404, без ложного успешного download.
  - Status: PASS
  - Observed: "Реальный CLI command: node --import /tmp/step048-live/fetch-observer.mjs apps/cli/dist/index.js download https://music.yandex.ru/track/2224197 --quality normal --output /tmp/step048-live/audio --json. Exit 0. Observer passthrough: artwork size400 HTTP200 image=true, вариант выбран и resolving пройден, audio HTTP206 после штатного308. Native keyring прочитан новым процессом без providerOverride. Job e750d356-1fd3-485c-b0f5-ae9054893ca2: единственный track completed, один итоговый MP3 5650599 bytes, .part отсутствуют; 356 NDJSON records. Secrets/challenge/signed URL не записаны. Фактические observations /tmp/step048-live; имитации HTTP/provider не было."
<!-- VERIFICATION-EVIDENCE:END -->

- Источник: STEP-019, раздел «Диагностика реального прогона после подтверждения входа»; job 85d6ec12-4a21-41cd-8101-1cf5b2aeec1e, track failed/DOWNLOAD_ERROR, exit 3. Production helper size=500 воспроизвёл HTTP 404; bounded read-only проверки того же ресурса при 200/400/600 дали HTTP 200/image. Диагностические observations — `/tmp/yandex-auth-diagnostic-20261011`; credentials/challenge не сохранялись.


## Blocker / Failure reason

—
