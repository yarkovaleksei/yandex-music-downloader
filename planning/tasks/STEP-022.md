---
schema: 1
id: STEP-022
status: planned
type: implementation
priority: high
phase: hardening
depends_on:
  - STEP-017
  - STEP-012
requirements:
  - REQ-028
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

# STEP-022 — Каталог playlist и .m3u8

## Goal

Генерировать `.m3u8` в UTF-8 с относительными путями в порядке плейлиста и нумерацией файлов по позициям источника.

## Context

Playlist membership выражается каталогом, `.m3u8` и manifest, но не тегом ALBUM.

## Scope

- Генератор `.m3u8` после завершения треков.
- Нумерация по позиции, стабильная при частичных неудачах.
- Исключение неуспешных треков из `.m3u8`.
- Интеграционный тест.

## Mutation policy

### Allowed

- `packages/core/filesystem/**`, `packages/core/downloader/**` (интеграция), тесты.

### Conditional

- Нет.

### Forbidden

- Изменение тегов, UI.
- Реализация future/unrelated STEP «заодно».

## Out of scope

- Другие форматы плейлистов.

## Acceptance criteria

- Интеграционный тест: N треков → каталог, N файлов и `.m3u8` с путями в порядке источника.
- Частичная неудача: `.m3u8` содержит только успешные треки, нумерация не сдвигается.
- Кириллические имена корректно читаются парсером `.m3u8`.

## Verification

- command: `npm run lint`
- command: `npm run typecheck`
- command: `npm test`
- command: `python3 .harness/tools/validate.py --mode manual`

## Deliverables

- m3u8 writer и тесты.

## Implementation plan

Заполняется командой `STEP PLAN STEP-022`. Пока semantic planning-review не дал PASS для текущих context basis + content hash, `plan.status` не может быть `ready`.

## Evidence

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.

## Blocker / Failure reason

—
