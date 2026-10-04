---
schema: 1
id: OQ-001
status: open
affects:
  - STEP-006
  - STEP-008
created_at: 2026-10-04T17:57:04Z
resolved_at: null
---

# OQ-001 — Какой auth flow стабильно поддерживается текущим API?

## Context

Brief §10 требует OAuth / Device Authorization без передачи пароля, но неофициальный API может поддерживать иной набор flow. Выбор определяет REQ auth и ADR хранения токена.

## Decision needed

Определить фактически поддерживаемый и стабильный flow авторизации и его ограничения (срок жизни токена, refresh).

## Resolution

—
