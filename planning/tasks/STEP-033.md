---
schema: 1
id: STEP-033
status: in_progress
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
  context_basis: sha256:396b41bd9c8f66b69d2f7d2ddc96d25acb16ef2a3b0a6840bd7e748680a64894
  content_hash: sha256:29b6355f5f2a1fc979a7e22c90bb0538bf7514e903fb9cfca1bb4c1b8caa96eb
  reviewed_report: planning/plan-reviews/STEP-033/PLAN-REVIEW-20261028T204003Z.md
  planned_at: 2026-10-28T20:40:03+00:00
  execution_groups:
  context_components:
    - "ARCH@docs/architecture.md#известный-architecture-debt-drift=sha256:ea129bff2b269f5c3689cb4a4d8a2aa47a088cfe620ca2267d43526b541319fb"
    - "ARCH@docs/architecture.md#основные-потоки=sha256:e7842c107b39127d5776d5575d975efcf69df8d05024b630a938e1dc510e7575"
    - "PRN@PRN-001=sha256:3b3801f207fafc3f77272f0e93570258a6d006964839d93a276accd814d548af"
    - "PRN@PRN-002=sha256:f29ee3fbdb9cf65cf9739d0907768bbf192ad88b8e443110d4d82f81c6b79ecb"
    - "PRN@PRN-003=sha256:16516d7d302fecda5f7615f9d55e29e04b588d671f8660640e1f61d1619e4ef8"
    - "REQ@REQ-053=sha256:2eb10ba3f4798da30d0639d0cf5abc8163824fd1a69c3020fb96735d346f1a80"
    - "STEP@STEP-031=sha256:ec5bdfca46bb193cece7b4ac637c64a440be3e958cd81bb824f5e9fd5e87209f"
    - "STEP@STEP-032=sha256:fae227682d39f2eaa5277169a6868a00e75c4d3c39e652a98b98c654e174a0ed"
    - "STEP@STEP-033=sha256:05a160179e22e1d34cd5df0aefb0a525c3a67f68dcf77d9ffbcef88e1a987a1f"
---

# STEP-033 — E2E-тест desktop

## Goal

Добавить автоматический E2E: resolve URL → start → pause → resume → complete → история.

## Context

E2E запускается на mock provider; ручное подтверждение на Windows и macOS.

## Scope

- E2E-фреймворк для Electron и сценарий.
- Интеграция в CI (Linux) и сборочные матрицы по мере готовности.
- После фактической реализации описать запуск E2E и границы локального, CI и ручного платформенного доказательства; сведения о готовности обновлять только по полученному Evidence.

## Mutation policy

### Allowed

- `apps/desktop/e2e/**`, CI workflow (дополнение матрицы).

### Conditional

- `docs/development.md` — только Testing и команда запуска нового E2E.
- `docs/architecture.md#известный-architecture-debt-drift` — только фактическое состояние E2E и оставшихся desktop gates; локальный успех не закрывает CI или Windows/macOS Acceptance.

### Forbidden

- Новая функциональность UI.
- Реализация future/unrelated STEP «заодно».

## Out of scope

- Release CI.

## Acceptance criteria

- E2E проходит на Linux в CI.
- Сценарий проверяет файл в выходном каталоге и запись в истории.
- Windows и macOS подтверждены вручную (Evidence).

## Verification

- command: `npm run lint`
- command: `npm run typecheck`
- command: `npm test`
- command: `npm run build`
- command: `node apps/desktop/e2e/run.mjs`
- command: `python3 .harness/tools/validate.py --mode manual`
- manual: Подтвердить успешный запуск Electron E2E на Linux в CI по фактическому job output для проверяемой revision; при недоступном запуске сохранить этот Acceptance pending.
- manual: Выполнить тот же Electron E2E на Windows и macOS, сохранить платформу, revision, результат полного сценария, итоговый файл и запись истории; отсутствие фактического Evidence оставляет соответствующий Acceptance pending.
- manual: Сверить инструкции E2E и текущие desktop gates с фактическими результатами; явно сохранить pending CI/Windows/macOS, если соответствующее Evidence ещё не получено.

## Deliverables

- E2E suite.
- Инструкции запуска и фактические ограничения доказательства E2E.

## Implementation plan

### 1. Подготовить изолированный запуск настоящего Electron

- Добавить отдельный E2E package с закреплённым Playwright, lockfile и одним worker; зависимости устанавливаются до сценария.
- Создавать отдельные временные userData/stateDir/outputDir. Тестовый entrypoint задаёт userData до main; точный production host source собирается с alias только импорта application factory на wrapper реальной createApplication с providerOverride/temp stateDir. Сохранить production main/preload/renderer/broker/MessagePort/utilityProcess/handler/SQLite/files/processing.
- Первой ограниченной проверкой доказать окно и host. Если production удаление automation switches подтверждённо мешает, необходимая адаптация допускается только в тестовом bootstrap с явным описанием ограничения; shipping entrypoint не менять.
- Добавить собственный offline provider с валидными малыми media fixtures и управляемой отменяемой задержкой потока для наблюдаемой pause. Реальные account/credentials/сеть не нужны; runtime packages/testing из apps не импортировать.
- Runner в finally закрывает Electron, сохраняет понятную ошибку запуска и удаляет только свои временные каталоги.

**Files:**
- apps/desktop/e2e/package.json
- apps/desktop/e2e/package-lock.json
- apps/desktop/e2e/playwright.config.mjs
- apps/desktop/e2e/prepare.mjs
- apps/desktop/e2e/main.mjs
- apps/desktop/e2e/application.mjs
- apps/desktop/e2e/provider.mjs
- apps/desktop/e2e/assets/**
- apps/desktop/e2e/run.mjs

**Tests:**
- Ограниченный запуск реального Electron с изолированным состоянием подтверждает окно, связь с host и завершение до полного сценария.
- Не использовать fake DesktopApi, user state, подмену stores или processing.

**Risks:**
- Совместимость automation switches подтвердить первой проверкой; предпосылки Electron/display определить по фактическому Linux запуску.

### 2. Проверить пользовательский сценарий, файл и SQLite историю

- Через реальные элементы renderer ввести mock URL, получить preview, выбрать временный output и начать download; в main подставляется только ответ native dialog.
- По наблюдаемым состояниям дождаться pause action, приостановить, подтвердить paused, продолжить, дождаться completed; произвольные задержки внутри теста не использовать.
- Открыть History и проверить тот же job/track. Проверить непустой итоговый файл внутри outputDir и сохранённую запись реальной SQLite временного stateDir; читать persistence evidence после штатного закрытия host либо безопасным доступным способом.
- При падении сохранять ограниченные диагностику/снимок только тестового состояния.

**Files:**
- apps/desktop/e2e/download.spec.mjs
- apps/desktop/e2e/run.mjs
- apps/desktop/e2e/provider.mjs

**Tests:**
- node apps/desktop/e2e/run.mjs
- Один полный проход URL→start→pause→resume→complete→History доказывает output file и SQLite record.

**Risks:**
- Existing mock bytes не являются валидным media; собственная fixture должна пройти настоящие validation/metadata без processing override.

### 3. Подключить тот же сценарий к Linux CI

- Добавить Linux E2E job в существующий CI workflow: принятая установка workspace dependencies, закреплённые E2E dependencies, production build, тот же runner с одним worker.
- Настроить необходимые по фактическому запуску системные предпосылки/виртуальный дисплей; сохранить диагностику неудачи через принятые версии upload-artifact и ограниченное хранение.
- Порядок install→build→E2E не допускает скрытого успеха при ошибке. Linux CI PASS фиксируется только по фактическому job output; при исчерпанных лимитах gate pending, локальный PASS его не заменяет.

**Files:**
- .github/workflows/ci.yml

**Tests:**
- Семантическая проверка порядка и отказа при ошибке.
- Фактический успешный CI output после доступного внешнего запуска.

### 4. Записать инструкции и фактические границы доказательства

- README E2E описывает установку, единую команду, временное состояние, mock fixtures, test host composition и платформенные предпосылки.
- В development Testing добавить E2E команду отдельно от unit/integration. В разрешённом architecture разделе описать полученное локальное Evidence и оставшиеся CI/Windows/macOS gates после реализации.
- Выполнить все автоматические проверки. Ручной Windows/macOS прогон сохраняет платформу/revision/полный сценарий/файл/историю; засчитывается только фактическое Evidence.
- До реального Linux CI и Windows/macOS доказательства Acceptance остаётся незавершённой. Packaging и соседние gates сохранить; push не выполнять.

**Files:**
- apps/desktop/e2e/README.md
- docs/development.md#testing
- docs/architecture.md#известный-architecture-debt-drift

**Tests:**
- Сверить инструкции с реальным runner и фактическими результатами; явно сохранить pending внешних gates.

## Evidence


<!-- VERIFICATION-EVIDENCE:START -->
- Verification run: 2026-10-28T20:57:11Z
- Status: MANUAL_REQUIRED
- Automated resumed: false
- Verification mode: full
- Incremental executed checks: 6
- Incremental reused checks: 0
- Targeted feedback reused: 0
- Incremental fallback reason: IMPACT_MAP_NOT_CONFIGURED
- Git head: 59ce6eaa9c54916b2037de8bf101cbb6797b3b8d
- Worktree hash: sha256:fcfd06bbe7c3ff05bf720dce6b8f5be22ebc517a4440688cb27755b4fc29c05e
- Verification contract basis: sha256:f19f9a882c1daabdf5e514a9ef1a180d4ba3f792b1014b215e84f6d1e338edc2
- Verification context basis: sha256:463f7a0f17e11114bd4b684742a791cb84024bd2c9b93f029984f6cef7c4ede8
- Subject git head: 59ce6eaa9c54916b2037de8bf101cbb6797b3b8d
- Subject worktree hash: sha256:d41959d687fe520b49efb7d26bd740e4e45b9c086296c26b654bbf0e7e812e22
- Subject content hash: sha256:d1c91794ca2d0aa2954168f2ded87c0595a978977a2178100db598807e162afd

### Automated verification
- Command: npm run lint
  - Status: PASS
  - Exit code: 0
  - Duration ms: 15185
  - stdout sha256: a9abc4bc51d6729860fb000bf87c02e5a80cc830999d05e640c5651c7e3daa6a
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 147
  - stderr bytes: 0
  - Provenance: executed
- Command: npm run typecheck
  - Status: PASS
  - Exit code: 0
  - Duration ms: 8027
  - stdout sha256: 73ad7967b0b62b903e0e14e90a6a3971d720cb1ab6b744714e6d2ef05dd89743
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 83
  - stderr bytes: 0
  - Provenance: executed
- Command: npm test
  - Status: PASS
  - Exit code: 0
  - Duration ms: 38813
  - stdout sha256: 2447277ed8d727f3ad65f57ee18e439d8651f3dbd063a35c5f0dc6d633ead01e
  - stderr sha256: e58f0c47d075ab7b4c578fb4147ba9a5ee043266e792599af2fda9282460240c
  - stdout bytes: 16010
  - stderr bytes: 4700
  - Provenance: executed
- Command: npm run build
  - Status: PASS
  - Exit code: 0
  - Duration ms: 666
  - stdout sha256: 4a84685762211c33a9f2ac6336f7b1d29d9e1f9d26373ef0b9a167bf0a587116
  - stderr sha256: 351b524197fb492920789369e7f1a271420c757633fbb553b280a181ac4c31a4
  - stdout bytes: 88
  - stderr bytes: 360
  - Provenance: executed
- Command: node apps/desktop/e2e/run.mjs
  - Status: PASS
  - Exit code: 0
  - Duration ms: 9676
  - stdout sha256: dada24dcf5a09bafe396fe050a9a62e8b28d1d0ad8ea11de4295947a1816bde9
  - stderr sha256: 8a707d265fdfddab79a4f9aed70dddaa7687c49cedfeaaf47625646b623ddbeb
  - stdout bytes: 281
  - stderr bytes: 326
  - Provenance: executed
- Command: python3 .harness/tools/validate.py --mode manual
  - Status: PASS
  - Exit code: 0
  - Duration ms: 5270
  - stdout sha256: ca73798d9bde23bfbc90f3999919a35ec66c02f63102abe8d872326eadae12b8
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 135
  - stderr bytes: 0
  - Provenance: executed

### Product verification
- none

### Manual verification
- Check: Сверить инструкции E2E и текущие desktop gates с фактическими результатами; явно сохранить pending CI/Windows/macOS, если соответствующее Evidence ещё не получено.
  - Status: PASS
  - Observed: "README E2E и docs/development Testing сверены с фактическими isolated install/build/runner командами, bootstrap и полным локальным Linux сценарием. Architecture описывает local proof и явные pending CI/Windows/macOS; shipping debug-switch limitation, отсутствие userDB/keyring/liveprovider, реальные stores/processing и отдельные packaging gates сохранены. Публикация и внешние прогоны не выполнялись."
- Check: Подтвердить успешный запуск Electron E2E на Linux в CI по фактическому job output для проверяемой revision; при недоступном запуске сохранить этот Acceptance pending.
  - Status: PENDING
- Check: Выполнить тот же Electron E2E на Windows и macOS, сохранить платформу, revision, результат полного сценария, итоговый файл и запись истории; отсутствие фактического Evidence оставляет соответствующий Acceptance pending.
  - Status: PENDING
<!-- VERIFICATION-EVIDENCE:END -->

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.

### Локальный Electron E2E

- На Linux x64 выполнен полный сценарий с настоящими renderer, preload, IPC broker, MessagePort, utilityProcess, application, файловыми adapters, metadata/validation и SQLite. Offline provider, каталоги и ответ системного диалога тестовые; stores и processing не подменялись.
- Наблюдались downloading → paused → completed после кнопок паузы/продолжения; итоговый MP3 — 50 785 байт. UI History содержит тот же job; после штатного закрытия, проверки SQLite header и нового Electron/utilityProcess восстановлены те же история, completed job и файл.
- Отдельный bounded запуск подтвердил, что обычное удаление Chromium debugging switches мешает Playwright; тестовый bootstrap сохраняет только `remote-debugging-port`/`remote-debugging-pipe`. Shipping source не меняется; этот E2E не доказывает отсутствие debugging endpoint в обычном запуске.
- Целевые прогоны runner выполнены на Node.js 22.14.0 и 24.21.0; обязательный свежий Verification фиксируется отдельным generated block. Диагностика содержит только синтетические данные.
- Linux CI, Windows и macOS не запускались: CI-лимиты исчерпаны, push запрещён владельцем, нового нативного Evidence нет. Их Acceptance остаётся pending; локальный PASS и наличие workflow не считаются платформенной приёмкой.


## Blocker / Failure reason

—
