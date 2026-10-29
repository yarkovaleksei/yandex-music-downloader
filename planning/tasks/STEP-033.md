---
schema: 1
id: STEP-033
status: completed
type: hardening
priority: medium
phase: desktop
depends_on:
  - STEP-031
  - STEP-032
requirements:
  - REQ-053
adrs: []
architecture_refs:
  - "docs/architecture.md#основные-потоки"
  - "docs/architecture.md#известный-architecture-debt-drift"
architecture_outputs:
  - "docs/architecture.md#известный-architecture-debt-drift"
risk_flags:
  - none
plan:
  status: ready
  revision: 1
  context_basis: sha256:7ef82fda8afbe26c46b5513e8826633443a3261ed0adefc14f92d7d72face6f8
  content_hash: sha256:a436eaafe723243d18bab7b82d714e32df68d24586c1b350e11f774f0718d3c4
  reviewed_report: planning/plan-reviews/STEP-033/PLAN-REVIEW-20261029T105633Z.md
  planned_at: 2026-10-29T10:56:33+00:00
  execution_groups:
  context_components:
    - "ARCH@docs/architecture.md#известный-architecture-debt-drift=sha256:ea129bff2b269f5c3689cb4a4d8a2aa47a088cfe620ca2267d43526b541319fb"
    - "ARCH@docs/architecture.md#основные-потоки=sha256:e7842c107b39127d5776d5575d975efcf69df8d05024b630a938e1dc510e7575"
    - "PRN@PRN-001=sha256:3b3801f207fafc3f77272f0e93570258a6d006964839d93a276accd814d548af"
    - "PRN@PRN-002=sha256:f29ee3fbdb9cf65cf9739d0907768bbf192ad88b8e443110d4d82f81c6b79ecb"
    - "PRN@PRN-003=sha256:16516d7d302fecda5f7615f9d55e29e04b588d671f8660640e1f61d1619e4ef8"
    - "REQ@REQ-053=sha256:7b04d93718bc304f5765efe319c8af4cc58c7e9337f43da93a32cfa8ed86ba3f"
    - "STEP@STEP-031=sha256:ec5bdfca46bb193cece7b4ac637c64a440be3e958cd81bb824f5e9fd5e87209f"
    - "STEP@STEP-032=sha256:fae227682d39f2eaa5277169a6868a00e75c4d3c39e652a98b98c654e174a0ed"
    - "STEP@STEP-033=sha256:0c65aca749a86a247be602ac997397bc5a06fa2f64a3b04c7cce8c52083636df"
---

# STEP-033 — E2E-тест desktop

## Goal

Добавить автоматический E2E: resolve URL → start → pause → resume → complete → история.

## Context

E2E запускается на mock provider. По решению владельца от 2026-10-29 сборка приложения и E2E host выполняется только на Linux; Windows/macOS запускают готовый артефакт без компиляции.

## Scope

- E2E-фреймворк для Electron и сценарий.
- Сборка на Linux и нативные прогоны готового приложения на Windows/macOS без сборочных инструментов.
- После фактической реализации описать запуск E2E и границы локального и ручного платформенного доказательства; сведения о готовности обновлять только по полученному Evidence.

## Mutation policy

### Allowed

- `apps/desktop/e2e/**`.

### Conditional

- `docs/development.md` — только Testing и команда запуска нового E2E.
- `docs/architecture.md#известный-architecture-debt-drift` — только фактическое состояние E2E и оставшихся desktop gates; локальный Linux успех не закрывает Windows/macOS Acceptance.

### Forbidden

- Новая функциональность UI.
- Реализация future/unrelated STEP «заодно».

## Out of scope

- Release CI.

## Acceptance criteria

- E2E проходит локально на Linux.
- Сценарий проверяет файл в выходном каталоге и запись в истории.
- Windows и macOS подтверждены вручную на собранном на Linux приложении без пересборки приложения или E2E host в гостевой ОС (Evidence).

## Verification

- command: `npm run lint`
- command: `npm run typecheck`
- command: `npm test`
- command: `npm run build`
- command: `node apps/desktop/e2e/run.mjs`
- command: `python3 .harness/tools/validate.py --mode manual`
- manual: Выполнить Electron E2E на Windows и macOS для готового приложения и тестового host, собранных на Linux; подтвердить отсутствие сборки в гостевой ОС, сохранить платформу, revision/build ID, хеш артефакта, результат сценария, итоговый файл и историю; отсутствие фактического Evidence оставляет Acceptance pending.
- manual: Сверить инструкции E2E и текущие desktop gates с фактическими результатами; явно сохранить pending Windows/macOS, если соответствующее Evidence ещё не получено.

## Deliverables

- E2E suite.
- Инструкции запуска и фактические ограничения доказательства E2E.

## Implementation plan

### 1. Связать текущую реализацию с полученными нативными отчётами

- Сохранить существующий Electron E2E и его assertions без ослабления; новая функциональность и hardening не требуются. Все builds выполняются только на Linux.
- Проверить совпадение текущих production dist/package файлов и заранее собранного E2E host со frozen appArtifactHash 7b37871db2ad5c2e8a2acfb020b2e57a048b70d470ed6a7b38f70baff9221f39 и file manifest выданных ready-наборов; host при необходимости пересобрать для сравнения только во временный каталог Linux. При executable drift не переносить старый native PASS, вернуть конкретный evidence gap.
- Принять существующие нативные report.json Windows x64 build20261029T093752Z-9f44abe6 и macOS arm64 build20261029T103807Z-mac-arm64-offline: integrity/e2e/prebuiltFilesUnchanged PASS, performedOnGuest=false, MP3 50785 bytes и тот же job/History после restart. Сохранённые raw reports/provenance не переписывать.
- Ранее сохранённые FAIL запуска и x64/Rosetta остаются историческими наблюдениями с неизвестной причиной. Не объявлять их исправленными и не выводить новый неподтверждённый corrective scope. Уточнённый REQ-053 требует Windows и macOS; отдельная x64 приёмка остаётся в существующем STEP-054, без изменения его contract/status.

**Tests:**
- Сопоставление native report/scenario/file hashes с ready manifests и текущими compiled outputs.

**Risks:**
- Текущий PASS не доказывает отсутствие всех intermittent startup failures, Intel/x64/Rosetta, packaging, signing или live provider; эти ограничения сохраняются.

### 2. Синхронизировать только подтверждённые E2E readiness claims

- После проверки bindings обновить Testing в docs/development.md, E2E README и известный architecture debt / drift: Windows x64 и macOS ARM64 подтверждены готовыми Linux-сборками; CI не является gate, гостевая ОС ничего не компилирует.
- Сохранить явные ограничения bootstrap automation switches, mock provider, отдельной x64/platform/packaging qualification и ранее зафиксированного раннего отказа Mac. Не писать STEP completed до независимого REVIEW.
- Не менять workflows приложения/Harness, production код, требования или historical отчёты.

**Files:**
- docs/development.md#testing
- docs/architecture.md#известный-architecture-debt-drift
- apps/desktop/e2e/README.md

**Tests:**
- Сверка документации с raw reports и фактическим runner.

### 3. Пройти свежий полный Verification и независимое REVIEW

- Перед completion синхронизировать Evidence/projections; во время Verification не менять файлы. Выполнить canonical команды через dispatcher.
- Передать exact manual observations для готового Linux-built приложения Windows/macOS и сверки документации. После PASS передать fresh subject независимому REVIEW; завершение принадлежит deterministic writer, не автору.

**Tests:**
- Полный Verification из STEP, включая npm test/build и реальный локальный Electron E2E.

## Evidence



<!-- VERIFICATION-EVIDENCE:START -->
- Verification run: 2026-10-29T11:00:46Z
- Status: PASS
- Automated resumed: false
- Verification mode: full
- Incremental executed checks: 6
- Incremental reused checks: 0
- Targeted feedback reused: 0
- Incremental fallback reason: IMPACT_MAP_NOT_CONFIGURED
- Git head: 32fb8e1aef7d7b78cb90b8ffce508da55f98aa52
- Worktree hash: sha256:d6e6f739a8d52c1567dc20ecdfb072d91396e1c6ad6a739549280c2c15a42ea3
- Verification contract basis: sha256:785fd21ed6993b3be8a909a4ac8c4507f7fc07d915b0f657ae57745315920869
- Verification context basis: sha256:b752f29d629b183353e6973a2acab7bcd5b51deca91ba162a0b1fcca25d26119
- Subject git head: 32fb8e1aef7d7b78cb90b8ffce508da55f98aa52
- Subject worktree hash: sha256:7f18d1d8581c1116a3a3061377ec29ce342f841736ecb6d31af712474ce880f4
- Subject content hash: sha256:61726103be2feb03e6217269e9a4b0008e2498d43464669482b8112f9ed185bc

### Automated verification
- Command: npm run lint
  - Status: PASS
  - Exit code: 0
  - Duration ms: 18154
  - stdout sha256: a9abc4bc51d6729860fb000bf87c02e5a80cc830999d05e640c5651c7e3daa6a
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 147
  - stderr bytes: 0
  - Provenance: executed
- Command: npm run typecheck
  - Status: PASS
  - Exit code: 0
  - Duration ms: 9285
  - stdout sha256: 73ad7967b0b62b903e0e14e90a6a3971d720cb1ab6b744714e6d2ef05dd89743
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 83
  - stderr bytes: 0
  - Provenance: executed
- Command: npm test
  - Status: PASS
  - Exit code: 0
  - Duration ms: 41706
  - stdout sha256: c8a8b6884b1dbb992230857307d418bcb20e4628c6bf5d12c0872c0435d722a3
  - stderr sha256: f51ad13b7cac6eb5a4be45cf8aab47cef996f22df502a0fcebda5b66d7116b89
  - stdout bytes: 17612
  - stderr bytes: 4700
  - Provenance: executed
- Command: npm run build
  - Status: PASS
  - Exit code: 0
  - Duration ms: 816
  - stdout sha256: 4a84685762211c33a9f2ac6336f7b1d29d9e1f9d26373ef0b9a167bf0a587116
  - stderr sha256: 351b524197fb492920789369e7f1a271420c757633fbb553b280a181ac4c31a4
  - stdout bytes: 88
  - stderr bytes: 360
  - Provenance: executed
- Command: node apps/desktop/e2e/run.mjs
  - Status: PASS
  - Exit code: 0
  - Duration ms: 10135
  - stdout sha256: 05ecb10e448130662dda1288dcf59bdeebebc345c1daf655b66a437aa82197ac
  - stderr sha256: 14d9afc227f0fea94997fc3df1d2da735580cdf1eebec7de11af81ee66d59402
  - stdout bytes: 281
  - stderr bytes: 163
  - Provenance: executed
- Command: python3 .harness/tools/validate.py --mode manual
  - Status: PASS
  - Exit code: 0
  - Duration ms: 5975
  - stdout sha256: 5bdad1a1ca405e520ab0848cf85781a5b2d581c58ed456755e88fb9b1c44fe2f
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 67
  - stderr bytes: 0
  - Provenance: executed

### Product verification
- none

### Manual verification
- Check: Выполнить Electron E2E на Windows и macOS для готового приложения и тестового host, собранных на Linux; подтвердить отсутствие сборки в гостевой ОС, сохранить платформу, revision/build ID, хеш артефакта, результат сценария, итоговый файл и историю; отсутствие фактического Evidence оставляет Acceptance pending.
  - Status: PASS
  - Observed: "Исходные win32-x64/report.json build 20261029T093752Z-9f44abe6 и mac-arm64-offline-103807/current/report.json build 20261029T103807Z-mac-arm64-offline в apps/desktop/e2e/evidence/native-20261029 подтверждают PASS; Linux x64 builtOn, performedOnGuest=false, integrity/prebuiltFilesUnchanged PASS. appArtifactHash 7b37871db2ad5c2e8a2acfb020b2e57a048b70d470ed6a7b38f70baff9221f39 совпадает; после свежего canonical npm run build все 342 productionFiles повторно совпали с durable ready-artifact-binding.json. Host побайтно совпал, SHA a98148a1569f7f3ae56741bb70d6ad5c824bf8e434fe9e91a3f18647159a85c3, сценарий без изменений. MP3 50785 bytes и тот же job в History после restart на обеих ОС. ARM64: M2 Pro/macOS15.7.7, proc_translated=0. Raw original reports/provenance сохранены. Предыдущие ARM64 startup FAIL и x64/Rosetta FAIL сохранены без заявления исправления; отдельная x64 квалификация остаётся STEP-054."
- Check: Сверить инструкции E2E и текущие desktop gates с фактическими результатами; явно сохранить pending Windows/macOS, если соответствующее Evidence ещё не получено.
  - Status: PASS
  - Observed: "Сверены docs/development.md Testing, apps/desktop/e2e/README.md и docs/architecture.md known debt с текущими scripts и raw native evidence. Windows x64/macOS arm64 подтверждены готовым Linux артефактом; отдельный x64/Rosetta STEP-054, packaging/signing/live provider/shipping debugging restriction сохранены. В гостях нет компиляции; установленный Node.js/FFmpeg и авторизация для offline сценария не требуются. CI gate отсутствует. Свежие шесть canonical automatic checks PASS."
<!-- VERIFICATION-EVIDENCE:END -->

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.

### Локальный Electron E2E

- На Linux x64 выполнен полный сценарий с настоящими renderer, preload, IPC broker, MessagePort, utilityProcess, application, файловыми adapters, metadata/validation и SQLite. Offline provider, каталоги и ответ системного диалога тестовые; stores и processing не подменялись.
- Наблюдались downloading → paused → completed после кнопок паузы/продолжения; итоговый MP3 — 50 785 байт. UI History содержит тот же job; после штатного закрытия, проверки SQLite header и нового Electron/utilityProcess восстановлены те же история, completed job и файл.
- Отдельный bounded запуск подтвердил, что обычное удаление Chromium debugging switches мешает Playwright; тестовый bootstrap сохраняет только `remote-debugging-port`/`remote-debugging-pipe`. Shipping source не меняется; этот E2E не доказывает отсутствие debugging endpoint в обычном запуске.
- Целевые прогоны runner выполнены на Node.js 22.14.0 и 24.21.0; обязательный свежий Verification фиксируется отдельным generated block. Диагностика содержит только синтетические данные.
- Linux CI, Windows и macOS не запускались: CI-лимиты исчерпаны, push запрещён владельцем, нового нативного Evidence нет. Их Acceptance остаётся pending; локальный PASS и наличие workflow не считаются платформенной приёмкой.



## Blocker / Failure reason

Контракт уточнён владельцем: сборка только на Linux, на Windows/macOS — запуск готового артефакта без компиляции. Подготовлены правильные готовые наборы и Linux E2E PASS; нужны фактические нативные Windows/macOS отчёты и новый STEP PLAN по уточнённому контракту. CI не требуется.

### Решение владельца от 2026-10-29

Обязательная CI-приёмка отменена; старые generated Evidence и observations выше являются историческими. Свежие lint/typecheck/tests/build/Harness validation прошли, локальный E2E упал на ожидании предпросмотра. Исправление E2E и Windows/macOS Evidence остаются обязательными. Изменённый контракт требует нового STEP PLAN; успешное завершение не заявлено.

### Повторный локальный прогон 2026-10-29

- Новый план прошёл независимый planning-review: `planning/plan-reviews/STEP-033/PLAN-REVIEW-20261029T084314Z.md`.
- Ограниченный `node apps/desktop/e2e/run.mjs`: exit 0, один полный сценарий PASS. Canonical Verification также подтвердил E2E PASS. Итоговый MP3 — 50 785 байт, тот же job присутствует в History после нового запуска Electron. Код E2E не менялся; прежний отказ предпросмотра не воспроизведён, причина неизвестна.
- Полный `npm test` завершился exit 1: 1 failed, 1389 passed. В `apps/cli/src/headless.integration.test.ts:206` после CLI crash/resume ожидается job `completed`, фактически получен `paused`; статусы треков при этом `completed`.
- Отдельный повтор `node packages/testing/scripts/run-yarn.mjs test apps/cli/src/headless.integration.test.ts` также показал 1 failed на том же assertion. Точный exit code дочерней команды отдельно не захвачен; наблюдаемый итог тестового runner — FAIL. Production CLI/application и tests вне E2E не менялись.
- Сверены инструкции и обновлены только разрешённые Testing/architecture claims о Linux PASS. Нативных Windows/macOS отчётов нет, приёмка остаётся pending. CI не требуется; workflows в этой execution не менялись.

### Наборы нативного E2E от 2026-10-29

- Подготовлены автономные Windows x64, macOS arm64 и macOS x64 наборы с текущими source/dist/dependencies, Node.js 24.21.0 и Electron 45.0.0. Включены исправления STEP-057 и жёлтая иконка. Это проверочные наборы, не установщики STEP-035.
- Build ID: `20261029T091933Z-b70e675e`; product source hash: `b70e675e5082b69fe205698090bcacf6d538383fa6c16b283ce8bc8651a2f728`. HEAD `32fb8e1aef7d7b78cb90b8ffce508da55f98aa52` с текущими незакоммиченными изменениями; один HEAD не идентифицирует набор.
- Архивы и инструкция находятся в `/home/user/Документы/vbox_shared/music-downloader-e2e-20261029-b70e675e/`. Имена: `music-downloader-e2e-win32-x64-b70e675e.zip`, `music-downloader-e2e-darwin-arm64-b70e675e.zip`, `music-downloader-e2e-darwin-x64-b70e675e.zip`. Рядом `SHA256SUMS.txt` и `ПРОВЕРКА-СБОРОК.json`; после копирования SHA-256 всех файлов совпал.
- Контрольные суммы runtime сверены с сохранённым официальным Node SHASUMS256 и установленным Electron checksums.json. CRC ZIP, архитектуры Node/Electron/SQLite и точные bytes актуальных manager/App/icon/E2E проверены — PASS.
- Автономный Linux-набор из того же product snapshot распакован отдельно и запущен встроенным Node: integrity, TypeScript build, desktop build и полный Electron E2E — PASS. Итоговый MP3 и History после перезапуска подтверждены. Это не нативный Windows/macOS PASS.
- Для нативного отчёта архив нужно распаковать на локальный диск гостевой ОС, выполнить `run-windows.cmd` или `run-macos.command` и вернуть папку `reports`. Нативные Windows/macOS Acceptance остаются pending до реальных отчётов с совпадающим sourceHash/buildId.

### Уточнение владельца: сборка только на Linux

2026-10-29: прежние наборы `20261029T091933Z-b70e675e` собирали приложение и host на целевой ОС и не соответствуют требуемой приёмке. Они заменяются наборами готового приложения и заранее собранного на Linux E2E host. Предыдущая самопроверка этих наборов остаётся историческим фактом и не закрывает новый контракт.

### Готовые артефакты: сборка только на Linux

- Неверные наборы с target-side build заменены готовым приложением и заранее собранным на Linux E2E host. В гостевых архивах отсутствуют src приложения, TypeScript/Vite/esbuild и команды сборки. Нативный launcher только проверяет хеши, создаёт runtime links и запускает готовые файлы.
- Build ID: `20261029T093752Z-9f44abe6`; sourceHash: `9f44abe60ddeb9afd97b71a36367d694a7cf5beffde5fa7332694b57872d77f4`; appArtifactHash: `7b37871db2ad5c2e8a2acfb020b2e57a048b70d470ed6a7b38f70baff9221f39`. Сборка выполнена на Linux x64, guestBuildAllowed=false.
- Папка: `/home/user/Документы/vbox_shared/music-downloader-ready-20261029-9f44abe6/`. Внутри Windows x64, macOS arm64/x64 ZIP, инструкция, SHA256SUMS и metadata. Все копии проверены по SHA-256.
- Linux-копия готового приложения прошла E2E без компиляции: performedOnGuest=false, e2e PASS, prebuiltFilesUnchanged PASS. Архитектуры runtime/SQLite и отсутствие компиляторов/src проверены для каждого ZIP.
- `open-app.cmd` / `open-app.command` открывают готовое приложение; `run-windows.cmd` / `run-macos.command` запускают автоматический E2E готового приложения. Нужно вернуть reports. Нативные Windows/macOS PASS до отчётов не заявлены.

### Полученные нативные отчёты готовой сборки

- Исходные отчёты владельца импортированы в `apps/desktop/e2e/evidence/native-20261029/`; manifest provenance содержит SHA-256 оригинальных report.json. Build ID `20261029T093752Z-9f44abe6`, sourceHash и appArtifactHash совпали с выданными готовыми наборами; сборка на гостях не выполнялась.
- Windows x64 и macOS arm64: машинные отчёты PASS, E2E exit 0, MP3 50 785 байт, тот же job в History после restart, prebuiltFilesUnchanged PASS.
- macOS x64: переданный машинный отчёт FAIL, integrity PASS; первый launch не показал поле «Ссылка на музыку» за 15 с, весь неуспешный прогон занял 32,2 с. По уточнению владельца это Rosetta 2 на Apple M2 Pro, а не Intel Mac.
- Отдельное сообщение владельца об одном успешном запуске, повторном пустом окне и последующем общем таймауте 90 с сохранено как owner observation. Свежего машинного отчёта с 90-секундным таймаутом в общей папке пока нет. Причина x64/Rosetta отказа не установлена; изменение таймаутов или production-кода не обосновано имеющимися данными.

### Нативный ARM64 офлайновый набор для Mac владельца

- По уточнению владельца подготовлен набор готового приложения с автоматическим офлайновым сценарием без авторизации для его Apple M2 Pro, без Rosetta. Приложение не менялось: текущая повторная Linux-сборка побайтно совпала со всеми productionFiles артефакта, ранее прошедшего реальный macOS arm64 E2E.
- Папка: `/home/user/Документы/vbox_shared/Mac-M2-offline-test-20261029/`; архив `music-downloader-Mac-Apple-Silicon-offline-test.zip`; build ID `20261029T103807Z-mac-arm64-offline`; appArtifactHash `7b37871db2ad5c2e8a2acfb020b2e57a048b70d470ed6a7b38f70baff9221f39`.
- Единственный пользовательский launcher — `ПРОВЕРИТЬ.command`: встроенный ARM64 Node/Electron, готовое приложение и ранее собранный на Linux host, синтетический provider, временное состояние. Авторизация, сборка в гостевой ОС и установленные Node.js/FFmpeg не требуются. Обычные launchers самостоятельного приложения из этого набора исключены.
- Добавлены companion system.json с CPU/runtime/translation probe и журналы Electron/Playwright; предыдущие отчёты при повторах сохраняются. Исходные E2E assertions и таймауты не менялись. Проверены bash/JS syntax, CRC, SHA256, полный file manifest, неизменность productionFiles и SHA256 копий. Linux ready E2E со штатными диагностическими флагами — PASS.
- Для нового launcher новый нативный результат ещё ожидается; за native proof прежнего готового приложения отвечает сохранённый исходный ARM PASS. Нестабильность x64/Rosetta не объявлена исправленной, Intel/x64 этим набором не проверяется.

### Повторные нативные отчёты ARM64 Mac

- Получен reports.zip, сохранён с SHA-256 и без изменения оригинала в `apps/desktop/e2e/evidence/native-20261029/mac-arm64-offline-103807/`. Извлечённые файлы и manifest provenance связывают два уникальных запуска, а не дубликаты current-run/previous-run.
- Оба запуска нативные arm64 на Apple M2 Pro/macOS 15.7.7, sysctl.proc_translated=0. Rosetta не использовалась.
- Первый запуск 10:45:54 UTC: FAIL запуска Electron за 7,1 с до сценария, Process failed to launch, kill EPERM, SIGKILL; причина не установлена.
- Последний запуск 10:47:11 UTC: полный E2E PASS за 13,3 с; compiled artifact hash совпал, performedOnGuest=false, итоговый MP3 50 785 байт, тот же job/History после restart, prebuiltFilesUnchanged PASS.
- Текущий нативный ARM64 сценарий подтверждён. Предыдущий ранний отказ сохранён как невыясненное наблюдение, а не объявлен исправленным благодаря успешному повтору. Код и таймауты не менялись; Intel/x64/Rosetta PASS этим архивом не доказан. Закрытие STEP по-прежнему требует актуального PLAN/Verification и независимого REVIEW.

### Привязка нативной приёмки к текущим готовым файлам

2026-10-29: после свежего PLAN с независимым PASS проверены все 342 productionFiles из frozen manifest: текущие dist/package побайтно совпадают с appArtifactHash `7b37871db2ad5c2e8a2acfb020b2e57a048b70d470ed6a7b38f70baff9221f39`. Пересобранный только на Linux E2E host совпал с prebuilt-host.js: SHA-256 `a98148a1569f7f3ae56741bb70d6ad5c824bf8e434fe9e91a3f18647159a85c3`; пять файлов сценария/bootstrap/fixture совпали с готовым Windows набором. Полная карта — `apps/desktop/e2e/evidence/native-20261029/ready-artifact-binding.json`.

Для платформенной приёмки STEP-033 используются исходный Windows x64 PASS и последний native macOS arm64 PASS набора `20261029T103807Z-mac-arm64-offline`: performedOnGuest=false, итоговый MP3 50 785 байт, тот же job в History после restart. Документация Testing/E2E/architecture синхронизирована с этими фактами. Предыдущие FAIL сохранены, причина стартовых ошибок не объявлена исправленной; отдельный x64/Rosetta STEP-054 сохраняет свой статус. CI не требуется. Завершение определяется свежими canonical Verification и независимым REVIEW.
