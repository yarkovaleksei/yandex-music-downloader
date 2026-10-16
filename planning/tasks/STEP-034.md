---
schema: 1
id: STEP-034
status: planned
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
architecture_refs:
  - "docs/architecture.md#deployment-runtime-assumptions"
risk_flags:
  - architecture
  - release-critical
plan:
  status: not_planned
  revision: 0
  context_basis: null
  content_hash: null
  reviewed_report: null
  planned_at: null
---

# STEP-034 — ADR: кроссплатформенная упаковка

## Goal

Принять решение по инструментам упаковки, схеме автообновления и подписания для Windows, macOS и Linux.

## Context

Решение зависит от фактической структуры desktop-приложения.

## Scope

- ADR «Cross-platform packaging».
- Описание схемы обновления и подписания (без секретов).

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

- ADR packaging.

## Implementation plan

Заполняется командой `STEP PLAN STEP-034`. Пока semantic planning-review не дал PASS для текущих context basis + content hash, `plan.status` не может быть `ready`.

## Evidence

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.

## Blocker / Failure reason

—
