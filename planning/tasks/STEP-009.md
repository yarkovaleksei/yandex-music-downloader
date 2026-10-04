---
schema: 1
id: STEP-009
status: planned
type: implementation
priority: critical
phase: provider
depends_on:
  - STEP-008
  - STEP-007
  - STEP-006
requirements:
  - REQ-006
  - REQ-007
  - REQ-005
adrs:
  - ADR-002
architecture_refs:
  - "docs/architecture.md#external-dependencies-integrations"
  - "docs/architecture.md#reliability-observability"
risk_flags:
  - external-integration
plan:
  status: not_planned
  revision: 0
  context_basis: null
  content_hash: null
  reviewed_report: null
  planned_at: null
---

# STEP-009 — Provider: метаданные, runtime-схемы и provider health

## Goal

Реализовать `resolveUrl`, `getTrack`, `getAlbum`, `getPlaylist` с runtime-валидацией ответов, версией совместимости и классификацией ошибок provider health.

## Context

Стратегия валидации и drift detection определена ADR STEP-006 (OQ-007).

## Scope

- Runtime-схемы критичных ответов и маппинг в доменные типы.
- `PROVIDER_SCHEMA_VERSION` и классификация NETWORK_ERROR/AUTH_ERROR/API_CHANGED/SERVICE_UNAVAILABLE/PROVIDER_RESPONSE_INVALID.
- Сохранённые fixtures реальных ответов (с редакцией секретов) для unit-тестов маппинга.
- Пользовательское сообщение об изменении API.
- `fetchArtwork(ArtworkRef, size)`: provider скачивает обложку по непрозрачной ссылке; клиенты и core не обращаются к CDN обложек напрямую.

## Mutation policy

### Allowed

- `packages/providers/yandex-music/**`, fixtures, тесты.

### Conditional

- Нет.

### Forbidden

- Audio variants/stream (STEP-010), downloader core, прямой экспорт типов библиотеки.
- Реализация future/unrelated STEP «заодно».

## Out of scope

- Cache ответов (STEP-024).

## Acceptance criteria

- Unit-тесты маппинга track/album/playlist на fixtures, включая отсутствующие необязательные поля и недоступные треки.
- Изменённая структура ответа даёт `PROVIDER_RESPONSE_INVALID`/`API_CHANGED`, а не `TypeError`.
- `fetchArtwork` возвращает байты и MIME-тип на mock-ответах; прямых обращений к CDN обложек вне provider нет.
- Публичный API пакета не содержит типов сторонней библиотеки (проверка ESLint/types).

## Verification

- command: `npm run lint`
- command: `npm run typecheck`
- command: `npm test`
- command: `python3 .harness/tools/validate.py --mode manual`
- manual: Live-проверка получения metadata для track, album, playlist.

## Deliverables

- Metadata-часть provider, fixtures, тесты.

## Implementation plan

Заполняется командой `STEP PLAN STEP-009`. Пока semantic planning-review не дал PASS для текущих context basis + content hash, `plan.status` не может быть `ready`.

## Evidence

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.

## Blocker / Failure reason

—
