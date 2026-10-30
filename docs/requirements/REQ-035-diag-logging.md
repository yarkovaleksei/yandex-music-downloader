---
schema: 1
id: REQ-035
priority: high
adrs: []
---

# REQ-035 — [DIAGNOSTICS] Структурированное логирование

## Requirement

Используется structured logging с уровнями error, warn, info, debug, trace (по умолчанию info); каждая запись задания содержит `jobId`, при возможности `correlationId`.

## Rationale

Диагностируемость без утечки секретов.

## Acceptance

- Логгер выводит записи в структурированном формате (JSON) с полями level, time, message и контекстом задания.
- Уровень по умолчанию — info; debug/trace включаются конфигурацией.
- Все записи в рамках job содержат `jobId`.
