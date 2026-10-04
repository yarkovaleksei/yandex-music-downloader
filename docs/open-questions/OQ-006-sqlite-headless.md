---
schema: 1
id: OQ-006
status: resolved
affects:
  - STEP-016
created_at: 2026-10-04T17:57:04Z
resolved_at: 2026-10-04T17:57:04Z
---

# OQ-006 — Нужен ли SQLite уже в headless MVP?

## Context

Brief §4.6 допускает файловые JSON-manifest для первой CLI-версии; §46 требует manifest, restart recovery и skip completed; §49 относит SQLite и миграции к STEP 4 после успешного headless MVP.

## Decision needed

Определить хранилище состояния для headless MVP.

## Resolution

Решено при PROJECT INIT на основании brief §4.6, §46 и §49: в headless MVP состояние хранится в файловых versioned JSON manifest за интерфейсом `ManifestStore` (ADR-004); SQLite и миграции вводятся на этапе desktop (STEP-028, STEP-029) без изменения семантики manifest.
