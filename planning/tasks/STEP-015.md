---
schema: 1
id: STEP-015
status: planned
type: implementation
priority: critical
phase: core
depends_on:
  - STEP-012
  - STEP-003
  - STEP-002
requirements:
  - REQ-012
  - REQ-024
adrs:
  - ADR-004
architecture_refs:
  - "docs/architecture.md#основные-потоки"
  - "docs/architecture.md#reliability-observability"
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

# STEP-015 — Запись .part и атомарная финализация

## Goal

Реализовать потоковую запись в `.part`, flush/close и атомарный rename с поведением skip-existing/overwrite по ADR-004.

## Context

Кроссплатформенный атомарный rename и замена существующего файла различаются на Windows и POSIX.

## Scope

- Writer потока в `.part` в каталоге назначения с поддержкой AbortSignal.
- Финализация: close, flush, hook проверки/метаданных, atomic rename/replace.
- Политики skip-existing/overwrite; удаление `.part` при cancel; имя `.part` уникально для job и трека; rename — точка фиксации.
- В режиме skip-existing финализация не заменяет файл, появившийся до rename (переход `processing → skipped`).
- Hook-и проверки/метаданных получают явный контейнер, а не определяют формат по расширению `.part`.
- Обработка ENOSPC/EACCES в доменные ошибки.

## Mutation policy

### Allowed

- `packages/core/filesystem/**`, тесты.

### Conditional

- Нет.

### Forbidden

- Запись тегов (STEP-021), валидация контейнера (STEP-023), очередь.
- Реализация future/unrelated STEP «заодно».

## Out of scope

- Range-resume (STEP-016).

## Acceptance criteria

- Обрыв потока оставляет только `.part` и не создаёт конечный файл (тест).
- `--overwrite` оставляет прежний файл нетронутым до успешного rename.
- ENOSPC/EACCES дают `DiskFullError`/`PermissionError`.
- Тесты кросс-ОС особенностей выполняются в CI matrix (STEP-002): EPERM/EBUSY при rename на Windows (ограниченные повторы), коллизии NFC/NFD и регистра, учёт `.part` в лимите длины пути.
- Два job с одним итоговым путём не используют один `.part`.

## Verification

- command: `npm run lint`
- command: `npm run typecheck`
- command: `npm test`
- command: `python3 .harness/tools/validate.py --mode manual`

## Deliverables

- File writer и тесты.

## Implementation plan

Заполняется командой `STEP PLAN STEP-015`. Пока semantic planning-review не дал PASS для текущих context basis + content hash, `plan.status` не может быть `ready`.

## Evidence

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.

## Blocker / Failure reason

—
