---
schema: 1
id: STEP-032
status: planned
type: implementation
priority: medium
phase: desktop
depends_on:
  - STEP-031
  - STEP-025
requirements:
  - REQ-051
  - REQ-052
adrs: []
architecture_refs:
  - "docs/architecture.md#основные-потоки"
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

# STEP-032 — UX: History, Settings, Account и Diagnostics

## Goal

Реализовать экраны History, Settings, Account и Diagnostics по макетам брендбука.

## Context

Макеты: `docs/brand/mockups/04..06`.

## Scope

- History: поиск, фильтры, Download again, Remove from history (без удаления файлов), Open folder.
- Settings: output, quality, concurrency, predefined templates, overwrite, FFmpeg, logging.
- Account: состояние авторизации, выход.
- Diagnostics: результаты doctor/provider health с повторным запуском.

## Mutation policy

### Allowed

- `apps/desktop/**`, `packages/application/**` (минимальные расширения API).

### Conditional

- Нет.

### Forbidden

- Доступ renderer к fs/токенам напрямую.
- Реализация future/unrelated STEP «заодно».

## Out of scope

- Packaging.

## Acceptance criteria

- Удаление записи из истории не изменяет файловую систему.
- Настройки сохраняются между перезапусками.
- Выход из аккаунта удаляет токен из secure storage.
- Diagnostics показывает результаты проверок и позволяет их перезапустить.

## Verification

- command: `npm run lint`
- command: `npm run typecheck`
- command: `npm test`
- command: `npm run build`
- command: `python3 .harness/tools/validate.py --mode manual`
- manual: Визуальная сверка с макетами.

## Deliverables

- Экраны и тесты.

## Implementation plan

Заполняется командой `STEP PLAN STEP-032`. Пока semantic planning-review не дал PASS для текущих context basis + content hash, `plan.status` не может быть `ready`.

## Evidence

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.

## Blocker / Failure reason

—
