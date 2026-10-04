---
schema: 1
id: REQ-054
priority: medium
source: brief
steps:
  - STEP-034
  - STEP-035
adrs: []
---

# REQ-054 — [PACKAGING] Дистрибутивы для всех целевых ОС

## Requirement

Создаются дистрибутивы: Windows installer, macOS package (arm64 и x64) и Linux package, собираемые release CI.

## Rationale

Brief §49 STEP 6, §55.

## Acceptance

- Release CI публикует артефакты для Windows x64, macOS arm64/x64 и Linux x64.
- Установка на чистой ОС каждой платформы запускает приложение (evidence).
- Версия приложения в артефакте соответствует тегу релиза.
