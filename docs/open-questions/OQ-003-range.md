---
schema: 1
id: OQ-003
status: resolved
affects:
  - STEP-010
created_at: 2026-10-04T17:57:04Z
resolved_at: 2026-10-08T19:10:22+00:00
---

# OQ-003 — Доступен ли HTTP Range для CDN download?

## Context

Brief §18: Range допустим только при реальной поддержке; иначе partial скачивается заново.

## Decision needed

Проверить поддержку Range и условия её работы (в том числе для signed URL).

## Resolution

STEP-005, 2026-10-08: все шесть исследованных полных MP3-вариантов (три трека × 192/320 kbps) на signed CDN URL ответили `206` на `Range: bytes=0-1048575` с согласованным `Content-Range: bytes 0-1048575/<size>`; фактически прочитан 1 MiB на вариант. Дополнительные пробы 4096 bytes также вернули `206` и согласованный Content-Range. HTTP Range для этих полных MP3-вариантов подтверждён.

Evidence: [отчёт](../research/yandex-api-spike.md#range), [вывод](../research/yandex-api-spike-output.jsonl). Не проверены ненулевое смещение, suffix/out-of-bounds Range, modern encraw и восстановление после expiry. Это не доказательство произвольного resume/расшифровки; будущий поток должен проверять фактический статус/Content-Range и сохранять предусмотренный fallback при неподдерживаемом Range.
