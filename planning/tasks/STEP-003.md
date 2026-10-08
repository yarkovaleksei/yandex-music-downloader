---
schema: 1
id: STEP-003
status: completed
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
  - docs/architecture.md#data-state-model
risk_flags:
  - architecture
  - public-api
plan:
  status: ready
  revision: 1
  context_basis: sha256:cf3f9671d25359a1f87bed149aef5876383615a2345d113ddb9aa780cfe23d1c
  content_hash: sha256:87e6ad255f83a34dee5d899f176c0ce879ca103797a983bc251e220750cf1f02
  reviewed_report: planning/plan-reviews/STEP-003/PLAN-REVIEW-20261008T180407Z.md
  planned_at: 2026-10-08T18:04:07+00:00
  execution_groups:
  context_components:
    - "ADR@ADR-001=sha256:0c9975737760fdee3b16ec2c99c8412cd98e81af5a0ce123cf70600a4a3200bc"
    - "ADR@ADR-002=sha256:9603d7e711e02ee4bc36d447b5397e944f34d00f15a3d773c4fec36cce4e4d17"
    - "ARCH@docs/architecture.md#data-state-model=sha256:934aa286596789bdd0f7032050c15a3b613e80c92b6f682d337181f6e6c04795"
    - "ARCH@docs/architecture.md#основные-компоненты-границы=sha256:199b2ee2dfd38c0d4e06c44b9234d1aaaf2f22cee09bb48ef3a6c634cacdfcb4"
    - "PRN@PRN-001=sha256:3b3801f207fafc3f77272f0e93570258a6d006964839d93a276accd814d548af"
    - "PRN@PRN-002=sha256:f29ee3fbdb9cf65cf9739d0907768bbf192ad88b8e443110d4d82f81c6b79ecb"
    - "PRN@PRN-003=sha256:16516d7d302fecda5f7615f9d55e29e04b588d671f8660640e1f61d1619e4ef8"
    - "REQ@REQ-004=sha256:0ebb58f4b7ce2c424b53147885d2e5d1d352ad3ebc3510fa267574f9d6edbb6a"
    - "REQ@REQ-037=sha256:d8eb802392cf51c348fe77e4e83e439685ef78c39806df0b1a1bf9888fb7ef4d"
    - "REQ@REQ-042=sha256:401263db29ff424588bd0dd6404896271a21b2d5d66d42da5f7a707889474124"
    - "STEP@STEP-001=sha256:d106929a060d966df5a13bf5e4513b05be5a45f6895d37ef444ac3bb91349e25"
    - "STEP@STEP-003=sha256:4eb8d227142046eb336a0c3cfb73c912d9f95f70a5b0b3421bd4d68cbd081071"
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

- command: `node packages/testing/scripts/run-yarn.mjs run lint`
- command: `node packages/testing/scripts/run-yarn.mjs run typecheck`
- command: `node packages/testing/scripts/run-yarn.mjs test`
- command: `node packages/testing/scripts/run-yarn.mjs run build`
- command: `node packages/testing/scripts/run-yarn.mjs run format:check`
- command: `python3 .harness/tools/validate.py --mode manual`

## Deliverables

- Пакеты `shared` и `testing` с тестами.

## Implementation plan

### 1. Доменные типы и переносимый контракт provider

- По brief §8 и ADR-002 определить Artist, AlbumReference, Track, Album, PlaylistTrack, Playlist, AudioVariant (обязательные key/container), ArtworkRef и QualityPreference best/lossless/high/normal, MediaReference с provider.
- Определить DownloadRequest, DownloadJob, DownloadTrackJob с типами статусов/control по ADR-006 и перечислением агрегатов ADR-003, без переходов state machine или manifest реализации.
- В provider.ts экспортировать полный MusicProvider и Account, AudioStream, ArtworkData, StreamOptions, минимальные AuthInteraction/CredentialStore порты; authenticate без обязательных аргументов, настройка портов через adapter composition. Auth остаётся уточняемым STEP-006.
- Все наружные ссылки на artwork непрозрачные, никаких CDN URL, ключей расшифровки и типов сторонних библиотек; shared без Node/I/O. Экспортировать через src/index.ts и сохранить package marker.

**Files:**
- packages/shared/src/domain.ts
- packages/shared/src/provider.ts
- packages/shared/src/index.ts
- packages/shared/src/web-platform.d.ts

**Tests:**
- Compile-time импорт всех публичных типов и проверка structurally compatible Web ReadableStream через общий exports.

**Risks:**
- Не копировать superseded state policy: только enum/DTO по принятому lifecycle, без реализации downloader.

### 2. Иерархия безопасных доменных ошибок

- Реализовать DomainError и все десять классов REQ-037, стабильные code/retryable, provider коды NETWORK_ERROR/AUTH_ERROR/API_CHANGED/SERVICE_UNAVAILABLE/PROVIDER_RESPONSE_INVALID/STREAM_EXPIRED.
- Для ошибок фиксировать безопасные сообщения по коду; toJSON выдаёт allowlist code/message/retryable без cause/stack/raw message/details. Не принимать внешние messages за публичную диагностику.
- Добавить нормализацию подтверждённых системных/HTTP ошибок ENOSPC/EACCES/404/429/5xx, auth/network без provider SDK; неизвестное исключение скрывает исходный текст. Функция не реализует retry policy.

**Files:**
- packages/shared/src/errors.ts
- packages/shared/src/errors.test.ts

**Tests:**
- Каждый класс code/retryable/JSON, provider health codes, безопасный JSON с cause, нормализация системных/HTTP ошибок по REQ-037.

### 3. Полный mock provider и fixtures

- В testing реализовать MusicProvider без сети и credentials; fixtures track/album/playlist/artwork/variants с непрозрачными стабильными ключами и provider ID.
- Конфигурировать очереди typed failures и задержки для методов, истечение ссылки STREAM_EXPIRED, обрыв stream, Range support, доступность трека; не выполнять скрытый retry.
- Для stream возвращать точные bytes, contentLength/container/acceptsRanges/startOffset; Range отдаёт suffix с фактическим offset, без Range отдаёт полный поток с startOffset=0; проверять variant принадлежность треку.
- AbortSignal отменяет открытие/чтение потока, отмена reader освобождает listener/таймер; artwork возвращает независимые bytes и MIME. Mock state ограничен экземпляром; успешная auth/logout/getAccount детерминированы.

**Files:**
- packages/testing/src/mock-provider.ts
- packages/testing/src/fixtures.ts
- packages/testing/src/index.ts
- packages/testing/src/mock-provider.test.ts

**Tests:**
- Success для всех методов, unavailable/network/expiry с повторным explicit вызовом, обрыв и Range/no Range bytes, artwork и delay/abort.

### 4. Контрактные тесты и каноническая проверка

- Покрыть обе критические proof obligations из Semantic Blast Radius: переносимость/безопасная диагностика и byte-exact mock stream/Range/expiry.
- Выполнить существующие lint/typecheck/test/build/format:check и Harness validator, исправляя только shared/testing; форматировать только затронутые файлы.
- Синхронизировать projections перед completion; передать factual SUCCESS dispatcher для canonical Verification и независимого REVIEW.

**Files:**
- packages/shared/src/provider.test.ts
- packages/testing/src/mock-provider.test.ts

**Tests:**
- Offline тесты без сети/учётных данных; mock implements MusicProvider подтверждает типизацию.

## Evidence


<!-- VERIFICATION-EVIDENCE:START -->
- Verification run: 2026-10-08T18:20:59Z
- Status: PASS
- Automated resumed: false
- Git head: 447e5d96c2d4198b1fa67582379003c7884b877a
- Worktree hash: sha256:21d1cd7d0ddcbd0575f5832f1d6b075351ba8236ca954f322b9fbbab57b5b81b
- Verification contract basis: sha256:75b598e33fd70ff9f5316d777967dc0391cde0d8e4a85a0ea979e02b7ae8a559
- Subject git head: 447e5d96c2d4198b1fa67582379003c7884b877a
- Subject worktree hash: sha256:9357c6009afbd0e0c2f550dfeba110e17e9f97c33f153b729a4618335e840d1c

### Automated verification
- Command: node packages/testing/scripts/run-yarn.mjs run lint
  - Status: PASS
  - Exit code: 0
  - Duration ms: 3720
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: f59ba696a15507a8febe0f9ea94ac75ccc5411952df61ee4cb3c971b47b6bc12
  - stdout bytes: 0
  - stderr bytes: 25
- Command: node packages/testing/scripts/run-yarn.mjs run typecheck
  - Status: PASS
  - Exit code: 0
  - Duration ms: 1316
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: ffbfd8ec2bfcf3e8f0e99a93f081f695da2de832eba56c5ae6943a4052680411
  - stdout bytes: 0
  - stderr bytes: 30
- Command: node packages/testing/scripts/run-yarn.mjs test
  - Status: PASS
  - Exit code: 0
  - Duration ms: 3074
  - stdout sha256: c32ecd19242bfc8c9784d44a3d7bae3750b75513358131367e28115b46ec763e
  - stderr sha256: f969fafb7bc32ecc492c8343f56269c9c47161d893e83a0d8b9b27fcf57b9aee
  - stdout bytes: 2460
  - stderr bytes: 21
- Command: node packages/testing/scripts/run-yarn.mjs run build
  - Status: PASS
  - Exit code: 0
  - Duration ms: 414
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: a0b5ebe8b7786637f56a665a03d6d27f3d6a927d0669b1870beb1307702b651a
  - stdout bytes: 0
  - stderr bytes: 26
- Command: node packages/testing/scripts/run-yarn.mjs run format:check
  - Status: PASS
  - Exit code: 0
  - Duration ms: 1065
  - stdout sha256: 17aa973d3f004560237d9a95171210b0671deff23d61628eecf7322ff5938f20
  - stderr sha256: 25e162fe1196016bd51a2c9644b6820f880082561abce757f808502fb7895ebb
  - stdout bytes: 66
  - stderr bytes: 33
- Command: python3 .harness/tools/validate.py --mode manual
  - Status: PASS
  - Exit code: 0
  - Duration ms: 2066
  - stdout sha256: 6dcfb60d513efe28137a4934b055ab0f9b82ae7b02ba4fa2083562a2f114a2a4
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 66
  - stderr bytes: 0

### Product verification
- none

### Manual verification
- none
<!-- VERIFICATION-EVIDENCE:END -->

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.


## Blocker / Failure reason

—
