---
schema: 1
id: STEP-037
status: completed
type: adr
priority: critical
phase: foundation
depends_on: []
requirements:
  - REQ-040
adrs:
  - ADR-008
architecture_refs:
  - docs/architecture.md#deployment-runtime-assumptions
risk_flags:
  - architecture
  - release-critical
plan:
  status: ready
  revision: 2
  context_basis: sha256:7ccc2cbc197110f81c1fe565ce9849254b382af4ef89bf07b0ba79d81a001e39
  content_hash: sha256:448e0ef7afd6cb672f1944d2d7c7cab62c3f193f486a3c90da99ae317487a9ed
  reviewed_report: planning/plan-reviews/STEP-037/PLAN-REVIEW-20261006T160257Z.md
  planned_at: 2026-10-06T16:02:57+00:00
  execution_groups:
  context_components:
    - "ADR@ADR-008=sha256:2003e2ad894a57050dc2a171d3c06186ed627a54094598c9b23bf853303fdc1e"
    - "ARCH@docs/architecture.md#deployment-runtime-assumptions=sha256:f301a436e0abeaf7aea31bffa46d170a9cde3219fb7d566834b3eb3ae57ac85a"
    - "PRN@PRN-001=sha256:3b3801f207fafc3f77272f0e93570258a6d006964839d93a276accd814d548af"
    - "PRN@PRN-002=sha256:f29ee3fbdb9cf65cf9739d0907768bbf192ad88b8e443110d4d82f81c6b79ecb"
    - "PRN@PRN-003=sha256:16516d7d302fecda5f7615f9d55e29e04b588d671f8660640e1f61d1619e4ef8"
    - "REQ@REQ-040=sha256:d2cb812c2f6f7323f775944dde0ff254f8bc2dbf6c0afa12f81802d593934c70"
    - "STEP@STEP-037=sha256:4f063f79ba0da6678fd69779a6269036082babe2c0d537763d5d627be6f1ef78"
---

# STEP-037 — ADR: Yarn workspaces вместо npm workspaces

## Goal

Принять ADR-008, заменяющий npm workspaces на Yarn 4 с `nodeLinker: node-modules`, и подготовить непротиворечивый contract для перепланировки STEP-001.

## Context

Ручная clean-install проверка STEP-001 показала, что npm 10 на нижней поддерживаемой Node.js версии удаляет `libc` metadata из lockfile, созданного npm 11. Владелец продукта подтвердил переход на Yarn.

## Scope

- Принять ADR-008 с границами миграции и операционными последствиями.
- Обновить REQ-040, architecture baseline, полный contract STEP-001 и traceability для Yarn; зафиксировать Node.js `>=22.13.0 <25` как диапазон с Corepack.
- Обнулить устаревший plan STEP-001 и направить его на новую планировку; production/toolchain-код не менять.

## Mutation policy

### Allowed

- `docs/adr/**`, `docs/architecture.md`, `docs/requirements/REQ-040-tool-ts-quality.md`, `planning/tasks/STEP-001.md`, `planning/tasks/STEP-037.md` и traceability/projections.

### Conditional

- Изменение command references в будущих STEP — только если deterministic impact analysis докажет необходимость для canonical contract.

### Forbidden

- Миграция package manager, изменение `package.json`, lockfile или production-кода.
- Переписывание ADR-001 задним числом.

## Out of scope

- Реализация Yarn migration; её владельцем остаётся перепланированный STEP-001.

## Acceptance criteria

- ADR-008 accepted и явно заменяет только package-manager положение ADR-001.
- REQ-040, architecture baseline и traceability ссылаются на Yarn, не оставляя npm как active package manager.
- STEP-001 согласован с Yarn contract и помечен как требующий новой планировки до продолжения implementation.

## Verification

- command: `python3 .harness/tools/validate.py --mode manual`
- manual: Независимый reviewer подтверждает accepted ADR-008, blocked/not_planned STEP-001, Yarn contract и сохранение migration scope в STEP-001.

## Deliverables

- Принятый ADR-008 и обновлённый contract для Yarn migration.

## Implementation plan

### 1. Завершить canonical статус ADR и migration-владельца

- Обновить индекс ADR-008 со статуса proposed на accepted.
- Установить STEP-001 status: blocked с причиной необходимости новой Yarn-планировки, сохранив исторические Evidence.
- Сохранить STEP-001 plan.status: not_planned до новой независимой планировки.

**Files:**
- docs/adr/README.md
- planning/tasks/STEP-001.md

**Tests:**
- Проверить статус ADR-008 и STEP-001 в canonical artifacts.

**Risks:**
- Не изменять accepted текст ADR-001 и не запускать migration tooling.

### 2. Устранить остатки npm contract

- Заменить npm в активной manual Verification STEP-001 на эквивалентные Yarn команды.
- Проверить согласованность Yarn и Node.js >=22.13.0 <25 между ADR-008, REQ-040, architecture baseline и STEP-001.

**Files:**
- planning/tasks/STEP-001.md
- docs/requirements/REQ-040-tool-ts-quality.md
- docs/architecture.md

**Tests:**
- Проверить отсутствие npm как active package manager в этих artifacts.

**Risks:**
- Фактический package.json, lockfile и development documentation меняются только в STEP-001 migration.

### 3. Проверить и синхронизировать

- Пересобрать generated projections.
- Запустить structural validation.

**Files:**
- docs/requirements/STATUS.md
- planning/PLAN.md
- planning/STATUS.md

**Tests:**
- python3 .harness/tools/validate.py --mode manual

**Risks:**
- Generated projections не редактируются вручную.

## Evidence






<!-- VERIFICATION-EVIDENCE:START -->
- Verification run: 2026-10-06T16:41:50Z
- Status: PASS
- Git head: 984253235b7b72b6ae404375a4aed5470d15eda7
- Worktree hash: sha256:9d19438498b719d09a1fa03a619b68ef9747cf359c5d8be8f3da6dbc0bfa0c37
- Verification contract basis: sha256:8465ac8e41d35d39ac757a3d487961d60ee9e294b021dd417b5c866c89d766d7
- Subject git head: 984253235b7b72b6ae404375a4aed5470d15eda7
- Subject worktree hash: sha256:d0e7dc990bb5e72e5e40aa7336d2629bd4615af16580e3071cdadabd58ccda51

### Automated verification
- Command: python3 .harness/tools/validate.py --mode manual
  - Status: PASS
  - Exit code: 0
  - Duration ms: 1565
  - stdout sha256: 4723a5c0272a45e8f2a1aee25aa42abc1449f81ba2edb534a667c4574a77384b
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 66
  - stderr bytes: 0

### Manual verification
- Check: Независимый reviewer подтверждает accepted ADR-008, blocked/not_planned STEP-001, Yarn contract и сохранение migration scope в STEP-001.
  - Status: PASS
  - Observed: "Независимый reviewer подтвердил: ADR-008 и индекс accepted; STEP-001 blocked/not_planned; REQ-040, architecture baseline и active STEP-001 contract согласованы с Yarn 4 и Node.js >=22.13.0 <25; migration остаётся в STEP-001."
<!-- VERIFICATION-EVIDENCE:END -->

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.






## Blocker / Failure reason

—
