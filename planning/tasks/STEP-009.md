---
schema: 1
id: STEP-009
status: completed
type: implementation
priority: critical
phase: provider
depends_on:
  - STEP-008
  - STEP-007
  - STEP-006
  - STEP-039
requirements:
  - REQ-006
  - REQ-007
  - REQ-005
adrs:
  - ADR-009
  - ADR-002
  - ADR-011
architecture_refs:
  - docs/architecture.md#external-dependencies-integrations
  - docs/architecture.md#reliability-observability
risk_flags:
  - external-integration
plan:
  status: ready
  revision: 1
  context_basis: sha256:ded9b94ad9ef2949c56ccee0e3a0f51a141cea2ca3fa9d9f5d819a9de3d22626
  content_hash: sha256:6ff95e24b343537006a2046a7e0f540bb44985a95a696983aeb7313c339b1d2d
  reviewed_report: planning/plan-reviews/STEP-009/PLAN-REVIEW-20261009T133517Z.md
  planned_at: 2026-10-09T13:35:17+00:00
  execution_groups:
  context_components:
    - "ADR@ADR-002=sha256:9603d7e711e02ee4bc36d447b5397e944f34d00f15a3d773c4fec36cce4e4d17"
    - "ADR@ADR-009=sha256:49e51470b212b80dcde0694e02d07c588763070df76c37cd89d112da580beecf"
    - "ADR@ADR-011=sha256:8082d7727d629cfeba47af27d3f298f4da7b4279b588371ee5ea11beb37c7ae2"
    - "ARCH@docs/architecture.md#external-dependencies-integrations=sha256:745b40d80b739a59467e156c30b839f7fb6c0cca9f347619f6856d1757324b1c"
    - "ARCH@docs/architecture.md#reliability-observability=sha256:a9c337102c2ed62fdaca7173e8e2c05ffe6d68a1d99140fe986a552b3cc636d4"
    - "OQ@OQ-007=sha256:8149a769a326311380fff629178d7e3bc7c6580428911fd457b98dfc4fbbd592"
    - "PRN@PRN-001=sha256:3b3801f207fafc3f77272f0e93570258a6d006964839d93a276accd814d548af"
    - "PRN@PRN-002=sha256:f29ee3fbdb9cf65cf9739d0907768bbf192ad88b8e443110d4d82f81c6b79ecb"
    - "PRN@PRN-003=sha256:16516d7d302fecda5f7615f9d55e29e04b588d671f8660640e1f61d1619e4ef8"
    - "REQ@REQ-005=sha256:132c5b89fda4c1ce731b1f83868e1b2fa608937489e1a3360de87ddafb859e46"
    - "REQ@REQ-006=sha256:b32e7c1ebbcbc8538605b1634bf2a09fc99be64bfc076e3f0540b4bb605631e8"
    - "REQ@REQ-007=sha256:6ecccc57a941d7a16855333f973f4fc2e9d3184e121a3f643f96d78d22ccaa74"
    - "STEP@STEP-006=sha256:bb2b5af572d47a1a6a35977e8a14065977d4d1f6eaecc85daefcd759536c8f5f"
    - "STEP@STEP-007=sha256:f4f726b5c11eaa5348b883096c419da4a1f236fd93401d23d29e455ceda74d5d"
    - "STEP@STEP-008=sha256:300f5231a103d2e7aa34493459f2b13455ba14dc7ef5a18460ce37dd6c6c3c37"
    - "STEP@STEP-009=sha256:380802b021ce0cbee5ea27906227389f05d217884a08f9d871f433e5314d91fc"
    - "STEP@STEP-039=sha256:e47a59ff5c4cbe2510865b08ee26aad93c36e32856f9d8d3727b1d7b87197f27"
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

- command: `node packages/testing/scripts/run-yarn.mjs run lint`
- command: `node packages/testing/scripts/run-yarn.mjs run typecheck`
- command: `node packages/testing/scripts/run-yarn.mjs test`
- command: `node packages/testing/scripts/run-yarn.mjs build`
- command: `python3 .harness/tools/validate.py --mode manual`
- manual: Live production metadata: один доступный собственный аккаунт, реальные getTrack/getAlbum/getPlaylist через authored provider facade/SDK/validated transport; full album volumes и все N playlist positions в порядке источника, availability и optional genre по реально сообщённым данным. Приложить safe command/exit/status/count observations и provenance redacted real fixtures без credentials/private identifiers/URLs; ограничить account/region выборку. Непроведённый live flow остаётся pending, synthetic mutations не являются live proof.
- manual: Scoped diff/traceability: product изменения только packages/providers/yandex-music; shared STEP-039 contract, existing auth lifecycle STEP-008/resolver STEP-007, зависимости/lockfile и unrelated dirty worktree сохранены. Public exports не содержат SDK/Zod/credentials; safe fixture capture не пишет unredacted body, headers или signed URLs. PROVIDER_SCHEMA_VERSION доступна из provider, doctor output — STEP-025; audio/cache/core/CLI не реализованы. Приложить factual baseline/paths/proof owner observations.

## Deliverables

- Metadata-часть provider, fixtures, тесты.

## Implementation plan

### 1. Зафиксировать текущий baseline и provider-local integration

- При RUN сохранить baseline предсуществующей dirty worktree и product/config/dependency файлов вне packages/providers/yandex-music; STEP-039 completed и ADR-011 accepted, поэтому прежний shared prerequisite снят. Shared/runtime других пакетов не менять, SDK 0.3.0 и Zod 4.6.5 уже установлены — зависимостей/lockfile изменений не требуется.
- Сохранить exported YandexMusicProviderAuth и его options/auth поведение; добавить к тому же credential-owning facade metadata методы и provider alias YandexMusicProvider с public surface только auth/resolveUrl/getTrack/getAlbum/getPlaylist/fetchArtwork. Не объявлять full MusicProvider с dummy audio methods: getAudioVariants/openAudioStream реализует STEP-010. Existing callers auth facade остаются совместимыми.
- Выделить package-private metadata schemas, transport, projection/mappers, errors и artwork helpers. Внутренний authorized operation получает credentials через того же владельца active/loggedOut/expiry; не экспортировать Client/Zod/credentials/token getter, не добавлять public/protected SDK callback, второе credential policy, refresh/replay или импорт native persistence.
- Переиспользовать resolveYandexMusicUrl из STEP-007; UUID playlist направлять в SDK playlist(uuid), legacy users/encoded-owner/playlists/kind — в usersPlaylists(kind, owner), сохраняя canonical owner encoding ровно один раз и opaque UUID. GetAlbum использует albumsWithTracks, а не summary albums. Endpoint knowledge остаётся provider-local.
- Короткие русские комментарии связывают сложные места с ADR-009/011; shared MusicProvider methods/types, auth/error/event contracts, core/CLI/cache/manifest/doctor не расширяются.

**Files:**
- packages/providers/yandex-music/src/yandex-music-auth.ts
- packages/providers/yandex-music/src/index.ts
- packages/providers/yandex-music/src/metadata/

**Tests:**
- Existing auth/resolver tests сохраняются; typed public facade imports не требуют SDK types.

**Risks:**
- Alias/внутренний helper — implementation choice, новый credential port или доступ к token за пределами provider недопустим.

### 2. Проверять transport и raw metadata до unwrap/deJson

- Для каждого metadata operation создать отдельный Client/fetch adapter с retries:0 и reportUnknownFields:false. Adapter прочитает bytes/status один раз, классифицирует transport/HTTP отказ и валидирует успешный JSON envelope/result Zod safeParse до Request.unwrap/deJson. SDK получает те же проверенные bytes через replay arrayBuffer, без повторного network запроса.
- Raw schemas по фактическим SDK endpoints и затем real fixture evidence: tracks result array; album with-tracks result object с volumes; legacy/UUID playlist result с source track references и optional embedded track. Критичные identity/title/artists/collection structure и используемые optional значения валидируются, additive unused поля допускаются. Отсутствующие optional поля не заменяются библиотечными defaults.
- Сохранять operation-private validated raw result для availability, direct genre, collection identity и partial refs, которые SDK может не перенести. Не использовать global lastResponse, shared mutable result или account-crossing cache. После успешной raw проверки библиотека строит модели, mapper использует модель и подтверждённые raw поля, затем отдельная Zod схема проверяет точную domain projection ADR-011.
- Health normalizer различает NETWORK_ERROR (connection/timeout/bytes read), AUTH_ERROR (OAuth/account 401/403), SERVICE_UNAVAILABLE (API 429/5xx), PROVIDER_RESPONSE_INVALID (malformed successful shape/используемое значение), API_CHANGED (только подтверждённая несовместимость protocol, включая сохранение уже нормализованного такого DomainError). Не выдумывать vendor version markers и не считать Album/Track.version или новое unused поле доказательством API_CHANGED.
- Errors/cause библиотечных исключений и Zod issues не выходят наружу. Обе schema/protocol ошибки содержат exact пользовательское сообщение REQ-007 без raw values/stack/URL; явный metadata access denial даёт TrackUnavailableError, а не whole-collection exception. HTTP без operation context не доказывает TrackUnavailable или CDN token expiry.
- Экспортировать PROVIDER_SCHEMA_VERSION="1.0.0" из provider package по ADR-009; Zod/SDK schemas/models остаются приватными. Вывод doctor принадлежит STEP-025, не создавать CLI здесь.

**Files:**
- packages/providers/yandex-music/src/metadata/transport.ts
- packages/providers/yandex-music/src/metadata/schemas.ts
- packages/providers/yandex-music/src/metadata/errors.ts
- packages/providers/yandex-music/src/index.ts

**Tests:**
- H-001: transport-facing test с изменённым raw envelope/critical field доказывает reject до SDK conversion, safe DomainError вместо TypeError; exact command node packages/testing/scripts/run-yarn.mjs test.

**Risks:**
- Нельзя опираться только на SDK model shape; pending executable proof H-001 закрывается фактическими public transport tests при RUN.

### 3. Реализовать typed mapping без потери metadata и collection records

- GetTrack возвращает exact Track union ADR-011: raw available=true на запросе действующего аккаунта подтверждает available; explicit false/подтверждённый отказ — unavailable (standalone TrackUnavailableError); отсутствующее/неоднозначное подтверждение — unknown. Premium/full-without-permission flags, подписка или metadata сами по себе не повышают доступ. Противоречивый access context не превращается в available. Available требует title/artists, иначе schema error; minimal denied/unknown сохраняет ID и только сообщённые поля.
- Маппить ID/title/artists, выбранный album reference, durationMs, trackNumber/discNumber из его trackPosition, year, genre и opaque artwork при наличии. Direct сообщённый track genre приоритетен; иначе genre именно выбранного album reference, без поиска другого album/enum/coercion. Некорректный используемый optional field — safe schema error; отсутствующий не выдумывается.
- Album.tracks разворачивает volumes в исходном порядке; denied/unknown записи сохраняются. Playlist.id сохраняет canonical запрошенную ссылку, owner берётся из проверенных сообщённых owner данных; tracks сохраняют каждую source reference с position index+1 и повторы. Embedded track и reference identity должны согласовываться; отсутствие валидного ID не заменять synthetic ID.
- Partial playlist reference с ID без embedded track остаётся minimal UnknownTrack с известными корректными metadata, не вызывает filtering/автоматическое превращение в available. Дополнительную фоновую hydration/retry/cache стратегию не вводить. Explicit denied внутри коллекции — marker, отказ всей metadata операции классифицируется отдельно.
- Post-mapping schema проверяет exact available/unavailable/unknown projection, optional metadata и коллекции перед выходом в public facade. Не отдавать наружу SDK instances/raw vendor flags/endpoints/credentials и не менять shared contract.

**Files:**
- packages/providers/yandex-music/src/metadata/mappers.ts
- packages/providers/yandex-music/src/metadata/schemas.ts
- packages/providers/yandex-music/src/yandex-music-auth.ts

**Tests:**
- Public mock transport tests проверяют полную expected sequence IDs/availability/positions, повтор ID, minimal/partial records и standalone refusal; length-only проверки недостаточно.

### 4. Реализовать fetchArtwork через отдельный binary transport

- Формировать ArtworkRef.key из проверенной public artwork resource identity источника, а не raw/signed URL либо memory-only registry; конкретные cover shapes сверить real fixtures. Provider восстанавливает наблюдаемый public CDN template и подставляет положительный целочисленный size; key остаётся opaque для клиентов и пригоден для повторного обращения без cache policy.
- Не сериализовать credentials/query-security параметры в key. Проверять key/resource template в provider, не принимать произвольный URL как ArtworkRef. Передавать только запрос public artwork, не использовать SDK download helper, который наследует OAuth Request headers.
- Отдельный injectable binary fetch не использует JSON auth/metadata schema path и не получает Authorization/cookies. Использовать platform response bytes и Content-Type (с узким расширением provider-owned fetch response/options при необходимости, обратно совместимым для auth mocks); вернуть shared ArtworkData bytes/mimeType. Missing/invalid image MIME и HTTP/bytes failures нормализовать безопасно по operation context без raw CDN URL/cause. CDN 401/403 с неизвестной причиной — безопасный DownloadError, не AUTH_ERROR/STREAM_EXPIRED без подтверждённого контекста; network и 5xx сохраняют отдельную transport классификацию по ADR-009.
- Artwork tests на mock responses доказывают byte-exact data/MIME, size substitution и отказ некорректной resource identity; actual CDN caller только provider. Никаких image decoder/cache/core/CLI изменений.

**Files:**
- packages/providers/yandex-music/src/metadata/artwork.ts
- packages/providers/yandex-music/src/metadata/artwork.test.ts
- packages/providers/yandex-music/src/auth-transport.ts (только обратно совместимый provider-owned response type при необходимости)

**Tests:**
- H-002: тесты mock binary request подтверждают отсутствие OAuth headers и безопасные errors; exact command node packages/testing/scripts/run-yarn.mjs test.

### 5. Сохранить реальные redacted fixtures и минимальный offline contract suite

- Добавить provider-local verification runner с injected CredentialStore как существующий manual auth flow; сам provider не импортирует persistence. Во время bounded RUN live capture читать только необходимые track/album/playlist ответы через реальный auth/SDK/transport. До любой записи делать allowlist projection/redaction без credentials/headers/signed URLs/private account details; unredacted body не писать во временные файлы.
- Fixtures под src/metadata/fixtures помечать provenance: endpoint kind, HTTP status, SDK/schema version, capture command/date и redaction summary без secret identifiers. Сохранённые реальными считать только действительно captured ответы. Derived optional/malformed/unavailable/unknown test payloads явно помечать synthetic modifications, не выдавать их за реальные observed API отказы или покрытие других аккаунтов.
- Unit mapping tests используют redacted real envelopes через public facade/mock fetch и SDK pipeline: track/album/playlist, optional absent, genre present/absent и выбранный album, volume positions, owner/legacy/UUID references, minimal/partial denied/unknown, все N/positions/duplicates. Mutation fixtures нарушают critical shape и проверяют отсутствие TypeError; additive unused fields не вызывают drift.
- Contract-rooted health/error tests различают все пять normalised codes; API_CHANGED допускается при explicit already-classified protocol incompatibility, а malformed shape остаётся PROVIDER_RESPONSE_INVALID. Не добавлять guessed real API protocol marker. Проверять exact REQ-007 message и serialization без fixture values/raw cause.
- H-001/H-002 proof obligations переносить в реальные тесты, traceable к ADR-009/011/PRN и existing auth lifecycle: raw reject до deJson, сохранение source records; expired/logout/failed-clear состояние не обходится metadata path, нет refresh/replay/extra request, CDN request без Authorization, safe errors/fixture redaction. Это Acceptance/invariant proof, не hardening из неподтверждённых новых сценариев.
- Existing auth/resolver/shared suites остаются offline; новые unit tests stub fetch и проверяют request count/no actual network. Public export/type tests импортируют facade/version/shared results без @dvxch/Zod types. Не запускать live flow в PR CI и не добавлять auth/native/platform qualification второй раз.

**Files:**
- packages/providers/yandex-music/src/metadata/fixtures/
- packages/providers/yandex-music/src/metadata/*.test.ts
- packages/providers/yandex-music/src/yandex-music-auth.test.ts
- packages/providers/yandex-music/src/index.test.ts
- packages/providers/yandex-music/verification/live-metadata-runner.mjs
- packages/providers/yandex-music/verification/README.md

**Tests:**
- node packages/testing/scripts/run-yarn.mjs test
- node packages/testing/scripts/run-yarn.mjs run typecheck
- node packages/testing/scripts/run-yarn.mjs run lint

**Risks:**
- Если live capture/авторизация/collection reference недоступны, эти proof obligations остаются pending и RUN не закрывается; не подменять реальные fixtures synthetic payloads.

### 6. Выполнить bounded live Verification и передать independent REVIEW

- Один доступный реальный собственный аккаунт: вызвать production facade getTrack/getAlbum/getPlaylist по доступным ссылкам/ID, записать safe observations (HTTP/status, метод, counts, обязательные/optional metadata shape, порядок/позиции, SDK/schema version). Реальные token/account/playlist private IDs и URLs не выводить; logout/очистку выполнять только для временной auth session, не удалять прежние пользовательские credentials без явного основания.
- Начальная live выборка ограничена одним track, full album и playlist; при отсутствии доступной playlist reference запросить её у пользователя во время RUN. Не создавать и не модифицировать плейлист. Нет ожидания TTL/rate-limit stress/чтения аудио/других аккаунтов/повторной Windows/macOS qualification. Все недоказанные account/region/denied случаи явно ограничить; offline negative matrix не считается live evidence.
- Перед canonical Verification выполнить sync-projections.py. Использовать фактические Yarn runners lint/typecheck/test/build и Harness validator; build формирует dist для manual production runner. Fixture/provenance/README/semantic evidence закончить до окончательной Verification, не reuse stale subject.
- Ручным scoped diff check подтвердить provider-only mutations, сохранение SDK/Zod/deps/lockfile и unrelated dirty worktree; shared contract STEP-039, auth semantics STEP-008 и resolver STEP-007 не пересмотрены. Doctor output/metadata cache/audio proof имеют explicit future owners STEP-025/024/010; не объявлять их выполненными.
- Rollback текущего provider delta сохраняет предсуществующую dirty worktree и existing exported auth facade; новых persisted схем/migrations нет. После fresh Verification и live observations передать REVIEW exact current revision с valid grounding/required blast proof; security/test independent reviewers обязательны по deterministic gate, completed ставит writer.

**Files:**
- packages/providers/yandex-music/verification/
- planning/tasks/STEP-009.md (semantic evidence)
- planning/PLAN.md (generated)
- planning/STATUS.md (generated)
- docs/requirements/STATUS.md (generated)

**Tests:**
- Canonical commands и exact manual live/scoped observations; unresolved critical executable proof запрещает PASS REVIEW.

## Evidence




<!-- VERIFICATION-EVIDENCE:START -->
- Verification run: 2026-10-09T14:15:41Z
- Status: PASS
- Automated resumed: false
- Git head: 2a19e5a72693ae741adfab8bbd464e120eed7785
- Worktree hash: sha256:81c1d7761bb92051eafd222168b7f88e45999ae2b30b5640c5862901b6d5c653
- Verification contract basis: sha256:e840523fd4fc832d65aaa7829d9716f90d5982ba681d5acc388750b546bb364f
- Subject git head: 2a19e5a72693ae741adfab8bbd464e120eed7785
- Subject worktree hash: sha256:5f57484c93709a1f28d4ee2458614ac84da88ccffc668b145c4aa00278c8b673

### Automated verification
- Command: node packages/testing/scripts/run-yarn.mjs run lint
  - Status: PASS
  - Exit code: 0
  - Duration ms: 5474
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: f59ba696a15507a8febe0f9ea94ac75ccc5411952df61ee4cb3c971b47b6bc12
  - stdout bytes: 0
  - stderr bytes: 25
- Command: node packages/testing/scripts/run-yarn.mjs run typecheck
  - Status: PASS
  - Exit code: 0
  - Duration ms: 2168
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: ffbfd8ec2bfcf3e8f0e99a93f081f695da2de832eba56c5ae6943a4052680411
  - stdout bytes: 0
  - stderr bytes: 30
- Command: node packages/testing/scripts/run-yarn.mjs test
  - Status: PASS
  - Exit code: 0
  - Duration ms: 3872
  - stdout sha256: 9b9edf7bc7fa73c2f75b63d946c83193e7f3ece093d46a869e85c20f16769747
  - stderr sha256: f969fafb7bc32ecc492c8343f56269c9c47161d893e83a0d8b9b27fcf57b9aee
  - stdout bytes: 3768
  - stderr bytes: 21
- Command: node packages/testing/scripts/run-yarn.mjs build
  - Status: PASS
  - Exit code: 0
  - Duration ms: 464
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: 0157d8afc3a7265ca4e7c585e12c0dad6c6e3b575b60dd6b58851567da7c61d3
  - stdout bytes: 0
  - stderr bytes: 22
- Command: python3 .harness/tools/validate.py --mode manual
  - Status: PASS
  - Exit code: 0
  - Duration ms: 2468
  - stdout sha256: 396c8fc552f5c39b3b2ec0a2334966ff5c863de96432e1d6a2a17caee20a33ee
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 308
  - stderr bytes: 0

### Product verification
- none

### Manual verification
- Check: Live production metadata: один доступный собственный аккаунт, реальные getTrack/getAlbum/getPlaylist через authored provider facade/SDK/validated transport; full album volumes и все N playlist positions в порядке источника, availability и optional genre по реально сообщённым данным. Приложить safe command/exit/status/count observations и provenance redacted real fixtures без credentials/private identifiers/URLs; ограничить account/region выборку. Непроведённый live flow остаётся pending, synthetic mutations не являются live proof.
  - Status: PASS
  - Observed: "Node composition с CliCredentialStore и runLiveMetadata: exit 0; captured safe output ACCOUNT_READY, RAW_TRACK_PASS, TRACK_READY, RAW_ALBUM_PASS, ALBUM_READY, RAW_PLAYLIST_PASS, PASS(track=available,albumTracks=11,playlistTracks=33,schema=1.0.0), TEMPORARY_SESSION_CLEANUP_PASS. Один собственный аккаунт; full album и 33 playlist позиции проверены runner-ом. Redacted real fixtures/provenance в src/metadata/fixtures; genre присутствует в real album/выбранном track album reference, public mock tests сверили mapping. Live был до финального canonical-owner guard; его numeric owner проходит тот же encode/decode predicate, остальные успешные metadata/model/artwork paths не менялись. Последующие source changes — проверка canonical input и комментарии, capture helper privacy; fresh Verification на финальном состоянии. Synthetic negative cases не считаются live evidence иных аккаунтов/регионов. README содержит literal captured output и ограничения. FIX F-001 после live удаляет только post-await присваивание active в metadataRequest; успешные raw/domain/artwork paths сохранены. Доказанный session race покрыт offline real-SDK public regression, повторный login не выполнялся."
- Check: Scoped diff/traceability: product изменения только packages/providers/yandex-music; shared STEP-039 contract, existing auth lifecycle STEP-008/resolver STEP-007, зависимости/lockfile и unrelated dirty worktree сохранены. Public exports не содержат SDK/Zod/credentials; safe fixture capture не пишет unredacted body, headers или signed URLs. PROVIDER_SCHEMA_VERSION доступна из provider, doctor output — STEP-025; audio/cache/core/CLI не реализованы. Приложить factual baseline/paths/proof owner observations.
  - Status: PASS
  - Observed: "Scoped delta только provider source/tests/fixtures/verification и STEP-009 Evidence/projections. SHA-256 112 product/config/dependency файлов вне provider unchanged; provider package.json и lockfile unchanged. Authenticate/logout побайтно совпали с RUN snapshot; getAccount refactor повторно использует тот же active/loggedOut/expiry reader, existing auth tests PASS. Existing resolver/shared domain/events/errors не менялись. Fixture scan: forbidden credential fields=0; все coverUri public resource refs без query/fragment/userinfo, owner/title/uid/UUID заменены псевдонимами, private user cover исключён. Public facade/version/response types содержат только shared/own portable types; SDK/Zod callbacks private. Doctor/audio/cache/core/CLI не реализованы. После FIX: protected112/provider package hashes повторно совпали; новый regression покрывает pending A -> logout -> authenticate B -> metadata B -> completion A -> следующий metadata B, store остаётся B."
<!-- VERIFICATION-EVIDENCE:END -->

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.

### Фактический metadata handoff

- Production facade по ADR-009/011: raw Zod проверка до SDK conversion, operation-local result и domain projection; compatibility version `1.0.0`. Audio methods остаются STEP-010, полный MusicProvider не подменён dummy реализацией.
- Live Node composition: exit `0`, track `available`, full album 11 записей, playlist 33 позиции; временная auth session очищена. Literal safe output, command description и ограничения — `packages/providers/yandex-music/verification/README.md`; real redacted fixtures/provenance — `src/metadata/fixtures` этого пакета. Synthetic mutations в tests не являются live evidence недоступных треков/иных аккаунтов.
- Проверка scoped baseline: 112 product/config/dependency файлов вне provider без изменений, package/dependency/lockfile сохранены; `authenticate`/`logout` совпали побайтно, auth expiry/failed-clear и resolver покрыты existing tests. Нативные backend проверки повторно не запускались.
- Safe fixture scan: credential fields/query/fragment/userinfo не найдены; 87 public artwork resource references проверены без вывода значений. Doctor/cache/core/CLI и audio proof остаются за owning STEP.
- FIX F-001 из `planning/reviews/STEP-009/REVIEW-20261009T141329Z.md`: удалена запись `active` после завершения metadataRequest. Один public-facade regression с настоящим SDK воспроизвёл прежнее поведение A/B/A (exit 1), после исправления проверяет A/B/B и сохранённый store B; targeted test Verification PASS. Mapping, raw validation и artwork не менялись, повторный live/native login для этого offline lifecycle сценария не выполнялся.




## Blocker / Failure reason

Prerequisite `STEP-039`: shared genre и discriminator union по ADR-011 вводятся после завершения `STEP-038`. STEP-009 маппит проверенные raw данные в AvailableTrack/UnavailableTrack/UnknownTrack: сохраняет genre выбранного источником album reference, metadata tombstones и порядок/повторы; standalone явный отказ остаётся TrackUnavailableError. До завершения STEP-039 provider-only STEP PLAN STEP-009 не может получить Ready. STEP-009 сохраняет свой Scope; завершение ADD не является реализацией metadata.
