---
schema: 1
id: OQ-006
status: resolved
created_at: 2026-10-04T17:57:04Z
resolved_at: 2026-10-04T17:57:04Z
---

# OQ-006 — Нужен ли SQLite уже в headless MVP?

## Context

Первая CLI-версия допускает файловые JSON-manifest при сохранении состояния, восстановлении после перезапуска и пропуске завершённых треков. SQLite и миграции вводятся на этапе desktop после успешной приёмки headless MVP.

## Decision needed

Определить хранилище состояния для headless MVP.

## Resolution

Решение первоначального проектирования: в headless MVP состояние хранится в файловых versioned JSON manifest за интерфейсом `ManifestStore` (ADR-004); SQLite и миграции вводятся на этапе desktop без изменения семантики manifest.
