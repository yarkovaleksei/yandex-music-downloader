---
schema: 1
id: STEP-030
status: planned
type: implementation
priority: medium
phase: desktop
depends_on:
  - STEP-028
  - STEP-018
  - STEP-029
requirements:
  - REQ-045
  - REQ-046
  - REQ-047
  - REQ-048
adrs:
  - ADR-001
  - ADR-007
architecture_refs:
  - "docs/architecture.md#основные-компоненты-границы"
  - "docs/architecture.md#security-boundaries"
  - "docs/architecture.md#deployment-runtime-assumptions"
risk_flags:
  - security-sensitive
  - architecture
plan:
  status: not_planned
  revision: 0
  context_basis: null
  content_hash: null
  reviewed_report: null
  planned_at: null
---

# STEP-030 — Desktop shell: Electron, React, MUI, typed IPC, secure storage

## Goal

Создать минимальную desktop-оболочку (main, preload, renderer) с typed IPC, безопасной конфигурацией окна и токеном в системном secure storage.

## Context

UI является клиентом application layer; renderer не имеет доступа к fs/provider/токенам.

## Scope

- Electron main/preload/renderer, Vite, React, TypeScript, MUI, тема по брендбуку.
- Typed `DesktopApi` как проекция application API и общих DTO (ADR-007); запрет произвольных IPC-каналов; `createApplication(runtimeAdapters)` в main с secure storage.
- Secure storage токена по ADR (OQ-010).
- Минимальный экран и связь с application layer.

## Mutation policy

### Allowed

- `apps/desktop/**`, подключение в monorepo toolchain, `packages/application/**` (минимальное расширение).

### Conditional

- Нет.

### Forbidden

- Прямой доступ renderer к fs/child_process/токенам/provider, nodeIntegration, полные экраны UX.
- Реализация future/unrelated STEP «заодно».

## Out of scope

- Экраны UX (STEP-031/032), packaging.

## Acceptance criteria

- Тест конфигурации окна подтверждает contextIsolation=true, nodeIntegration=false, sandbox=true.
- Все IPC-вызовы проходят через typed `DesktopApi`; произвольные channel strings запрещены lint-правилом.
- Токен хранится в системном secure storage; plaintext fallback отсутствует.
- Сборка и smoke-запуск выполнены на Windows x64, macOS arm64/x64 и Linux x64 (evidence).

## Verification

- command: `npm run lint`
- command: `npm run typecheck`
- command: `npm test`
- command: `npm run build`
- command: `python3 .harness/tools/validate.py --mode manual`
- manual: Smoke-запуск на трёх ОС с evidence.

## Deliverables

- Desktop shell и тесты.

## Implementation plan

Заполняется командой `STEP PLAN STEP-030`. Пока semantic planning-review не дал PASS для текущих context basis + content hash, `plan.status` не может быть `ready`.

## Evidence

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.

## Blocker / Failure reason

—
