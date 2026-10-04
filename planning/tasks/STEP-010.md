---
schema: 1
id: STEP-010
status: planned
type: implementation
priority: critical
phase: provider
depends_on:
  - STEP-009
  - STEP-005
requirements:
  - REQ-010
  - REQ-038
  - REQ-015
adrs:
  - ADR-002
architecture_refs:
  - "docs/architecture.md#external-dependencies-integrations"
  - "docs/architecture.md#security-boundaries"
risk_flags:
  - external-integration
  - security-sensitive
plan:
  status: not_planned
  revision: 0
  context_basis: null
  content_hash: null
  reviewed_report: null
  planned_at: null
---

# STEP-010 — Provider: audio variants и поток

## Goal

Реализовать `getAudioVariants` и `openAudioStream` с поддержкой AbortSignal и сообщением о возможностях потока (Range) по evidence STEP-005.

## Context

Результаты OQ-002/003/008 определяют форму AudioVariant, поддержку Range и обновление signed URL; они выражаются runtime-флагами `AudioStream`, а не изменением контракта. OQ-012 определяет допустимость вариантов с зашифрованным транспортом и preview.

## Scope

- `getAudioVariants` — только доступные текущему аккаунту варианты.
- `openAudioStream(trackId, variantKey, {signal, offset?})` → `AudioStream` с `contentLength`, `container`, `acceptsRanges`, `startOffset`; `AudioVariant.key` стабилен между запусками.
- Расшифровка потока (если применимо по evidence STEP-005) выполняется внутри provider; ключ расшифровки не входит в `variantKey`, manifest, cache, логи, ошибки и события и запрашивается заново при каждом открытии; Range на зашифрованном потоке либо корректно маппит offset, либо `acceptsRanges=false`; `AudioVariant.container` заполнен.
- Недействительная подпись ссылки классифицируется как `STREAM_EXPIRED`, а не `AUTH_ERROR`; provider не повторяет запросы скрыто.
- Нормализация ошибок недоступности (TrackUnavailable/QualityUnavailable).
- Редакция signed URL в логах.

## Mutation policy

### Allowed

- `packages/providers/yandex-music/**`, при необходимости минимальное расширение типов в `packages/shared`, тесты.

### Conditional

- Расширение контракта MusicProvider — только через ADR.

### Forbidden

- Загрузка файлов на диск, обход ограничений аккаунта, логирование полных signed URL.
- Реализация future/unrelated STEP «заодно».

## Out of scope

- Файловая запись и очередь.

## Acceptance criteria

- Для набора mock-ответов варианты маппятся в `AudioVariant` с реальными codec/bitrate/lossless.
- Отмена через AbortSignal прекращает чтение потока (тест); запрос с `offset` возвращает корректный `startOffset` либо `acceptsRanges=false`.
- Вариант можно открыть повторно по `variantKey` после перезапуска процесса (тест на сохранённом ключе).
- Тест редакции: ключ расшифровки и signed URL отсутствуют в `variantKey`, логах и сериализованных ошибках.
- Signed URL не попадает в логи (тест редакции).
- Live-проверка: поток трека читается до конца у авторизованного аккаунта.

## Verification

- command: `npm run lint`
- command: `npm run typecheck`
- command: `npm test`
- command: `python3 .harness/tools/validate.py --mode manual`
- manual: Live-проверка получения variants и чтения потока (evidence с редакцией).

## Deliverables

- Audio-часть provider, тесты.

## Implementation plan

Заполняется командой `STEP PLAN STEP-010`. Пока semantic planning-review не дал PASS для текущих context basis + content hash, `plan.status` не может быть `ready`.

## Evidence

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.

## Blocker / Failure reason

—
