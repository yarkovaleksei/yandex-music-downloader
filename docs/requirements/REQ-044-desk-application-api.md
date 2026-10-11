---
schema: 1
id: REQ-044
priority: high
source: brief
steps:
  - STEP-018
  - STEP-042
  - STEP-043
adrs:
  - ADR-005
  - ADR-007
  - ADR-001
---

# REQ-044 — [DESKTOP] Application API как единая граница для клиентов

## Requirement

Application layer предоставляет клиентам (CLI, desktop) единый API операций: авторизация, resolve/preview, создание и управление загрузками, история, диагностика; клиенты не обращаются к provider, не скачивают аудио, не управляют токеном и не пишут метаданные самостоятельно. API оперирует сериализуемыми DTO и версионированными событиями, токены через него не передаются, runtime-специфичные реализации подключаются через `createApplication(runtimeAdapters)`.

## Rationale

UI/CLI не должны знать про Yandex API (brief §3, §56).

## Acceptance

- CLI и desktop используют один и тот же application API (общий набор тестов контракта).
- Ни `apps/cli`, ни `apps/desktop` не импортируют `packages/providers/**`, `packages/core/**`, `packages/metadata` или `packages/persistence` напрямую (проверка ESLint boundary).
- Операции application API возвращают нормализованные доменные ошибки как сериализуемые DTO с `code`; клиенты не используют `instanceof` для ошибок.
- Типы контракта application API импортируются без зависимостей от Node built-ins (проверка сборкой/lint для preload/renderer).
