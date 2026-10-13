---
schema: 1
id: STEP-024
status: completed
type: implementation
priority: medium
phase: hardening
depends_on:
  - STEP-009
  - STEP-018
requirements:
  - REQ-027
adrs: []
architecture_refs:
  - docs/architecture.md#data-state-model
risk_flags:
  - none
plan:
  status: ready
  revision: 1
  context_basis: sha256:2719d5e3aeef8db9a033607788ed4537a98cf15abc668a8972957114c3aa453f
  content_hash: sha256:99a5e39a51acfa530129616f03f19a08fb70ff6ecf2b6451c6a2b84c1ccff0f6
  reviewed_report: planning/plan-reviews/STEP-024/PLAN-REVIEW-20261013T194451Z.md
  planned_at: 2026-10-13T19:44:51+00:00
  execution_groups:
  context_components:
    - "ARCH@docs/architecture.md#data-state-model=sha256:a16465c45f16a8f41fd3e876e764be3e05d852017bd62457799b7dba138bf6c6"
    - "PRN@PRN-001=sha256:3b3801f207fafc3f77272f0e93570258a6d006964839d93a276accd814d548af"
    - "PRN@PRN-002=sha256:f29ee3fbdb9cf65cf9739d0907768bbf192ad88b8e443110d4d82f81c6b79ecb"
    - "PRN@PRN-003=sha256:16516d7d302fecda5f7615f9d55e29e04b588d671f8660640e1f61d1619e4ef8"
    - "REQ@REQ-027=sha256:bbbddf4b8e30dd5ffae69da1a6fca85bef1e89d3946d4418083f7adbeaae5ece"
    - "STEP@STEP-009=sha256:eb191ddce635810bb63fbeddbdf905bc7796ff7a6e9fe3ccf0055393c7ca3cc3"
    - "STEP@STEP-018=sha256:ef554746f2dd587e4003775194675c6948f4b905d548119bfb60e491e7ec4659"
    - "STEP@STEP-024=sha256:f221a4b1f42381be1dfd15fdaf99e5090efe4fc593baffe6c8b8b8fd5146f341"
---

# STEP-024 — Локальный cache метаданных и обложек с TTL

## Goal

Добавить cache метаданных, обложек и ответов provider с TTL без секретов.

## Context

Снижает число запросов к неофициальному API; audio cache в MVP не требуется.

## Scope

- Интерфейс и файловая реализация cache с TTL и инжектируемыми часами.
- Подключение через application layer; ключ cache учитывает аккаунт и `PROVIDER_SCHEMA_VERSION`; ссылки на поток и download info не кэшируются; доступность и варианты кэшируются только с ключом по аккаунту.
- Команда/API очистки cache без влияния на manifest и файлы.

## Mutation policy

### Allowed

- `packages/persistence/**`, `packages/application/**`, тесты.

### Conditional

- Нет.

### Forbidden

- Кэширование аудио, секретов и signed URL.
- Реализация future/unrelated STEP «заодно».

## Out of scope

- SQLite cache.

## Acceptance criteria

- Повторный запрос в пределах TTL не обращается к provider; после TTL — обращается.
- В cache нет токенов, cookies и signed URL (автоматическая проверка).
- Очистка cache не затрагивает manifest и скачанные файлы.

## Verification

- command: `node packages/testing/scripts/run-yarn.mjs test packages/application packages/persistence`
- command: `node packages/testing/scripts/run-yarn.mjs run lint`
- command: `node packages/testing/scripts/run-yarn.mjs run typecheck`
- command: `node packages/testing/scripts/run-yarn.mjs test`
- command: `node packages/testing/scripts/run-yarn.mjs build`
- command: `python3 .harness/tools/validate.py --mode manual`

## Deliverables

- Cache и тесты.

## Implementation plan

### 1. Файловый TTL-cache в persistence

- Добавить CacheStore (read/write/clear) и FileCacheStore в packages/persistence; clock now и TTL инжектируются, expiresAt сравнивается строго: now >= expiresAt означает miss. Store принимает только JSON cache payload, не credentials/audio/stream.
- Использовать отдельный фиксированный stateDir/cache каталог, хешировать составной ключ provider/account/schema/method/arguments; envelope версии cache и expiresAt. Публиковать JSON существующим writeAtomicJson; отсутствующая, истёкшая либо повреждённая запись является miss, ошибки доступа обрабатываются существующей безопасной нормализацией.
- clear удаляет только собственный cache каталог; существующие manifests, leases, inbox, скачанные файлы и job artwork snapshots не затрагиваются. При удалении каталога во время write ошибка/следующий miss допустимы, транзакционный concurrent clear не обещается.

**Files:**
- packages/persistence/src/cache-store.ts
- packages/persistence/src/file-cache-store.ts
- packages/persistence/src/file-cache-store.test.ts
- packages/persistence/src/index.ts

**Tests:**
- Настоящий tmp filesystem, read после перезапуска store, TTL до/на/после границы, missing/corrupt record, schema/account key isolation, clear сохраняет sibling manifest и output.

### 2. Provider decorator с явной безопасной проекцией

- Добавить application decorator MusicProvider: getTrack/getAlbum/getPlaylist и fetchArtwork используют TTL-cache; authenticate/getAccount/logout/resolveUrl/getAudioVariants/openAudioStream всегда делегируются исходному provider. Варианты по REQ-027 допускается не кэшировать, download info/stream никогда не сохраняются.
- Перед cacheable metadata/artwork операцией получать current account через исходный getAccount; null означает bypass cache, ошибка account не обслуживается чужим/анонимным cache. Account/auth не кэшируются, credentials не читаются decorator. Account ID входит только в hashed key, не в envelope. Acceptance счётчик относится к metadata/artwork запросам REQ-027, live account проверки сохраняются.
- Запись и чтение metadata проходят allowlist exact shared Track/Album/Playlist полей, включая availability и nested album/artists/playlist positions; неизвестные token/cookie/Authorization/downloadInfo/url поля не копируются. ArtworkRef остаётся непрозрачным provider public identity; application не декодирует Yandex key. При явно секретном/signed URL значении в persisted string payload обходить cache целиком, не искажая provider результат. Artwork сохраняется как bytes/base64 плюс image MIME; размер входит в ключ.
- Проверять shape payload на чтении, повреждённый payload повторно получать у provider; не кэшировать исключения. Результат hit возвращать независимым snapshot, чтобы caller не менял последующие ответы.

**Files:**
- packages/application/src/cached-provider.ts
- packages/application/src/cache-payload.ts
- packages/application/src/cached-provider.test.ts

**Tests:**
- Счётчики metadata/artwork до TTL и после; смена account и schema; null-account bypass; все некэшируемые методы делегируются; allowlist и обход signed URL проверяются чтением реальных cache files.

### 3. Подключение к composition root и application API очистки

- Добавить RuntimeAdapters cache options (ttlMs, now, providerId/schemaVersion для override), без изменения shared/provider contract. Production constant PROVIDER_SCHEMA_VERSION подключать только в composition-root. Default TTL выбрать 5 минут как локальную настройку, ttlMs=0 отключает cache; invalid TTL отклонять ValidationError. Для providerOverride cache включается только при явно заданных providerId/schemaVersion, чтобы разные fake/host providers не делили production namespace.
- Создать FileCacheStore и decorator в createApplication и передать cache-aware provider в preview/Jobs; diagnostics получает исходный provider для живой проверки account/metadata/variants. Existing createArtworkCache(stateDir) остаётся snapshot для core recovery.
- Экспортировать отдельную Node application функцию clearApplicationCache({stateDir}) с безопасным ApplicationResult<null> envelope через existing command normalization. shared ApplicationApi, CLI команды и provider package не изменять: scope разрешает отдельный application API.
- Кратко документировать TTL, account/schema namespace, bypass/default override, live auth probes, clear API и отсутствие audio/download cache в packages/application/README.md. Комментарии только по сути на русском с @link STEP-024/REQ-027.

**Files:**
- packages/application/src/composition-root.ts
- packages/application/src/runtime-adapters.ts
- packages/application/src/cache.ts
- packages/application/src/index.ts
- packages/application/README.md

**Tests:**
- Public createApplication preview twice hits cache; diagnostics still live; clear public export invalidates cache and preserves manifest/download/job artwork.

### 4. Доказать REQ-027 и canonical verification

- Добавить integration suite с настоящим filesystem и управляемым MusicProvider/clock: track/album/playlist/artwork miss-hit-expired, другой аккаунт, новая schema, restart application, clear. Не требовать real external API для счётчиков: Acceptance явно задаёт provider counter в тесте.
- Автоматически просканировать все созданные cache записи с injected secret marker в extra token/cookie/Authorization/downloadInfo/signed URL fixture: никакие secret marker, signed URL или stream bytes не сохранены. Существующие auth/doctor/download/recovery тесты должны остаться PASS.
- Запустить targeted tests, полный lint/typecheck/tests/build и Harness validation; verification evidence записывает runner, завершение только после независимого STEP REVIEW.

**Files:**
- packages/application/src/cache.integration.test.ts
- packages/application/src/cached-provider.test.ts
- packages/persistence/src/file-cache-store.test.ts

**Tests:**
- node packages/testing/scripts/run-yarn.mjs test packages/application packages/persistence
- Полные repository checks из Verification.

## Evidence


<!-- VERIFICATION-EVIDENCE:START -->
- Verification run: 2026-10-13T20:00:58Z
- Status: PASS
- Automated resumed: false
- Git head: f7e9c45363ec4e3866bbbec8ee0d7ad566ec99cf
- Worktree hash: sha256:d8ccc301e1afba25ca89f57264ff6f95a766925232493e00157213d1f9a25173
- Verification contract basis: sha256:19e561ffec32653324c9debc35b55ded2b489b277e5a0b8316e853ed37a3d7e2
- Subject git head: f7e9c45363ec4e3866bbbec8ee0d7ad566ec99cf
- Subject worktree hash: sha256:d10ef8c20ba3bf73934d9c8799b2ffb48c762813ba25d8d23dd242d45a1ce26e

### Automated verification
- Command: node packages/testing/scripts/run-yarn.mjs test packages/application packages/persistence
  - Status: PASS
  - Exit code: 0
  - Duration ms: 6074
  - stdout sha256: 4a6f29e52a1c20715b6d5edfa8edb521858c741093f5fbbee4f432df4bd05519
  - stderr sha256: 320424d9eeadc4d8427afbe4eb070b04a5d3a543f3bdcd01c1b1e8b4ad6ca702
  - stdout bytes: 3397
  - stderr bytes: 2569
- Command: node packages/testing/scripts/run-yarn.mjs run lint
  - Status: PASS
  - Exit code: 0
  - Duration ms: 7727
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: f59ba696a15507a8febe0f9ea94ac75ccc5411952df61ee4cb3c971b47b6bc12
  - stdout bytes: 0
  - stderr bytes: 25
- Command: node packages/testing/scripts/run-yarn.mjs run typecheck
  - Status: PASS
  - Exit code: 0
  - Duration ms: 3219
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: ffbfd8ec2bfcf3e8f0e99a93f081f695da2de832eba56c5ae6943a4052680411
  - stdout bytes: 0
  - stderr bytes: 30
- Command: node packages/testing/scripts/run-yarn.mjs test
  - Status: PASS
  - Exit code: 0
  - Duration ms: 7185
  - stdout sha256: 6544d12ffafcc9bef395723633bc76884ba53b43f9638bec5095d03073bf08f1
  - stderr sha256: c52747d29e78dc3e3f9acd776dfebf9213e18d0b43c283f39b20844d39eb704f
  - stdout bytes: 10514
  - stderr bytes: 2527
- Command: node packages/testing/scripts/run-yarn.mjs build
  - Status: PASS
  - Exit code: 0
  - Duration ms: 414
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: 0157d8afc3a7265ca4e7c585e12c0dad6c6e3b575b60dd6b58851567da7c61d3
  - stdout bytes: 0
  - stderr bytes: 22
- Command: python3 .harness/tools/validate.py --mode manual
  - Status: PASS
  - Exit code: 0
  - Duration ms: 4570
  - stdout sha256: 9fe9a50816e45f7aa3b5dbf68a231bb9c2cd98eb185eb344619fb9e145df7e7c
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 424
  - stderr bytes: 0

### Product verification
- none

### Manual verification
- none
<!-- VERIFICATION-EVIDENCE:END -->

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.


## Blocker / Failure reason

—
