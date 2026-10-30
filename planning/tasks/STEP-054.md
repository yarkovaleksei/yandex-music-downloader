---
schema: 1
id: STEP-054
status: in_progress
type: implementation
priority: medium
phase: packaging
depends_on:
  - STEP-034
  - STEP-035
  - STEP-036
  - STEP-055
  - STEP-056
requirements:
  - REQ-041
  - REQ-045
  - REQ-053
  - REQ-054
  - REQ-055
adrs:
  - ADR-014
  - ADR-019
architecture_refs:
  - docs/architecture.md#deployment-runtime-assumptions
architecture_outputs:
  - docs/architecture.md#deployment-runtime-assumptions
risk_flags:
  - release-critical
plan:
  status: ready
  revision: 1
  context_basis: sha256:ad1bb3e39399df2d497cb64d694dbb9d5b8944d12e182b4ad0f08dd6d051b74c
  content_hash: sha256:65eb6f3d9859590ff4e05b6b0b9426f304ecc33a928f60c0a9d479f6d0d9f41b
  reviewed_report: planning/plan-reviews/STEP-054/PLAN-REVIEW-20261029T145024Z.md
  planned_at: 2026-10-29T14:50:24+00:00
  execution_groups:
  context_components:
    - "ADR@ADR-014=sha256:d21dd58fd7f4167a6b4820ba1f26624fcf440fb7a3f9fdc926e1ec517a969f39"
    - "ADR@ADR-019=sha256:661497200e97275c9243a5f4b2594b02b1d04a026a4c6c9a65f4dc6f95dc3a7b"
    - "ARCH@docs/architecture.md#deployment-runtime-assumptions=sha256:fc520397c4d2e3737c000cc225b7b76b4ec3aef0d626169e608e2954cab41cf9"
    - "PRN@PRN-001=sha256:3b3801f207fafc3f77272f0e93570258a6d006964839d93a276accd814d548af"
    - "PRN@PRN-002=sha256:f29ee3fbdb9cf65cf9739d0907768bbf192ad88b8e443110d4d82f81c6b79ecb"
    - "PRN@PRN-003=sha256:16516d7d302fecda5f7615f9d55e29e04b588d671f8660640e1f61d1619e4ef8"
    - "REQ@REQ-041=sha256:9bf3b9b0e777a7ea641d1c30aa8ff4a4d136e153b36b16b04646f620bfac5e26"
    - "REQ@REQ-045=sha256:bcce7a91d3ddbbe2d627053444661ea5d8e9b81a56e82bc782da6893b5cd2d14"
    - "REQ@REQ-053=sha256:e414b6c6c3b5fc1dd9095197481b3bc06b830c09f0fbfbd027664dc9429020e2"
    - "REQ@REQ-054=sha256:cac9146dfd5cb7bc77561948b30922e2d3889af95e407677b6a29b11db05c5e8"
    - "REQ@REQ-055=sha256:6fcaaa85d4dadbe69925aee6e390a667230b85c7d929dd2fd45671480f989737"
    - "STEP@STEP-034=sha256:f98281769eb8b764301012e5e694c9e29aefef92a2ff8a66fb920a38b448b6c9"
    - "STEP@STEP-035=sha256:cadec965a839e71c9ae2deecd781e2399c37531dfc66abe017c88b2586ed6f05"
    - "STEP@STEP-036=sha256:9ce7a5f5a64a3109c8857f00d1c362f0af392516eafd394cc54af0c2093b8087"
    - "STEP@STEP-054=sha256:62b1be7959d5b5f5544359cb1db007f03f136662c6dd8e2de1298d0fabb64659"
    - "STEP@STEP-055=sha256:1ba8f049c5d77437da5b80d5a8615a2678c23b53ad9dcc64e41afb6b0eaa7780"
    - "STEP@STEP-056=sha256:d980488ba2ce34154dfc84dd7835a427f62b0da0b1285364577efe3d9033571b"
---

# STEP-054 — Финальная проверка готового приложения на Windows и macOS

## Goal

После всей разработки и упаковки единым финальным прогоном подтвердить готовые Linux-сборки на Windows x64 и macOS arm64/x64.

## Context

Решение владельца от 2026-10-29: передача архивов другу через облако и получение отчётов слишком дороги по времени. Все новые Windows/macOS проверки отложены на самый последний STEP. До него обязательны только локальные Linux-проверки; CI не требуется. Старые PASS/FAIL сохраняются без переоценки. Прежний план отдельной x64 проверки устарел; новый PLAN составляется только после STEP-034/035/036. Любая новая разработка должна завершиться до этого финального прогона и быть добавлена в depends_on.

Решение владельца от 2026-10-29: «исправь критерий в скрипте и документации и засчитай Windows PASS по текущим отчётам. Повторный прогон Windows не нужен». Наличие системных Node.js/FFmpeg не препятствует приёмке Windows/macOS: требуется использование встроенных runtime по абсолютным путям без необходимости устанавливать системные инструменты. `externalTools` и `cleanEnvironment` сохраняются как справочные метаданные.

Исключение по решению владельца от 2026-10-29: STEP-058 реализует переносимые UI-функции и соответствие макетам и не является prerequisite STEP-054. STEP-054 может завершиться независимо от STEP-058; его нативные отчёты относятся к проверенным revision/build ID, а не автоматически к будущей UI-сборке. Повторные Windows/macOS прогоны не требуются для завершения STEP-058; новые платформенные интеграции в его scope запрещены.

## Scope

- Единый набор готовых артефактов Windows x64, macOS arm64/x64, собранных только на Linux, с revision/build ID и хешами.
- Распаковка portable-пакета на целевой ОС, запуск интерфейса и полный офлайновый Electron E2E без авторизации и гостевой сборки, без необходимости устанавливать системные Node.js/FFmpeg, с использованием встроенных runtime по абсолютным путям.
- Проверка собственной подписи descriptor и portable-обновления N → N+1 на Windows/macOS по принятому packaging ADR.
- Сохранение raw отчётов, архитектуры runtime/CPU и признака Rosetta; диагностика невыясненного x64 пустого окна до заявления PASS.

## Mutation policy

### Allowed

- `docs/development.md` — инструкции итоговой платформенной проверки.
- `docs/architecture.md#deployment-runtime-assumptions` — фактический результат финальной платформенной проверки с сохранением ограничений и исторических отказов.
- `apps/desktop/e2e/**` — финальный сценарий, диагностика и нативное Evidence.
- `apps/desktop/scripts/**` — Linux-подготовка готовых проверочных артефактов.

### Conditional

- Точечные исправления подтверждённых финальной проверкой дефектов desktop/packaging: только после фиксации воспроизведения и нового STEP PLAN с явными файлами, тестами и документационными outputs.

### Forbidden

- Сборка приложения или E2E host на Windows/macOS.
- Изменение CI workflows, требования CI-приёмки, секреты в отчётах/репозитории.
- Неподтверждённое hardening и unrelated функции.

## Out of scope

- Разработка portable-упаковки и проверки обновлений до завершения STEP-034/035/036.
- Live provider и личный аккаунт для офлайнового E2E.

## Acceptance criteria

- Все предшествующие этапы разработки и упаковки завершены; финальные артефакты собраны на Linux и совпадают с manifest по хешам.
- На Windows x64 и macOS arm64/x64 готовое portable-приложение запускается без установщика и, открывает интерфейс и проходит офлайновый Electron E2E; файл и та же история сохраняются после перезапуска, гостевая компиляция отсутствует.
- Собственная подпись descriptor и ручное portable-обновление N → N+1 проверены на Windows/macOS по принятому ADR.
- Evidence содержит revision/build ID, appArtifactHash, ОС, process.arch, CPU/Rosetta, команды, raw результаты и сведения о файле/истории. Старые FAIL не скрыты; Linux или прежние CI-логи не подменяют новый native PASS.
- При отсутствии требуемой платформы финальная приёмка остаётся pending; промежуточные STEP из-за этого не блокируются, готовность релиза не заявляется.

## Verification

- command: `python3 .harness/tools/validate.py --mode manual`
- command: `node apps/desktop/scripts/final-kit.mjs --check`
- command: `node apps/desktop/scripts/final-kit.mjs --verify`
- manual: На Windows x64 и macOS arm64/x64 распаковать финальные Linux-built наборы: проверить хеши, запуск portable N, offline E2E с файлом/историей после restart без компиляции и без необходимости устанавливать системные Node.js/FFmpeg, с использованием встроенных runtime по абсолютным путям; проверить Ed25519 descriptor, скачать N+1, заменить приложение вручную и подтвердить UI/общий stateDir/историю/файл; сохранить raw отчёты revision/buildId/appArtifactHash/OS/process.arch/CPU/Rosetta и причинные журналы прежнего x64 пустого окна. Нет доступа или невыясненный отказ — PENDING, не PASS.
- manual: Проверить соответствие docs/development.md и docs/architecture.md#deployment-runtime-assumptions фактическим наборам/отчётам; отсутствие новых native отчётов, production feed и исторический macOS x64 FAIL не скрыты.

## Deliverables

- Единый финальный проверочный набор и инструкция.
- Реальные Windows/macOS отчёты portable-запуска, E2E, проверки подлинности и обновления.
- `docs/architecture.md#deployment-runtime-assumptions` — подтверждённое состояние нативной приёмки; отсутствие отчёта не превращается в заявление готовности.

## Implementation plan

### 1. Подготовить единый финальный набор на Linux

- Переиспользовать Linux packaging 0.0.0 и 0.0.1 для Windows x64/macOS arm64/x64; сверить актуальные inputs manifest, версии и hashes до упаковки. Готовить только local версии без публикации/тега.
- Добавить final-kit.mjs: Linux-only builder включает готовые portable N/N+1, Node runtime целевой архитектуры, stock Electron для отдельного offline E2E, production closure и заранее собранный на Linux E2E host. Не включать compiler/esbuild или приватный ключ.
- Создать manifest с revision/build ID/appArtifactHash, builtOn, guestBuildAllowed=false, хешами файлов и архивов; --verify проверяет готовые наборы и подтверждает H-001 на Linux в пределах статической проверки. Native выполнимость остаётся manual.

**Files:**
- apps/desktop/scripts/final-kit.mjs
- apps/desktop/e2e/prepare.mjs

**Tests:**
- node apps/desktop/scripts/final-kit.mjs --check
- node apps/desktop/scripts/final-kit.mjs --verify

### 2. Добавить запуск и причинную диагностику на целевых ОС

- Добавить bundled runtime launcher и final-check.mjs, который сверяет manifest до/после, записывает OS/process.arch/CPU/Rosetta, raw результаты и версии без гостевого build.
- Переиспользовать полный UI offline сценарий download.spec с настоящими IPC/host/SQLite и проверкой файла/истории после restart. prepare динамически импортирует esbuild только в Linux developer flow, готовый guest flow копирует prebuilt host.
- Сохранять Electron main/renderer/preload/load/crash журналы и screenshot при ошибке: сначала получить причину x64 пустого окна, затем отдельный PLAN для подтверждённого production дефекта. Не менять GPU/security flags/таймауты как предполагаемое исправление.
- Отдельно проверять запуск настоящих shipping portable N/N+1: automation E2E bootstrap не выдавать за доказательство shipping entrypoint.

**Files:**
- apps/desktop/e2e/final-check.mjs
- apps/desktop/e2e/main.mjs
- apps/desktop/e2e/download.spec.mjs
- apps/desktop/e2e/prepare.mjs

### 3. Проверить подписанный portable N → N+1 и сохранить инструкцию

- На Linux создать временный отдельный Ed25519 fixture ключ и подписанные точные descriptors по target/version/HTTPS URL/size/SHA-256; в набор включить только публичный ключ/подпись. Для offline native проверки использовать fixture transport production PortableUpdates, не менять production trust/feed.
- Финальный native runner сохраняет raw проверку/скачивание N+1 через production service, отклонение повреждённой подписи/пакета и отсутствие автоматического запуска. Пользователь закрывает N и вручную заменяет portable файлы; runner фиксирует запуск N+1 и сохранность общего состояния. H-002 требует реальной native проверки.
- Описать распаковку, однократные команды, manual replacement, возврат raw отчётов и ограничения в docs/development.md. При отсутствии целевой ОС подготовить наборы и оставить native приёмку PENDING, не запрашивая повторные прежние архивы.
- Обновить только docs/architecture.md#deployment-runtime-assumptions по фактическому Evidence; сохранить historical FAIL и отсутствие production feed.

**Files:**
- apps/desktop/e2e/final-check.mjs
- apps/desktop/scripts/final-kit.mjs
- docs/development.md
- docs/architecture.md#deployment-runtime-assumptions
- apps/desktop/e2e/evidence/STEP-054/README.md

## Evidence


<!-- VERIFICATION-EVIDENCE:START -->
- Verification run: 2026-10-29T15:31:34Z
- Status: MANUAL_REQUIRED
- Automated resumed: false
- Verification mode: full
- Incremental executed checks: 3
- Incremental reused checks: 0
- Targeted feedback reused: 0
- Incremental fallback reason: RISK_REQUIRES_FULL
- Git head: 94fa63b4dbbc9ae40b2e18c850c8e986df1d6d62
- Worktree hash: sha256:25250a94ffc2d0483ec707cc882c50426d6924eac64a294f5af9a01ce48660a7
- Verification contract basis: sha256:bae9d3dfbedf842ace7bc22c5ce8f765bb2ac5d45cb676f5a3e78e44a4d5146b
- Verification context basis: sha256:5955fe13466de3e4138b5a8928fff74bc60b9833dd64a512fa1ec8f862fcd4df
- Subject git head: 94fa63b4dbbc9ae40b2e18c850c8e986df1d6d62
- Subject worktree hash: sha256:0277a202bf0fbc6fd5d6305bf995da9953105db2d7a33e3712bcc66f718d3102
- Subject content hash: sha256:7fcb4270fe3f2f2417b4f4c45c6139797fe0eaed3390ec81ebe5a0afedb856c9

### Automated verification
- Command: python3 .harness/tools/validate.py --mode manual
  - Status: PASS
  - Exit code: 0
  - Duration ms: 5673
  - stdout sha256: 5294452764c063c13151482165591264350027fb0bacc09d730a433f53eaf52f
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 67
  - stderr bytes: 0
  - Provenance: executed
- Command: node apps/desktop/scripts/final-kit.mjs --check
  - Status: PASS
  - Exit code: 0
  - Duration ms: 164
  - stdout sha256: 4feadbe4fcfa7ac41d3ea26b568aa20ebbcb7fae00ce705629727562a3507f7c
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 130
  - stderr bytes: 0
  - Provenance: executed
- Command: node apps/desktop/scripts/final-kit.mjs --verify
  - Status: PASS
  - Exit code: 0
  - Duration ms: 104748
  - stdout sha256: 7d3254cd7c268452d44a30a3683cf4fbb797d9d0f1f2ddefa1e24c65905cf13a
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 391
  - stderr bytes: 0
  - Provenance: executed

### Product verification
- none

### Manual verification
- Check: Проверить соответствие docs/development.md и docs/architecture.md#deployment-runtime-assumptions фактическим наборам/отчётам; отсутствие новых native отчётов, production feed и исторический macOS x64 FAIL не скрыты.
  - Status: PASS
  - Observed: "Сверены docs/development.md, docs/architecture.md#deployment-runtime-assumptions и apps/desktop/e2e/evidence/STEP-054/README.md с manifest buildId 20261029T152446475Z-94fa63b4 и scripts. Описаны реальные N/N+1, prebuilt host, отдельный fixture trust, отсутствие production feed и новых native отчётов. Исторический macOS x64 FAIL сохранён."
- Check: На Windows x64 и macOS arm64/x64 распаковать финальные Linux-built наборы: проверить хеши, запуск portable N, offline E2E с файлом/историей после restart без установленного Node.js/FFmpeg и компиляции; проверить Ed25519 descriptor, скачать N+1, заменить приложение вручную и подтвердить UI/общий stateDir/историю/файл; сохранить raw отчёты revision/buildId/appArtifactHash/OS/process.arch/CPU/Rosetta и причинные журналы прежнего x64 пустого окна. Нет доступа или невыясненный отказ — PENDING, не PASS.
  - Status: PENDING
<!-- VERIFICATION-EVIDENCE:END -->

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.

### Историческая блокировка CI

2026-10-16: изменение `ci.yml` опубликовано в [PR #30](https://github.com/yarkovaleksei/yandex-music-downloader/pull/30), но GitHub не запустил Windows/macOS jobs: «recent account payments have failed or your spending limit needs to be increased» (run 38926508109). Владелец восстановит биллинг не раньше 2026-11-07; manual Verification (прогон CI) отложена до этого. По решению владельца STEP-029 подтверждает платформы ручным прогоном и от STEP-054 больше не зависит.

### Подготовка повторной x64 проверки 2026-10-29

Неизменённый Linux-built ZIP `music-downloader-ready-darwin-x64-9f44abe6.zip`, 307 758 376 байт, проверен: CRC PASS; SHA-256 `a51db9c902766933f21d435278a684ff4b7bc5eed52349b192415deb60ffb61a`; все 342 productionFiles совпадают с текущими dist/package. appArtifactHash `7b37871db2ad5c2e8a2acfb020b2e57a048b70d470ed6a7b38f70baff9221f39`, build ID `20261029T093752Z-9f44abe6`, builtOn linux/x64, guestBuildAllowed=false. Гостевой prepare только копирует dist/prebuilt-host.js, компилятора не вызывает.

Инструкция `docs/development.md#локальная-проверка-macos-x64-step-054` описывает офлайновый сценарий без авторизации и гостевой сборки, существующие переменные журналирования и сохранение raw PASS/FAIL с данными CPU/runtime. Архив и копия инструкции предоставляются в `/home/user/Документы/vbox_shared/Mac-x64-STEP-054/`. Это доставка прежнего проверенного по целостности набора, а не исправление прежнего отказа.

Исходный FAIL: `apps/desktop/e2e/evidence/native-20261029/darwin-x64/report.json`, SHA-256 проверяется по provenance; Electron не показал поле URL за 15 с. Причина не установлена. Нового x64 PASS в общей папке нет; свежий reports.zip содержит только arm64. Нативный x64 результат остаётся pending. Критическое H-001 сохраняется: локальная валидация подтверждает структуру артефактов, а native Acceptance требует отдельного реального отчёта.

### Диагностика прежнего x64 отказа по требованию владельца

2026-10-29: владелец отклонил повторную выдачу неизменённого падающего архива и потребовал установить причину до следующей проверки. Старый архив не является исправлением. Исходные x64 console.log/error-context.md подтверждают успешный electron.launch и отказ первого expect поля «Ссылка на музыку» через 15 с; сценарий ещё не дошёл до preview/download. В предоставленном отчёте нет renderer/pageerror, preload-error, did-fail-load, render-process-gone или main stderr, поэтому первопричина пустого окна не установлена.

Дополнительная read-only проверка: все 274 упакованных файла Electron, включая типы symlinks и executable flags, совпали с official electron-v45.0.0-darwin-x64.zip. Node/Electron/better-sqlite3/keyring имеют Mach-O64 CPU x86_64. Это исключает обнаруженную подмену архитектур и повреждение Electron при упаковке, но не доказывает работу на Mac. Локальный Linux startup probe с обработчиками main/renderer/load/preload errors открыл music-downloader://app/index.html и получил desktopApi; Linux результат не перенесён в macOS PASS.

Production-код, параметры безопасности, GPU flags и таймауты не менялись: конкретного подтверждённого дефекта в них пока нет. Нужен доступ к Mac для сбора причинного журнала; владельцу задан вопрос о SSH, ответ пока не получен. Новая сборка как исправленная не выдаётся.


### Перенос по решению владельца

2026-10-29: отдельные проверки x64 и новые Windows/macOS прогоны отложены до самого последнего STEP после разработки/упаковки. Прежние ошибки и диагностические сведения выше сохранены как история; новых прогонов у владельца/друга сейчас не требуется.

### Финальный набор 2026-10-29

План revision 1 прошёл независимый planning-review. Предшествующая разработка и упаковка завершены; подготовлены три финальных Linux-built ZIP с build ID `20261029T152446475Z-94fa63b4` для Windows x64 и macOS arm64/x64. Общий manifest, точные хеши, Linux E2E и диагностические результаты сохранены в [Evidence STEP-054](../../apps/desktop/e2e/evidence/STEP-054/README.md). Переиспользованная portable N сохраняет исходный packaging revision отдельно от revision набора; актуальность входов проверяется по хешам.

Наборы содержат готовые N/N+1, целевые runtime и Linux-built offline host; гостевая компиляция не требуется. Подпись проверяется отдельной тестовой fixture без приватного ключа в архиве; production trust/feed не настраивались. Владелец выбрал проверить целевые ОС позже. Эти материалы не являются новым Windows/macOS PASS или исправлением исторического macOS x64 FAIL.


### Новый Windows x64 отчёт 2026-10-29

Сохранены raw [before.json](../../apps/desktop/e2e/evidence/STEP-054/native-win32-x64-20261029/before.json), [after.json](../../apps/desktop/e2e/evidence/STEP-054/native-win32-x64-20261029/after.json) и [provenance.json](../../apps/desktop/e2e/evidence/STEP-054/native-win32-x64-20261029/provenance.json). Build ID `20261029T152446475Z-94fa63b4`, revision `94fa63b4dbbc9ae40b2e18c850c8e986df1d6d62`; Windows `10.0.26200`, `process.arch=x64`, без гостевой сборки. Функциональный результат PASS: shipping 0.0.0/0.0.1 с готовым UI; полный E2E `1 passed (15.7s)`, MP3 50 785 байт и тот же job в History после restart. Ручная замена подтверждена (`CONFIRMED_BY_USER`), `fileAndHistoryPreserved=true`, integrity до/после PASS. Production PortableUpdates с отдельной fixture проверил корректный пакет и отказ неверных подписи/размера/SHA-256; SHA-256 скачанного N+1 `04403b2a578626154a061cb39e28e97967c56076c61c62eaf432a83df35083e5` совпал с финальным manifest.

Нативная приёмка Windows x64 — **PASS** по текущим отчётам, без повторного прогона: [acceptance.json](../../apps/desktop/e2e/evidence/STEP-054/native-win32-x64-20261029/acceptance.json) фиксирует решение владельца, SHA-256 источников и проверку встроенных runtime по абсолютным путям. В исходных raw сохранено `nativeAcceptance=PENDING` из-за ошибочного прежнего критерия наличия системного Node.js. В PATH найден `C:\Program Files\nodejs\node.exe`, FFmpeg не найден; `cleanEnvironment=false` и `externalTools` — справочные метаданные. Raw и generated Verification Evidence выше не изменены. Новых macOS arm64/x64 отчётов нет; исторический x64 FAIL сохраняется.


## Blocker / Failure reason

Предшествующие STEP-034/035/036/055/056 завершены. Windows x64 принят с результатом PASS по текущим отчётам и решению владельца, без повторного прогона. Наличие системного Node.js не является blocker: команды используют встроенные runtime по абсолютным путям. Для macOS arm64/x64 нужны новые raw отчёты финальных наборов; их приёмка остаётся PENDING, исторический macOS x64 FAIL не объявляется исправленным. STEP остаётся открытым. Уточнение контракта владельцем требует обновления Ready plan/fingerprint при будущем resume; persisted plan и generated Verification Evidence здесь не пересматриваются.
