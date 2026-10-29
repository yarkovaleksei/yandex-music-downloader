---
schema: 1
id: STEP-057
status: completed
type: bugfix
priority: high
phase: hardening
depends_on:
  - STEP-026
requirements:
  - REQ-020
  - REQ-042
adrs:
  - ADR-004
  - ADR-007
architecture_refs:
  - "docs/architecture.md#основные-потоки"
risk_flags:
  - none
plan:
  status: ready
  revision: 1
  context_basis: sha256:7a351b71d2fd74c20b0b4516c32d8d8bd936c7690226cf9117a91691525eebf2
  content_hash: sha256:333c0c084f19f7c74bc803ccd311411f71528cc84cc652563d00d4ee5b051013
  reviewed_report: planning/plan-reviews/STEP-057/PLAN-REVIEW-20261029T085011Z.md
  planned_at: 2026-10-29T08:50:11+00:00
  execution_groups:
  context_components:
    - "ADR@ADR-004=sha256:4ad987cbdefdf1409c52fd01994ccca0d6941fad8ae0126d435745f3e727ca08"
    - "ADR@ADR-007=sha256:04d6b08c651797508a14cb298d43f539d5364b851981d6d9064800f288b6b42c"
    - "ARCH@docs/architecture.md#основные-потоки=sha256:e7842c107b39127d5776d5575d975efcf69df8d05024b630a938e1dc510e7575"
    - "PRN@PRN-001=sha256:3b3801f207fafc3f77272f0e93570258a6d006964839d93a276accd814d548af"
    - "PRN@PRN-002=sha256:f29ee3fbdb9cf65cf9739d0907768bbf192ad88b8e443110d4d82f81c6b79ecb"
    - "PRN@PRN-003=sha256:16516d7d302fecda5f7615f9d55e29e04b588d671f8660640e1f61d1619e4ef8"
    - "REQ@REQ-020=sha256:93b4e91c7b271606530f1bafa07000f04d26e338e032ded633ab019958ec92dc"
    - "REQ@REQ-042=sha256:401263db29ff424588bd0dd6404896271a21b2d5d66d42da5f7a707889474124"
    - "STEP@STEP-026=sha256:0c5cc608966d02e44fcfbdc70599b40eb4a676427ab51a168da389b559a4966f"
    - "STEP@STEP-057=sha256:1d597e0fed714a86771a5db94d3eb5959727422f53177b11020309e7b69a5e8d"
---

# STEP-057 — Итоговое состояние CLI после crash/resume

## Goal

Устранить воспроизводимый отказ CLI crash/resume: успешно завершённая загрузка после штатного закрытия приложения сохраняет job completed, а не paused.

## Context

При STEP RUN STEP-033 полный npm test завершился FAIL в apps/cli/src/headless.integration.test.ts:206: оба трека completed, job paused вместо completed. Отдельный повтор подтвердил тот же отказ. Electron E2E STEP-033 проходит. Владелец 2026-10-29 разрешил отдельное исправление. Это восстановление REQ-020/042, а не новый product contract; исторические PASS STEP-026 не переписываются.

## Scope

- Локализовать причину итогового paused в пути CLI resume → application/core lifecycle → shutdown → сохранённый snapshot.
- Минимально исправить подтверждённую причину в production-коде либо тестовой fixture, сохранив контракт completed и действительную проверку crash/resume.
- Сохранить пропуск завершённых треков, Range offset незавершённого трека, целостность файлов, штатное освобождение аренды и отсутствие секретов.

## Mutation policy

### Allowed

- `apps/cli/src/runner.ts`, `apps/cli/src/commands.ts` и относящиеся к ним tests.
- `apps/cli/src/headless.integration.test.ts`, `apps/cli/src/fixtures/headless-owner.mjs`.
- `packages/application/src/jobs.ts` и относящиеся к lifecycle tests.
- `packages/core/downloader/src/manager.ts` и его tests.

### Conditional

- Другие непосредственно вызываемые lifecycle helpers в `packages/core/downloader/src/**` — только если воспроизводимый дефект принадлежит им; обоснование в Evidence.

### Forbidden

- Ослабление assertion completed, удаление crash/resume сценария, ретраи теста вместо исправления.
- Изменение persistence schema, public API, архитектурных границ, provider или UI.
- Любые workflows CI приложения/Harness, зависимости и unrelated функциональность.

## Out of scope

- Desktop E2E и Windows/macOS приёмка STEP-033.
- CI-приёмка: успешный CI не требуется.

## Acceptance criteria

- Существующий CLI crash/resume integration test проходит: после нового процесса и штатного shutdown job и оба трека completed.
- Завершённый первый трек не скачивается заново, второй продолжается с сохранённого offset 32; payload файлов корректен, .part отсутствуют.
- Проверки отсутствия токена и signed URL в JSON/stdout/stderr/logs/SQLite сохраняются и проходят.
- Полный локальный npm test проходит; прекращение действительно активной загрузки продолжает использовать pause/release по ADR-004/007.

## Verification

- command: `node packages/testing/scripts/run-yarn.mjs test apps/cli/src/headless.integration.test.ts`
- command: `npm run lint`
- command: `npm run typecheck`
- command: `npm test`
- command: `npm run build`
- command: `python3 .harness/tools/validate.py --mode manual`

## Deliverables

- Минимальное исправление причины отказа и regression proof существующего CLI crash/resume сценария.

## Implementation plan

### 1. Закрепить воспроизведённую гонку финализации regression proof

- Observation planning/reviews/STEP-026/OBSERVATION-20261029T084758Z-f3c27614d138.json связывает поздний отказ с trusted PASS STEP-026. Full Verification без incremental reuse.
- Bounded proof выполнен: при заблокированном writePlaylist оба трека completed/control running; shutdown переводит control в paused, подавляет job.completed и освобождает lease. Добавить deterministic regression test с управляемым gate writer, без произвольного sleep; до исправления он должен падать на сохранении running и completion.
- Существующие проверки настоящего CLI crash/resume, offset32, пропуска первого трека и секретов не ослаблять.

**Files:**
- packages/core/downloader/src/manager.test.ts

**Tests:**
- Целевой regression test до фикса FAIL; после фикса PASS.

### 2. Дождаться терминальной финализации в shutdown вместо применения pause

- В manager.shutdown при intent running, существующем loop и terminal aggregate completed/completed_with_errors/failed ожидать тот же loop через существующий bounded timeout. Не вызывать pause или повторный launch/writer в этой стадии.
- Сохранить порядок writer→job.completed→единственный close/release; ошибка loop/writer и timeout остаются отказом shutdown. Добавить проверку writer rejection в том же воспроизведённом terminal shutdown окне.
- Для действительно активных треков сохранить прежний pause/drain/release; существующие cancel-during-writer и shutdown/release timeout/rejection tests остаются без ослабления. Shared caller Jobs.command(pause) при уже terminal aggregate также дожидается финализации. Aggregate precedence, API/store и ADR не менять.

**Files:**
- packages/core/downloader/src/manager.ts
- packages/core/downloader/src/manager.test.ts

**Tests:**
- Целевой manager suite и существующий CLI crash/resume integration test.

**Risks:**
- Не объявлять lease освобождённой при timeout/неуспешном release; использовать существующие bounded/closePromise.

### 3. Проверить интеграцию и записать фактический результат

- Выполнить canonical полный Verification, включая существующий CLI crash/resume и npm test, через dispatcher.
- Записать root cause, red/green regression proof и результаты в Evidence STEP-057. Current-state architecture/overview не меняются: исправление восстанавливает существующий контракт без новых возможностей.
- Workflows CI приложения/Harness, сторонние изменения рабочего дерева и completed исторические STEP/reports не менять; commit/push не выполнять.

**Tests:**
- Все команды из Verification.

## Evidence



<!-- VERIFICATION-EVIDENCE:START -->
- Verification run: 2026-10-29T09:02:02Z
- Status: PASS
- Automated resumed: false
- Verification mode: full
- Incremental executed checks: 6
- Incremental reused checks: 0
- Targeted feedback reused: 0
- Incremental fallback reason: IMPACT_MAP_NOT_CONFIGURED
- Git head: 32fb8e1aef7d7b78cb90b8ffce508da55f98aa52
- Worktree hash: sha256:29cb8b2a9f7e99063100b6b14065b423018bdca8bc51504cb0acc3d73fe22de6
- Verification contract basis: sha256:3e4fe9d12ec3f9be398e6e0bab4f5cd1364aec99ec3e646184c358601bac0e72
- Verification context basis: sha256:b304ab41ceffb3572e9eabb8843877e63c1ea5d6778f6648b40fd0aae37377dd
- Subject git head: 32fb8e1aef7d7b78cb90b8ffce508da55f98aa52
- Subject worktree hash: sha256:d0a3d569fc0a4532b1b4955eecc01374f3c1429e3537bff61753488c4bad34c1
- Subject content hash: sha256:bcef4ed79038264aa953a036e71ee033580c197e7058ec8f8d4a9994a2ebc58f

### Automated verification
- Command: node packages/testing/scripts/run-yarn.mjs test apps/cli/src/headless.integration.test.ts
  - Status: PASS
  - Exit code: 0
  - Duration ms: 34577
  - stdout sha256: 791490b563e97d2f76413e3da86bc7b95918dcb20912a813b97c165a454e574c
  - stderr sha256: 9c80c347621eed2ce8daf8d454164257705b380641f22ae1a4fa47cf92ebf89b
  - stdout bytes: 472
  - stderr bytes: 63
  - Provenance: executed
- Command: npm run lint
  - Status: PASS
  - Exit code: 0
  - Duration ms: 15293
  - stdout sha256: a9abc4bc51d6729860fb000bf87c02e5a80cc830999d05e640c5651c7e3daa6a
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 147
  - stderr bytes: 0
  - Provenance: executed
- Command: npm run typecheck
  - Status: PASS
  - Exit code: 0
  - Duration ms: 7826
  - stdout sha256: 73ad7967b0b62b903e0e14e90a6a3971d720cb1ab6b744714e6d2ef05dd89743
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 83
  - stderr bytes: 0
  - Provenance: executed
- Command: npm test
  - Status: PASS
  - Exit code: 0
  - Duration ms: 39008
  - stdout sha256: 0f35cabd65403559e34f2af0f1cf71f2f59960c7ef6188c3a99e229a3578e701
  - stderr sha256: fd946ebad695f4c5906e1989392bd4b6c8b7aa239e01a6d5afc4fe1e96a55770
  - stdout bytes: 16766
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
- Command: python3 .harness/tools/validate.py --mode manual
  - Status: PASS
  - Exit code: 0
  - Duration ms: 5471
  - stdout sha256: 5bdad1a1ca405e520ab0848cf85781a5b2d581c58ed456755e88fb9b1c44fe2f
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 67
  - stderr bytes: 0
  - Provenance: executed

### Product verification
- none

### Manual verification
- none
<!-- VERIFICATION-EVIDENCE:END -->

Исходный отказ зафиксирован в Evidence STEP-033 от 2026-10-29; это воспроизводимое наблюдение, причина на момент ADD не установлена.



## Blocker / Failure reason

—

### Причина и regression proof

- `observeJob` завершает CLI при terminal snapshot всех треков. В этот момент исходный manager loop может ещё выполнять `writePlaylist` до `job.completed` и `close`. Прежний `shutdown` применял pause к ещё открытому loop и тем самым сохранял control paused после завершения треков.
- Bounded proof с управляемым gate writer до исправления: before running / completed,completed; after paused / completed,completed; job.completed отсутствует, lease освобождена. Скрипт был временным; итог зафиксирован как наблюдение, не как исходный terminal quote.
- Regression cases (успех и отказ writer) до production fix: exit 1, 2 failed. После изменения manager: exit 0, 29 tests PASS, включая оба regression cases. Проверка writer rejection также доказала, что shutdown теперь сохраняет ошибку финализации вместо ложного успеха.
- Исправление: при intent running, существующем loop и aggregate completed/completed_with_errors/failed shutdown ждёт тот же loop через существующий bounded timeout. Active pause/drain/release, aggregate precedence, API/schema и closePromise не изменены.
- Источник позднего дефекта: `planning/reviews/STEP-026/OBSERVATION-20261029T084758Z-f3c27614d138.json`. Исторические PASS/reports не переписывались. Workflow CI приложения/Harness не менялся в STEP-057; commit/push не выполнялись.

### FIX F-001 — освобождение аренды при одновременном pause

- Независимый REVIEW `planning/reviews/STEP-057/REVIEW-20261029T085927Z.md` воспроизвёл прямую регрессию: terminal loop при одновременном pause пропускает свой close, а ранний return shutdown оставлял lease занятой.
- Добавлен обязательный вызов существующего идемпотентного close после bounded(loop). Ошибки и timeout не подавляются; closePromise сохраняет единственность release.
- Regression test с gate writer и owner pause до исправления: exit 1, 1 failed. После исправления manager suite: exit 0, 30 tests PASS. Код исправления соответствует только F-001; adjacent hardening не добавлялся.
