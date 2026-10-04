---
schema: 1
id: STEP-006
status: planned
type: adr
priority: critical
phase: provider-spike
depends_on:
  - STEP-005
  - STEP-003
requirements:
  - REQ-002
  - REQ-007
adrs: []
architecture_refs:
  - "docs/architecture.md#external-dependencies-integrations"
  - "docs/architecture.md#security-boundaries"
risk_flags:
  - architecture
  - security-sensitive
  - external-integration
plan:
  status: not_planned
  revision: 0
  context_basis: null
  content_hash: null
  reviewed_report: null
  planned_at: null
---

# STEP-006 — ADR: стратегия адаптера, авторизация и хранение токена

## Goal

Принять устойчивые решения по стратегии Yandex adapter (использование `@dvxch/yandex-music`, стратегия runtime-валидации и обнаружения schema drift) и по авторизации/хранению токена CLI.

## Context

ADR-002 фиксирует общий контракт; детали адаптера и flow зависят от evidence STEP-005. OQ-007 (определение schema drift) закрывается этим STEP.

## Scope

- Создать ADR «Yandex Music API adapter strategy» (библиотека, обёртка, runtime-схемы, drift detection, PROVIDER_SCHEMA_VERSION).
- Создать ADR «Authentication and secure token storage» для CLI (flow, механизм хранения, права, logout, порт взаимодействия при авторизации и `CredentialStore`); допустимо уточнить auth-часть контракта MusicProvider (ADR-002 п.1); токен не проходит через application API; ADR явно решает, допустимо ли однократное обновление токена с повтором запроса внутри provider (исключение из запрета скрытых повторов ADR-002 п.6) либо refresh выносится в core.
- Перевести OQ-007 в `resolved` либо `deferred` с обоснованием.
- Привязать ADR к REQ/STEP (двусторонняя traceability) и обновить architecture baseline.

## Mutation policy

### Allowed

- `docs/adr/**`, `docs/architecture.md`, `docs/open-questions/**`, связанные REQ/STEP (только traceability).

### Conditional

- Supersede ADR-002 — только если evidence доказывает неверность контракта.

### Forbidden

- Production-код, изменение Accepted ADR задним числом.
- Реализация future/unrelated STEP «заодно».

## Out of scope

- Реализация adapter и хранилища токена.

## Acceptance criteria

- Созданы ADR со статусом `accepted`, ссылающиеся на evidence из `docs/research/yandex-api-spike.md`.
- OQ-007 разрешён либо отложен с обоснованием, а решения о токене согласованы с REQ auth-token-storage.
- Двусторонняя traceability ADR↔STEP и REQ↔ADR актуальна; `validate.py` проходит.

## Verification

- command: `python3 .harness/tools/validate.py --mode manual`
- manual: Независимая проверка ADR reviewer-ом на соответствие evidence.

## Deliverables

- ADR adapter strategy, ADR auth/token storage, обновлённая architecture.

## Implementation plan

Заполняется командой `STEP PLAN STEP-006`. Пока semantic planning-review не дал PASS для текущих context basis + content hash, `plan.status` не может быть `ready`.

## Evidence

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.

## Blocker / Failure reason

—
