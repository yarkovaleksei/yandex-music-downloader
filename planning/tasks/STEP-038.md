---
schema: 1
id: STEP-038
status: completed
type: adr
priority: critical
phase: foundation
depends_on:
  - STEP-003
  - STEP-006
requirements:
  - REQ-006
adrs:
  - ADR-002
  - ADR-009
  - ADR-011
architecture_refs:
  - docs/architecture.md#data-state-model
  - docs/architecture.md#security-boundaries
risk_flags:
  - none
plan:
  status: ready
  revision: 2
  context_basis: sha256:60852f5e7ec935352f79d99c8eba44ccdb80e2c0cbaf670386d3a44291392c3d
  content_hash: sha256:9dcd2c6c1b1e280a8f041e6dd397ce408411e05f6c8d45c98a7340db3cd93cb0
  reviewed_report: planning/plan-reviews/STEP-038/PLAN-REVIEW-20261009T122823Z.md
  planned_at: 2026-10-09T12:28:23+00:00
  execution_groups:
  context_components:
    - "ADR@ADR-002=sha256:9603d7e711e02ee4bc36d447b5397e944f34d00f15a3d773c4fec36cce4e4d17"
    - "ADR@ADR-009=sha256:49e51470b212b80dcde0694e02d07c588763070df76c37cd89d112da580beecf"
    - "ADR@ADR-011=sha256:8082d7727d629cfeba47af27d3f298f4da7b4279b588371ee5ea11beb37c7ae2"
    - "ARCH@docs/architecture.md#data-state-model=sha256:a16465c45f16a8f41fd3e876e764be3e05d852017bd62457799b7dba138bf6c6"
    - "ARCH@docs/architecture.md#security-boundaries=sha256:1fb8b1276fc829d50a70930422b9207f8e907ad24da1447e1d32ddb08a4adcbe"
    - "PRN@PRN-001=sha256:3b3801f207fafc3f77272f0e93570258a6d006964839d93a276accd814d548af"
    - "PRN@PRN-002=sha256:f29ee3fbdb9cf65cf9739d0907768bbf192ad88b8e443110d4d82f81c6b79ecb"
    - "PRN@PRN-003=sha256:16516d7d302fecda5f7615f9d55e29e04b588d671f8660640e1f61d1619e4ef8"
    - "REQ@REQ-006=sha256:b32e7c1ebbcbc8538605b1634bf2a09fc99be64bfc076e3f0540b4bb605631e8"
    - "STEP@STEP-003=sha256:d44b1efab2bcb4a844c3ac708626a1569e846fb6034b4aae8b752fa91b7e7405"
    - "STEP@STEP-006=sha256:bb2b5af572d47a1a6a35977e8a14065977d4d1f6eaecc85daefcd759536c8f5f"
    - "STEP@STEP-038=sha256:a3d5805b10e8c96c8cf007023f2b8a73f470d2f6bba5a13090b9d2d5f37220f6"
---

# STEP-038 — ADR: жанр и доступность в shared metadata contract

## Goal

Принять узкий ADR, определяющий типизированные жанр и доступность трека в shared metadata contract по REQ-006, и передать реализацию STEP-039.

## Context

При `STEP PLAN STEP-009` выявлен подтверждённый разрыв: REQ-006 требует жанр, если он сообщён, и признак недоступности трека внутри album/playlist без прерывания коллекции; текущие `Track`, `Album`, `PlaylistTrack` в `packages/shared/src/domain.ts` этих данных не выражают. STEP-009 разрешает менять только provider. Requirements Quality Gate и независимый architect подтвердили blocker. STEP-003 остаётся завершённым историческим владельцем исходных доменных типов; новый шаг развивает контракт явно.

## Scope

- Новый ADR о форме жанра и доступности в `Track`/`Album`/элементах коллекций: optional данные, явный отказ, отсутствие подтверждения доступности и минимальные metadata недоступной записи.
- Определить типизированное представление недоступной записи без потери identity, порядка и повторов album/playlist; незаявленная доступность не означает разрешение на чтение контента (PRN-003).
- Зафиксировать совместимость: форма возвращаемых доменных данных, mock/fixtures, существующие потребители и границы влияния на future STEP-009/010. Доступность определяется provider для текущего аккаунта; shared не получает vendor flags, credentials или endpoint knowledge.
- Согласовать решение с ADR-002/009. Если нужно заменить конкретное ограничение принятого решения, новый ADR явно указывает только заменяемое положение; Accepted ADR не переписываются задним числом. Стратегию thin SDK wrapper, runtime-валидацию и остальную архитектуру не пересматривать.
- Обновить ADR/REQ/STEP traceability и architecture baseline по принятому решению; добавить новый accepted ADR в refs STEP-039 и STEP-009 и перенести точные обязанности реализации в STEP-039.

## Mutation policy

### Allowed

- Новый ADR в `docs/adr/`, индекс ADR и `docs/architecture.md` в части metadata contract.
- Связанные `docs/requirements/REQ-006-provider-metadata.md`, `planning/tasks/STEP-009.md`, `planning/tasks/STEP-039.md`: traceability и передача принятого контракта без ослабления REQ-006 и без добавления unrelated scope.
- Связанные ADR frontmatter/index: traceability и supersession metadata, только если этого требует новый ADR.

### Conditional

- Другие owning STEP contracts — только при доказанном прямом изменении их typed metadata obligations новым решением; без реализации этих STEP.

### Forbidden

- Production-код, тестовый executable code, зависимости и lockfile.
- Редактура Accepted ADR decision задним числом; изменение auth, audio/stream, cache, manifest, UI/CLI или правил доступа.
- Потеря жанра или недоступных записей ради обхода разрыва; скрытые provider-local поля вместо публичного typed shared contract.

## Out of scope

- Реализация shared-типов и mock/contract tests — STEP-039.
- Реальные API mappings/live fixtures — STEP-009; audio eligibility/variants/stream — STEP-010.

## Acceptance criteria

- Новый ADR accepted и задаёт точную форму/семантику жанра, доступности и недоступной записи, включая отсутствие optional данных и отсутствие подтверждённого доступа.
- ADR сохраняет REQ-006: unavailable запись остаётся различимой в результате коллекции, остальные записи, их порядок и повторы сохраняются; неизвестный доступ не повышается до доступного.
- Совместимость с ADR-002/009 разрешена явно; production shared/runtime не менялся, а обязанности реализации, mock и контрактных тестов однозначно принадлежат STEP-039.
- ADR↔REQ↔STEP refs и architecture baseline согласованы; STEP-009 зависит от реализации STEP-039.

## Verification

- command: `python3 .harness/tools/validate.py --mode manual`
- manual: Независимый ADR reviewer сопоставляет новый accepted metadata ADR с REQ-006/ADR-002/ADR-009 и PRN-001/003: формы жанра/доступности/minimal недоступной записи определены, optional данные не выдуманы и отсутствие подтверждения не становится разрешением; коллекции сохраняют identity/порядок/повторы/позиции, typed compatibility и узкое уточнение прежних решений явные. Приложить factual contract-matrix review observations.
- manual: Проверить итоговый diff/traceability/architecture и сравнить product/dependency файлы с baseline: STEP-039 получил exact implementation contract и новый accepted ADR refs, STEP-009 сохраняет provider-only scope и prerequisite STEP-039; REQ-006 behavior не ослаблен, production/shared/mock/tests/deps/lockfile и unrelated dirty worktree не изменены. Metadata/auth/audio/cache/manifest/UI/CLI runtime не реализован, completion STEP-038 не заявляет снятия prerequisite completed STEP-039. Приложить безопасное factual evidence.

## Deliverables

- Accepted metadata ADR, актуальная traceability и architecture baseline.
- Уточнённый owning contract STEP-039 и новый ADR ref STEP-009.

## Implementation plan

### 1. Подготовить точную форму metadata contract в новом ADR

- При resume текущего RUN сохранить уже созданный ADR-011 и исходный baseline; не создавать второй ADR и не повторять завершённые decision/review шаги. После принятия ADR изменился context basis — обновить только planning fingerprints и проверить оставшиеся handoff/Verification обязанности, без нового выбора модели.
- В начале STEP RUN STEP-038 сохранить read-only baseline существующих product/dependency файлов и dirty worktree, чтобы документационная работа не смешалась с ранее выполненными изменениями. Использовать результаты bounded grounding: Track/Album/PlaylistTrack, typed MusicProvider returns и текущие mock fixtures/cloneTrack; не исследовать весь проект и не запускать live API или product tests для принятия этой формы.
- Создать новый ADR в docs/adr с очередным свободным ID (сейчас следующий ADR-011, проверить занятость при RUN), сначала proposed. Обосновать его подтверждённым разрывом REQ-006 и ссылками на packages/shared/src/domain.ts/provider.ts: жанр и признак недоступности нельзя представить в текущем typed shared контракте, STEP-009 остаётся provider-only. Новый ADR, а не Implementation plan, принимает устойчивое решение.
- Сравнить минимальные portable формы genre и availability: optional scalar/list жанра по фактическому источнику metadata и месту в Track/Album; отсутствие жанра не превращается в ошибку доступа. Для availability сравнить явно различимые подтверждённый доступ, явную недоступность и отсутствие подтверждения, включая альтернативы optional flags и явные состояния/типы. Выбранная форма и точные поля/значения фиксируются в Decision ADR, а до этого не считаются Accepted.
- Определить minimal record недоступного/неподтверждённого track и поведение standalone getTrack относительно коллекций: сохранить источник identity, не выдумывать отсутствующие title/artists/genre; collection не падает целиком и не теряет остальные записи. Порядок album volumes/tracks и позиции playlist 1..N/повторы сохраняются. Уточнить, как новый typed record согласуется с текущими обязательными Track.title/artists и assumptions cloneTrack, не скрывая provider-local subtype за старым shared типом.
- В Decision явно указать: availability относится к текущему аккаунту и сообщается provider; missing/unknown никогда не означает разрешение читать контент (PRN-003), оно не выводится из genre/title/artwork. Shared не получает vendor flags, endpoints, SDK-типы, credentials или signed URL; raw mappings/валидаторы остаются STEP-009, audio eligibility/варианты/stream — STEP-010. Никакого принятия новых правил обхода ограничений или реализации этих будущих STEP.

**Files:**
- docs/adr/ADR-011-shared-metadata-contract.md (или следующий свободный ADR ID при RUN)

**Tests:**
- Ручная contract matrix: genre present/absent; confirmed access/explicit denial/no confirmation; complete/minimal metadata; повтор одного track в collection. Это ADR review examples, не executable tests.

**Risks:**
- Выбор конкретной формы принимается в ADR STEP-038; STEP-039 не вправе переизобретать её во время implementation.

### 2. Разрешить совместимость и передать точный contract владельцам

- Описать в ADR связь с ADR-002/009: набор методов MusicProvider сохраняется, уточняется только metadata data shape для REQ-006. В отдельном compatibility пункте перечислить конкретные прежние положения, которые решение уточняет или заменяет; при доказанном конфликте оформить узкое supersession metadata по architecture-change. Accepted Decision текст не переписывать; SDK wrapper/schema drift/auth и остальная стратегия остаются отдельными решениями.
- Проверить фактические affected typed call sites domain/provider/mock fixtures/cloneTrack и разделить compatibility obligations: STEP-039 меняет shared exports/types/offline mocks/контрактные tests, STEP-009 выполняет vendor metadata mapping после completed STEP-039. ADR содержит точные expected fields/states, отсутствующие optional данные, minimal record, порядок/повторы и матрицу tests для STEP-039. Если выбранная форма требует mutation вне его Allowed, передать это явно в owning Scope до Ready implementation, не добавлять hidden edits.
- Применимые data/lifecycle consequences описать по фактам: availability — snapshot provider для текущего аккаунта, auth lifetime/cache не реализуются здесь. Обосновать необходимость или отсутствие миграций/rollback существующих persisted данных; не менять manifest/cache/schema version/runtime formats в STEP-038 и не заявлять непроверенную совместимость. Если решение фактически меняет обязательство owning future STEP, использовать только разрешённый Conditional update его canonical contract, без реализации и без широкого перепланирования.
- Обновить STEP-039 exact Scope/Acceptance/Verification responsibilities по выбранному accepted ADR; methods/auth/error/event contracts и остальные metadata requirements не расширять. STEP-009 добавить новый ADR ref и описание typed prerequisite, сохранив provider-only scope и depends_on STEP-039; полное снятие implementation blocker происходит только после completed STEP-039, а не после ADR.
- Добавить двусторонние ADR↔REQ-006↔STEP-038/039/009 refs, обновить docs/adr/README.md и docs/architecture.md только в metadata data model/границах. Если новое решение ссылается на другие accepted ADR, обеспечить точную required traceability. REQ-006 behavior не ослаблять, STEP-003 не открывать задним числом и historical Ready plans не переписывать. Для доказанно изменённых downstream contract plans сохранить stale/not_planned routing через deterministic tools, не объявлять их выполненными.

**Files:**
- docs/adr/
- docs/adr/README.md
- docs/architecture.md
- docs/requirements/REQ-006-provider-metadata.md
- planning/tasks/STEP-039.md
- planning/tasks/STEP-009.md

**Tests:**
- Read-only сопоставление ADR Decision ↔ metadata contract STEP-039 ↔ provider-only prerequisite STEP-009; schema/traceability validation после sync-projections.

### 3. Независимо проверить ADR и зафиксировать документальное завершение

- Отдельный readonly ADR reviewer проверяет authored ADR, alternatives и contract matrix против REQ-006/ADR-002/009/PRN-001/003 и actual shared/mock assumptions. Проверять material consistency/compatibility/ownership, не делать full editorial review или hypothetical hardening; подтвердить все manual Verification наблюдения фактическими результатами. После согласования фиксировать ADR accepted и выполнить финальную проверку перед completion.
- Сверить продуктовые/dependency файлы с baseline и фактический diff: production/shared/mock executable tests/deps/lockfile не менялись, metadata runtime/live proof не заявлен, unrelated dirty worktree сохранена. Принято только architecture decision и его docs/traceability/contract handoff, реализацию выполняет STEP-039.
- Перед canonical Verification запустить sync-projections.py; deterministic validator и два manual checks выполнить на итоговом документальном состоянии. Safe evidence различает captured output и summary; не печатать секреты или fixture body с account data. Передать dispatcher результат и manual observations, не самоприсваивать STEP completed или implementation proof.

**Files:**
- planning/tasks/STEP-038.md (semantic observations)
- planning/PLAN.md (generated)
- planning/STATUS.md (generated)
- docs/requirements/STATUS.md (generated)

**Tests:**
- python3 .harness/tools/validate.py --mode manual и независимые manual ADR/traceability/baseline checks.

## Evidence

<!-- VERIFICATION-EVIDENCE:START -->
- Verification run: 2026-10-09T12:28:47Z
- Status: PASS
- Automated resumed: false
- Git head: 2a19e5a72693ae741adfab8bbd464e120eed7785
- Worktree hash: sha256:d3344bbfdc2176c5760e0f9709d8db110f82afdf8e1275bb822a720603c86192
- Verification contract basis: sha256:8b988d5f621200f9b41781fd739ce9a5163020cb6a2d910b65af896648e7d978
- Subject git head: 2a19e5a72693ae741adfab8bbd464e120eed7785
- Subject worktree hash: sha256:1213fc0e336a09eb64cb9cf96bd8d555b828e09942adf034aa54ddc00b53c35c

### Automated verification
- Command: python3 .harness/tools/validate.py --mode manual
  - Status: PASS
  - Exit code: 0
  - Duration ms: 2367
  - stdout sha256: 396c8fc552f5c39b3b2ec0a2334966ff5c863de96432e1d6a2a17caee20a33ee
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 308
  - stderr bytes: 0

### Product verification
- none

### Manual verification
- Check: Независимый ADR reviewer сопоставляет новый accepted metadata ADR с REQ-006/ADR-002/ADR-009 и PRN-001/003: формы жанра/доступности/minimal недоступной записи определены, optional данные не выдуманы и отсутствие подтверждения не становится разрешением; коллекции сохраняют identity/порядок/повторы/позиции, typed compatibility и узкое уточнение прежних решений явные. Приложить factual contract-matrix review observations.
  - Status: PASS
  - Observed: "Независимый readonly ADR reviewer /root/adr011_review вернул PASS без findings по семи группам контрактной матрицы: optional scalar genre и жанр выбранного album reference; available/unavailable/unknown без повышения неизвестного доступа; минимальный ID record без выдуманных title/artists; сохранение identity/порядка/повторов/позиций; standalone TrackUnavailableError; миграция typed fixtures/clone helpers в STEP-039; явное узкое дополнение ADR-002/009. После PASS изменён только status proposed → accepted, Decision сохранился. ADR и STEP-039 содержат owning proof для контрактных тестов, raw mapping принадлежит STEP-009, audio проверка STEP-010. Это документальный review, а не runtime proof."
- Check: Проверить итоговый diff/traceability/architecture и сравнить product/dependency файлы с baseline: STEP-039 получил exact implementation contract и новый accepted ADR refs, STEP-009 сохраняет provider-only scope и prerequisite STEP-039; REQ-006 behavior не ослаблен, production/shared/mock/tests/deps/lockfile и unrelated dirty worktree не изменены. Metadata/auth/audio/cache/manifest/UI/CLI runtime не реализован, completion STEP-038 не заявляет снятия prerequisite completed STEP-039. Приложить безопасное factual evidence.
  - Status: PASS
  - Observed: "Сверка SHA-256 134 product/config/dependency файлов с исходным .harness/local/step038-run-baseline.json: changed=[], missing=[]. ADR-011 accepted, REQ-006 имеет ADR ref и неизменное Requirement/Acceptance, architecture data-state-model отражает genre и union. STEP-039 получил exact types/exports/mock/contract-test обязательства; STEP-009 сохраняет provider-only scope, зависит от STEP-039 и имеет ADR-011 ref. Decision ADR-002/009 не переписан, metadata/auth/audio/cache/manifest/UI/CLI runtime не реализован. Предсуществующая dirty worktree сохранена; принятие ADR не закрывает implementation prerequisite STEP-039."
<!-- VERIFICATION-EVIDENCE:END -->

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.

### Наблюдения принятия ADR

- ADR-011 принят после независимого readonly ADR review PASS: discriminator available/unavailable/unknown, minimal ID record, optional scalar genre, standalone refusal и collection markers согласованы с REQ-006/ADR-002/009/PRN. Decision текст не менялся при переходе proposed → accepted.
- STEP-039 получил exact union/types/exports/mock/contract-test обязанности; STEP-009 — ADR ref и provider-only mapping handoff с prerequisite completed STEP-039. Новый ADR не является runtime implementation proof.
- Baseline из `.harness/local/step038-run-baseline.json`: 134 product/config/dependency файла сохранили SHA-256. Независимый reviewer подтвердил changed=[] и missing=[]; сохранена предсуществующая dirty worktree. Эти значения — factual summary, не реконструированный terminal quote.

## Blocker / Failure reason

—
