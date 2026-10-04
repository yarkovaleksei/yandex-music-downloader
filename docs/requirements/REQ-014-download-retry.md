---
schema: 1
id: REQ-014
priority: high
source: brief
steps:
  - STEP-014
  - STEP-017
adrs:
  - ADR-003
  - ADR-006
---

# REQ-014 — [DOWNLOAD] Повторные попытки только для transient-ошибок

## Requirement

Автоматические повторы выполняются только для transient-ошибок (timeout, connection reset, HTTP 429/500/502/503/504) с exponential backoff и jitter; `maxAttempts` по умолчанию равен 5 и настраивается. Автоматически не повторяются 401, 403 (отказ авторизации/доступа), 404, invalid URL, unsupported codec, permission denied, insufficient disk space. Истёкшая или недействительная подпись ссылки на поток (`STREAM_EXPIRED`) не считается отказом авторизации: она обрабатывается повторным открытием потока.

## Rationale

Бесконечные или бессмысленные повторы ухудшают UX и могут блокировать аккаунт (brief §16).

## Acceptance

- Unit-тесты классифицируют каждый из перечисленных кодов как retryable/non-retryable.
- Backoff-задержки возрастают экспоненциально, ограничены сверху и содержат jitter (проверка через инжектируемые часы и random).
- После 5-й неудачной попытки трек переходит в `failed` с последней причиной; попытки записываются в manifest.
- Ответ CDN, классифицированный как `STREAM_EXPIRED`, не попадает в список non-retryable 403 и запускает повторное открытие потока; provider не выполняет скрытых повторов запросов (бюджет попыток принадлежит core).
