---
schema: 1
id: REQ-036
priority: medium
adrs: []
---

# REQ-036 — [DIAGNOSTICS] Трассируемость операции загрузки

## Requirement

Каждая операция публикует события: job created, entity resolved, plan created, track started, variant selected, download started, download completed, metadata written, validation completed, job completed; каждое содержит `jobId`, `trackId` (если применимо) и `durationMs`.

## Rationale

Трассируемость нужна для диагностики сбоев.

## Acceptance

- Интеграционный тест загрузки playlist фиксирует все перечисленные события в ожидаемом порядке для каждого трека.
- Каждое событие содержит jobId и durationMs, события по треку — `trackKey`.
- События не содержат секретов.
