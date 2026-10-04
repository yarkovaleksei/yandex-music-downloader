---
schema: 1
id: STEP-027
status: planned
type: audit
priority: critical
phase: hardening
depends_on:
  - STEP-026
  - STEP-011
requirements:
  - REQ-043
adrs: []
architecture_refs:
  - "docs/architecture.md#system-context"
  - "docs/architecture.md#reliability-observability"
risk_flags:
  - release-critical
plan:
  status: not_planned
  revision: 0
  context_basis: null
  content_hash: null
  reviewed_report: null
  planned_at: null
---

# STEP-027 — Приёмка headless MVP и gate перехода к UI

## Goal

Документально подтвердить критерий готовности headless MVP и перехода к desktop UI, включая реальные прогоны на Linux, macOS и Windows.

## Context

Brief §47–§48 запрещает начинать UI до подтверждённой жизнеспособности headless core; ответственность за решение остаётся у пользователя.

## Scope

- Прогнать сценарии track/album/playlist, auth, retry, resume, metadata, doctor на Linux, macOS и Windows.
- Проверить критерии brief §47 (НЕ готов, если…).
- Записать отчёт приёмки с evidence по каждому пункту критерия и решением go/no-go.

## Mutation policy

### Allowed

- `planning/audits/**`, `docs/research/**`, фиксация дефектов как новые STEP через STEP ADD.

### Conditional

- Нет.

### Forbidden

- Исправление дефектов внутри STEP; начало работ desktop.
- Реализация future/unrelated STEP «заодно».

## Out of scope

- Любая реализация.

## Acceptance criteria

- `completed` допустим только при выполнении каждого критерия REQ-043 и явном решении `go`; `no-go` или любой незакрытый blocker перехода означает, что STEP остаётся не completed и desktop не начинается.
- Отчёт приёмки содержит evidence по каждому пункту brief §48 и не менее трёх последовательных успешных реальных прогонов track, album и playlist (включая interruption/resume) на Linux, macOS и Windows.
- Для каждого невыполненного пункта создан blocker/STEP/OQ; до его закрытия решение `go` запрещено.

## Verification

- command: `python3 .harness/tools/validate.py --mode manual`
- manual: Реальные прогоны на Linux, macOS и Windows с приложением отредактированных результатов.

## Deliverables

- Отчёт приёмки в `planning/audits/`.

## Implementation plan

Заполняется командой `STEP PLAN STEP-027`. Пока semantic planning-review не дал PASS для текущих context basis + content hash, `plan.status` не может быть `ready`.

## Evidence

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.

## Blocker / Failure reason

—
