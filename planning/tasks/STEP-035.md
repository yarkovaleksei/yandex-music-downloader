---
schema: 1
id: STEP-035
status: completed
type: implementation
priority: low
phase: packaging
depends_on:
  - STEP-034
requirements:
  - REQ-054
  - REQ-045
  - REQ-041
adrs:
  - ADR-014
  - ADR-015
  - ADR-018
architecture_refs:
  - docs/architecture.md#deployment-runtime-assumptions
architecture_outputs:
  - docs/architecture.md#deployment-runtime-assumptions
risk_flags:
  - release-critical
plan:
  status: ready
  revision: 2
  context_basis: sha256:6b5a44946aa9cced50f511a895bb531930e5d86f1688c272bf916d0de874cf81
  content_hash: sha256:6455877abe0d096257148088edcbab80c72b5964048677a66ceda58a2bcddc2a
  reviewed_report: planning/plan-reviews/STEP-035/PLAN-REVIEW-20261029T122820Z.md
  planned_at: 2026-10-29T12:28:20+00:00
  execution_groups:
  context_components:
    - "ADR@ADR-014=sha256:d21dd58fd7f4167a6b4820ba1f26624fcf440fb7a3f9fdc926e1ec517a969f39"
    - "ADR@ADR-015=sha256:0fd7f2940c2f6ac5a15eda9b9c9ad7c6a961062d03a4eedd4e3dd03eb8750d53"
    - "ADR@ADR-018=sha256:32ab9694703aaa940cf12d8cea477a712b6185f05a1a5a003778d507f5f9b4ee"
    - "ARCH@docs/architecture.md#deployment-runtime-assumptions=sha256:fc520397c4d2e3737c000cc225b7b76b4ec3aef0d626169e608e2954cab41cf9"
    - "OQ@OQ-005=sha256:adde005210499e79a47d34b2489ba132e01a55a31b89d66254a6496878cd9c63"
    - "PRN@PRN-001=sha256:3b3801f207fafc3f77272f0e93570258a6d006964839d93a276accd814d548af"
    - "PRN@PRN-002=sha256:f29ee3fbdb9cf65cf9739d0907768bbf192ad88b8e443110d4d82f81c6b79ecb"
    - "PRN@PRN-003=sha256:16516d7d302fecda5f7615f9d55e29e04b588d671f8660640e1f61d1619e4ef8"
    - "REQ@REQ-041=sha256:9bf3b9b0e777a7ea641d1c30aa8ff4a4d136e153b36b16b04646f620bfac5e26"
    - "REQ@REQ-045=sha256:bcce7a91d3ddbbe2d627053444661ea5d8e9b81a56e82bc782da6893b5cd2d14"
    - "REQ@REQ-054=sha256:43694c3bffee6a52de253081dbbd6eab790be4ecdd06b8ca729b267b90d40655"
    - "STEP@STEP-034=sha256:f98281769eb8b764301012e5e694c9e29aefef92a2ff8a66fb920a38b448b6c9"
    - "STEP@STEP-035=sha256:a792e536c7cb0280fdd302e9492eac7cbb15cf6d075858ad92857267d5214c3c"
---

# STEP-035 — Локальная сборка дистрибутивов

## Goal

Реализовать сборку дистрибутивов для Windows, macOS и Linux только на Linux-машине.

## Context

Подписание/notarization реализуются отдельным STEP-036.

## Scope

- Конфигурация упаковки и локальные команды сборки.
- Артефакты для Windows x64, macOS arm64/x64, Linux x64.
- Версионирование артефактов по тегу; для одобренной владельцем локальной проверки — версия 0.0.0 без создания Git-тега и публикации.
- Команды, зависимости, проверка состава/fuses и clean Linux smoke; документация фактической готовности упаковки.

## Mutation policy

### Allowed

- `apps/desktop/scripts/**`, `apps/desktop/packaging/**` — упаковка, проверки и clean Linux smoke.
- `apps/desktop/src/packaging/**` — необходимые тесты build-контрактов, без изменения UI/runtime поведения.
- `apps/desktop/src/main/smoke.ts` — только проверочный helper: ожидание видимого UI/кадра, фактические uiReady/isolation и диагностическая ошибка; обычный запуск и бизнес-логика не меняются.
- `package.json`, `apps/desktop/package.json`, `yarn.lock` — exact build-time dependencies и команды.
- `docs/development.md` — команды и раздел локальной упаковки; `docs/architecture.md#deployment-runtime-assumptions` — подтверждённое текущее состояние.
- `apps/desktop/evidence/STEP-035/**` — durable отчёты и screenshots без секретов.

### Conditional

- Нет.

### Forbidden

- Хранение ключей/сертификатов в репозитории.
- Реализация future/unrelated STEP «заодно».

## Out of scope

- Подписание и notarization (STEP-036), автообновление.

## Acceptance criteria

- Локальная сборка на Linux создаёт готовые артефакты для четырёх целей; их состав, архитектуры и версия проверены на Linux. Нативная проверка Windows/macOS передана финальному STEP-054 и не блокирует этот STEP.
- Установка на чистой Linux запускает приложение (Evidence). Установка и запуск Windows/macOS проверяются в финальном STEP-054.
- Версия релизного артефакта соответствует переданному тегу; одобренная локальная сборка использует 0.0.0, явно отмечена как local/unsigned и не заявляет наличие Git-тега или готовность релиза.

## Verification

- command: `npm run lint`
- command: `npm run typecheck`
- command: `npm test`
- command: `npm run build`
- command: `node --test apps/desktop/packaging/packaging.test.mjs`
- command: `npm run package:verify`
- command: `npm run package:smoke -- --check`
- command: `python3 .harness/tools/validate.py --mode manual`
- manual: Установка и запуск на чистой Linux; состав готовых Windows/macOS артефактов проверен на Linux, их нативная приёмка отложена до финального STEP-054.

## Deliverables

- Packaging и локальные команды сборки, четыре артефакта с manifest и контрольными суммами.
- `docs/development.md` — инструкция; `docs/architecture.md#deployment-runtime-assumptions` — подтверждённые возможности и сохранённые ограничения.
- Evidence состава/fuses/версий и clean Linux installation smoke.

## Implementation plan

### 1. Создать production staging и точные Linux build tools

- Закрепить electron-builder26.18.1, @electron/asar3.4.1 и @electron/fuses1.8.0 как build-time tools; добавить команды package:local/package:verify без изменения CI.
- Сформировать staging из desktop dist/package и транзитивной production closure workspace/external dependencies с сохранением loader paths; исключить workspace src/test/fixtures/native-probe, E2E и личное состояние.
- Для каждой цели выбрать target optional dependencies/prebuilds better-sqlite3, keyring и fs-native-extensions с require-addon closure; при отсутствии binary/dependency отказывать до выдачи артефакта.
- Стабильные app/bundle ID, утверждённая жёлтая иконка и лицензии; native libraries вне ASAR. Задания/stateDir/runtime код не менять.

**Files:**
- apps/desktop/scripts/package.mjs
- apps/desktop/packaging/**
- package.json
- yarn.lock

### 2. Собрать четыре локальных unsigned дистрибутива на Linux

- Реализовать явный local режим0.0.0 по решению владельца и отдельный release tag режим с проверкой соответствия реального Git tag/HEAD; не создавать тег и не публиковать.
- Применить shipping fuses ADR015: RunAsNode/NodeOptions/CliInspect off, OnlyLoadAppFromAsar on и EmbeddedIntegrity там где поддержано; штатные средства builder пишут integrity metadata. Проверочный Playwright bootstrap не добавлять в shipping.
- Выполнить настоящую Linux-сборку NSISWindowsx64, AppImageLinuxx64, appZIPdarwinarm64/x64. Официальные targetElectron archives/sha проверяются; Linux binary не подставляется под другой target.
- Сохранить build manifest, local/unsigned markers, production input hashes, версии, размеры и checksum окончательных артефактов. Подпись/updater остаются036, Win/Mac запуск054.

**Files:**
- apps/desktop/scripts/package.mjs
- apps/desktop/packaging/**

### 3. Доказать содержимое артефактов и clean Linux installation smoke

- Реализовать package:verify с проверкой freshness input/output hashes, полного production dependency closure, version/localtag, ASAR main/renderer/preload/host, отсутствия запрещённых fixtures, трёх target native bindings и shipping fuses/integrity metadata для всех четырёх целей (H001/H002).
- Добавить необходимые node:test contract cases: malformed/mismatched tag, missing required dependency и несовместимый native target не получают успешный manifest; optional packages другой ОС пропускаются корректно.
- Исправить подтверждённый ложный PASS captureSmoke: в существующем проверочном режиме дождаться видимого поля URL и отрисованного кадра, записать uiReady и точную ошибку; обычный startup/business logic не менять.
- Выполнить smoke извлечённого AppImage в новом Ubuntu Docker контейнере без Node.js/FFmpeg, с отдельными HOME/state/userData и сетью none. Проверить четыре isolation booleans существующего captureSmoke, видимый интерфейс по screenshot и SQLite/header как дополнительное наблюдение host startup.
- Если контейнер требует --no-sandbox для ОС-процесса, явно ограничить это smoke режимом и записать ограничение; shipping BrowserWindow/fuses не ослаблять. FUSE desktop integration этим извлечённым запуском не доказывается.
- package:smoke --check повторяет executable smoke, записывая только ignored cache; durable PNG/JSON копируются до Verification в обычном режиме.

**Files:**
- apps/desktop/scripts/verify-package.mjs
- apps/desktop/scripts/package-smoke.mjs
- apps/desktop/packaging/packaging.test.mjs
- apps/desktop/packaging/Dockerfile.smoke
- apps/desktop/evidence/STEP-035/**
- apps/desktop/src/main/smoke.ts

### 4. Синхронизировать документацию и завершить Verification/REVIEW

- После фактических четырёх build и smoke обновить docs/development.md команды/локальную упаковку и только deployment/runtime architecture anchor с подтверждёнными возможностями. Сохранить unsignedlocal, отсутствие релизного тега, отложенные036/054 и нерешённый x64 runtime FAIL.
- Зафиксировать durable Evidence без личных данных, пересобрать projections до Verification. Выполнить полный canonical Verification и независимый REVIEW. Если инструменты не создают формат, исправлять конкретную доказанную проблему в scope; не переносить сборку на Mac и не подменять неготовый installer ZIP.

**Files:**
- docs/development.md
- docs/architecture.md#deployment-runtime-assumptions
- planning/tasks/STEP-035.md
- apps/desktop/evidence/STEP-035/**

## Evidence


<!-- VERIFICATION-EVIDENCE:START -->
- Verification run: 2026-10-29T12:42:30Z
- Status: PASS
- Automated resumed: false
- Verification mode: full
- Incremental executed checks: 8
- Incremental reused checks: 0
- Targeted feedback reused: 0
- Incremental fallback reason: RISK_REQUIRES_FULL
- Git head: 32fb8e1aef7d7b78cb90b8ffce508da55f98aa52
- Worktree hash: sha256:26897c91c96aab02e6aa2ff9df242fb7c866deb3031327f8eebf065613613111
- Verification contract basis: sha256:86a3743b9afea6de8e9ef4c275dd7ab12fffc309dee9ec42e12ed6fd665775af
- Verification context basis: sha256:1f906e7ff0e8c6c5f4af85075b5ced0e6504c952f9bdc1cc055c879b5f086f95
- Subject git head: 32fb8e1aef7d7b78cb90b8ffce508da55f98aa52
- Subject worktree hash: sha256:9d6a67ef39153a7e8f9547a429e6ca462c46ff53bfdca30dfcda27c45ed5457c
- Subject content hash: sha256:2c797249dd0970ee9bc08cbe3f64c85d2ae6cfdd97243967bf7253e7f9f5554a

### Automated verification
- Command: npm run lint
  - Status: PASS
  - Exit code: 0
  - Duration ms: 14641
  - stdout sha256: a9abc4bc51d6729860fb000bf87c02e5a80cc830999d05e640c5651c7e3daa6a
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 147
  - stderr bytes: 0
  - Provenance: executed
- Command: npm run typecheck
  - Status: PASS
  - Exit code: 0
  - Duration ms: 7627
  - stdout sha256: 73ad7967b0b62b903e0e14e90a6a3971d720cb1ab6b744714e6d2ef05dd89743
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 83
  - stderr bytes: 0
  - Provenance: executed
- Command: npm test
  - Status: PASS
  - Exit code: 0
  - Duration ms: 39842
  - stdout sha256: 188da72a3c34c59c04ca60d266770eeafc536f494f7447bccb8c80494e12967b
  - stderr sha256: 93652eb79d6e2c699c04c811b10a596c8e64a9f16261ac1509e94f4a57d9ae5c
  - stdout bytes: 16777
  - stderr bytes: 4700
  - Provenance: executed
- Command: npm run build
  - Status: PASS
  - Exit code: 0
  - Duration ms: 664
  - stdout sha256: 4a84685762211c33a9f2ac6336f7b1d29d9e1f9d26373ef0b9a167bf0a587116
  - stderr sha256: 351b524197fb492920789369e7f1a271420c757633fbb553b280a181ac4c31a4
  - stdout bytes: 88
  - stderr bytes: 360
  - Provenance: executed
- Command: node --test apps/desktop/packaging/packaging.test.mjs
  - Status: PASS
  - Exit code: 0
  - Duration ms: 164
  - stdout sha256: 8799724d2fcaff3dfe8a0f5426f05e7e6b4a65e1c6ed12cce6373b786e5369ad
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 774
  - stderr bytes: 0
  - Provenance: executed
- Command: npm run package:verify
  - Status: PASS
  - Exit code: 0
  - Duration ms: 10580
  - stdout sha256: 8d5b0ae635fcc6c7ed14df7c872148bacca6da521e8ceca3b35427cea4697d84
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 372
  - stderr bytes: 0
  - Provenance: executed
- Command: npm run package:smoke -- --check
  - Status: PASS
  - Exit code: 0
  - Duration ms: 1917
  - stdout sha256: 7a4f78dc91887e741d199ba78af6c2e234a58d7aa5befb5f37ff651cb3b01a7b
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 1291
  - stderr bytes: 0
  - Provenance: executed
- Command: python3 .harness/tools/validate.py --mode manual
  - Status: PASS
  - Exit code: 0
  - Duration ms: 5572
  - stdout sha256: 5bdad1a1ca405e520ab0848cf85781a5b2d581c58ed456755e88fb9b1c44fe2f
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 67
  - stderr bytes: 0
  - Provenance: executed

### Product verification
- none

### Manual verification
- Check: Установка и запуск на чистой Linux; состав готовых Windows/macOS артефактов проверен на Linux, их нативная приёмка отложена до финального STEP-054.
  - Status: PASS
  - Observed: "Реальный AppImage SHA256 83eaa355f0bab13f01161d6c6cdccc970bea4124e73eef61bf613d7724d15ea0 извлечён и запущен в чистом Ubuntu24.04 без установленного Node/FFmpeg, networknone. linux-smoke.json: uiReadytrue,4 isolationtrue,SQLiteheadertrue. linux-window.png просмотрен: главная страница, поле ссылки, жёлтая иконка. Системное хранилище отсутствует в контейнере, вход не проверен. Четыре реальных артефакта0.0.0 проверены package:verify на Linux. FUSE/desktop integration не проверялись, запуск Docker --no-sandbox. НативныеWin/Mac только054, signing/updater036. Evidence apps/desktop/evidence/STEP-035/README.md."
<!-- VERIFICATION-EVIDENCE:END -->

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.

Реализация и фактические доказательства: [локальные дистрибутивы](../../apps/desktop/evidence/STEP-035/README.md). Четыре unsigned артефакта 0.0.0 собраны на Linux; проверены их содержимое/архитектуры/fuses и запуск извлечённого AppImage в чистом Ubuntu без установленного Node.js/FFmpeg. Финальный снимок с видимым UI просмотрен. Подписание/updater и нативные Windows/macOS проверки сохраняют владельцев STEP-036/STEP-054.


## Blocker / Failure reason

—

### Уточнение проверочной поверхности

Во время реализации обнаружен воспроизводимый ложный PASS старого captureSmoke: четыре isolation поля true и SQLite создаётся, но PNG содержит только пустой фон. Helper после loadURL не ожидает React DOM/отрисованный кадр. Новый PLAN разрешает точечно исправить readiness только этого проверочного helper и требует package:smoke --check без изменения durable Evidence внутри canonical Verification. Первые неуспешные capture-наблюдения сохраняются; они не считаются успешной визуальной приёмкой.
