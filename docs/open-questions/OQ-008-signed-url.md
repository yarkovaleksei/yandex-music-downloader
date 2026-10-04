---
schema: 1
id: OQ-008
status: open
affects:
  - STEP-010
created_at: 2026-10-04T17:57:04Z
resolved_at: null
---

# OQ-008 — Как обновляются signed audio URLs и какой у них TTL?

## Context

Загрузка больших плейлистов может превышать время жизни ссылки; от этого зависит стратегия обновления потока.

## Decision needed

Определить TTL, условия истечения и способ получения новой ссылки.

## Resolution

—
