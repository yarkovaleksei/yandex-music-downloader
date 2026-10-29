---
schema: 1
id: STEP-036
status: completed
type: implementation
priority: low
phase: packaging
depends_on:
  - STEP-035
requirements:
  - REQ-054
  - REQ-055
adrs:
  - ADR-014
  - ADR-015
  - ADR-019
architecture_refs:
  - docs/architecture.md#deployment-runtime-assumptions
  - docs/architecture.md#security-boundaries
architecture_outputs:
  - docs/architecture.md#deployment-runtime-assumptions
risk_flags:
  - security-sensitive
  - release-critical
plan:
  status: ready
  revision: 1
  context_basis: sha256:9d73a950b553e053c5178174001cb0e4f23fc50ec5cc1d644a8f54f5719383f9
  content_hash: sha256:c28659153c29ddeb7ea879b1cb11ff90034c6d87a4ed2a3bdbb9d7fe00e70230
  reviewed_report: planning/plan-reviews/STEP-036/PLAN-REVIEW-20261029T134455Z.md
  planned_at: 2026-10-29T13:44:55+00:00
  execution_groups:
  context_components:
    - "ADR@ADR-014=sha256:d21dd58fd7f4167a6b4820ba1f26624fcf440fb7a3f9fdc926e1ec517a969f39"
    - "ADR@ADR-015=sha256:0fd7f2940c2f6ac5a15eda9b9c9ad7c6a961062d03a4eedd4e3dd03eb8750d53"
    - "ADR@ADR-019=sha256:661497200e97275c9243a5f4b2594b02b1d04a026a4c6c9a65f4dc6f95dc3a7b"
    - "ARCH@docs/architecture.md#deployment-runtime-assumptions=sha256:fc520397c4d2e3737c000cc225b7b76b4ec3aef0d626169e608e2954cab41cf9"
    - "ARCH@docs/architecture.md#security-boundaries=sha256:f213ddc0354e3d3e9f61f234de7da6f7042599f8ec5b729713bdf760b82904ab"
    - "OQ@OQ-013=sha256:247167a71db46423b68dc29e7a38e23724ce1db788492afa6f5adf0c69e0a4f3"
    - "PRN@PRN-001=sha256:3b3801f207fafc3f77272f0e93570258a6d006964839d93a276accd814d548af"
    - "PRN@PRN-002=sha256:f29ee3fbdb9cf65cf9739d0907768bbf192ad88b8e443110d4d82f81c6b79ecb"
    - "PRN@PRN-003=sha256:16516d7d302fecda5f7615f9d55e29e04b588d671f8660640e1f61d1619e4ef8"
    - "REQ@REQ-054=sha256:cac9146dfd5cb7bc77561948b30922e2d3889af95e407677b6a29b11db05c5e8"
    - "REQ@REQ-055=sha256:6fcaaa85d4dadbe69925aee6e390a667230b85c7d929dd2fd45671480f989737"
    - "STEP@STEP-035=sha256:cadec965a839e71c9ae2deecd781e2399c37531dfc66abe017c88b2586ed6f05"
    - "STEP@STEP-036=sha256:061bc39a4a7fabb90a110cd9b4ac1f926b4ee25860c6bd6f807b75211aa53c83"
---

# STEP-036 — Portable-пакеты и проверенные обновления

## Goal

Реализовать portable-дистрибутивы и проверку/скачивание обновлений с ручной заменой приложения по ADR-019, без платных сертификатов и notarization.

## Context

Решение владельца от 2026-10-29: платные сертификаты не покупаются вообще, нужны portable-версии. OQ-013 разрешён; ADR-019 заменяет системную подпись и installer updater. Приватный ключ собственной Ed25519-подписи хранится в защищённом хранилище ОС Linux-сборщика. CI не требуется; новые Windows/macOS прогоны только в финальном STEP-054.

## Scope

- Windows x64 ZIP вместо NSIS; macOS arm64/x64 .app ZIP и Linux AppImage, только Linux-сборка.
- Проверка/скачивание portable-обновления по запросу: Ed25519 descriptor, target/version/origins/size/SHA-256, безопасные ошибки, открытие папки с проверенным пакетом.
- Собственная release-подпись без платных сертификатов, публичный ключ в приложении и закрытый ключ в защищённом хранилище ОС.
- Документация ручной замены и Linux-проверка готовых приложений N → N+1 с сохранением состояния.

## Mutation policy

### Allowed

- `apps/desktop/**` — portable packaging, main/preload/renderer updater, тесты и Evidence.
- `package.json`, `apps/desktop/package.json`, `yarn.lock` — команды и необходимые зависимости.
- `docs/development.md`, `docs/architecture.md#deployment-runtime-assumptions` — подтверждённое состояние и инструкции; остальные architecture sections не изменяются.

### Conditional

- Нет.

### Forbidden

- Ключи и сертификаты в репозитории.
- Реализация future/unrelated STEP «заодно».

## Out of scope

- Новые платформы, платная/system code signing, notarization/stapling, автоматическая установка/замена и запуск скачанного пакета.
- Новые Windows/macOS прогоны до финального STEP-054, публикация релиза и создание Git-тегов.

## Acceptance criteria

- На Linux создаются и проверяются portable-артефакты Windows x64 ZIP, macOS arm64/x64 .app ZIP и Linux x64 AppImage; платная подпись/notarization не требуются. Нативная приёмка Windows/macOS только в финальном STEP-054.
- По явному действию пользователя обновление проверяет Ed25519 descriptor, более новую версию/канал/цель, HTTPS/origins и фактические размер/SHA-256. Неверные/неполные пакеты не выдаются как готовые, не запускаются и не устанавливаются автоматически; отсутствие production trust/feed явно сообщается.
- Получение проверенного пакета, ручная замена и запуск готового приложения N → N+1 с сохранением общего состояния проверены на Linux; Windows/macOS проверяются в финальном STEP-054.
- В репозитории отсутствуют секреты.

## Verification

- command: `npm run lint`
- command: `npm run typecheck`
- command: `npm test`
- command: `npm run build`
- command: `node --test apps/desktop/packaging/packaging.test.mjs`
- command: `node --test apps/desktop/packaging/update-contract.test.mjs`
- command: `npm run package:verify`
- command: `npm run package:update-smoke -- --check`
- command: `python3 .harness/tools/validate.py --mode manual`
- manual: Проверить portable-пакеты и обновление N → N+1 на Linux по ADR-019: собственная подпись, скачивание, ручная замена, запуск новой версии и сохранение состояния; нативные проверки Windows/macOS не выполнять до финального STEP-054.

## Deliverables

- Portable-пакеты, проверка/скачивание обновлений и собственная подпись descriptor.
- Linux Evidence N → N+1 и негативных проверок, инструкции ручной замены.
- Подтверждённые docs/development.md и deployment/runtime architecture output.

## Implementation plan

### 1. Создать portable-пакеты и явно проверочные версии Linux

- По REQ-054/ADR-019 заменить NSIS Windows на ZIP и verifier на проверку фактического ZIP; сохранить остальные targetnative/closure/fuses/ASAR assertions.
- Добавить явный режим локальной проверочной версии (например --local-version 0.0.1) и выбор Linux target для N→N+1; tagnull/localtrue/publishedfalse, отдельныеoutputdirs, обычный --local остаётся0.0.0. Не создаватьGitтеги/релизы.
- Включить публичную конфигурацию доверия обновления в неизменяемый production ASAR, проверять её hash в manifest inputs. Отсутствие ключа/feed означает disabled, не принимать userenv как runtime trust.

**Files:**
- apps/desktop/scripts/package.mjs
- apps/desktop/scripts/verify-package.mjs
- apps/desktop/scripts/package-smoke.mjs
- apps/desktop/packaging/**

**Tests:**
- npm run package:verify
- node --test apps/desktop/packaging/packaging.test.mjs

### 2. Реализовать проверку и скачивание обновления в main

- Создать модуль main/update с явной конфигурацией embeddedpublickey/feed/origins/channel,безSDKновыхdependencies если достаточноnodecrypto/https/zod. Задать ограниченный versioned descriptor и detachedEd25519 signature exactbytes; более новаяsemver/currenttarget/channel и HTTPS origins включая redirects проверяются доdownload.
- Подписанные неизменные size/hash/url/version/target данные сохраняются дляdownload; streamingboundeddownload в отдельный private updatecache, неполный.part удаляется,проверенныйfilename mainгенерирует сам. Повторныедействия сериализовать; отказ не меняет userSQLite/credentials. Не исполнять/распаковывать пакеты.
- Добавить узкие методы checkUpdate/downloadUpdate/openUpdateFolder в contract/broker/preload и main wiring, closedemptyinputs/trustedsender. Renderer не передаёт URL/пути/ключи; openFolder открывает только реально проверенный текущийпакет и перепроверяетhash передпоказом. Ошибки безопасныебезURLs/nativeexceptions.
- Добавить в Settings отдельный блок обновления:проверить, скачать, открытьпапку; понятные unavailable/failed/current/available/ready статусы и инструкция ручнойзамены, noautoactions. Существующие settings/music не менять.

**Files:**
- apps/desktop/src/main/**
- apps/desktop/src/contract/**
- apps/desktop/src/transport/**
- apps/desktop/src/renderer/Settings.tsx
- apps/desktop/src/renderer/Settings.test.tsx
- apps/desktop/src/renderer/Updates.tsx
- apps/desktop/src/renderer/Updates.test.tsx

**Tests:**
- npm test
- node --test apps/desktop/packaging/update-contract.test.mjs

### 3. Добавить собственную подпись descriptor и доказать реальное portable обновление Linux

- ReleaseCLI генерирует Ed25519 privatekey только в отдельном namespace SecretService Linuxсборщика через существующийnativekeyring; выводиттолькоpublickey. Подписывает точныеbytesdescriptor по ключуизOSstore,не хранитсекретвфайлах/env/аргументах/logs. Нетключа/store=>safe отказ,безplaintextfallback. Ключиtests генерируютсявременно,не являютсяproductionkey.
- Собрать реальные Linux AppImage версийN0.0.0 иN+1проверочной0.0.1, подписать testdescriptor ephemeralkey, проверитьproductiondownloadpath через реальныйHTTPSлокальныйfixture с отдельным довереннымtestCA transport, сохранитьпакетс точнымhash. Не ослаблять shipping TLS/IPC/fuses и не вводить runtime backdoor доверия.
- CleanUbuntu драйвер запускает реальнуюN, сохраняетSQLite/контрольныйsettingsstate, закрываетприложение, выполняетручнуюзамену на скачаннуюN+1 и запускаетс темжestate. Проверяет appversionизElectron, UI/isolation/SQLite и неизменностьпользовательскогосостояния. БезinstalledNode/FFmpeg/сети вruntimeконтейнере. ОграниченияextractedAppImage/noFUSE/--no-sandbox явнофиксировать.
- Контрактные executableтесты H001: валиднаяподпись/download; невернаяподпись/неизвестныйключ,version/channel/target,HTTP/foreignredirect,hash/size/неполныйpayload. ТребованиеADR019,неhypotheticalhardening. Проверить отсутствиеавтоматического запуска и arbitraryrendererinputs.
- В режиме --check писать толькоignoredcache; durableEvidence/скриншоты/хеши сохранитьобычнымзапуском доcanonicalVerification.

**Files:**
- apps/desktop/scripts/release-update.mjs
- apps/desktop/scripts/package-update-smoke.mjs
- apps/desktop/packaging/update-contract.test.mjs
- apps/desktop/packaging/**
- apps/desktop/evidence/STEP-036/**
- package.json

**Tests:**
- node --test apps/desktop/packaging/update-contract.test.mjs
- npm run package:update-smoke -- --check

### 4. Синхронизировать подтверждённое состояние и пройти проверку/ревью

- После реализации обновить docs/development.md инструкцииportable/собственнойподписи/feed/trust/manualreplacement и только deployment-runtime anchor docs/architecture.md с доказаннымсостоянием. Не объявлятьproductionfeed/ключ/нативныйWinMacPASS настроенными.
- Сохранить durableLinux build/verification/N→N+1 Evidence с версиями,хешами,UI/state; отметить отсутствиеплатныхсертификатов и системныхподписей. ИсторическийMacx64FAIL/native054 и общийstateDir сохраняются.
- sync-projections доcanonicalVerification,полныйVerification,manualsemanticпроверкаUI/docs/ограничений и independentrequiredreviews. БезCI иgitcommit.

**Files:**
- docs/development.md
- docs/architecture.md#deployment-runtime-assumptions
- apps/desktop/evidence/STEP-036/**

**Tests:**
- python3 .harness/tools/validate.py --mode manual

## Evidence




<!-- VERIFICATION-EVIDENCE:START -->
- Verification run: 2026-10-29T14:25:58Z
- Status: PASS
- Automated resumed: false
- Verification mode: full
- Incremental executed checks: 9
- Incremental reused checks: 0
- Targeted feedback reused: 0
- Incremental fallback reason: RISK_REQUIRES_FULL
- Git head: 32fb8e1aef7d7b78cb90b8ffce508da55f98aa52
- Worktree hash: sha256:9d271f1f9dbf41ffea07fcb4ac66f4a55c68b3fbaf6a8d2eca4c37af3af7f636
- Verification contract basis: sha256:4f8ab9f9f6d87eb1ac047773383fa6b2bb1ac745adcb6ca43dd528ad4350861b
- Verification context basis: sha256:2ed6eb083c4080fd27470372b27203a0112635350bfe1fa36b12cc355922afb1
- Subject git head: 32fb8e1aef7d7b78cb90b8ffce508da55f98aa52
- Subject worktree hash: sha256:eebb0634298408240689bb1499dea357547f9be0e8cfe6745cdbd487e8e51f65
- Subject content hash: sha256:dfe0510ca82e40bc4e36b56289c0ee81859d3530b3fd6bd83bf38ddd3c257099

### Automated verification
- Command: npm run lint
  - Status: PASS
  - Exit code: 0
  - Duration ms: 14940
  - stdout sha256: a9abc4bc51d6729860fb000bf87c02e5a80cc830999d05e640c5651c7e3daa6a
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 147
  - stderr bytes: 0
  - Provenance: executed
- Command: npm run typecheck
  - Status: PASS
  - Exit code: 0
  - Duration ms: 7776
  - stdout sha256: 73ad7967b0b62b903e0e14e90a6a3971d720cb1ab6b744714e6d2ef05dd89743
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 83
  - stderr bytes: 0
  - Provenance: executed
- Command: npm test
  - Status: PASS
  - Exit code: 0
  - Duration ms: 37491
  - stdout sha256: 54b54fc6c8d7afb283dc2f03530f7794c0a8507743f530207c8805588a1120ca
  - stderr sha256: a32eeaf15b7a0718b245441f17f3f883f479e66356d506125c9c874bdc4f50e1
  - stdout bytes: 13852
  - stderr bytes: 4700
  - Provenance: executed
- Command: npm run build
  - Status: PASS
  - Exit code: 0
  - Duration ms: 715
  - stdout sha256: 4a84685762211c33a9f2ac6336f7b1d29d9e1f9d26373ef0b9a167bf0a587116
  - stderr sha256: 351b524197fb492920789369e7f1a271420c757633fbb553b280a181ac4c31a4
  - stdout bytes: 88
  - stderr bytes: 360
  - Provenance: executed
- Command: node --test apps/desktop/packaging/packaging.test.mjs
  - Status: PASS
  - Exit code: 0
  - Duration ms: 164
  - stdout sha256: 964b0c9c81e8f2c749c6da01970db6ea4f33831525b26327e4fb2f00621290e6
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 775
  - stderr bytes: 0
  - Provenance: executed
- Command: node --test apps/desktop/packaging/update-contract.test.mjs
  - Status: PASS
  - Exit code: 0
  - Duration ms: 364
  - stdout sha256: 67c477238b7ee22202df43d05c38d239f84a22d3e6f4c8240ae529558129665c
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 1769
  - stderr bytes: 0
  - Provenance: executed
- Command: npm run package:verify
  - Status: PASS
  - Exit code: 0
  - Duration ms: 11432
  - stdout sha256: 8d5b0ae635fcc6c7ed14df7c872148bacca6da521e8ceca3b35427cea4697d84
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 372
  - stderr bytes: 0
  - Provenance: executed
- Command: npm run package:update-smoke -- --check
  - Status: PASS
  - Exit code: 0
  - Duration ms: 17643
  - stdout sha256: fad1368f319cb532848aaa0601f63c86828151ab673402cee40ff7f99510cb51
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 2236
  - stderr bytes: 0
  - Provenance: executed
- Command: python3 .harness/tools/validate.py --mode manual
  - Status: PASS
  - Exit code: 0
  - Duration ms: 5522
  - stdout sha256: 5bdad1a1ca405e520ab0848cf85781a5b2d581c58ed456755e88fb9b1c44fe2f
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 67
  - stderr bytes: 0
  - Provenance: executed

### Product verification
- none

### Manual verification
- Check: Проверить portable-пакеты и обновление N → N+1 на Linux по ADR-019: собственная подпись, скачивание, ручная замена, запуск новой версии и сохранение состояния; нативные проверки Windows/macOS не выполнять до финального STEP-054.
  - Status: PASS
  - Observed: "Финальные четыре portable-пакета0.0.0 и второйLinuxAppImage0.0.1 собраны наLinux, normalverify all4PASS, повторныйupdateSmokePASS. Evidence apps/desktop/evidence/STEP-036/{README.md,build-summary.json,artifact-verification.json,next-artifact-verification.json,linux-update.json,n.png,n-plus-1.png}. Productionservice проверяет собственнуюEd25519подпись и скачивает полныйAppImage пореальномуHTTPS fixture с отдельнымCA. После ручнойзамены/app готовое приложение0.0.1 запущено, UIready/4isolationtrue, сохраненыSQLite/qualitynormal/loggingdebug/concurrency3. RuntimeUbuntu24.04 безinstalledNode/FFmpeg/сети. NativeWinMac/auth/FUSE/desktopintegration не проверены; --no-sandbox толькоDocker. Publictrust/feed disabled, платныхсертификатов/системнойподписи/публикации нет. Документация соответствует реализации и сохраняетfinal054."
<!-- VERIFICATION-EVIDENCE:END -->

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.

Фактические пакеты и Linux N → N+1: [Evidence STEP-036](../../apps/desktop/evidence/STEP-036/README.md). Все четыре portable-пакета проверены; новая Linux-версия запущена с сохранёнными настройками/SQLite. Production trust/feed остаются явно отключёнными до настройки; платные сертификаты не требуются, native Win/Mac только054.




## Blocker / Failure reason

—
