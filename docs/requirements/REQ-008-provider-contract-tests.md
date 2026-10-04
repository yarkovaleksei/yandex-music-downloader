---
schema: 1
id: REQ-008
priority: high
source: brief
steps:
  - STEP-011
adrs:
  - ADR-002
---

# REQ-008 — [PROVIDER] Отдельный набор contract-тестов реального API

## Requirement

Для проверки реального API существует отдельный набор тестов, запускаемый командой `npm run test:provider` с токеном из переменной окружения `PROVIDER_TEST_TOKEN`. Он не входит в обычный offline unit/integration suite и не запускается в PR CI автоматически; секреты не попадают в репозиторий.

## Rationale

Только live-тесты обнаруживают дрейф неофициального API (brief §41, §42).

## Acceptance

- `npm test` проходит без сети и без токена.
- `npm run test:provider` без `PROVIDER_TEST_TOKEN` завершается понятным сообщением о пропуске/ошибке конфигурации без обращения к сети.
- В репозитории отсутствуют значения токенов; PR CI workflow не вызывает `test:provider`.
