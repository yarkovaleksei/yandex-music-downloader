---
schema: 1
id: REQ-042
priority: high
adrs: []
---

# REQ-042 — [TOOLING] Обязательные unit и integration тесты

## Requirement

Существуют unit-тесты для URL parser, filename sanitizer, quality resolver, Download Planner, state machine, retry policy, manifest, path generator и provider response mapping, а также integration-тесты на mock provider: single track, album, playlist, network interruption, resume, retry, partial failure, cancel.

## Rationale

Проверяемость headless core без реального API.

## Acceptance

- Для каждого перечисленного модуля есть набор unit-тестов, запускаемый `npm test`.
- Для каждого перечисленного integration-сценария есть автоматический тест на mock provider.
- Тесты не требуют сети и учётных данных.
