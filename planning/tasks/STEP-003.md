---
schema: 1
id: STEP-003
status: planned
type: implementation
priority: critical
phase: foundation
depends_on:
  - STEP-001
requirements:
  - REQ-004
  - REQ-037
  - REQ-042
adrs:
  - ADR-001
  - ADR-002
architecture_refs:
  - "docs/architecture.md#основные-компоненты-границы"
  - "docs/architecture.md#data-state-model"
risk_flags:
  - architecture
  - public-api
plan:
  status: not_planned
  revision: 0
  context_basis: null
  content_hash: null
  reviewed_report: null
  planned_at: null
---

# STEP-003 — Доменная модель, ошибки и контракт MusicProvider

## Goal

Определить в `packages/shared` доменные типы, иерархию доменных ошибок и контракт `MusicProvider`, а в `packages/testing` — mock provider для тестов core.

## Context

ADR-001/ADR-002 фиксируют направление зависимостей и контракт; реальный API ещё не исследован, поэтому контракт не должен содержать деталей Яндекса.

## Scope

- Типы Track, Album, Playlist, Artist, AudioVariant, MediaReference, DownloadRequest, DownloadJob, DownloadTrackJob (brief §8) и QualityPreference.
- Интерфейс `MusicProvider` по ADR-002 (`logout`, `AudioVariant.key`, `openAudioStream(trackId, variantKey, {signal, offset?})` → `AudioStream {stream, contentLength?, container, acceptsRanges, startOffset}`, `fetchArtwork(ArtworkRef, size)`), `Account`, поле `provider` в `MediaReference`, минимальные порты взаимодействия при авторизации и `CredentialStore` (уточняются STEP-006).
- Иерархия доменных ошибок со стабильными кодами и признаком retryable, коды provider health и `STREAM_EXPIRED`.
- Mock provider и тестовые fixtures в `packages/testing` с управляемыми сбоями (ошибки, задержки, истёкшие ссылки, наличие/отсутствие Range, обложки).

## Mutation policy

### Allowed

- `packages/shared/**`, `packages/testing/**`, unit-тесты этих пакетов.

### Conditional

- Изменение контракта относительно brief §9 — только если выявлено при реализации и оформлено через ADR.

### Forbidden

- Реализация Yandex adapter, downloader core, CLI, зависимости от `@dvxch/yandex-music`.
- Реализация future/unrelated STEP «заодно».

## Out of scope

- Реальный provider, логика загрузки.

## Acceptance criteria

- Типы и интерфейс `MusicProvider` экспортируются из `packages/shared` и не содержат типов сторонних библиотек.
- Иерархия ошибок содержит все классы из REQ диагностики; для каждого есть код, `retryable` и сериализация в JSON без секретов.
- Mock provider реализует интерфейс целиком и поддерживает сценарии: успех, недоступный трек, сетевая ошибка, истёкшая ссылка (`STREAM_EXPIRED`), обрыв потока, поток с Range и без Range, получение обложки.
- Unit-тесты ошибок и mock provider проходят.

## Verification

- command: `npm run lint`
- command: `npm run typecheck`
- command: `npm test`
- command: `python3 .harness/tools/validate.py --mode manual`

## Deliverables

- Пакеты `shared` и `testing` с тестами.

## Implementation plan

Заполняется командой `STEP PLAN STEP-003`. Пока semantic planning-review не дал PASS для текущих context basis + content hash, `plan.status` не может быть `ready`.

## Evidence

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.

## Blocker / Failure reason

—
