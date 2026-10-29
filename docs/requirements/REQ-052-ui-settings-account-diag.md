---
schema: 1
id: REQ-052
priority: medium
source: brief
steps:
  - STEP-058
  - STEP-056
  - STEP-032
adrs: []
---

# REQ-052 — [UI] Экраны Settings, Account и Diagnostics

## Requirement

Settings позволяет менять output directory, quality, concurrency, предустановленные шаблоны имён/каталогов, overwrite behavior, FFmpeg и logging; Account показывает состояние авторизации и позволяет выйти; Diagnostics показывает необходимые для использования результаты provider health и doctor-проверок с повторным запуском; desktop-проекция и помощь по FFmpeg уточняются REQ-057, полный CLI doctor сохраняет REQ-034.

## Rationale

Brief §33.

## Acceptance

- Каждая настройка сохраняется и восстанавливается после перезапуска приложения (тест).
- Выход из аккаунта удаляет токен из secure storage.
- Diagnostics отображает необходимые для использования проверки и позволяет их перезапустить; применяет фильтрацию и объяснения REQ-057 без изменения CLI doctor.
