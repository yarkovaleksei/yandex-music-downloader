---
schema: 1
id: STEP-054
status: completed
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
  revision: 2
  context_basis: sha256:e4254fbf62cfefcd9cb7bfeb4461ae0458bdba7f5bc036aca925387411575c7c
  content_hash: sha256:a697b9b159f815d869d732e2c1aeae6228500a0fbb18b3c06d7835643291772b
  reviewed_report: planning/plan-reviews/STEP-054/PLAN-REVIEW-20261030T075553Z.md
  planned_at: 2026-10-30T07:55:53+00:00
  execution_groups:
  context_components:
    - "ADR@ADR-014=sha256:d21dd58fd7f4167a6b4820ba1f26624fcf440fb7a3f9fdc926e1ec517a969f39"
    - "ADR@ADR-019=sha256:661497200e97275c9243a5f4b2594b02b1d04a026a4c6c9a65f4dc6f95dc3a7b"
    - "ARCH@docs/architecture.md#deployment-runtime-assumptions=sha256:fc520397c4d2e3737c000cc225b7b76b4ec3aef0d626169e608e2954cab41cf9"
    - "PRN@PRN-001=sha256:3b3801f207fafc3f77272f0e93570258a6d006964839d93a276accd814d548af"
    - "PRN@PRN-002=sha256:f29ee3fbdb9cf65cf9739d0907768bbf192ad88b8e443110d4d82f81c6b79ecb"
    - "PRN@PRN-003=sha256:16516d7d302fecda5f7615f9d55e29e04b588d671f8660640e1f61d1619e4ef8"
    - "REQ@REQ-041=sha256:14dc8e6885630aa5623924828edf73185be7e0d633f1e9fe9e4d10db294cff5c"
    - "REQ@REQ-045=sha256:8c0daf83e3979fa9f33b19fa0c35d0304fa959dd09781ff523a4a0b303131fda"
    - "REQ@REQ-053=sha256:15dbb9161575225f8cdb1fd2553e472f0794d8b92a09998125f48719bf869bd2"
    - "REQ@REQ-054=sha256:002aac704fa57e3cb6eb205952c5e8a9d97c7c85c89cd9ac326e411a403c6016"
    - "REQ@REQ-055=sha256:fabf61aba1d72b364c5b1c8b5fdfb0bc82c601df13568d37e7c372237dc31160"
    - "STEP@STEP-034=sha256:f98281769eb8b764301012e5e694c9e29aefef92a2ff8a66fb920a38b448b6c9"
    - "STEP@STEP-035=sha256:cadec965a839e71c9ae2deecd781e2399c37531dfc66abe017c88b2586ed6f05"
    - "STEP@STEP-036=sha256:9ce7a5f5a64a3109c8857f00d1c362f0af392516eafd394cc54af0c2093b8087"
    - "STEP@STEP-054=sha256:ffbbacafc8a00f018117800d89d551f8830f7072a2a5dac68a18e8bf2a6e58c1"
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

Решение владельца от 2026-10-30: исправить проверочный набор и выяснить SIGKILL arm64; подготовить только Mac-наборы для оставшихся проверок. Не повторять arm64 diagnostic E2E с подтверждёнными файлом 50 785 байт и историей после restart и x64 shipping N UI PASS через Rosetta. Reuse относится только к исходным revision/build ID/хешам и исходным входам, а не к новой UI-сборке. Harness и CI не менять.

## Scope

- Повторяемые Mac-проверки с раздельными каталогами запусков: arm64 shipping N, диагностика подписи и обновление; x64 offline E2E и обновление. Уже подтверждённые части явно REUSED с исходными доказательствами.
- Точечная коррекция упаковки arm64 при доказанной нарушенной Mach-O подписи после изменения fuses; Linux-only подготовка, без платных сертификатов и без ослабления fuses/ASAR integrity.

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
- Изменение `.harness/**`, `.agents/**`, CI workflows, требования CI-приёмки, секреты в отчётах/репозитории.
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

- Каждая проверка нового набора помечена EXECUTED или REUSED; REUSED содержит исходный raw report, его SHA-256 и точные входы. Пропуск проверки не выдаётся за свежий PASS. Windows повторно не проверяется.

## Verification

- command: `python3 .harness/tools/validate.py --mode manual`
- command: `node apps/desktop/scripts/mac-signature.mjs --check`
- command: `node apps/desktop/scripts/mac-retry-kit.mjs --check`
- command: `node apps/desktop/scripts/mac-retry-kit.mjs --verify`
- manual: На macOS arm64 выполнить только новый shipping N, подпись/update и ручной N+1 с сохранением baseline state/file; на macOS x64/Rosetta выполнить только automation E2E, подпись/update и ручной N+1. Получить raw OS/arch/Rosetta/buildId/hashes/signals/commands/phase diagnostics. REUSED PASS сверить с точными старым input hashes. Без native reports приёмка PENDING; Linux signature verify не доказывает причину исчезновения SIGKILL.
- manual: Проверить docs/development.md, docs/architecture.md#deployment-runtime-assumptions и Evidence против manifest: Windows и прежние PASS не повторяются и не переименованы в свежие, исторические FAIL сохранены, production feed/trust и Harness/CI не менялись.

## Deliverables

- Два Mac-only набора оставшихся проверок и короткая инструкция; исходные PASS/FAIL и сырые отчёты сохраняются неизменными.
- Реальные Windows/macOS отчёты portable-запуска, E2E, проверки подлинности и обновления.
- `docs/architecture.md#deployment-runtime-assumptions` — подтверждённое состояние нативной приёмки; отсутствие отчёта не превращается в заявление готовности.

## Implementation plan

### 1. Зафиксировать полученные Mac результаты и подтвердить дефект arm64 упаковки

- Сохранить выбранные исходные raw JSON/stdout/log/screenshot и SHA-256 архивов без browser cache; не исполнять содержимое вложений. Разделить подтверждённые PASS и FAIL, указать revision/buildId/target/Rosetta/точные artifact hashes.
- Проверить CodeDirectory hashes старого arm64 Electron Framework, связать повреждённую страницу с изменёнными fuses. Не утверждать причину SIGKILL окончательно до нового native arm64 запуска.
- Закрепить reuse arm64 diagnostic E2E только за неизменёнными automation Electron/runtime/host/closure; x64 shipping UI — только за прежним portable N. Не переносить PASS на новые bytes.

**Files:**
- apps/desktop/e2e/evidence/STEP-054/README.md
- apps/desktop/e2e/evidence/STEP-054/native-mac-20261030/

**Tests:**
- Проверить исходные SHA-256, raw statuses и отсутствие after/update proof.

### 2. Восстановить ad hoc целостность arm64 после fuses на Linux

- Добавить Linux-only helper с закреплёнными version/checksum rcodesign; без сертификата/Developer ID/notarization и без зависимости на guest. Проверить старые CodeDirectory до ремонта и после него.
- В копиях старых portable arm64 N/N+1 восстановить ad hoc подписи после изменения fuses. Сохранить нужные entitlements, fuses, ASAR integrity и payload; новая identity/trust не вводятся. Исходные артефакты не перезаписывать.
- Подключить helper в package.mjs после последней мутации fuses и до финального archive/manifest, чтобы дефект не повторялся. Изменение остаётся packaging-only; product rebuild ради retry не требуется.

**Files:**
- apps/desktop/scripts/mac-signature.mjs
- apps/desktop/scripts/package.mjs

**Tests:**
- node apps/desktop/scripts/mac-signature.mjs --check

**Risks:**
- Корректная Linux подпись не заменяет нативный arm64 запуск; SIGKILL resolution остаётся PENDING до raw report.

### 3. Сделать Mac runner повторяемым и выполнять только непройденные проверки

- Добавить run-scoped current/home/reports с отдельным state и неизменяемыми предыдущими отчётами. Отдельные before/after одной попытки связывать run ID и baseline, не удалять чужие данные; повтор before не должен падать EEXIST или видеть job другого прогона.
- arm64 выполнить только shipping N, fixture signature/update и shipping N+1 после ручной замены; старый automation E2E не запускать. Для доказательства сохранности state/file подготовить отдельный явно помеченный baseline без повторного E2E.
- x64 пропустить shipping N smoke с точной ссылкой на прежний PASS; выполнить automation E2E с phase-specific bounded startup budget и журналами подключения main/renderer/host. Повторные startup timeout не скрывать увеличением числа retries и не выдавать за PASS.
- Проверять update через прежний production service и отдельный fixture public key, ожидать ручную замену; не включать Windows и пройденные проверки как исполняемые шаги. Сохранить команды/exitCode/signals и macOS причинные сведения SIGKILL без личных данных/секретов.

**Files:**
- apps/desktop/e2e/mac-retry-check.mjs
- apps/desktop/e2e/download.spec.mjs
- apps/desktop/e2e/prepare.mjs
- apps/desktop/e2e/final-check.mjs

**Tests:**
- node apps/desktop/scripts/mac-retry-kit.mjs --check

### 4. Собрать два Mac retry набора с явным provenance и проверить их на Linux

- Собрать только darwin-arm64 и darwin-x64 из immutable старых artifacts/runtime/closure, обновив только проверочный runner и arm64 подписи. Не требовать совпадения старых packaging inputs с новым UI HEAD и не пересобирать продукт молча.
- Manifest фиксирует исходный и новый artifact hashes, old/native PASS references и их exact inputs, check plan EXECUTED/REUSED, Linux-built provenance, guestBuildAllowed=false. Fixture N+1 descriptor подписать над окончательными bytes; приватный ключ в набор не включать.
- Self-check на воспроизведённых EEXIST/shared-state и пропусках PASS проверяет rerun isolation, phase gating, binding before/after и mismatch rejection. Static verify проверяет inventories/архивы/подписи/fuses/ASAR и отсутствие compiler/private keys; native работу не объявляет доказанной.

**Files:**
- apps/desktop/scripts/mac-retry-kit.mjs
- apps/desktop/e2e/mac-retry-check.mjs
- apps/desktop/e2e/evidence/STEP-054/README.md

**Tests:**
- node apps/desktop/scripts/mac-retry-kit.mjs --check
- node apps/desktop/scripts/mac-retry-kit.mjs --verify

### 5. Описать оставшиеся команды Mac и фактические ограничения

- Обновить инструкцию: распаковать новый target, выполнить before, ручную замену и after с run ID; перечислить точные raw reports для возврата. Явно показать уже REUSED PASS и какие тесты исключены.
- После локальных проверок синхронизировать deployment-runtime-assumptions и Evidence: Windows PASS неизменён; x64 shipping UI PASS только Rosetta/old hash; arm E2E PASS old automation inputs; новые arm shipping/x64 E2E/update остаются PENDING до получения Mac reports. Исторические FAIL сохранить.

**Files:**
- docs/development.md
- docs/architecture.md#deployment-runtime-assumptions
- apps/desktop/e2e/evidence/STEP-054/README.md

**Tests:**
- python3 .harness/tools/validate.py --mode manual
- Сопоставить инструкции и документацию с реальными manifest/check plan/статусами.

## Evidence





<!-- VERIFICATION-EVIDENCE:START -->
- Verification run: 2026-10-30T10:48:00Z
- Status: PASS
- Automated resumed: false
- Verification mode: full
- Incremental executed checks: 4
- Incremental reused checks: 0
- Targeted feedback reused: 0
- Incremental fallback reason: RISK_REQUIRES_FULL
- Git head: 5cb41f172b69e7a02b9ec9af6a31917e31398b49
- Worktree hash: sha256:fc386ee118f912804abebb25d12ca06fa7f94ad1b16500b3a0f7520e61756f5a
- Verification contract basis: sha256:50fd1ede35d4803a02474e0b09f109da58c8e253fa43ddbc2566f2dc5c628a27
- Verification context basis: sha256:b1f79f85cc2c8b9d153de6afc8fbcdbc007642e2fb5199b562b80699d40ff479
- Subject git head: 5cb41f172b69e7a02b9ec9af6a31917e31398b49
- Subject worktree hash: sha256:11437edec1bf34099a53d057c568268efcbc080034f508ca41af37fa9529396f
- Subject content hash: sha256:c1329ccedca235fad3bf6b7f33023da1628080e54b77000dbf1579f46e55d0ae

### Automated verification
- Command: python3 .harness/tools/validate.py --mode manual
  - Status: PASS
  - Exit code: 0
  - Duration ms: 6474
  - stdout sha256: ddb34c4e01b60a6f6edf39bf4b7c3aa54066b22a0085fb22de6fb999223ee730
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 67
  - stderr bytes: 0
  - Provenance: executed
- Command: node apps/desktop/scripts/mac-signature.mjs --check
  - Status: PASS
  - Exit code: 0
  - Duration ms: 63
  - stdout sha256: 8b60ca8b9f99ae23c0cfc0ba050e17813570155d62d92031921825b9382fd81c
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 132
  - stderr bytes: 0
  - Provenance: executed
- Command: node apps/desktop/scripts/mac-retry-kit.mjs --check
  - Status: PASS
  - Exit code: 0
  - Duration ms: 3870
  - stdout sha256: 59a9cfbf63cca6efe580b177518ef00e7594cd7818a8d89d0b2e8b55ce10512e
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 408
  - stderr bytes: 0
  - Provenance: executed
- Command: node apps/desktop/scripts/mac-retry-kit.mjs --verify
  - Status: PASS
  - Exit code: 0
  - Duration ms: 93173
  - stdout sha256: ba182d40fd156634d5ea8bc78f51e3d8c067383c050b68e3cfb8cb0776dfd61e
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 162
  - stderr bytes: 0
  - Provenance: executed

### Product verification
- none

### Manual verification
- Check: На macOS arm64 выполнить только новый shipping N, подпись/update и ручной N+1 с сохранением baseline state/file; на macOS x64/Rosetta выполнить только automation E2E, подпись/update и ручной N+1. Получить raw OS/arch/Rosetta/buildId/hashes/signals/commands/phase diagnostics. REUSED PASS сверить с точными старым input hashes. Без native reports приёмка PENDING; Linux signature verify не доказывает причину исчезновения SIGKILL.
  - Status: PASS
  - Observed: "Получены новые raw Mac отчёты exact build 20261030T081544687Z-5cb41f17; final-reports/{provenance,acceptance}.json связывают два исходных ZIP,119 raw файлов и принятые app/N+1 hashes. ARM run20261030T101530Z-00006634: shipping N/N+1 UI PASS, update descriptor valid READY и signature/size/hash rejected, baseline file/history сохранены; old E2E REUSED со старым hash. X64 run20261030T101708Z-000067a7: E2E PASS50785 bytes/history restart, N+1 PASS и state/file preserved, old shippingN REUSED; M2 Rosetta, не Intel. before/after integrity PASS, final after nativeAcceptance PASS и continuation/phases подтверждают завершение. Старые FAIL сохранены. codesign native exit1 отдельно от code-page PASS: resource seal отсутствует, не требуется ADR019; codesign-analysis.json проверяет те же accepted bytes. Пройденные Mac сценарии не повторялись."
- Check: Проверить docs/development.md, docs/architecture.md#deployment-runtime-assumptions и Evidence против manifest: Windows и прежние PASS не повторяются и не переименованы в свежие, исторические FAIL сохранены, production feed/trust и Harness/CI не менялись.
  - Status: PASS
  - Observed: "Сверены docs/development.md, deployment-runtime-assumptions и STEP054 Evidence с final acceptance, retry manifest и raw. Все данные относятся к точным проверочным hashes исходной production-версии, не к новой UI-сборке; Windows PASS сохранён без повтора. Ранние FAIL не исправлены задним числом; stale launcher-summary первой after попытки сохранён рядом с finalPASS after и continuation. Root .DS_Store теперь допускается только regular nonexec рядом с .app, payload/nested/symlink проверяются; локальная регрессия PASS. CodeDirectory PASS не назван полной системной подписью; native codesign FAIL, buggy rcodesign verify FAIL и resource seal ABSENT явно отражены. Production feed/trust и Harness/CI не менялись."
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

Блокеров нет. Windows x64 принят по прежним отчётам без повторного прогона; macOS arm64 и x64 через Rosetta приняты по финальным [отчётам 2026-10-30](../../apps/desktop/e2e/evidence/STEP-054/native-mac-20261030/final-reports/acceptance.json). Ранние FAIL сохранены, точные build ID и хеши связывают результаты с проверенными артефактами; отдельный Intel Mac и новая UI-сборка не заявлены. По пояснению оператора карантин снят и приложение заменено вручную через `ditto`; автоматического обхода системной политики нет. Отсутствие полного macOS resource seal отдельно от успешной проверки CodeDirectory и Ed25519 отражено в [диагностике](../../apps/desktop/e2e/evidence/STEP-054/native-mac-20261030/final-reports/codesign-analysis.json) и не является требованием ADR-019. STEP закрыт canonical writer после независимого [REVIEW PASS](../reviews/STEP-054/REVIEW-20261030T105415Z.md). Коммит не выполнялся.
