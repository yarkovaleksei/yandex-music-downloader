---
schema: 1
id: REQ-039
priority: critical
source: brief
steps:
  - STEP-004
  - STEP-008
adrs: []
---

# REQ-039 — [SECURITY] Запрет утечки секретов в логи и артефакты

## Requirement

Access token, cookies, Authorization header, credentials, ключи расшифровки потока и полные signed CDN URL с security-параметрами не попадают в логи, события, manifest, `variantKey`, cache, SQLite и сообщения об ошибках; редакция применяется централизованно.

## Rationale

Утечка секретов недопустима (brief §10, §30, §55).

## Acceptance

- Автоматический тест прогоняет сценарий с известным тестовым токеном и signed URL и подтверждает их отсутствие во всех логах, событиях и manifest.
- Логгер/сериализатор ошибок редактирует поля Authorization, Cookie, token и query-параметры signed URL.
- Добавление нового поля с секретом требует явной регистрации в списке редактирования (тест на конфигурацию).
