---
schema: 1
id: PRN-002
status: active
severity: blocking
scope: project
superseded_by: null
requirements:
  - REQ-039
  - REQ-002
  - REQ-047
adrs: []
---

# PRN-002 — Секреты не хранятся и не логируются в открытом виде

## Rule

Access token, cookies, Authorization header, credentials, ключи расшифровки потока и полные signed CDN URL с security-параметрами никогда не записываются открытым текстом в logs, events, manifest, cache, SQLite, settings и сообщения об ошибках; пароль пользователя Яндекса не запрашивается и не хранится.

## Rationale

Утечка токена даёт доступ к аккаунту пользователя (brief §10, §30, §55).

## Applies to

Логирование, ошибки, события CLI/IPC, persistence, cache, настройки, диагностические отчёты и тестовые fixtures.

## Exceptions / approved deviation

Исключений нет. Хранение токена допускается только в механизме, принятом ADR (защищённое хранилище CLI, системное secure storage desktop).
