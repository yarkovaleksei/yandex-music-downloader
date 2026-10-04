---
schema: 1
id: STEP-011
status: planned
type: implementation
priority: high
phase: provider
depends_on:
  - STEP-010
requirements:
  - REQ-008
adrs:
  - ADR-002
architecture_refs:
  - "docs/architecture.md#external-dependencies-integrations"
risk_flags:
  - external-integration
plan:
  status: not_planned
  revision: 0
  context_basis: null
  content_hash: null
  reviewed_report: null
  planned_at: null
---

# STEP-011 — Provider contract tests на реальном API

## Goal

Создать отдельный suite `npm run test:provider`, проверяющий контракт provider на реальном API с токеном из окружения.

## Context

Offline suite не обнаруживает дрейф API; live-тесты запускаются вручную или по расписанию, а не в каждом PR.

## Scope

- Скрипт `test:provider` и набор тестов track/album/playlist/variants.
- Поведение при отсутствии `PROVIDER_TEST_TOKEN`.
- Документация запуска в `docs/development.md`.

## Mutation policy

### Allowed

- `packages/providers/yandex-music/test-live/**` (или эквивалент), скрипты, `docs/development.md`.

### Conditional

- Нет.

### Forbidden

- Запуск live-тестов из PR CI, хранение секретов в репозитории.
- Реализация future/unrelated STEP «заодно».

## Out of scope

- Scheduled CI для live-тестов (отдельное решение).

## Acceptance criteria

- `npm test` не запускает live-тесты и проходит без сети.
- `npm run test:provider` без токена завершается понятным сообщением без обращения к сети.
- С токеном suite проходит на реальном аккаунте (evidence).

## Verification

- command: `npm run lint`
- command: `npm run typecheck`
- command: `npm test`
- command: `python3 .harness/tools/validate.py --mode manual`
- manual: Запустить `PROVIDER_TEST_TOKEN=... npm run test:provider` и приложить отредактированный вывод.

## Deliverables

- Live contract suite и документация.

## Implementation plan

Заполняется командой `STEP PLAN STEP-011`. Пока semantic planning-review не дал PASS для текущих context basis + content hash, `plan.status` не может быть `ready`.

## Evidence

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.

## Blocker / Failure reason

—
