---
schema: 1
id: STEP-026
status: planned
type: hardening
priority: high
phase: hardening
depends_on:
  - STEP-019
  - STEP-022
  - STEP-021
  - STEP-023
  - STEP-025
requirements:
  - REQ-042
  - REQ-005
  - REQ-020
adrs: []
architecture_refs:
  - "docs/architecture.md#основные-потоки"
  - "docs/architecture.md#reliability-observability"
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

# STEP-026 — Интеграционный набор headless-сценариев

## Goal

Собрать и дополнить интеграционные тесты на mock provider по всем обязательным сценариям и подтвердить обязательные unit-наборы.

## Context

Тесты частично создаются в предыдущих STEP; этот STEP закрывает пробелы по brief §41.

## Scope

- Сценарии: single track, album, playlist, network interruption, resume, retry, partial failure, cancel.
- Проверка наличия unit-наборов URL parser, sanitizer, quality resolver, planner, state machine, retry policy, manifest, path generator, provider mapping.
- Проверка отсутствия утечки секретов во всех сценариях.

## Mutation policy

### Allowed

- `packages/testing/**`, тестовые каталоги пакетов и `apps/cli`.

### Conditional

- Исправление найденных дефектов — минимально необходимое, с отдельным пояснением в Evidence.

### Forbidden

- Новая функциональность.
- Реализация future/unrelated STEP «заодно».

## Out of scope

- E2E desktop (STEP-033).

## Acceptance criteria

- Все перечисленные интеграционные сценарии существуют и проходят без сети.
- Автоматическая проверка подтверждает отсутствие токена и signed URL во всех логах/событиях/manifest сценариев.
- Traceability: для каждого обязательного unit-модуля существует набор тестов (проверка списком в Evidence).

## Verification

- command: `npm run lint`
- command: `npm run typecheck`
- command: `npm test`
- command: `npm run build`
- command: `python3 .harness/tools/validate.py --mode manual`

## Deliverables

- Интеграционный suite.

## Implementation plan

Заполняется командой `STEP PLAN STEP-026`. Пока semantic planning-review не дал PASS для текущих context basis + content hash, `plan.status` не может быть `ready`.

## Evidence

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.

## Blocker / Failure reason

—
