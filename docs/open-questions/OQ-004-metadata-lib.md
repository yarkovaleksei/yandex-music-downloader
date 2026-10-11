---
schema: 1
id: OQ-004
status: resolved
affects:
  - STEP-021
created_at: 2026-10-04T17:57:04Z
resolved_at: 2026-10-11T12:22:30+00:00
---

# OQ-004 — Какая metadata library наиболее надёжна на Node.js?

## Context

Brief §4.7 требует выбор библиотеки отдельным ADR после spike; ошибки Unicode/обложек недопустимы.

## Decision needed

Выбрать библиотеку по результатам сравнения на реальных файлах.

## Resolution

Выбран taglib-wasm 1.5.3, Emscripten buffer API: MP3, AAC-in-MP4 и FLAC-in-MP4 прошли запись всех обязательных тегов и обложки, независимое чтение и сохранность аудио. Explicit container сверяется с распознанными bytes до записи в .part; force-format API библиотеки не заявлен.

Решение: [ADR](../adr/ADR-012-audio-metadata-library.md). Evidence: [сравнительный отчёт](../research/audio-metadata-spike.md), [results.json](../research/audio-metadata-spike/results.json). Полные локальные samples не являются доказательством Yandex transport. Реализация и платформенные проверки остаются owning STEP, перечисленными в ADR; production-код STEP-020 не менялся.
