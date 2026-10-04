---
schema: 1
id: STEP-024
status: planned
type: implementation
priority: medium
phase: hardening
depends_on:
  - STEP-009
  - STEP-018
requirements:
  - REQ-027
adrs: []
architecture_refs:
  - "docs/architecture.md#data-state-model"
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

# STEP-024 — Локальный cache метаданных и обложек с TTL

## Goal

Добавить cache метаданных, обложек и ответов provider с TTL без секретов.

## Context

Снижает число запросов к неофициальному API; audio cache в MVP не требуется.

## Scope

- Интерфейс и файловая реализация cache с TTL и инжектируемыми часами.
- Подключение через application layer; ключ cache учитывает аккаунт и `PROVIDER_SCHEMA_VERSION`; ссылки на поток и download info не кэшируются; доступность и варианты кэшируются только с ключом по аккаунту.
- Команда/API очистки cache без влияния на manifest и файлы.

## Mutation policy

### Allowed

- `packages/persistence/**`, `packages/application/**`, тесты.

### Conditional

- Нет.

### Forbidden

- Кэширование аудио, секретов и signed URL.
- Реализация future/unrelated STEP «заодно».

## Out of scope

- SQLite cache.

## Acceptance criteria

- Повторный запрос в пределах TTL не обращается к provider; после TTL — обращается.
- В cache нет токенов, cookies и signed URL (автоматическая проверка).
- Очистка cache не затрагивает manifest и скачанные файлы.

## Verification

- command: `npm run lint`
- command: `npm run typecheck`
- command: `npm test`
- command: `python3 .harness/tools/validate.py --mode manual`

## Deliverables

- Cache и тесты.

## Implementation plan

Заполняется командой `STEP PLAN STEP-024`. Пока semantic planning-review не дал PASS для текущих context basis + content hash, `plan.status` не может быть `ready`.

## Evidence

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.

## Blocker / Failure reason

—
