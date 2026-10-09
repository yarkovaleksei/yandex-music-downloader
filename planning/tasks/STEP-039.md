---
schema: 1
id: STEP-039
status: completed
type: implementation
priority: critical
phase: foundation
depends_on:
  - STEP-003
  - STEP-038
requirements:
  - REQ-006
adrs:
  - ADR-002
  - ADR-009
  - ADR-011
architecture_refs:
  - docs/architecture.md#data-state-model
  - "docs/architecture.md#основные-компоненты-границы"
risk_flags:
  - none
plan:
  status: ready
  revision: 1
  context_basis: sha256:fc069af35e621582f95168c452f7a75f777ae513e6a60205f5e307997cc3e22d
  content_hash: sha256:b4f48d84e9e8f846a7a822f5d233e7267c4334a198fe80a30de8a6f6e9a1cabb
  reviewed_report: planning/plan-reviews/STEP-039/PLAN-REVIEW-20261009T124606Z.md
  planned_at: 2026-10-09T12:46:06+00:00
  execution_groups:
  context_components:
    - "ADR@ADR-002=sha256:9603d7e711e02ee4bc36d447b5397e944f34d00f15a3d773c4fec36cce4e4d17"
    - "ADR@ADR-009=sha256:49e51470b212b80dcde0694e02d07c588763070df76c37cd89d112da580beecf"
    - "ADR@ADR-011=sha256:8082d7727d629cfeba47af27d3f298f4da7b4279b588371ee5ea11beb37c7ae2"
    - "ARCH@docs/architecture.md#data-state-model=sha256:a16465c45f16a8f41fd3e876e764be3e05d852017bd62457799b7dba138bf6c6"
    - "ARCH@docs/architecture.md#основные-компоненты-границы=sha256:fbdabff4c712b9793cdefe9ef7f14d27253ce04e554c0e2e1ab730cb5bfb5a91"
    - "PRN@PRN-001=sha256:3b3801f207fafc3f77272f0e93570258a6d006964839d93a276accd814d548af"
    - "PRN@PRN-002=sha256:f29ee3fbdb9cf65cf9739d0907768bbf192ad88b8e443110d4d82f81c6b79ecb"
    - "PRN@PRN-003=sha256:16516d7d302fecda5f7615f9d55e29e04b588d671f8660640e1f61d1619e4ef8"
    - "REQ@REQ-006=sha256:b32e7c1ebbcbc8538605b1634bf2a09fc99be64bfc076e3f0540b4bb605631e8"
    - "STEP@STEP-003=sha256:d44b1efab2bcb4a844c3ac708626a1569e846fb6034b4aae8b752fa91b7e7405"
    - "STEP@STEP-038=sha256:849fa65d933a50751d3fb42ec1a57a1a6cc407af85d369585ec720c14878ea69"
    - "STEP@STEP-039=sha256:5c9161f9ef993a5e1f4aefa202f247a03a29543a0eec05c35373734380f3a206"
---

# STEP-039 — Shared metadata: жанр, доступность и контрактные тесты

## Goal

Реализовать в shared доменную форму жанра и доступности по ADR-011, принимаемому STEP-038, обновить offline mock provider и контрактные тесты, чтобы STEP-009 мог выполнить REQ-006 в своём provider-only scope.

## Context

STEP-009 заблокирован отсутствием обязательных metadata полей в текущих shared-типах. Этот STEP — corrective implementation поверх завершённого STEP-003; Точная форма полей описана ADR-011; реализация допустима после его принятия и completed STEP-038, без выбора другой модели внутри IMPLEMENT. REQ-006 сохраняется без ослабления.

## Scope

- По accepted ADR-011 добавить TrackAvailability и discriminator union Track = AvailableTrack | UnavailableTrack | UnknownTrack, общий TrackMetadata, optional genre:string в TrackMetadata/Album/AlbumReference и shared exports. AvailableTrack сохраняет обязательные title/artists, остальные ветки допускают minimal ID без выдуманных полей; набор методов MusicProvider остаётся прежним.
- Сохранить набор методов MusicProvider, provider-neutral boundaries и отсутствие Node/SDK/I/O в shared. Никаких Yandex-specific raw fields в общем контракте.
- Обновить offline `MockMusicProvider`, fixtures, cloneTrack/collection helpers и текущие shared contract tests по ADR-011. Доступные fixtures получают явный discriminator; отсутствующие artists/title у unavailable/unknown не разыменовываются и не подменяются. Standalone getTrack при явном отказе сохраняет TrackUnavailableError; album/playlist сохраняют record и остальные элементы. Реальные API запросы не добавлять.
- Покрыть optional жанр, явную недоступность и отсутствие подтверждения доступности, сохранение identity/позиций/повторов и остальных записей album/playlist; проверить typed consumer compatibility по принятому ADR.
- Передать получившийся typed contract STEP-009; наличие этого STEP не заменяет provider runtime/raw fixture/live proof STEP-009.

## Mutation policy

### Allowed

- `packages/shared/**`: только metadata domain types, exports и соответствующие tests.
- `packages/testing/**`: offline mock provider, metadata fixtures и контрактные tests, относящиеся к изменённому shared contract.
- Документация этих пакетов и связанная REQ/STEP traceability по доказанной реализации.

### Conditional

- Минимальная совместимость existing mock/test call sites с принятым ADR, без нового product behavior; при необходимости mutation за пределами Allowed сначала обновить owning Scope через PLAN.

### Forbidden

- Yandex provider implementation, SDK/API/network/auth/native store, audio/stream/CDN, core/application/CLI/UI/cache/manifest behavior.
- Новый durable metadata design внутри IMPLEMENT; изменение принятого ADR или ослабление REQ-006.
- Новые зависимости и lockfile; unrelated изменения общего API/ошибок/events.

## Out of scope

- Получение/валидация metadata и маппинг vendor flags — STEP-009.
- Реальное чтение аудио и enforcement вариантов — STEP-010; интеграция потребителей последующих owning STEP.

## Acceptance criteria

- Shared types и exports точно соответствуют ADR-011: mandatory availability available/unavailable/unknown, optional scalar genre, AvailableTrack с обязательными title/artists и ID-only minimal остальные ветки. Отсутствие discriminator не считается доступным legacy track; vendor данные в shared не добавлены.
- Offline контрактные тесты и MockMusicProvider возвращают album/playlist с доступными и недоступными записями без потери остальных элементов; сохраняются ID, порядок, повторы и позиции playlist 1..N.
- Optional genre/metadata отсутствуют без падения или искусственных значений; сообщённые поля unavailable/unknown сохраняются. Type-level tests не допускают AvailableTrack без title/artists и любого Track без ID/discriminator. Standalone явный отказ и collection markers различаются по матрице ADR-011; неизвестный доступ не выдаётся за разрешение.
- Публичный metadata contract остаётся portable и provider-neutral; существующий набор методов MusicProvider и unrelated auth/error/event contracts не изменены. Typecheck и проверки границ проходят.
- STEP-009 имеет этот completed prerequisite и документированный typed путь выполнения REQ-006; реальные metadata mappings/live proof не заявляются выполненными этим STEP.

## Verification

- command: `node packages/testing/scripts/run-yarn.mjs run lint`
- command: `node packages/testing/scripts/run-yarn.mjs run typecheck`
- command: `node packages/testing/scripts/run-yarn.mjs test`
- command: `python3 .harness/tools/validate.py --mode manual`
- manual: Сверить итоговый scoped diff с baseline: shared types/exports и offline mock/tests реализуют exact ADR-011; набор методов MusicProvider, unrelated auth/error/event/audio/stream contracts, code других пакетов, зависимости/lockfile и предсуществующая dirty worktree сохранены. STEP-009 сохраняет provider-only scope, ADR-011 ref и prerequisite STEP-039; completion текущего STEP доказывает shared/mock contract, а raw mapping/fixtures/live proof остаются STEP-009. Приложить factual paths/checks, не заявлять completed prerequisite до independent review/lifecycle close.

## Deliverables

- Metadata domain types и exports в shared по принятому ADR.
- Обновлённые offline mock/fixtures/contract tests и проверенная совместимость.
- Evidence prerequisite для повторного `STEP PLAN STEP-009`.

## Implementation plan

### 1. Реализовать точный shared metadata union и мигрировать typed fixtures

- В начале RUN сохранить baseline предсуществующей dirty worktree и product/dependency файлов вне Allowed; изменения ограничить packages/shared и packages/testing. ADR-011 уже accepted, STEP-038 completed: не выбирать другой design и не создавать новый ADR.
- В packages/shared/src/domain.ts заменить прежний Track interface точными TrackMetadata, AvailableTrack, UnavailableTrack, UnknownTrack, TrackAvailability и Track union из Decision ADR-011. ID/discriminator обязательны для всех веток, available требует title/artists, остальные допускают ID-only; прежние optional metadata поля сохраняются. Добавить genre?: string к TrackMetadata/Album/AlbumReference. Непустота/валидность реального ID проверяется provider schemas STEP-009, а не новым runtime validator shared.
- Сохранить Album.tracks и PlaylistTrack.track как Track; методы MusicProvider, AudioVariant, auth/credential/error/event contracts не менять. Проверить публичные type exports через существующий shared barrel export *, не создавать лишние ports/helpers или vendor-specific поля.
- Мигрировать existing Track object literals в shared tests и доступный mockTrack на availability: available; типизировать доступный fixture как AvailableTrack, чтобы mockAlbum.artists оставался обязательным без cast/non-null assertion. Existing typed consumers title/artists сужать по discriminator при необходимости, не объявлять старый объект без discriminator доступным.
- Добавить короткие русские комментарии о metadata snapshot и минимальных записях с @link на ADR-011; shared остаётся без Node/SDK/I/O. Source migration атомарна с mock изменениями; новый persisted формат, schema version, cache/manifest migration не вводятся.

**Files:**
- packages/shared/src/domain.ts
- packages/shared/src/index.ts
- packages/shared/src/provider.test.ts
- packages/testing/src/fixtures.ts

**Tests:**
- Typecheck подтвердит экспорт union/types, доступную ветку с обязательными title/artists и миграцию прежних typed object literals.

**Risks:**
- Изменение source-compatible только после явной миграции object literals; отсутствие availability не считается legacy разрешением.

### 2. Обновить только offline metadata fixtures и методы mock provider

- Сохранить существующие default IDs/успешные fixtures и длину одноэлементных default album/playlist. Добавить именованные synthetic fixtures с отдельными ID: minimal unavailable/unknown и unavailable/unknown с фактически сообщёнными optional metadata; mixed album/playlist включают их между доступными треками и повтор одного available ID. Genre present/absent задаётся явно на track, album и выбранном album reference, без provider mapping или определения жанра mock-ом.
- В MockMusicProvider metadata lookup поддержать существующие и эти явно известные fixtures по ID; не добавлять общий configurable repository/registry, новый network или SDK. Неизвестный ID сохраняет прежнюю ошибку. GetTrack известного unavailable record либо ID из unavailableTrackIds даёт существующий TrackUnavailableError; известный unknown record возвращается как UnknownTrack и не повышается до available.
- GetAlbum/getPlaylist клонируют каждую запись в порядке fixture; имеющийся unavailableTrackIds обозначает соответствующие records unavailable во всех их позициях, без фильтрации, исключения всей коллекции и изменения IDs. Playlist позиции остаются 1..N, повторы сохраняются. Minimal records не получают искусственных title/artists; сообщённые optional поля остаются в denied/unknown ветках.
- Перестроить cloneTrack с корректным narrowing/conditional copy: artists копируется, если существует, обязательная available ветка возвращается типобезопасно; absence optional artists/title/genre/album сохраняется, не заполняется пустыми значениями. Existing clonePlaylistTrack сохраняет position и делегирует тому же helper. Не добавлять deep-copy политику unrelated вложенных объектов.
- Не менять auth, retries/delay/failure queue, artwork, getAudioVariants/openAudioStream и stream/Range/error behavior. Новые unavailable/unknown fixtures используют отдельные metadata-only IDs, для которых существующие audio stubs уже отказывают; unknown не вводит разрешение аудио. Реальные vendor flags/access enforcement остаются STEP-009/010.

**Files:**
- packages/testing/src/fixtures.ts
- packages/testing/src/mock-provider.ts
- packages/testing/src/index.ts

**Tests:**
- Default mock contract остаётся прежним после добавления discriminator; mixed коллекции возвращают все records и повторные позиции, standalone явный отказ остаётся ошибкой.

**Risks:**
- Нельзя свести collection denial к existing standalone assertAvailable, иначе падает вся коллекция; audio stub не расширяется для новых metadata IDs.

### 3. Доказать принятую контрактную матрицу offline и на уровне типов

- В shared metadata/provider test.ts (существующий provider.test.ts либо один colocated metadata-contract.test.ts) проверить публичные exports и корректные AvailableTrack/ID-only UnavailableTrack/UnknownTrack. Negative @ts-expect-error assignments исключают Track без ID/discriminator, unsupported state, AvailableTrack без title или artists и non-string genre. Добавить корректный consumer narrowing без cast. Эти проверки входят в существующий tsc -p tsconfig.tests.json; отдельный type-test runner/tsconfig не нужен.
- В mock-provider metadata tests проверить genre present/absent на track/album/reference; отсутствие optional genre/title/artists/album не вызывает падения и не создаёт искусственных полей. Для partial unavailable/unknown сверять реально заданные title/artists/genre и остальные metadata, не путать их наличие с доступностью.
- Проверять результаты public getAlbum/getPlaylist против полной expected последовательности IDs, availability и positions 1..N, включая unavailable/unknown между available и повтор ID. Для unavailableTrackIds проверить сохранение каждой позиции указанного ID вместо фильтрации или whole-collection ошибки. Не ограничиваться длиной массива или spread исходной fixture как единственным ожидаемым результатом.
- Через public getTrack отдельно подтвердить TrackUnavailableError/code TRACK_UNAVAILABLE при явном отказе и UnknownTrack для известного reference без подтверждения. Minimal collection record не требует обязательных available полей. Малый вызов существующих audio stubs для новых metadata-only unavailable/unknown IDs должен сохранять отказ; существующие audio methods при этом не изменяются.
- Все fixtures synthetic, без реальных аккаунтов/credentials/URLs; новые metadata тесты явно запрещают network через существующий Vitest spy/stub с cleanup и проверяют отсутствие обращений. Существующий offline набор доказывает отсутствие регрессий auth/error/events/stream; новые редкие edge/hardening сценарии не добавлять.

**Files:**
- packages/shared/src/provider.test.ts
- packages/shared/src/metadata-contract.test.ts (при необходимости)
- packages/testing/src/mock-provider.test.ts
- packages/testing/src/metadata-contract.test.ts (при необходимости)

**Tests:**
- Canonical typecheck для positive/negative assignments и полный existing offline Vitest набор, включая новые public metadata contract assertions.

### 4. Проверить совместимость и зафиксировать узкий handoff STEP-009

- Перед Verification обновить только доказанную пакетную документацию/semantic evidence STEP-039 и при необходимости related traceability; canonical ADR/REQ behavior, owning STEP-009 provider-only Scope/depends_on не менять. Выполнить sync-projections.py до validator. Не менять lockfile, root tooling/config или code другого пакета.
- Canonical Verification выполняет lint (включая boundaries), root typecheck, existing offline test и Harness validate; typecheck покрывает production и existing test include patterns. Если обнаружен реальный typed consumer вне Allowed, не обходить его cast-ом и не расширять mutation молча: вернуть конкретный owning Scope blocker через свежий PLAN.
- Ручным semantic diff/traceability check подтвердить неизменный MusicProvider набор методов, auth/errors/events/audio runtime, portable shared exports, отсутствие vendor types/SDK/deps/lockfile изменений и сохранение unrelated dirty baseline. Убедиться, что STEP-009 имеет completed prerequisite STEP-039 после independent review/lifecycle close; до этого не объявлять raw mapping, live proof либо всю REQ-006 выполненными.
- Rollback source migration до публикации — согласованный возврат только текущего shared/mock/test delta с сохранением предсуществующей dirty worktree; не reinterpret unknown как available и не применять destructive reset. Runtime/persisted migration отсутствует. Передать canonical REVIEW fresh Verification и точные owner obligations; completed устанавливает writer только после независимого PASS.

**Files:**
- planning/tasks/STEP-039.md
- пакетная документация при наличии доказанной необходимости
- planning/PLAN.md (generated)
- planning/STATUS.md (generated)
- docs/requirements/STATUS.md (generated)

**Tests:**
- node packages/testing/scripts/run-yarn.mjs run lint
- node packages/testing/scripts/run-yarn.mjs run typecheck
- node packages/testing/scripts/run-yarn.mjs test
- python3 .harness/tools/validate.py --mode manual
- Ручная сверка scoped diff и baseline вне Allowed, ADR-011/REQ-006/STEP-009 owner handoff.

## Evidence

<!-- VERIFICATION-EVIDENCE:START -->
- Verification run: 2026-10-09T12:58:17Z
- Status: PASS
- Automated resumed: false
- Git head: 2a19e5a72693ae741adfab8bbd464e120eed7785
- Worktree hash: sha256:3e765dae6b024af4b7f14188666d95e69fb6dd0da86892185393042c2a2e0e06
- Verification contract basis: sha256:e15e5466e76a7017030d8bac8ccd4066aceb49b352f9c621570bee7247ed916d
- Subject git head: 2a19e5a72693ae741adfab8bbd464e120eed7785
- Subject worktree hash: sha256:8cc9b4b87e47bdc55b26d0cfd0bdd2ef5e3bceecd3e0d50e8c330b63f11637f6

### Automated verification
- Command: node packages/testing/scripts/run-yarn.mjs run lint
  - Status: PASS
  - Exit code: 0
  - Duration ms: 4421
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: f59ba696a15507a8febe0f9ea94ac75ccc5411952df61ee4cb3c971b47b6bc12
  - stdout bytes: 0
  - stderr bytes: 25
- Command: node packages/testing/scripts/run-yarn.mjs run typecheck
  - Status: PASS
  - Exit code: 0
  - Duration ms: 2618
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: ffbfd8ec2bfcf3e8f0e99a93f081f695da2de832eba56c5ae6943a4052680411
  - stdout bytes: 0
  - stderr bytes: 30
- Command: node packages/testing/scripts/run-yarn.mjs test
  - Status: PASS
  - Exit code: 0
  - Duration ms: 3670
  - stdout sha256: efcfd99b2c4e170ac69b4f8f14a37f964c6b61a77a38c66e166948503526cc60
  - stderr sha256: f969fafb7bc32ecc492c8343f56269c9c47161d893e83a0d8b9b27fcf57b9aee
  - stdout bytes: 3750
  - stderr bytes: 21
- Command: python3 .harness/tools/validate.py --mode manual
  - Status: PASS
  - Exit code: 0
  - Duration ms: 2417
  - stdout sha256: 396c8fc552f5c39b3b2ec0a2334966ff5c863de96432e1d6a2a17caee20a33ee
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 308
  - stderr bytes: 0

### Product verification
- none

### Manual verification
- Check: Сверить итоговый scoped diff с baseline: shared types/exports и offline mock/tests реализуют exact ADR-011; набор методов MusicProvider, unrelated auth/error/event/audio/stream contracts, code других пакетов, зависимости/lockfile и предсуществующая dirty worktree сохранены. STEP-009 сохраняет provider-only scope, ADR-011 ref и prerequisite STEP-039; completion текущего STEP доказывает shared/mock contract, а raw mapping/fixtures/live proof остаются STEP-009. Приложить factual paths/checks, не заявлять completed prerequisite до independent review/lifecycle close.
  - Status: PASS
  - Observed: "Scoped delta: shared domain.ts/provider.test.ts и новый metadata-contract.test.ts; testing fixtures.ts/mock-provider.ts и новый metadata-contract.test.ts. Exact ADR-011 types/genre экспортируются существующими barrels, новые imports только shared/offline fixtures. 109 product/config/dependency файлов вне Allowed совпали по SHA-256 с RUN baseline; все остальные existing файлы вне четырёх owned snapshots совпали с planning baseline, включая shared provider/error/events/index и lockfile. Байт-в-байт совпали mock auth/resolveUrl, audio/stream/artwork/failure/delay plumbing и delay/createByteStream. STEP-009 имеет ADR-011 ref, provider-only scope и prerequisite STEP-039; raw mapping/fixtures/live proof не реализованы. До independent review/lifecycle close статус STEP-039 in_progress; completed prerequisite не заявляется заранее."
<!-- VERIFICATION-EVIDENCE:END -->

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.

## Blocker / Failure reason

—
