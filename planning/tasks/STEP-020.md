---
schema: 1
id: STEP-020
status: planned
type: adr
priority: high
phase: hardening
depends_on:
  - STEP-005
requirements:
  - REQ-025
  - REQ-016
adrs: []
architecture_refs:
  - "docs/architecture.md#external-dependencies-integrations"
  - "docs/architecture.md#deployment-runtime-assumptions"
risk_flags:
  - architecture
plan:
  status: not_planned
  revision: 0
  context_basis: null
  content_hash: null
  reviewed_report: null
  planned_at: null
---

# STEP-020 — ADR: библиотека метаданных и использование FFmpeg

## Goal

Выбрать по результатам технического spike Node.js-библиотеку записи тегов/обложек и определить роль FFmpeg; закрыть OQ-004 и OQ-005.

## Context

Контейнеры/кодеки определены OQ-002 (STEP-005). Brief требует выбор библиотеки отдельным ADR после spike.

## Scope

- Сравнить кандидатов на реальных файлах (контейнеры из evidence): корректность Unicode, обложки, надёжность.
- ADR «Audio metadata library» и ADR «FFmpeg usage» (опциональность, bundled или нет).
- Проверить запись тегов с явным указанием контейнера (временный файл `*.part` без расширения формата).
- Перевести OQ-004 и OQ-005 в `resolved`/`deferred`.

## Mutation policy

### Allowed

- `docs/adr/**`, `docs/research/**`, `docs/open-questions/**`, одноразовые spike-скрипты вне `packages/**`.

### Conditional

- Нет.

### Forbidden

- Production-код в `packages/**`.
- Реализация future/unrelated STEP «заодно».

## Out of scope

- Реализация записи тегов (STEP-021).

## Acceptance criteria

- ADR accepted и ссылаются на результаты сравнения на реальных контейнерах.
- OQ-004 и OQ-005 имеют Resolution либо обоснованный `deferred`.
- Выбранная библиотека пишет теги по явному контейнеру, а не по расширению `.part`.
- Решение сохраняет FFmpeg опциональной зависимостью либо явно обосновывает иное через ADR.

## Verification

- command: `python3 .harness/tools/validate.py --mode manual`
- manual: Запустить сравнение библиотек на реальных файлах и приложить результаты в Evidence.

## Deliverables

- ADR, отчёт сравнения.

## Implementation plan

Заполняется командой `STEP PLAN STEP-020`. Пока semantic planning-review не дал PASS для текущих context basis + content hash, `plan.status` не может быть `ready`.

## Evidence

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.

## Blocker / Failure reason

—
