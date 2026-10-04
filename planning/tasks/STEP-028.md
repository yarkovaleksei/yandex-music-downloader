---
schema: 1
id: STEP-028
status: planned
type: adr
priority: medium
phase: desktop
depends_on:
  - STEP-027
requirements:
  - REQ-033
  - REQ-046
  - REQ-047
adrs: []
architecture_refs:
  - "docs/architecture.md#security-boundaries"
  - "docs/architecture.md#data-state-model"
  - "docs/architecture.md#deployment-runtime-assumptions"
risk_flags:
  - architecture
  - security-sensitive
plan:
  status: not_planned
  revision: 0
  context_basis: null
  content_hash: null
  reviewed_report: null
  planned_at: null
---

# STEP-028 — ADR: SQLite, модель безопасности Electron и IPC

## Goal

Принять решения по SQLite-библиотеке и миграциям, модели безопасности Electron, typed IPC contract и secure storage; закрыть OQ-010.

## Context

Решения принимаются после стабилизации headless core (brief §49 STEP 4) и не должны ломать границы ADR-001.

## Scope

- ADR «SQLite persistence» (библиотека, миграции).
- ADR «Electron security model» и ADR «IPC contract».
- Решение по secure storage (OQ-010) в ADR либо `deferred`: Linux без `basic_text`, привязка Keychain к подписи приложения (связь со STEP-034).
- Роль SQLite относительно файловых manifest, общий каталог состояния CLI и desktop, единая система миграций.
- Где выполняется application: main process или `utilityProcess`; ограничения native-модулей SQLite для Electron.
- Обновить architecture baseline.

## Mutation policy

### Allowed

- `docs/adr/**`, `docs/architecture.md`, `docs/open-questions/**`, `docs/research/**`.

### Conditional

- Нет.

### Forbidden

- Production-код.
- Реализация future/unrelated STEP «заодно».

## Out of scope

- Реализация (STEP-029, STEP-030).

## Acceptance criteria

- ADR accepted и согласованы с ADR-001 и PRN-001/PRN-002.
- OQ-010 разрешён либо отложен с обоснованием.
- Двусторонняя traceability ADR↔STEP актуальна.

## Verification

- command: `python3 .harness/tools/validate.py --mode manual`
- manual: Независимая архитектурная проверка.

## Deliverables

- ADR и обновлённая architecture.

## Implementation plan

Заполняется командой `STEP PLAN STEP-028`. Пока semantic planning-review не дал PASS для текущих context basis + content hash, `plan.status` не может быть `ready`.

## Evidence

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.

## Blocker / Failure reason

—
