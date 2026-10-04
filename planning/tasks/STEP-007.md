---
schema: 1
id: STEP-007
status: planned
type: implementation
priority: critical
phase: provider
depends_on:
  - STEP-003
requirements:
  - REQ-009
adrs:
  - ADR-002
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

# STEP-007 — Resolver ссылок Яндекс Музыки

## Goal

Реализовать в provider package разбор и нормализацию ссылок track/album/playlist с доменной ошибкой `UNSUPPORTED_URL`.

## Context

Форматы URL известны из публичных ссылок; resolver — чистая функция без сети.

## Scope

- Парсер URL → `MediaReference` (тип, canonical id).
- Нормализация: fragment, маркетинговые query-параметры, hostname.
- Table-driven unit-тесты, включая негативные.

## Mutation policy

### Allowed

- `packages/providers/yandex-music/**` (url), тесты.

### Conditional

- Нет.

### Forbidden

- Сетевые вызовы, авторизация, получение метаданных.
- Реализация future/unrelated STEP «заодно».

## Out of scope

- Резолв через API, короткие/редирект-ссылки, требующие сети (если потребуются — отдельный STEP).

## Acceptance criteria

- Эквивалентные ссылки дают одинаковый `MediaReference`.
- Неподдерживаемые ссылки дают `UnsupportedUrlError` с кодом `UNSUPPORTED_URL`.
- Тесты не требуют сети.

## Verification

- command: `npm run lint`
- command: `npm run typecheck`
- command: `npm test`
- command: `python3 .harness/tools/validate.py --mode manual`

## Deliverables

- Resolver и тесты.

## Implementation plan

Заполняется командой `STEP PLAN STEP-007`. Пока semantic planning-review не дал PASS для текущих context basis + content hash, `plan.status` не может быть `ready`.

## Evidence

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.

## Blocker / Failure reason

—
