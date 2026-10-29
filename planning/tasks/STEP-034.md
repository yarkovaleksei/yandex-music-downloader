---
schema: 1
id: STEP-034
status: completed
type: adr
priority: low
phase: packaging
depends_on:
  - STEP-033
requirements:
  - REQ-054
  - REQ-055
adrs:
  - ADR-014
  - ADR-015
  - ADR-018
adr_outputs:
  - ADR-018
architecture_refs:
  - docs/architecture.md#deployment-runtime-assumptions
architecture_outputs:
  - docs/architecture.md#deployment-runtime-assumptions
risk_flags:
  - architecture
  - release-critical
plan:
  status: ready
  revision: 1
  context_basis: sha256:b2b6c0b34154158187efd3ee693feac516f17d455b232599200fa8d716646d35
  content_hash: sha256:79018a06ca4b4ad5d65478e2eaa4c02822679e11223c7f8a8bbf593399b418d8
  reviewed_report: planning/plan-reviews/STEP-034/PLAN-REVIEW-20261029T113003Z.md
  planned_at: 2026-10-29T11:30:03+00:00
  execution_groups:
  context_components:
    - "ADR@ADR-014=sha256:d21dd58fd7f4167a6b4820ba1f26624fcf440fb7a3f9fdc926e1ec517a969f39"
    - "ADR@ADR-015=sha256:0fd7f2940c2f6ac5a15eda9b9c9ad7c6a961062d03a4eedd4e3dd03eb8750d53"
    - "ARCH@docs/architecture.md#deployment-runtime-assumptions=sha256:fc520397c4d2e3737c000cc225b7b76b4ec3aef0d626169e608e2954cab41cf9"
    - "PRN@PRN-001=sha256:3b3801f207fafc3f77272f0e93570258a6d006964839d93a276accd814d548af"
    - "PRN@PRN-002=sha256:f29ee3fbdb9cf65cf9739d0907768bbf192ad88b8e443110d4d82f81c6b79ecb"
    - "PRN@PRN-003=sha256:16516d7d302fecda5f7615f9d55e29e04b588d671f8660640e1f61d1619e4ef8"
    - "REQ@REQ-054=sha256:43694c3bffee6a52de253081dbbd6eab790be4ecdd06b8ca729b267b90d40655"
    - "REQ@REQ-055=sha256:b50fc245734c2dbeb971c0e9da4f69c821a7b7cc6ae18f372cd98f643c8de98e"
    - "STEP@STEP-033=sha256:7bdb467f8d787e6be9dcd05aefcc6b96896df413e94b7960f6f4c8efed9e2c11"
    - "STEP@STEP-034=sha256:54c3598baa52a58639bdbcc655314af2e1540e1ccd97ae9fa4e0e43d71284750"
---

# STEP-034 — ADR: кроссплатформенная упаковка

## Goal

Принять решение по инструментам упаковки, схеме автообновления и подписания для Windows, macOS и Linux.

## Context

Решение зависит от фактической структуры desktop-приложения. По решению владельца все сборки выполняются только на Linux; новые Windows/macOS прогоны выполняются в самом последнем STEP-054. Принятие архитектуры не требует наличия сертификатов OQ-013 или нативных прогонов сейчас: реальные подпись и updater реализуются в STEP-036.

## Scope

- ADR «Cross-platform packaging».
- Описание схемы обновления и подписания (без секретов).
- Синхронизация принятого решения в `docs/architecture.md#deployment-runtime-assumptions` без заявления о готовой реализации упаковки.

## Mutation policy

### Allowed

- `docs/adr/**`, `docs/architecture.md`.

### Conditional

- Нет.

### Forbidden

- Production-код, секреты.
- Реализация future/unrelated STEP «заодно».

## Out of scope

- Реализация packaging.

## Acceptance criteria

- ADR accepted и покрывает Windows, macOS (arm64/x64), Linux.
- Схема автообновления и подписания описана без секретов в репозитории.

## Verification

- command: `python3 .harness/tools/validate.py --mode manual`
- manual: Независимая архитектурная проверка.

## Deliverables

- ADR-018 — упаковка, обновления и подписание при сборке только на Linux.
- `docs/architecture.md#deployment-runtime-assumptions` — описание принятого решения и оставшихся этапов реализации.

## Implementation plan

### 1. Принять ADR-018 о Linux-упаковке и доверенных обновлениях

- Создать ADR-018 по проектному template: один electron-builder стабильной ветки 26 (baseline 26.18.1) для NSIS Windows x64, AppImage Linux x64 и .app ZIP macOS arm64/x64; зависимости в этом STEP не добавлять.
- Описать staging production dist, изолированную production closure workspace packages, target native prebuilds, asar/unpack native libraries, стабильные app/bundle ID и общий stateDir; сохранить ADR-014/015 и shipping fuses отдельно от тестовой адаптации Playwright.
- Принять rcodesign как Linux signing/notarize/staple путь macOS до итогового ZIP; Windows signing через Linux Authenticode tooling, Linux release descriptor signing. OQ-013 оставить открытым у STEP-036.
- Зафиксировать electron-updater baseline 6.8.12 и отдельный Ed25519 release descriptor с immutable tuple version/OS/arch/URL/size/SHA256. Main проверяет подпись до загрузки, downloaded bytes после загрузки и publisher code signing отдельно; autoDownload/autoInstallOnAppQuit=false, единственный guarded install. Не полагаться на unreleased v27 signed manifests.
- Сохранить shutdown application host, общий SQLite stateDir, forward-only migrations и отказ downgrade вместо ложного обещания автоматического rollback. Фактическая реализация и проверки принадлежат STEP035/036/054, ADR не заявляет их выполненными.

**Files:**
- docs/adr/ADR-018-linux-packaging-and-updates.md

**Risks:**
- Документация инструментов — основание выбора, не native proof; реальные сертификаты/Apple account остаются OQ-013 для STEP-036.

### 2. Синхронизировать architecture и traceability принятого решения

- Связать ADR018 с REQ054/055 и STEP034/035/036/054 двусторонне, изменяя только metadata traceability соседних STEP и requirements.
- Обновить только docs/architecture.md#deployment-runtime-assumptions: принятое решение, Linux-only сборка, сохранение stateDir/fuses и final native gate; не объявлять packaging/updater уже реализованными.
- Выполнить H001: validate canonical graph/outputs; независимая архитектурная manual проверка сверяет семантические constraints и ownership.

**Files:**
- docs/architecture.md#deployment-runtime-assumptions
- docs/requirements/REQ-054-pack-installers.md
- docs/requirements/REQ-055-pack-update-signing.md
- planning/tasks/STEP-034.md
- planning/tasks/STEP-035.md
- planning/tasks/STEP-036.md
- planning/tasks/STEP-054.md

### 3. Проверить и зафиксировать ADR без реализации packaging

- Выполнить canonical Verification и независимую архитектурную проверку самого ADR; при материальном противоречии исправить документ в рамках объявленного output.
- Зафиксировать Evidence и пройти независимый STEP REVIEW; старые Accepted ADR и historical reports не менять, production/CI/dependencies не трогать.

## Evidence


<!-- VERIFICATION-EVIDENCE:START -->
- Verification run: 2026-10-29T11:31:18Z
- Status: PASS
- Automated resumed: false
- Verification mode: full
- Incremental executed checks: 1
- Incremental reused checks: 0
- Targeted feedback reused: 0
- Incremental fallback reason: RISK_REQUIRES_FULL
- Git head: 32fb8e1aef7d7b78cb90b8ffce508da55f98aa52
- Worktree hash: sha256:2623008cab4325e8818caf86e7d73df45ad1e66408c1dcec57c25fdf261c57b0
- Verification contract basis: sha256:d445d35dc4330f737edb62ba505b5f4cd833f0ed502d5345b3e20106dcfde4d0
- Verification context basis: sha256:17ce5c3180f7e55fa9edad5e0e27def3bfabe6512c40aef3ae541eeb9bfd295a
- Subject git head: 32fb8e1aef7d7b78cb90b8ffce508da55f98aa52
- Subject worktree hash: sha256:75cb22a11252f5d27e17687d2f57276451b3cd50ae354e226a5fb9fac10c0ab0
- Subject content hash: sha256:6fd91a820f848e340d15c7a14d03bca8ae7b7cf61cdbae1451c75ca2ea71f84e

### Automated verification
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
- Check: Независимая архитектурная проверка.
  - Status: PASS
  - Observed: "Независимый architect architecture_034 прочитал созданный ADR018 и deployment/runtime anchor и подтвердил PASS без материальных противоречий. Stable builder26.18.1/updater6.8.12, Linux-only NSIS/AppImage/maczip, rcodesign/osslsigncode и хеши после подписи; immutable signed descriptor+payload validation, false auto flags, guarded install, no provider/credentials в main. Common stateDir/namespaces/shipping fuses и forward-only SQLite no downgrade сохранены. Owners035/036/054, OQ013open, native readiness не заявлена. Primary docs и released MacUpdater6.8.12 проверены, предположение преждевременного Squirrel install при falseauto флаге опровергнуто."
<!-- VERIFICATION-EVIDENCE:END -->

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.


## Blocker / Failure reason

—

### Принятое решение упаковки

Создан ADR-018: electron-builder 26.18.1 / electron-updater 6.8.12 как исходные stable pins для реализации; NSIS/AppImage/macOS app ZIP; Linux rcodesign/osslsigncode; доверенное описание релиза и guard перед установкой. Сохранены common stateDir, native prebuilds, shipping fuses, forward-only SQLite и отсутствие автоматического downgrade. Обновлён только deployment/runtime architecture anchor; traceability ADR↔REQ/STEP двусторонняя.

Независимый architect pass architecture_034 и planning reviewer plan_review_034 не нашли материальных противоречий. Документация инструментов и released MacUpdater6.8.12 подтверждают основания выбора; работоспособность будущего release этим не объявляется. STEP035/036 владеют реализацией, STEP054 — новыми native прогонами, OQ013 остаётся открытым. Production/CI/dependencies не менялись.
