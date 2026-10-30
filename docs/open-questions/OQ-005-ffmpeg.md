---
schema: 1
id: OQ-005
status: resolved
created_at: 2026-10-04T17:57:04Z
resolved_at: 2026-10-11T12:22:30+00:00
---

# OQ-005 — Нужен ли bundled FFmpeg?

## Context

FFmpeg — опциональная зависимость; bundling влияет на размер, лицензии и packaging.

## Decision needed

Определить роль FFmpeg и необходимость поставки вместе с приложением.

## Resolution

FFmpeg/ffprobe остаются опциональными; baseline поставляется без bundled FFmpeg и не скачивает его автоматически. Spike доказал запись и независимое базовое распознавание/duration без доступа к внешним бинарникам. Дополнительное декодирование использовано только при подготовке research corpus.

Решение: [ADR](../architecture-decisions/ADR-013-optional-ffmpeg.md). Основания выбора и технические ограничения приведены в ADR. Полные локальные samples не являются доказательством Yandex transport. Реализация и платформенные проверки определяются соответствующим ADR и проверяются отдельно; исследование не меняло production-код.
