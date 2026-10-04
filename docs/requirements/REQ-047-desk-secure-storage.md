---
schema: 1
id: REQ-047
priority: critical
source: brief
steps:
  - STEP-028
  - STEP-030
adrs: []
---

# REQ-047 — [DESKTOP] Токен в системном secure storage

## Requirement

В desktop токен хранится в системном secure storage (Windows Credential Manager, macOS Keychain, Linux Secret Service/Keyring); при недоступности хранилища токен не пишется открытым текстом, пользователь получает явную ошибку/инструкцию. Конкретная реализация выбирается по OQ-010.

## Rationale

Brief §10: открытый текст токена недопустим.

## Acceptance

- На каждой целевой ОС токен после авторизации защищён системным хранилищем без plaintext-fallback; конкретный механизм определяется по OQ-010 (проверка evidence).
- Проверка отсутствия токена в `settings.json`, SQLite и логах проходит автоматически.
- При недоступном Secret Service приложение сообщает об ошибке и не использует plaintext fallback.
