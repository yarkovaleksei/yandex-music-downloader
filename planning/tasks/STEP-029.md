---
schema: 1
id: STEP-029
status: planned
type: implementation
priority: medium
phase: desktop
depends_on:
  - STEP-028
  - STEP-018
requirements:
  - REQ-033
adrs:
  - ADR-004
  - ADR-014
architecture_refs:
  - "docs/architecture.md#data-state-model"
risk_flags:
  - data-migration
plan:
  status: not_planned
  revision: 0
  context_basis: null
  content_hash: null
  reviewed_report: null
  planned_at: null
---

# STEP-029 — SQLite persistence и миграции

## Goal

Реализовать SQLite-реализацию хранилища (история, очередь, jobs, настройки, диагностика) с миграциями.

## Context

Семантика manifest и интерфейс `ManifestStore` сохраняются (ADR-004).

## Scope

- Схема v1 и механизм миграций N → N+1.
- Реализация интерфейсов хранения за application layer.
- Отказ при более новой версии схемы.
- Тесты миграций.

## Mutation policy

### Allowed

- `packages/persistence/**`, `packages/application/**` (wiring), тесты.

### Conditional

- Нет.

### Forbidden

- Пересоздание базы при несовпадении версии, токены в базе.
- Реализация future/unrelated STEP «заодно».

## Out of scope

- UI истории (STEP-032).

## Acceptance criteria

- Все миграции применяются последовательно к базе v1 без потери данных.
- База более новой версии не изменяется; приложение сообщает о несовместимости.
- В базе нет токенов (автоматическая проверка).

## Verification

- command: `npm run lint`
- command: `npm run typecheck`
- command: `npm test`
- command: `python3 .harness/tools/validate.py --mode manual`

## Deliverables

- SQLite store и тесты миграций.

## Implementation plan

Заполняется командой `STEP PLAN STEP-029`. Пока semantic planning-review не дал PASS для текущих context basis + content hash, `plan.status` не может быть `ready`.

## Evidence

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.

## Blocker / Failure reason

—
