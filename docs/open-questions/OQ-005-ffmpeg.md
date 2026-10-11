---
schema: 1
id: OQ-005
status: resolved
affects:
  - STEP-023
  - STEP-035
created_at: 2026-10-04T17:57:04Z
resolved_at: 2026-10-11T12:22:30+00:00
---

# OQ-005 — Нужен ли bundled FFmpeg?

## Context

Brief §4.8: FFmpeg — опциональная зависимость; bundling влияет на размер, лицензии и packaging.

## Decision needed

Определить роль FFmpeg и необходимость поставки вместе с приложением.

## Resolution

FFmpeg/ffprobe остаются опциональными; baseline поставляется без bundled FFmpeg и не скачивает его автоматически. Spike доказал запись и независимое базовое распознавание/duration без доступа к внешним бинарникам. Дополнительное декодирование использовано только при подготовке research corpus.

Решение: [ADR](../adr/ADR-013-optional-ffmpeg.md). Evidence: [сравнительный отчёт](../research/audio-metadata-spike.md), [results.json](../research/audio-metadata-spike/results.json). Полные локальные samples не являются доказательством Yandex transport. Реализация и платформенные проверки остаются owning STEP, перечисленными в ADR; production-код STEP-020 не менялся.
