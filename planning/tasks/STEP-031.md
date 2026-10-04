---
schema: 1
id: STEP-031
status: planned
type: implementation
priority: medium
phase: desktop
depends_on:
  - STEP-030
requirements:
  - REQ-049
  - REQ-050
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

# STEP-031 — UX: предпросмотр URL, загрузки, прогресс и уведомления

## Goal

Реализовать главный экран (URL → preview) и экран Downloads с прогрессом, управлением и уведомлениями по макетам брендбука.

## Context

Макеты: `docs/brand/mockups/01..03, 07..09`.

## Scope

- Поле URL, preview для track/album/playlist, выбор качества и папки.
- Downloads: прогресс job/track, скорость/ETA при достоверности, Pause/Resume/Cancel/Retry/Open folder.
- Уведомления о завершении и ошибках.
- Тесты компонентов на mock application.

## Mutation policy

### Allowed

- `apps/desktop/renderer/**`, `apps/desktop/preload/**`, `apps/desktop/main/**` (минимально необходимое).

### Conditional

- Нет.

### Forbidden

- Прямой доступ к provider и core из renderer.
- Реализация future/unrelated STEP «заодно».

## Out of scope

- History/Settings/Account/Diagnostics (STEP-032).

## Acceptance criteria

- Preview показывает все поля REQ ui-url-preview для track/album/playlist на mock application.
- Скорость и ETA скрыты при недостатке данных.
- Недопустимые по state machine действия недоступны.
- Экраны сверены с макетами (review checklist в Evidence).

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

Заполняется командой `STEP PLAN STEP-031`. Пока semantic planning-review не дал PASS для текущих context basis + content hash, `plan.status` не может быть `ready`.

## Evidence

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.

## Blocker / Failure reason

—
