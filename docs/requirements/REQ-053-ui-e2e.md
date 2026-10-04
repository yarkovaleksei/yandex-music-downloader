---
schema: 1
id: REQ-053
priority: medium
source: brief
steps:
  - STEP-033
adrs: []
---

# REQ-053 — [UI] End-to-end сценарий desktop

## Requirement

Автоматический E2E-тест проходит сценарий: resolve URL → start download → pause → resume → complete → открыть историю.

## Rationale

Brief §41.

## Acceptance

- E2E-сценарий запускается в CI на mock provider и завершается успешно.
- Сценарий проверяет появление файла в выходном каталоге и записи в истории.
- Сценарий выполняется на Linux в CI и вручную подтверждён на Windows и macOS.
