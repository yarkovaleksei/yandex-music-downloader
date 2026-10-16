---
schema: 1
id: REQ-041
priority: high
source: brief
steps:
  - STEP-002
  - STEP-035
  - STEP-044
  - STEP-050
  - STEP-054
adrs: []
---

# REQ-041 — [TOOLING] CI на pull request

## Requirement

CI на каждый PR выполняет lint, typecheck, unit tests, integration tests, build CLI и build core; live-тесты provider не запускаются автоматически. После появления desktop добавляются сборки для Windows, macOS и Linux.

## Rationale

Регрессии должны ловиться до слияния (brief §42).

## Acceptance

- Workflow GitHub Actions запускает перечисленные задачи на PR и падает при провале любой из них.
- В workflow нет шагов, использующих `PROVIDER_TEST_TOKEN` или выполняющих `test:provider`.
- Существующий Harness Integrity workflow сохраняется.
