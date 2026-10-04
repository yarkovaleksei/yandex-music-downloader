---
schema: 1
id: STEP-033
status: planned
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

# STEP-033 — E2E-тест desktop

## Goal

Добавить автоматический E2E: resolve URL → start → pause → resume → complete → история.

## Context

E2E запускается на mock provider; ручное подтверждение на Windows и macOS.

## Scope

- E2E-фреймворк для Electron и сценарий.
- Интеграция в CI (Linux) и сборочные матрицы по мере готовности.

## Mutation policy

### Allowed

- `apps/desktop/e2e/**`, CI workflow (дополнение матрицы).

### Conditional

- Нет.

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
- command: `python3 .harness/tools/validate.py --mode manual`
- manual: Ручной прогон на Windows и macOS.

## Deliverables

- E2E suite.

## Implementation plan

Заполняется командой `STEP PLAN STEP-033`. Пока semantic planning-review не дал PASS для текущих context basis + content hash, `plan.status` не может быть `ready`.

## Evidence

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.

## Blocker / Failure reason

—
