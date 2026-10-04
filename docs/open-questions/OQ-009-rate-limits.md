---
schema: 1
id: OQ-009
status: open
affects:
  - STEP-014
  - STEP-017
created_at: 2026-10-04T17:57:04Z
resolved_at: null
---

# OQ-009 — Какие rate limits наблюдаются у API/CDN?

## Context

Значения по умолчанию concurrency (4) и backoff зависят от реальных ограничений; ошибочные значения могут привести к блокировкам.

## Decision needed

Зафиксировать наблюдаемые лимиты и безопасные значения concurrency/backoff.

## Resolution

—
