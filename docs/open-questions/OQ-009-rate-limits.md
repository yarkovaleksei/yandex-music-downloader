---
schema: 1
id: OQ-009
status: deferred
affects:
  - STEP-014
  - STEP-017
created_at: 2026-10-04T17:57:04Z
resolved_at: null
---

# OQ-009 — Какие rate limits наблюдаются у API/CDN?

## Context

Значения по умолчанию concurrency (4) и backoff зависят от реальных ограничений; ошибочные значения могут привести к блокировкам.

## Decision needed

Зафиксировать наблюдаемые лимиты и безопасные значения concurrency/backoff.

## Resolution

STEP-005, 2026-10-08: короткое ограниченное наблюдение — 10 дополнительных account-status API-запросов и 6 CDN-проб по 4096 bytes, concurrency 1 и 4. API ответил `200`, CDN — `206`; `429`, 5xx и Retry-After в этой выборке не наблюдались. Это не означает отсутствия лимитов или доказанной длительной безопасности concurrency=4.

Определение порогов и числового backoff отложено: ограниченная разрешённая выборка не достигла throttling, а поиск предела нагрузкой не входит в spike. Начальный concurrency=4 согласуется только с короткой наблюдаемой серией; устойчивость длительных jobs и реакция на 429 ещё не доказаны. Повторная проверка — при естественно наблюдённом throttling на собственном аккаунте/обычном job, с записью Retry-After и без обхода блокировок. STEP-014/017 не должны считать эти данные измеренным rate limit.

Evidence: [отчёт](../research/yandex-api-spike.md#rate-limits), [вывод](../research/yandex-api-spike-output.jsonl).
