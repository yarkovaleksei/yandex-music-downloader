---
schema: 1
id: REQ-007
priority: high
source: brief
steps:
  - STEP-006
  - STEP-009
  - STEP-025
adrs:
  - ADR-002
---

# REQ-007 — [PROVIDER] Runtime-валидация ответов и версия совместимости

## Requirement

Provider adapter валидирует критичные ответы API runtime-схемами и имеет собственную версию compatibility contract (`PROVIDER_SCHEMA_VERSION`). Изменение формата ответа приводит к ошибке `API_CHANGED` / `PROVIDER_RESPONSE_INVALID` с сообщением «API Яндекс Музыки изменился. Текущая версия приложения не поддерживает новый формат ответа.» вместо stack trace.

## Rationale

Schema drift не должен превращаться в generic runtime exception (brief §29, §45).

## Acceptance

- Unit-тест подаёт ответ с изменённой структурой и получает доменную ошибку с кодом `PROVIDER_RESPONSE_INVALID` или `API_CHANGED`, а не `TypeError`.
- Коды `NETWORK_ERROR`, `AUTH_ERROR`, `API_CHANGED`, `SERVICE_UNAVAILABLE`, `PROVIDER_RESPONSE_INVALID` различаются в нормализованной ошибке.
- `PROVIDER_SCHEMA_VERSION` доступна из provider package и выводится в `doctor`.
