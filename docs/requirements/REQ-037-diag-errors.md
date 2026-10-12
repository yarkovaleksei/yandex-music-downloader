---
schema: 1
id: REQ-037
priority: high
source: brief
steps:
  - STEP-003
  - STEP-019
  - STEP-046
adrs:
  - ADR-005
  - ADR-007
---

# REQ-037 — [DIAGNOSTICS] Иерархия доменных ошибок

## Requirement

Введена иерархия доменных ошибок (ProviderError, AuthenticationError, UnsupportedUrlError, TrackUnavailableError, QualityUnavailableError, DownloadError, DiskFullError, PermissionError, ValidationError, MetadataError) со стабильными кодами; CLI и UI получают нормализованную ошибку, а сообщения библиотек не отображаются пользователю напрямую.

## Rationale

Пользовательские сообщения не должны зависеть от внутренностей библиотек (brief §31).

## Acceptance

- Unit-тесты подтверждают маппинг системных/HTTP/библиотечных ошибок (ENOSPC, EACCES, HTTP 404/429 и др.) в доменные ошибки с кодом и признаком retryable.
- CLI в обычном режиме не печатает stack trace доменной ошибки; в debug-режиме stack доступен.
- Нормализованная ошибка сериализуется в JSON-событие без секретов.
