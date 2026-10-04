---
schema: 1
id: REQ-052
priority: medium
source: brief
steps:
  - STEP-032
adrs: []
---

# REQ-052 — [UI] Экраны Settings, Account и Diagnostics

## Requirement

Settings позволяет менять output directory, quality, concurrency, предустановленные шаблоны имён/каталогов, overwrite behavior, FFmpeg и logging; Account показывает состояние авторизации и позволяет выйти; Diagnostics показывает результаты provider health и doctor-проверок с повторным запуском.

## Rationale

Brief §33.

## Acceptance

- Каждая настройка сохраняется и восстанавливается после перезапуска приложения (тест).
- Выход из аккаунта удаляет токен из secure storage.
- Diagnostics отображает статус каждой doctor-проверки и позволяет перезапустить проверку.
