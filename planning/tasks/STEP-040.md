---
schema: 1
id: STEP-040
status: planned
type: documentation
priority: medium
phase: foundation
depends_on:
  - STEP-004
  - STEP-007
  - STEP-008
  - STEP-009
  - STEP-010
  - STEP-011
  - STEP-039
requirements: []
adrs: []
architecture_refs:
  - docs/architecture.md#data-state-model
  - docs/architecture.md#external-dependencies-integrations
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

# STEP-040 — Синхронизировать описание реализованной foundation и provider

## Goal

Привести текущее описание кода в `docs/architecture.md` и `docs/development.md` к проверенной реализации завершённых STEP, сохранив принятые решения и границы будущей работы.

## Context

`PROJECT RECONCILE` 2026-10-09 обнаружил документальный drift после STEP-004/007/008/009/010/011/039. Development всё ещё относит logging, persistence и provider к каркасам. Architecture описывает metadata union как только документальную форму, а runtime wrapper, schemas и native-store proof — как будущую работу. Фактические exports, tests, завершённые STEP и их независимые reviews подтверждают реализацию.

Это корректировка документации, а не новый product contract: тип `documentation` не требует искусственного REQ. Отсутствие полноценного downloader core, application/CLI/UI и ограниченность live/platform evidence должны остаться явными.

## Scope

- Обновить фактический статус shared metadata/events, logger, CLI CredentialStore и provider URL/auth/metadata/artwork/audio методов.
- Описать отдельный live contract suite STEP-011 и текущую `PROVIDER_SCHEMA_VERSION` по code/evidence.
- Отделить реализованные модули от будущего core/application/CLI/desktop и ещё не принятых решений.
- Точно сохранить ограничения: native probes не равны packaging/полной платформенной квалификации; synthetic encraw не равен live full encraw; один аккаунт не доказывает универсальную доступность или TTL.

## Mutation policy

### Allowed

- `docs/architecture.md`, `docs/development.md` — только фактическое описание и ссылки на подтверждающие code/STEP/evidence.
- Evidence текущего STEP и детерминированные projections.

### Conditional

- Нет.

### Forbidden

- Изменения production-кода, tests, dependencies, lockfile и CI.
- Изменение REQ, решений Accepted ADR, статусов OQ и закрытие отсутствующих runtime/platform доказательств предположениями.
- Изменение завершённых STEP, их планов, fingerprints и immutable review/audit reports ради актуального описания.

## Out of scope

- Реализация core, application/CLI, desktop и future STEP.
- Новый live запуск или повторная native/platform qualification.
- Новое архитектурное решение, ADR или product REQ.

## Acceptance criteria

- Architecture и development перечисляют реализованные shared/logger/store/provider возможности с проверяемыми ссылками и не называют их каркасами или только документальной формой.
- Описание текущей реализации отделено от будущей работы; ограничения live, encraw, Range/TTL и платформенных наблюдений не расширены.
- Production/config/tests, REQ/Accepted ADR/OQ и исторические STEP/reviews сохранены; projections согласованы, документация проходит format и Harness gates.

## Verification

- command: `node packages/testing/scripts/run-yarn.mjs exec prettier --check docs/development.md`
- command: `node packages/testing/scripts/run-yarn.mjs exec vitest run eslint/consistency.test.ts`
- command: `python3 .harness/tools/check-command-references.py --json`
- command: `python3 .harness/tools/validate.py --mode manual`
- manual: Сверить каждое утверждение о реализованной возможности с code/export/test и completion evidence её STEP; сохранить исходный production baseline, ограничения proof и Accepted decisions. Историческую сокращённую ссылку внутри fingerprinted плана STEP-008 классифицировать отдельно, не переписывая утверждённый план.

## Deliverables

- Актуализированные `docs/architecture.md` и `docs/development.md`.
- Evidence со ссылками на источники и независимый PASS review документационного изменения.

## Implementation plan

Заполняется командой `STEP PLAN STEP-040`.

## Evidence

Основание: `PROJECT RECONCILE` 2026-10-09. Найденный drift касается описания состояния, а не нового нарушения product/architecture contract. Реализация STEP этой записью не заявляется.

## Blocker / Failure reason

—
