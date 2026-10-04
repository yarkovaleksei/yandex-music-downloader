---
schema: 1
id: REQ-009
priority: critical
source: brief
steps:
  - STEP-007
  - STEP-019
adrs:
  - ADR-002
---

# REQ-009 — [URL] Распознавание и нормализация URL

## Requirement

Система принимает ссылки Яндекс Музыки на track, album и playlist: удаляет fragment и маркетинговые query-параметры, приводит hostname к ожидаемому виду, проверяет тип ресурса и извлекает канонический идентификатор. Некорректная или неподдерживаемая ссылка даёт доменную ошибку `UNSUPPORTED_URL`.

## Rationale

Единый вход для CLI и UI; необработанное исключение на пользовательской ссылке недопустимо (brief §11).

## Acceptance

- Table-driven unit-тесты покрывают валидные ссылки track/album/playlist (включая варианты с fragment, UTM-параметрами и разными поддерживаемыми hostname) и дают один и тот же канонический `MediaReference` для эквивалентных ссылок.
- Ссылки на неподдерживаемые типы ресурсов, чужие домены и мусорные строки дают `UnsupportedUrlError` с кодом `UNSUPPORTED_URL`.
- Команда `download` автоматически определяет тип по URL; `track`/`album`/`playlist` отклоняют ссылку несоответствующего типа.
