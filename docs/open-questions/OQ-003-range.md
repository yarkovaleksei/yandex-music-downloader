---
schema: 1
id: OQ-003
status: open
affects:
  - STEP-010
created_at: 2026-10-04T17:57:04Z
resolved_at: null
---

# OQ-003 — Доступен ли HTTP Range для CDN download?

## Context

Brief §18: Range допустим только при реальной поддержке; иначе partial скачивается заново.

## Decision needed

Проверить поддержку Range и условия её работы (в том числе для signed URL).

## Resolution

—
