---
schema: 1
id: STEP-008
status: planned
type: implementation
priority: critical
phase: provider
depends_on:
  - STEP-006
  - STEP-003
  - STEP-004
requirements:
  - REQ-001
  - REQ-002
  - REQ-003
  - REQ-039
adrs:
  - ADR-002
architecture_refs:
  - "docs/architecture.md#external-dependencies-integrations"
  - "docs/architecture.md#security-boundaries"
risk_flags:
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

# STEP-008 — Provider: авторизация, аккаунт и хранилище токена CLI

## Goal

Реализовать авторизацию, получение аккаунта, обработку истёкшего токена и хранилище токена CLI по решениям ADR STEP-006.

## Context

OQ-001 определяет поддерживаемый flow; STEP зависит от resolution этого вопроса и принятых ADR.

## Scope

- Реализация `authenticate`, `getAccount` и `logout` в provider package; `logout` удаляет credentials только через `CredentialStore`.
- Хранилище токена CLI по ADR (за интерфейсом в shared; без plaintext в settings/logs/manifest).
- Нормализация ошибок авторизации в `AuthenticationError`/`AUTH_ERROR`.
- Unit-тесты на mock HTTP/библиотеку; live-проверка вручную.

## Mutation policy

### Allowed

- `packages/providers/yandex-music/**`, реализация хранилища токена в разрешённом ADR пакете, тесты.

### Conditional

- Дополнение интерфейса хранилища в `packages/shared` — минимально необходимое.

### Forbidden

- Хранение/запрос пароля, логирование токенов, прямой импорт библиотеки вне provider package, CLI-команды (STEP-019).
- Реализация future/unrelated STEP «заодно».

## Out of scope

- Desktop secure storage (STEP-030).

## Acceptance criteria

- Авторизация завершается получением аккаунта на live-прогоне (evidence); тесты на mock подтверждают маппинг ошибок.
- Токен не обнаруживается в settings/logs/manifest (автоматическая проверка).
- Истёкший токен даёт `AuthenticationError` без retry.
- `logout` удаляет токен из разрешённого хранилища и следующий `getAccount` возвращает состояние «не авторизован».
- Права хранилища токена соответствуют ADR и проверяются тестом.

## Verification

- command: `npm run lint`
- command: `npm run typecheck`
- command: `npm test`
- command: `python3 .harness/tools/validate.py --mode manual`
- manual: Live-прогон авторизации на реальном аккаунте пользователя с приложением отредактированного вывода.

## Deliverables

- Auth-часть provider, хранилище токена, тесты.

## Implementation plan

Заполняется командой `STEP PLAN STEP-008`. Пока semantic planning-review не дал PASS для текущих context basis + content hash, `plan.status` не может быть `ready`.

## Evidence

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.

## Blocker / Failure reason

—
