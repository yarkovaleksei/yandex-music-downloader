---
schema: 1
id: STEP-014
status: planned
type: implementation
priority: critical
phase: core
depends_on:
  - STEP-003
  - STEP-005
requirements:
  - REQ-013
  - REQ-014
adrs:
  - ADR-006
architecture_refs:
  - "docs/architecture.md#data-state-model"
  - "docs/architecture.md#reliability-observability"
risk_flags:
  - concurrency
plan:
  status: not_planned
  revision: 0
  context_basis: null
  content_hash: null
  reviewed_report: null
  planned_at: null
---

# STEP-014 — State machine задания и retry policy

## Goal

Реализовать формальную state machine по ADR-006 и retry policy с backoff+jitter.

## Context

OQ-009 (rate limits) влияет на значения backoff по умолчанию.

## Scope

- Таблица переходов ADR-006 как данные + функция перехода с отказом на недопустимых (включая `skipped`, `retry_wait` с `retryPhase`, control job).
- Детерминированная агрегация статуса job (`completed_with_errors`, `interrupted`, `paused`, `cancelled`).
- Классификация ошибок retryable/non-retryable (включая `STREAM_EXPIRED`), backoff, jitter, `maxAttempts`; повторы выполняет только core.
- Unit-тесты на все переходы.

## Mutation policy

### Allowed

- `packages/core/retry/**`, `packages/core/downloader/state/**`, тесты.

### Conditional

- Нет.

### Forbidden

- Сетевые вызовы, очередь и файловая запись.
- Реализация future/unrelated STEP «заодно».

## Out of scope

- Очередь и менеджер (STEP-017).

## Acceptance criteria

- Каждый разрешённый переход таблицы ADR покрыт тестом, каждый недопустимый отвергается; агрегация статуса job покрыта тестами на наборах статусов треков.
- Классификация кодов по REQ download-retry покрыта тестами.
- Backoff детерминирован при инжектируемых часах и random; ограничен сверху.

## Verification

- command: `npm run lint`
- command: `npm run typecheck`
- command: `npm test`
- command: `python3 .harness/tools/validate.py --mode manual`

## Deliverables

- State machine, retry policy, тесты.

## Implementation plan

Заполняется командой `STEP PLAN STEP-014`. Пока semantic planning-review не дал PASS для текущих context basis + content hash, `plan.status` не может быть `ready`.

## Evidence

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.

## Blocker / Failure reason

—
