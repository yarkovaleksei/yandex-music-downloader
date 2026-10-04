---
schema: 1
id: STEP-036
status: planned
type: implementation
priority: low
phase: packaging
depends_on:
  - STEP-035
requirements:
  - REQ-055
adrs: []
architecture_refs:
  - "docs/architecture.md#deployment-runtime-assumptions"
  - "docs/architecture.md#security-boundaries"
risk_flags:
  - security-sensitive
  - release-critical
plan:
  status: not_planned
  revision: 0
  context_basis: null
  content_hash: null
  reviewed_report: null
  planned_at: null
---

# STEP-036 — Подписание, notarization и автообновление

## Goal

Реализовать подписание, notarization и автообновление дистрибутивов по ADR.

## Context

Ключи и сертификаты хранятся в защищённом хранилище CI.

## Scope

- Code signing Windows/macOS, notarization macOS.
- Механизм автообновления и проверка подписи обновления.
- Документация процесса релиза.

## Mutation policy

### Allowed

- Release workflow, `apps/desktop/**` (updater), документация.

### Conditional

- Нет.

### Forbidden

- Ключи и сертификаты в репозитории.
- Реализация future/unrelated STEP «заодно».

## Out of scope

- Новые платформы.

## Acceptance criteria

- Подписанные артефакты проходят проверку подписи/notarization.
- Обновление N → N+1 проверено на каждой ОС.
- В репозитории отсутствуют секреты.

## Verification

- command: `npm run lint`
- command: `npm run typecheck`
- command: `npm test`
- command: `npm run build`
- command: `python3 .harness/tools/validate.py --mode manual`
- manual: Проверка подписи и обновления на трёх ОС.

## Deliverables

- Подписание и updater.

## Implementation plan

Заполняется командой `STEP PLAN STEP-036`. Пока semantic planning-review не дал PASS для текущих context basis + content hash, `plan.status` не может быть `ready`.

## Evidence

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.

## Blocker / Failure reason

—
