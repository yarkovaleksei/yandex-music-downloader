---
schema: 1
id: STEP-013
status: planned
type: implementation
priority: critical
phase: core
depends_on:
  - STEP-003
  - STEP-005
requirements:
  - REQ-011
  - REQ-010
adrs:
  - ADR-004
architecture_refs:
  - "docs/architecture.md#основные-компоненты-границы"
  - "docs/architecture.md#data-state-model"
risk_flags:
  - none
plan:
  status: not_planned
  revision: 0
  context_basis: null
  content_hash: null
  reviewed_report: null
  planned_at: null
---

# STEP-013 — Download Planner и quality resolver

## Goal

Реализовать построение immutable `DownloadPlan` и resolver качества на фактических `AudioVariant`.

## Context

Политика недоступной настройки решена владельцем продукта (ошибка без снижения); OQ-011 остаётся открытым в части ранжирования `high`/`normal`, а OQ-012 — в части допустимости зашифрованных вариантов; без resolution STEP не стартует.

## Scope

- Planner для track/album/playlist (без сетевой загрузки аудио).
- Quality resolver по ранжированию реальных вариантов и правилам OQ-011; фильтр поддерживаемых вариантов — внедряемый предикат `supports(variant)` (наполняется решениями STEP-020; preview-варианты исключены решением OQ-012).
- Запись выбранного variant в job.
- Unit-тесты на наборах вариантов разных аккаунтов.

## Mutation policy

### Allowed

- `packages/core/planner/**`, тесты, минимальные типы в shared.

### Conditional

- Дополнение `QualityPreference` — только по решению OQ-011.

### Forbidden

- Фиксированные соответствия подписка→кодек и пресет→битрейт, загрузка файлов.
- Реализация future/unrelated STEP «заодно».

## Out of scope

- UI выбора качества.

## Acceptance criteria

- План неизменяем (compile-time и runtime) и содержит позиции 1..N.
- `best` и `lossless` дают ожидаемые варианты на тестовых наборах; при недоступной настройке `lossless`/`high`/`normal` трек получает `QualityUnavailableError` без тихого снижения, остальные треки продолжаются; ранжирование `high`/`normal` соответствует resolution OQ-011.
- В коде нет констант Premium=FLAC/High=320.

## Verification

- command: `npm run lint`
- command: `npm run typecheck`
- command: `npm test`
- command: `python3 .harness/tools/validate.py --mode manual`

## Deliverables

- Planner, quality resolver, тесты.

## Implementation plan

Заполняется командой `STEP PLAN STEP-013`. Пока semantic planning-review не дал PASS для текущих context basis + content hash, `plan.status` не может быть `ready`.

## Evidence

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.

## Blocker / Failure reason

—
