---
schema: 1
id: STEP-001
status: planned
type: implementation
priority: critical
phase: foundation
depends_on: []
requirements:
  - REQ-040
adrs:
  - ADR-001
architecture_refs:
  - "docs/architecture.md#основные-компоненты-границы"
  - "docs/architecture.md#deployment-runtime-assumptions"
risk_flags:
  - architecture
plan:
  status: not_planned
  revision: 0
  context_basis: null
  content_hash: null
  reviewed_report: null
  planned_at: null
---

# STEP-001 — Monorepo и toolchain контроля качества

## Goal

Создать каркас monorepo по ADR-001 с TypeScript strict, ESLint (включая boundary rules), Prettier и тестовым раннером, чтобы все следующие STEP получали единые команды проверки.

## Context

Репозиторий содержит только Harness и документацию; production-кода и toolchain нет. Выбор менеджера пакетов, workspace tooling, тестового раннера и формата модулей — implementation decision этого STEP (brief §7: структура, §43: качество).

## Scope

- Корневой `package.json` с npm workspaces и скриптами `lint`, `typecheck`, `format:check`, `test`, `build`.
- Пустые пакеты-скелеты по ADR-001: `packages/shared`, `packages/core/*`, `packages/providers/yandex-music`, `packages/metadata`, `packages/persistence`, `packages/application`, `packages/logging`, `packages/testing`, `apps/cli`.
- tsconfig с `strict: true`, `noImplicitAny`, project references.
- Выбрать поддерживаемую Node.js LTS (минимум 20) для CI и разработки; зафиксировать в `engines` и `docs/development.md`.
- Boundary rules порядка зависимостей внутри `packages/core/*` (ADR-001 п.3) и запрет Node built-ins в `packages/shared`.
- ESLint + Prettier; boundary rules направления зависимостей ADR-001 и запрет импорта `@dvxch/yandex-music` вне provider package; запрет необоснованного `any`.
- Тестовый раннер и по одному smoke-тесту на пакет-скелет.
- Заполнить `docs/development.md` фактическими командами и требованиями (Node.js 20+).

## Mutation policy

### Allowed

- Корневые конфигурационные файлы toolchain, `packages/**`, `apps/cli/**` (только скелет), `docs/development.md`, `.gitignore` (добавления для build-артефактов).

### Conditional

- Изменение `AGENTS.md` project routing — только если появляется project/technology skill.

### Forbidden

- Реализация доменной логики, provider, CLI-команд, GitHub Actions workflow (отдельный STEP-002), `apps/desktop`.
- Реализация future/unrelated STEP «заодно».

## Out of scope

- Бизнес-логика, desktop, CI, публикация пакетов.

## Acceptance criteria

- `npm install` завершается без ошибок на чистом клоне.
- `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm test`, `npm run build` проходят на скелете.
- Тестовый файл с импортом `@dvxch/yandex-music` вне provider package и файл с нарушением направления зависимостей ADR-001 падают в `npm run lint` (негативная проверка зафиксирована в Evidence).
- `strict: true` включён во всех пакетах; `docs/development.md` содержит фактические команды.

## Verification

- command: `npm run lint`
- command: `npm run typecheck`
- command: `npm test`
- command: `npm run build`
- command: `python3 .harness/tools/validate.py --mode manual`
- manual: Выполнить негативную lint-проверку boundary rules и приложить вывод в Evidence.

## Deliverables

- Скелет monorepo, конфигурация toolchain, обновлённый `docs/development.md`.

## Implementation plan

Заполняется командой `STEP PLAN STEP-001`. Пока semantic planning-review не дал PASS для текущих context basis + content hash, `plan.status` не может быть `ready`.

## Evidence

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.

## Blocker / Failure reason

—
