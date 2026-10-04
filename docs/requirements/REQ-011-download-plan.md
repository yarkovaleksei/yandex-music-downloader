---
schema: 1
id: REQ-011
priority: critical
source: brief
steps:
  - STEP-013
  - STEP-016
adrs:
  - ADR-004
---

# REQ-011 — [DOWNLOAD] Immutable DownloadPlan

## Requirement

До начала физической загрузки формируется `DownloadPlan` (источник, название, упорядоченные треки с позициями). После формирования план неизменяем для текущей операции и сохраняется в manifest.

## Rationale

Повторяемость, корректная нумерация, resume и диагностика (brief §12).

## Acceptance

- Планировщик по `Playlist`/`Album`/`Track` строит план без сетевых вызовов загрузки аудио.
- Попытка изменить сформированный план приводит к ошибке (тип `readonly` + runtime freeze/тест).
- После перезапуска и resume позиции треков и нумерация файлов совпадают с исходным планом.
