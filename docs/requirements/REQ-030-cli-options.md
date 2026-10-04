---
schema: 1
id: REQ-030
priority: high
source: brief
steps:
  - STEP-019
adrs: []
---

# REQ-030 — [CLI] Опции CLI и коды завершения

## Requirement

CLI поддерживает опции `--output <path>`, `--quality <best|lossless|high|normal>`, `--concurrency <n>`, `--overwrite`, `--skip-existing`, `--json`; некорректные значения дают ошибку использования с ненулевым кодом завершения и понятным сообщением. Коды завершения различают успех, частичную неудачу, ошибку использования и ошибку выполнения.

## Rationale

Автоматизация и тестируемость CLI (brief §26).

## Acceptance

- Тесты разбора аргументов подтверждают приём валидных и отказ на невалидных значениях `--quality` и `--concurrency`.
- Коды завершения различны и описаны в справке по таблице «статус job/результат команды → exit code»: `completed` (в том числе все треки `skipped`) — 0; `completed_with_errors` — частичная неудача; `failed` — ошибка выполнения; `paused` (Ctrl+C или `AUTH_REQUIRED`) — отдельный код приостановки; `cancelled` — отдельный код; ошибка использования — отдельный код; отказ из-за чужой живой аренды job — отдельный код.
- Опции передаются в application layer без потерь (проверка через mock application).
