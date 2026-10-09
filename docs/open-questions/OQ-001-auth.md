---
schema: 1
id: OQ-001
status: resolved
affects:
  - STEP-006
  - STEP-008
created_at: 2026-10-04T17:57:04Z
resolved_at: 2026-10-08T19:10:22+00:00
---

# OQ-001 — Какой auth flow стабильно поддерживается текущим API?

## Context

Brief §10 требует OAuth / Device Authorization без передачи пароля, но неофициальный API может поддерживать иной набор flow. Выбор определяет REQ auth и ADR хранения токена.

## Decision needed

Определить фактически поддерживаемый и стабильный flow авторизации и его ограничения (срок жизни токена, refresh).

## Resolution

2026-10-08 в STEP-005 на собственном аккаунте с подпиской подтверждён OAuth Device Authorization: выдача Device Code (`200`), подтверждение владельцем через выданный сервером адрес на `ya.ru`, получение токена (`200`) и идентификация аккаунта через `Client.init`/account status (`200`). Пароль приложение не запрашивает; токен не сохраняется. Device Code действует 300 секунд, interval 5 секунд. Access-token ответ сообщает `expiresIn=31536000` и наличие refresh token; фактическое годовое истечение не наблюдалось.

`refreshAccessToken` на уже авторизованном Client вернул `401`; после отказа исходный access token успешно использовался для чтения каталога. Причина отказа не установлена, поддержка refresh в других условиях не отвергнута. Библиотека сохраняет Authorization в transport при установке, поэтому после выдачи токена research вызывает `client.request.setAuthorization`; одной смены `client.token` недостаточно. Product flow/storage должен принять ADR STEP-006 с этими ограничениями, а не предполагать работающий refresh.

Evidence, команды и границы выборки: [отчёт STEP-005](../research/yandex-api-spike.md#авторизация), [отредактированный фактический вывод](../research/yandex-api-spike-output.jsonl). Подтверждён один flow и один аккаунт; повторное использование после истечения и другие OAuth grants не исследованы.
