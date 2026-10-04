---
schema: 1
id: STEP-016
status: planned
type: implementation
priority: critical
phase: core
depends_on:
  - STEP-014
  - STEP-013
  - STEP-015
  - STEP-005
requirements:
  - REQ-020
  - REQ-021
  - REQ-032
  - REQ-011
adrs:
  - ADR-004
  - ADR-003
  - ADR-006
architecture_refs:
  - "docs/architecture.md#data-state-model"
  - "docs/architecture.md#reliability-observability"
risk_flags:
  - data-migration
  - concurrency
plan:
  status: not_planned
  revision: 0
  context_basis: null
  content_hash: null
  reviewed_report: null
  planned_at: null
---

# STEP-016 — Manifest store и восстановление

## Goal

Реализовать интерфейс `ManifestStore` и файловую реализацию versioned JSON manifest, а также логику recovery после перезапуска.

## Context

OQ-003 определяет возможность Range-resume; OQ-006 разрешён: headless MVP использует файловый manifest.

## Scope

- Схема manifest v1 по ADR-004 (ключ трека — позиция в плане, `provider`, `control`, `retryPhase`, `variantKey`, `partial`) и интерфейс `ManifestStore` в shared, включая эксклюзивную аренду job (PID, hostname, heartbeat) и отдельный канал control-запросов (не-владельцы пишут только его; manifest пишет держатель аренды); устаревание аренды по PID + времени старта процесса.
- Распознавание устаревшей аренды; recovery при любом успешном захвате аренды, включая ранее освобождённую; сверка окна «rename выполнен, manifest не записан»; объединение частых обновлений прогресса.
- Файловая реализация с атомарной записью и каталогом состояния по правилам ОС.
- Recovery: completed → skip, pending → enqueue, failed → по команде, partial → resume/restart.
- Поддержка Range только при заявленной provider возможности.
- Contract-набор тестов `ManifestStore`.

## Mutation policy

### Allowed

- `packages/core/manifest/**`, `packages/persistence/**` (файловая реализация), типы в shared, тесты.

### Conditional

- Нет.

### Forbidden

- SQLite, хранение токенов/signed URL, UI.
- Реализация future/unrelated STEP «заодно».

## Out of scope

- SQLite store (STEP-029).

## Acceptance criteria

- Manifest с более новой версией не перезаписывается и даёт `ValidationError`.
- Тест recovery: процесс прерван на середине playlist → restart завершает только незавершённые треки.
- Тест захвата ранее освобождённой paused job подтверждает применение recovery-нормализации до `resume`.
- Manifest не содержит токены и signed URL (автоматическая проверка).
- Второй процесс не может захватить живую аренду job (тест с двумя процессами); аренда аварийно завершённого процесса распознаётся как устаревшая; при одновременном захвате устаревшей аренды побеждает ровно один процесс (тест).
- Переиспользованный PID другого процесса не удерживает аренду; аренда с другого хоста снимается только явной ручной командой.
- Recovery «итоговый файл есть, `.part` нет → `completed`» применяется только к треку в `processing` при совпадении ожидаемого размера/маркера.
- Range используется только при `acceptsRanges=true`; иначе partial скачивается заново.

## Verification

- command: `npm run lint`
- command: `npm run typecheck`
- command: `npm test`
- command: `python3 .harness/tools/validate.py --mode manual`

## Deliverables

- Manifest store, recovery и тесты.

## Implementation plan

Заполняется командой `STEP PLAN STEP-016`. Пока semantic planning-review не дал PASS для текущих context basis + content hash, `plan.status` не может быть `ready`.

## Evidence

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.

## Blocker / Failure reason

—
