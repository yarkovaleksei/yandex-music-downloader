---
schema: 1
id: REQ-045
priority: high
source: brief
steps:
  - STEP-030
  - STEP-035
adrs:
  - ADR-001
---

# REQ-045 — [DESKTOP] Целевые платформы и независимость core

## Requirement

Electron-приложение собирается и запускается на Windows x64, macOS arm64, macOS x64 и Linux x64; downloader core не зависит от Electron или React и допускает добавление новых архитектур без переработки.

## Rationale

Кроссплатформенность — часть определения готовности (brief §4.3, §55).

## Acceptance

- Сборка приложения успешно выполняется для всех четырёх целей в CI.
- Пакеты `packages/core/**` собираются и тестируются без зависимостей Electron/React.
- Smoke-запуск собранного приложения на каждой ОС открывает главное окно (evidence в STEP).
