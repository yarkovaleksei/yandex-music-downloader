---
schema: 1
id: OQ-013
status: open
affects:
  - STEP-036
created_at: 2026-10-04T17:57:04Z
resolved_at: null
---

# OQ-013 — Сертификаты и аккаунты для подписи и notarization релизов

## Context

Подписание Windows/macOS дистрибутивов и notarization требуют сертификатов и аккаунтов владельца (Apple Developer ID, Windows code signing) и связанных расходов; без них REQ pack-update-signing не может быть подтверждён реальной подписью.

## Decision needed

Определить, предоставит ли владелец сертификаты и аккаунты, кто и где хранит ключи (защищённое хранилище CI) и допустимо ли выпускать неподписанные сборки.

## Resolution

—
