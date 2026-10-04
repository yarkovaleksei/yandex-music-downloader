---
schema: 1
id: STEP-021
status: planned
type: implementation
priority: high
phase: hardening
depends_on:
  - STEP-020
  - STEP-017
requirements:
  - REQ-025
  - REQ-026
  - REQ-036
adrs:
  - ADR-004
  - ADR-006
architecture_refs:
  - "docs/architecture.md#основные-компоненты-границы"
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

# STEP-021 — Теги, встроенная обложка и cover.jpg

## Goal

Реализовать `packages/metadata`: запись тегов и встроенной обложки, `cover.jpg` и кэш обложек в рамках операции, подключить к стадии processing менеджера.

## Context

Библиотека определена ADR STEP-020; OQ-002 определяет контейнеры.

## Scope

- Запись тегов TITLE, ARTIST, ALBUM, ALBUMARTIST, TRACK, DISC, DATE/YEAR, GENRE.
- Встроенная обложка и опциональный `cover.jpg`; однократная загрузка общей обложки.
- Интеграция через порт `MetadataWriter` в processing: контейнер и уже полученные в стадии `resolving` байты обложки передаются явно; `processing` не обращается к сети.
- Round-trip тесты чтения.

## Mutation policy

### Allowed

- `packages/metadata/**`, подключение в `packages/core/downloader/**`, тесты.

### Conditional

- Нет.

### Forbidden

- Подмена ALBUM названием плейлиста, валидация контейнера (STEP-023).
- Реализация future/unrelated STEP «заодно».

## Out of scope

- m3u8 (STEP-022).

## Acceptance criteria

- Round-trip тест на каждом поддерживаемом контейнере совпадает по всем полям, включая кириллицу.
- При загрузке playlist тег ALBUM равен исходному альбому трека.
- Альбом из 12 треков с общей обложкой делает ровно один запрос обложки.
- Встроенная обложка совпадает по хэшу с исходной.

## Verification

- command: `npm run lint`
- command: `npm run typecheck`
- command: `npm test`
- command: `python3 .harness/tools/validate.py --mode manual`

## Deliverables

- Metadata package и интеграция.

## Implementation plan

Заполняется командой `STEP PLAN STEP-021`. Пока semantic planning-review не дал PASS для текущих context basis + content hash, `plan.status` не может быть `ready`.

## Evidence

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.

## Blocker / Failure reason

—
