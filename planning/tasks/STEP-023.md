---
schema: 1
id: STEP-023
status: planned
type: implementation
priority: high
phase: hardening
depends_on:
  - STEP-020
  - STEP-015
  - STEP-017
requirements:
  - REQ-016
  - REQ-036
adrs:
  - ADR-004
architecture_refs:
  - "docs/architecture.md#reliability-observability"
  - "docs/architecture.md#deployment-runtime-assumptions"
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

# STEP-023 — Валидация файлов и опциональный FFmpeg

## Goal

Реализовать post-download validation (existence, size, stream completion, container, duration) и опциональную расширенную проверку через FFmpeg.

## Context

Допуск duration определяется этим STEP как implementation decision; FFmpeg не обязателен.

## Scope

- Базовые проверки без FFmpeg.
- Проверка длительности с документированным допуском.
- Опциональный FFmpeg-адаптер (если ADR STEP-020 это подтверждает).
- Интеграция в стадию processing до rename.

## Mutation policy

### Allowed

- `packages/core/validation/**`, интеграция в downloader, тесты.

### Conditional

- Bundled FFmpeg — только если разрешено ADR STEP-020.

### Forbidden

- Обязательная зависимость от FFmpeg для базовой загрузки.
- Реализация future/unrelated STEP «заодно».

## Out of scope

- Транскодирование.

## Acceptance criteria

- Отказ на пустом, обрезанном, нераспознанном и со значительным расхождением длительности файле.
- Допуск duration зафиксирован в документации и покрыт граничными тестами.
- Без FFmpeg загрузка и базовая валидация проходят.

## Verification

- command: `npm run lint`
- command: `npm run typecheck`
- command: `npm test`
- command: `python3 .harness/tools/validate.py --mode manual`

## Deliverables

- Validation package и тесты.

## Implementation plan

Заполняется командой `STEP PLAN STEP-023`. Пока semantic planning-review не дал PASS для текущих context basis + content hash, `plan.status` не может быть `ready`.

## Evidence

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.

## Blocker / Failure reason

—
