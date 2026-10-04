---
schema: 1
id: STEP-018
status: planned
type: implementation
priority: high
phase: core
depends_on:
  - STEP-017
  - STEP-009
requirements:
  - REQ-002
  - REQ-044
  - REQ-032
adrs:
  - ADR-001
  - ADR-005
  - ADR-007
architecture_refs:
  - "docs/architecture.md#основные-компоненты-границы"
  - "docs/architecture.md#основные-потоки"
risk_flags:
  - architecture
  - public-api
plan:
  status: not_planned
  revision: 0
  context_basis: null
  content_hash: null
  reviewed_report: null
  planned_at: null
---

# STEP-018 — Application layer API и composition root

## Goal

Создать `packages/application` с единым API операций и composition root, единственным местом регистрации Yandex provider.

## Context

CLI и desktop не должны знать про Yandex API; application layer связывает provider, core, persistence и metadata (ADR-001).

## Scope

- API на сериализуемых DTO (ADR-007): auth/account/logout, resolve/preview, createDownload, управление job (pause/resume/cancel/retry), `listJobs`/`getJob`, `subscribe` на версионированные события, diagnostics hook; токен через API не передаётся.
- `createApplication(runtimeAdapters)`: composition root (provider, ManifestStore, logger, secure storage, каталог состояния); runtime-специфичные адаптеры передаёт клиент.
- DTO ошибок с `code`; типы контракта в `packages/shared` без Node built-ins.
- Нормализация ошибок.
- Тесты на mock provider.

## Mutation policy

### Allowed

- `packages/application/**`, `packages/shared/**` (DTO и типы контракта), boundary rules (только ужесточение), тесты.

### Conditional

- Нет.

### Forbidden

- CLI-команды, UI, импорт provider библиотеки вне provider package.
- Реализация future/unrelated STEP «заодно».

## Out of scope

- Desktop IPC (STEP-030).

## Acceptance criteria

- API покрыт тестами на mock provider для track/album/playlist.
- Provider package подключается только в composition root.
- Ошибки возвращаются как сериализуемые DTO с `code`; события доступны через `subscribe` и соответствуют union из `packages/shared`.
- `createApplication` принимает host-only runtime-адаптеры (secure storage, native SQLite, пути ОС); Node-реализации по умолчанию (файловый `ManifestStore`, logger) подключает application, так что CLI их не импортирует.
- Получение обложки для preview доступно через application API.
- `logout` вызывает только application API, удаляет credentials через порт и возвращает `CommandResult` без токена.
- Для тестов и E2E provider подменяется mock provider через `providerOverride` без изменения кода клиентов.

## Verification

- command: `npm run lint`
- command: `npm run typecheck`
- command: `npm test`
- command: `python3 .harness/tools/validate.py --mode manual`

## Deliverables

- Application package и тесты.

## Implementation plan

Заполняется командой `STEP PLAN STEP-018`. Пока semantic planning-review не дал PASS для текущих context basis + content hash, `plan.status` не может быть `ready`.

## Evidence

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.

## Blocker / Failure reason

—
