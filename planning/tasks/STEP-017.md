---
schema: 1
id: STEP-017
status: planned
type: implementation
priority: critical
phase: core
depends_on:
  - STEP-016
  - STEP-010
  - STEP-004
  - STEP-014
  - STEP-013
  - STEP-015
requirements:
  - REQ-017
  - REQ-018
  - REQ-019
  - REQ-015
  - REQ-036
  - REQ-020
  - REQ-024
  - REQ-026
  - REQ-014
  - REQ-003
adrs:
  - ADR-006
  - ADR-004
  - ADR-007
architecture_refs:
  - "docs/architecture.md#основные-компоненты-границы"
  - "docs/architecture.md#основные-потоки"
  - "docs/architecture.md#reliability-observability"
risk_flags:
  - concurrency
  - performance-critical
plan:
  status: not_planned
  revision: 0
  context_basis: null
  content_hash: null
  reviewed_report: null
  planned_at: null
---

# STEP-017 — Download Manager: очередь, concurrency и управление

## Goal

Реализовать Download Manager с очередью, ограничением параллелизма, pause/resume/cancel/retry, событиями прогресса и обновлением истёкших ссылок.

## Context

OQ-008/OQ-009 влияют на обновление ссылок и безопасные значения concurrency.

## Scope

- Очередь и пул воркеров (default 4, диапазон 1–8).
- Оркестрация: resolving (включая безопасное получение artwork) → variant selection → download → processing через интерфейсы; transient-ошибка artwork использует retry `resolving` по ADR-006.
- Pause/resume/cancel/retry по ADR-006; AbortSignal.
- Публикация progress/observability событий.
- Повторный запрос потока при `STREAM_EXPIRED` в пределах maxAttempts.
- Владение job через аренду manifest; применение control-запросов других процессов; SIGINT = `pause` job: активные треки в `paused`, шаги `resolving`/`processing` дожидаются с таймаутом; глобальные non-retryable ошибки ставят job на паузу с причиной.
- Общий лимит concurrency на экземпляр приложения; обработка состояния `skipped`.

## Mutation policy

### Allowed

- `packages/core/downloader/**`, `packages/core/queue/**`, тесты.

### Conditional

- Нет.

### Forbidden

- Прямые обращения к Yandex API, CLI/UI, запись тегов и m3u8.
- Реализация future/unrelated STEP «заодно».

## Out of scope

- Метаданные, m3u8, validation (STEP-021..023).

## Acceptance criteria

- Тест с 20 mock-треками и concurrency=3 подтверждает не более 3 одновременных загрузок.
- Cancel удаляет `.part`, pause сохраняет; retry перезапускает только failed.
- Истёкшая ссылка обновляется через повторный `openAudioStream` без бесконечного цикла.
- Progress-события монотонны; speed/ETA отсутствуют при недостатке данных.
- Значения concurrency вне 1–8 отвергаются; лимит общий для всех job экземпляра.
- SIGINT оставляет `.part` и manifest в состоянии, из которого `resume` продолжает работу; control-запрос `cancel` от другого процесса применяется владельцем всегда, даже при частой записи прогресса; `resume` живого `running` job отклоняется ошибкой.
- При `control=paused` треки в `retry_wait` не возобновляются после backoff.

## Verification

- command: `npm run lint`
- command: `npm run typecheck`
- command: `npm test`
- command: `python3 .harness/tools/validate.py --mode manual`

## Deliverables

- Download Manager и тесты на mock provider.

## Implementation plan

Заполняется командой `STEP PLAN STEP-017`. Пока semantic planning-review не дал PASS для текущих context basis + content hash, `plan.status` не может быть `ready`.

## Evidence

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.

## Blocker / Failure reason

—
