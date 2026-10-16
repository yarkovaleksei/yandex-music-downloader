---
schema: 1
id: STEP-035
status: planned
type: implementation
priority: low
phase: packaging
depends_on:
  - STEP-034
requirements:
  - REQ-054
  - REQ-045
  - REQ-041
adrs:
  - ADR-014
  - ADR-015
architecture_refs:
  - "docs/architecture.md#deployment-runtime-assumptions"
risk_flags:
  - release-critical
plan:
  status: not_planned
  revision: 0
  context_basis: null
  content_hash: null
  reviewed_report: null
  planned_at: null
---

# STEP-035 — Дистрибутивы и release CI

## Goal

Реализовать сборку дистрибутивов для Windows, macOS и Linux и release CI.

## Context

Подписание/notarization реализуются отдельным STEP-036.

## Scope

- Конфигурация упаковки и release workflow.
- Артефакты для Windows x64, macOS arm64/x64, Linux x64.
- Версионирование артефактов по тегу.

## Mutation policy

### Allowed

- Конфигурация упаковки, `.github/workflows/release.yml`, `apps/desktop/**` (build config).

### Conditional

- Нет.

### Forbidden

- Хранение ключей/сертификатов в репозитории.
- Реализация future/unrelated STEP «заодно».

## Out of scope

- Подписание и notarization (STEP-036), автообновление.

## Acceptance criteria

- Release CI публикует артефакты для четырёх целей.
- Установка на чистой ОС каждой платформы запускает приложение (Evidence).
- Версия артефакта соответствует тегу.

## Verification

- command: `npm run lint`
- command: `npm run typecheck`
- command: `npm test`
- command: `npm run build`
- command: `python3 .harness/tools/validate.py --mode manual`
- manual: Установка на чистых ОС.

## Deliverables

- Packaging и release workflow.

## Implementation plan

Заполняется командой `STEP PLAN STEP-035`. Пока semantic planning-review не дал PASS для текущих context basis + content hash, `plan.status` не может быть `ready`.

## Evidence

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.

## Blocker / Failure reason

—
