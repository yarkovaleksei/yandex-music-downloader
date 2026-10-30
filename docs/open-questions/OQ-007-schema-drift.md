---
schema: 1
id: OQ-007
status: resolved
created_at: 2026-10-04T17:57:04Z
resolved_at: 2026-10-08T20:41:59Z
---

# OQ-007 — Как корректно определять API schema drift?

## Context

API drift не должен превращаться в generic runtime exception; нужна стратегия runtime-схем и классификации.

## Decision needed

Выбрать стратегию runtime-валидации и признаки drift (какие поля критичны, как отличить drift от сетевой ошибки).

## Resolution

Стратегия определена [ADR-009](../architecture-decisions/ADR-009-yandex-adapter-strategy.md): Zod 4 проверяет критичный исходный ответ до библиотечных моделей и доменную проекцию после них. Additive поля допускаются; отсутствие/неверный тип обязательного поля или некорректное используемое значение даёт PROVIDER_RESPONSE_INVALID; подтверждённая несовместимая версия/смена протокола — API_CHANGED. Network/auth/service/CDN отказы классифицируются по контексту отдельно. Неизвестный preview исключает вариант; hooks библиотеки не заменяют схемы. PROVIDER_SCHEMA_VERSION — SemVer проверяемого compatibility contract, независимо от npm-version.

Основание: [наблюдения вариантов аудио](OQ-002-codecs.md), в частности потеря preview в LosslessDownloadInfo, и REQ-007. Реализация metadata-схем/версии — реализация provider metadata, audio/CDN — проверка аудиотранспорта, вывод doctor — диагностика provider. Resolution принимает документальную стратегию, а не подтверждает runtime-поддержку будущего адаптера; ограничения encraw/Range/TTL сохраняются.
