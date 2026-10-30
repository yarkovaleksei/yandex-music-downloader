---
schema: 1
id: OQ-004
status: resolved
created_at: 2026-10-04T17:57:04Z
resolved_at: 2026-10-11T12:22:30+00:00
---

# OQ-004 — Какая metadata library наиболее надёжна на Node.js?

## Context

Выбор библиотеки фиксируется отдельным ADR после сравнения вариантов; ошибки Unicode и обложек недопустимы.

## Decision needed

Выбрать библиотеку по результатам сравнения на реальных файлах.

## Resolution

Выбран taglib-wasm 1.5.3, Emscripten buffer API: MP3, AAC-in-MP4 и FLAC-in-MP4 прошли запись всех обязательных тегов и обложки, независимое чтение и сохранность аудио. Explicit container сверяется с распознанными bytes до записи в .part; force-format API библиотеки не заявлен.

Решение: [ADR](../architecture-decisions/ADR-012-audio-metadata-library.md). Основания выбора и технические ограничения приведены в ADR. Полные локальные samples не являются доказательством Yandex transport. Реализация и платформенные проверки определяются соответствующим ADR и проверяются отдельно; исследование не меняло production-код.
