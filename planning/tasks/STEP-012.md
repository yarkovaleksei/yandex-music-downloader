---
schema: 1
id: STEP-012
status: planned
type: implementation
priority: critical
phase: core
depends_on:
  - STEP-003
requirements:
  - REQ-022
  - REQ-023
adrs:
  - ADR-001
architecture_refs:
  - "docs/architecture.md#основные-компоненты-границы"
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

# STEP-012 — Filename sanitizer и генерация путей

## Goal

Реализовать единый кроссплатформенный sanitizer и генератор путей для track/album/playlist с predefined templates.

## Context

Правила Windows/macOS/Linux различаются; ошибка приводит к потере данных или path traversal.

## Scope

- Sanitizer с параметром платформы (reserved names, trailing, длина, Unicode).
- Path generator для single/album/playlist по predefined templates.
- Детерминированное разрешение коллизий имён.
- Table-driven и property-тесты.

## Mutation policy

### Allowed

- `packages/core/filesystem/**`, тесты.

### Conditional

- Нет.

### Forbidden

- Запись файлов на диск, пользовательский template language.
- Реализация future/unrelated STEP «заодно».

## Out of scope

- Полноценный template language (будущее).

## Acceptance criteria

- Тесты покрывают все пункты REQ fs-sanitizer, включая reserved names без учёта регистра, `..`, абсолютные пути, кириллицу и эмодзи.
- Результат путей всегда внутри выходного каталога.
- Коллизии имён разрешаются детерминированно без перезаписи.

## Verification

- command: `npm run lint`
- command: `npm run typecheck`
- command: `npm test`
- command: `python3 .harness/tools/validate.py --mode manual`

## Deliverables

- Пакет filesystem с тестами.

## Implementation plan

Заполняется командой `STEP PLAN STEP-012`. Пока semantic planning-review не дал PASS для текущих context basis + content hash, `plan.status` не может быть `ready`.

## Evidence

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.

## Blocker / Failure reason

—
