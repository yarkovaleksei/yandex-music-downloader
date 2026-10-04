---
schema: 1
id: STEP-002
status: planned
type: implementation
priority: high
phase: foundation
depends_on:
  - STEP-001
requirements:
  - REQ-041
adrs: []
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

# STEP-002 — CI workflow для TypeScript monorepo

## Goal

Добавить GitHub Actions workflow, выполняющий lint, typecheck, unit/integration tests и build CLI/core на каждый PR, не затрагивая Harness Integrity workflow.

## Context

Toolchain появляется в STEP-001; AGENTS.md требует проектировать product CI отдельным STEP после появления реального tooling.

## Scope

- Workflow `.github/workflows/ci.yml` для PR и push в main.
- Кэширование зависимостей, matrix по поддерживаемой LTS Node.js и ОС (ubuntu, windows, macos) для unit/integration тестов, чтобы кросс-ОС особенности файловой системы выявлялись рано.
- Явное исключение live provider tests из workflow.
- Обновить `docs/development.md` раздел CI/CD.

## Mutation policy

### Allowed

- .github/workflows/ci.yml, docs/development.md.

### Conditional

- Изменение `.github/workflows/harness-integrity.yml` запрещено; допустимо только чтение.

### Forbidden

- Сборки desktop и release workflow (STEP-035), secrets, изменение product-кода.
- Реализация future/unrelated STEP «заодно».

## Out of scope

- Release CI, desktop build matrix, публикация артефактов.

## Acceptance criteria

- Workflow запускает lint, typecheck, test, build и падает при провале любой задачи.
- Workflow не содержит `PROVIDER_TEST_TOKEN` и вызова `test:provider`.
- Тесты выполняются на Linux, Windows и macOS.
- Harness Integrity workflow не изменён (проверка git diff).

## Verification

- command: `python3 .harness/tools/validate.py --mode manual`
- manual: Подтвердить успешный запуск workflow на draft PR и приложить ссылку в Evidence.

## Deliverables

- `.github/workflows/ci.yml`, обновлённая документация CI.

## Implementation plan

Заполняется командой `STEP PLAN STEP-002`. Пока semantic planning-review не дал PASS для текущих context basis + content hash, `plan.status` не может быть `ready`.

## Evidence

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.

## Blocker / Failure reason

—
