---
schema: 1
id: STEP-019
status: planned
type: implementation
priority: critical
phase: core
depends_on:
  - STEP-018
  - STEP-004
requirements:
  - REQ-029
  - REQ-030
  - REQ-031
  - REQ-013
  - REQ-001
  - REQ-002
  - REQ-003
  - REQ-009
  - REQ-017
  - REQ-037
adrs:
  - ADR-001
  - ADR-005
  - ADR-003
  - ADR-007
  - ADR-006
architecture_refs:
  - "docs/architecture.md#основные-компоненты-границы"
  - "docs/architecture.md#основные-потоки"
risk_flags:
  - public-api
plan:
  status: not_planned
  revision: 0
  context_basis: null
  content_hash: null
  reviewed_report: null
  planned_at: null
---

# STEP-019 — CLI: команды, опции и режим --json

## Goal

Реализовать `apps/cli` с командами auth, account, download/track/album/playlist, jobs, resume, retry, cancel, опциями и NDJSON-режимом.

## Context

CLI — обязательный продукт первого этапа; doctor добавляется отдельным STEP-025.

## Scope

- Команды и разбор аргументов, коды завершения.
- Человекочитаемый вывод и прогресс; `--json` NDJSON — проекция `CliRecord` application layer (CLI собственную схему не определяет).
- Ctrl+C: корректная пауза через application API; коды завершения различают `completed`, `completed_with_errors`, ошибку использования и ошибку выполнения.
- Опции output/quality/concurrency/overwrite/skip-existing.
- Smoke-тесты на mock application.

## Mutation policy

### Allowed

- `apps/cli/**`, тесты.

### Conditional

- Нет.

### Forbidden

- Импорт provider/core напрямую, определение собственной схемы событий, команда doctor.
- Реализация future/unrelated STEP «заодно».

## Out of scope

- doctor (STEP-025).

## Acceptance criteria

- Команды auth, account, download/track/album/playlist, jobs, resume, retry, cancel и logout присутствуют в `--help` и покрыты smoke-тестами; doctor реализуется STEP-025.
- Каждая строка stdout в `--json` валидна по union `CliRecord` из `packages/shared`.
- Некорректные значения опций дают ошибку использования с ненулевым кодом.
- Статическая проверка: `apps/cli` не импортирует provider/core напрямую.

## Verification

- command: `npm run lint`
- command: `npm run typecheck`
- command: `npm test`
- command: `npm run build`
- command: `python3 .harness/tools/validate.py --mode manual`
- manual: Ручной прогон `download` на реальном треке после готовности provider.

## Deliverables

- CLI, тесты.

## Implementation plan

Заполняется командой `STEP PLAN STEP-019`. Пока semantic planning-review не дал PASS для текущих context basis + content hash, `plan.status` не может быть `ready`.

## Evidence

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.

## Blocker / Failure reason

—
