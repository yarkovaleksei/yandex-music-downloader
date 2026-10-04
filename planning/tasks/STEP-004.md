---
schema: 1
id: STEP-004
status: planned
type: implementation
priority: high
phase: foundation
depends_on:
  - STEP-003
requirements:
  - REQ-035
  - REQ-039
  - REQ-036
adrs:
  - ADR-005
  - ADR-007
architecture_refs:
  - "docs/architecture.md#reliability-observability"
  - "docs/architecture.md#security-boundaries"
risk_flags:
  - security-sensitive
plan:
  status: not_planned
  revision: 0
  context_basis: null
  content_hash: null
  reviewed_report: null
  planned_at: null
---

# STEP-004 — Структурированное логирование и редакция секретов

## Goal

Реализовать единый structured logger с уровнями, контекстом job/correlation и централизованной редакцией секретов, а также типизированные события observability.

## Context

Токены и signed URL не должны попадать в логи (brief §30); логгер нужен provider и core с самого начала, поэтому создаётся до них.

## Scope

- Logger в `packages/logging` с уровнями error..trace и уровнем info по умолчанию.
- Контекст `jobId`, `correlationId`, `trackId`.
- Редакция Authorization, Cookie, token и query-параметров signed URL; регистрация секретных полей.
- Единый версионированный `JobEvent` и `CommandResult`/`CliRecord` (ADR-007) в `packages/shared`: observability-события (job created ... job completed) и события прогресса с `schemaVersion`, монотонным `seq` на job, `jobId`, `trackKey?` (позиция в плане), `trackId?` (атрибут), `durationMs?`; `subscribe` покрывает только job своего экземпляра.

## Mutation policy

### Allowed

- `packages/logging/**`, `packages/shared/**` (типы событий), unit-тесты.

### Conditional

- Расширение boundary rules для `packages/logging` — минимально необходимое.

### Forbidden

- Подключение логгера к provider/core (делают соответствующие STEP), запись логов в файлы.
- Реализация future/unrelated STEP «заодно».

## Out of scope

- Ротация/транспорт логов, UI отображения логов.

## Acceptance criteria

- Тест с известным токеном и signed URL подтверждает их отсутствие в выводе логгера и сериализованных ошибках.
- Уровень по умолчанию — info; debug/trace включаются конфигурацией.
- Записи в контексте job содержат `jobId`; события observability имеют `durationMs`.
- Добавление нового секретного поля требует регистрации (тест).

## Verification

- command: `npm run lint`
- command: `npm run typecheck`
- command: `npm test`
- command: `python3 .harness/tools/validate.py --mode manual`

## Deliverables

- Logger, redaction, типы событий, тесты.

## Implementation plan

Заполняется командой `STEP PLAN STEP-004`. Пока semantic planning-review не дал PASS для текущих context basis + content hash, `plan.status` не может быть `ready`.

## Evidence

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.

## Blocker / Failure reason

—
