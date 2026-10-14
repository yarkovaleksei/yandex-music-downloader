---
schema: 1
id: STEP-051
status: completed
type: bugfix
priority: critical
phase: provider
depends_on:
  - STEP-007
  - STEP-009
  - STEP-019
requirements:
  - REQ-006
  - REQ-007
  - REQ-009
adrs:
  - ADR-002
architecture_refs:
  - "docs/architecture.md#основные-компоненты-границы"
  - docs/architecture.md#external-dependencies-integrations
risk_flags:
  - external-integration
  - release-critical
plan:
  status: ready
  revision: 1
  context_basis: sha256:3811c4c0d44f39579c6c3ebcb6d808561dcf220c299dc218b80f501b3be36073
  content_hash: sha256:d1b86adb5e1269b29cf5d4ebcd4fcd98c17569a37bb13fafa5cda641031c005a
  reviewed_report: planning/plan-reviews/STEP-051/PLAN-REVIEW-20261014T072432Z.md
  planned_at: 2026-10-14T07:24:32+00:00
  execution_groups:
  context_components:
    - "ADR@ADR-002=sha256:9603d7e711e02ee4bc36d447b5397e944f34d00f15a3d773c4fec36cce4e4d17"
    - "ARCH@docs/architecture.md#external-dependencies-integrations=sha256:4a5a14fc27a94cc250440377eb2f8dc3e5c5c0ebcb267bedd209869dbf7b41c1"
    - "ARCH@docs/architecture.md#основные-компоненты-границы=sha256:36d9cb1ad69493f4fa4a0f35214bf9d3309221ca0b0c8ed6363d206364878773"
    - "PRN@PRN-001=sha256:3b3801f207fafc3f77272f0e93570258a6d006964839d93a276accd814d548af"
    - "PRN@PRN-002=sha256:f29ee3fbdb9cf65cf9739d0907768bbf192ad88b8e443110d4d82f81c6b79ecb"
    - "PRN@PRN-003=sha256:16516d7d302fecda5f7615f9d55e29e04b588d671f8660640e1f61d1619e4ef8"
    - "REQ@REQ-006=sha256:b32e7c1ebbcbc8538605b1634bf2a09fc99be64bfc076e3f0540b4bb605631e8"
    - "REQ@REQ-007=sha256:6ecccc57a941d7a16855333f973f4fc2e9d3184e121a3f643f96d78d22ccaa74"
    - "REQ@REQ-009=sha256:d757e12491f060a00d6265bb48aa8cc963fe62e1db09680d1724c6b09585e684"
    - "STEP@STEP-007=sha256:f4f726b5c11eaa5348b883096c419da4a1f236fd93401d23d29e455ceda74d5d"
    - "STEP@STEP-009=sha256:eb191ddce635810bb63fbeddbdf905bc7796ff7a6e9fe3ccf0055393c7ca3cc3"
    - "STEP@STEP-019=sha256:48362e7f320bf7ef42460a0cb146b241e6eab5996d3ff8f29a69ec1360eb3a55"
    - "STEP@STEP-051=sha256:75e7cb09afe5cc7b92bc8cb1ec701f6763468ceebccbb5fb0cb4aa8ffa4db055"
---

# STEP-051 — Загрузка коллекции «Мне нравится» по ссылке lk.UUID

## Goal

Позволить штатному CLI загружать коллекцию «Мне нравится» по выдаваемой Яндекс Музыкой ссылке `/playlists/lk.<UUID>`, сохраняя префикс в идентификаторе provider.

## Context

При реальной приёмке STEP-027 2026-10-14 исходная ссылка пользователя отклонена с `UNSUPPORTED_URL` до создания задания. Пользователь подтвердил, что `lk.` означает коллекцию «Мне нравится»; обычные плейлисты префикса не имеют.

Read-only probe установленного `@dvxch/yandex-music 0.3.0` с существующей CLI-авторизацией подтвердил: `client.playlist('lk.<UUID>')` возвращает «Мне нравится», 148 треков; их состав и порядок совпадают с `usersLikesTracks` этого аккаунта. Без префикса сервер возвращает `NotFoundError`. Текущие rawPlaylistSchema и mapPlaylist принимают реальный ответ, сохраняют `id=lk.<UUID>` и отображают все 148 доступных треков. Credentials и account ID не записывались. Подробное evidence: [приёмка Linux](../audits/AUDIT-20261014T071038Z.md).

STEP-007 и STEP-009 завершены, открытого corrective STEP по этому случаю нет. Их исторические reports не переписываются. STEP-027 разрешает аудит и регистрацию дефектов, но запрещает исправлять production; дефект блокирует реальную ячейку playlist. Расширение shared API или новый способ авторизации не требуется.

## Scope

- Добавить распознавание формы `/playlists/lk.<UUID>` в provider-owned URL resolver, с сохранением префикса в каноническом opaque id.
- Разрешить этот id в getPlaylist и передавать его без удаления префикса в существующий SDK playlist и validated metadata transport.
- Сохранить UUID и legacy user/kind формы, нормализацию hostname/UTM/fragment, ошибки неподдерживаемых ссылок и проверку сырого ответа до SDK defaults.
- Добавить регрессионное покрытие resolver и реального facade/SDK seam; повторить штатный CLI-прогон исходной lk-ссылки.

## Mutation policy

### Allowed

- `packages/providers/yandex-music/src/url/resolve-yandex-music-url.ts` и соответствующий unit-набор.
- `packages/providers/yandex-music/src/yandex-music-auth.ts` — только admission lk.UUID и передача неизменённого id существующему playlist endpoint.
- `packages/providers/yandex-music/src/metadata/metadata.test.ts` — регрессии lk-коллекции и старых форм.
- Документация поддерживаемых ссылок и evidence текущего STEP; projections только deterministic tools.

### Conditional

- Нет.

### Forbidden

- Изменения application/CLI/core/shared contracts, схем metadata, storage/auth, зависимостей и lockfile.
- Подмена lk.UUID на обычный UUID, слепое разрешение произвольных префиксов или подавление ошибок API.
- Изменение лайков, создание/копирование плейлистов на аккаунте, cookies/plaintext credentials, обход доступности контента.
- Поддержка других prefixed типов ссылок и unrelated/future desktop work.

## Out of scope

- Изменение коллекции «Мне нравится», синхронизация новых лайков или выбор чужого аккаунта.
- Переход к UI и завершение STEP-027; полная матрица и go/no-go остаются у приёмки.

## Acceptance criteria

- Валидная lk-ссылка, включая UTM/fragment и поддерживаемые hostname, возвращает `MediaReference` kind playlist с id `lk.<lowercase UUID>`; обычные UUID и legacy формы сохраняют своё поведение.
- Некорректный UUID, лишние path segments, чужой hostname и неизвестный префикс дают существующий `UNSUPPORTED_URL` без содержимого входной ссылки.
- getPlaylist передаёт полный lk.UUID в SDK playlist и возвращает штатную domain collection после действующей проверки raw metadata. Regression capture подтверждает отсутствие запроса по UUID без lk.
- Malformed API response по lk-коллекции по-прежнему даёт безопасный `PROVIDER_RESPONSE_INVALID`; недоступные позиции сохраняют действующий availability contract.
- Штатный built CLI принимает исходную ссылку, создаёт job и начинает фактическую загрузку коллекции; после SIGINT — paused/exit 4, после resume — completed/exit 0 с проверенными файлами, tags/artwork и сохранением уже завершённых треков. Внешние отказы фиксируются отдельно, а не выдаются за PASS.
- Нет Yandex API/SDK вне provider production package и нет credentials/account ID/signed URL в сохраняемом evidence.

## Verification

- command: `node packages/testing/scripts/run-yarn.mjs test packages/providers/yandex-music/src/url packages/providers/yandex-music/src/metadata`
- command: `node packages/testing/scripts/run-yarn.mjs run lint`
- command: `node packages/testing/scripts/run-yarn.mjs run typecheck`
- command: `node packages/testing/scripts/run-yarn.mjs test`
- command: `node packages/testing/scripts/run-yarn.mjs build`
- command: `python3 .harness/tools/validate.py --mode manual`
- manual: Выполнить штатный CLI playlist по исходной lk-ссылке на существующем авторизованном аккаунте в новую папку. Дождаться completed первого трека и progress следующего, отправить SIGINT, зафиксировать paused/exit 4, затем resume и completed/exit 0. Проверить состав коллекции, конечные файлы, validation, tags/artwork и неизменность завершённых файлов; сохранять только безопасное evidence.

## Deliverables

- Поддержка lk.UUID внутри provider, регрессионные тесты, безопасное real CLI evidence и независимый PASS review.

## Implementation plan

### 1. Распознавание lk.UUID и сохранение идентичности

- В существующем provider URL resolver допустить только точную форму lk.<UUID> наряду с обычным UUID; сохранить lowercase UUID и значимый lowercase prefix lk., прежние hostname/protocol/UTM/fragment правила не менять.
- В getPlaylist выделить lk.UUID как форму существующего SDK playlist endpoint: передавать полный id без удаления lk и использовать прежний metadataRequest/rawPlaylistSchema/mapPlaylist. Не менять shared API, схемы, auth/storage или runtime retry.
- Добавить короткие русские комментарии с @link на STEP-051: API требует lk, удаление префикса воспроизводимо даёт NotFoundError.

**Files:**
- packages/providers/yandex-music/src/url/resolve-yandex-music-url.ts
- packages/providers/yandex-music/src/yandex-music-auth.ts

**Tests:**
- Фактический flow в следующем regression-наборе

**Risks:**
- Изменение URL resolver без getPlaylist admission оставит ошибку до metadata request; оба места меняются одной согласованной правкой.

### 2. Прямое proof H-001/H-002 на resolver и real facade/SDK seam

- Дополнить table-driven URL tests lk-ссылками с UTM/fragment, uppercase UUID, поддерживаемыми hostname и ведущим нулём; проверить сохранение prefix и canonical id, эквивалентность вариантов.
- Проверить explicit rejection неправильного UUID, unknown prefix, лишнего segment и чужого hostname через существующий UNSUPPORTED_URL; не добавлять новые неподтверждённые threat scenarios.
- В metadata tests пройти lk через public resolveUrl → getPlaylist с настоящим SDK и synthetic response: capture exact /playlist/lk.UUID, id, ordered positions, available/unavailable/unknown records; сохранить прежние UUID/legacy проверки.
- Проверить malformed lk API response через действующую raw validation и безопасный PROVIDER_RESPONSE_INVALID, без изменения schemas или маскировки defaults.

**Files:**
- packages/providers/yandex-music/src/url/resolve-yandex-music-url.test.ts
- packages/providers/yandex-music/src/metadata/metadata.test.ts

**Tests:**
- node packages/testing/scripts/run-yarn.mjs test packages/providers/yandex-music/src/url packages/providers/yandex-music/src/metadata

**Risks:**
- Validated Semantic Blast Radius PLAN: INCONCLUSIVE; H-001 сохранение идентичности и H-002 прежняя raw validation должны получить fresh PASS exact command после реализации.

### 3. Реальный CLI interruption/resume и independent review

- Выполнить canonical targeted/root Verification. Реальный исходный lk URL взять из подтверждённого пользовательского ресурса; запускать built штатный CLI в отдельный новый output со штатным state/profile и существующим native credential store.
- Для collection использовать concurrency 1: дождаться completed первого трека и реального prefix следующего; отправить настоящий SIGINT, сохранить exit 4 и persisted paused. Зафиксировать SHA-256, mtimeNs и inode completed-файла.
- В новом CLI process выполнить resume того же job без замены output/quality; получить completed/exit 0. Проверить полный доступный состав, итоговые audio validation, tags/artwork, отсутствие собственных .part и неизменность completed-файла. Внешние отказы записать отдельно; не править manifests/lease/heartbeat и не заменять контент mock.
- Сохранить безопасное evidence без credentials/account IDs/signed URLs и передать exact reviewed subject независимому review. Scope STEP-027 и desktop не закрывать этим исправлением.

**Files:**
- planning/tasks/STEP-051.md
- planning/reviews/STEP-051/
- docs/research/

**Tests:**
- Canonical Verification
- Реальный штатный CLI playlist → SIGINT → новый resume

**Risks:**
- Недоступность native state directory в sandbox требует разрешённого запуска CLI вне sandbox, а не изменения приложения или profile.
- Объём коллекции 148 треков известен на момент probe; фактический source snapshot и итоговый состав фиксируются в live evidence.

## Evidence



<!-- VERIFICATION-EVIDENCE:START -->
- Verification run: 2026-10-14T07:42:37Z
- Status: PASS
- Automated resumed: false
- Git head: b57db587ca4d70173fba6a495fb4c76337250227
- Worktree hash: sha256:2ee0a7bee263d6442592900c5286875df3a1971d36130064846f274ec0a51aa2
- Verification contract basis: sha256:7404e873681fb3f959c64e7240bf40337fd01b2e0424ce9215bf1a2435417218
- Subject git head: b57db587ca4d70173fba6a495fb4c76337250227
- Subject worktree hash: sha256:13578d6f6ce8841ed143ef69d66971c27c1b35afc084e9c1108a9a2225d47b46

### Automated verification
- Command: node packages/testing/scripts/run-yarn.mjs test packages/providers/yandex-music/src/url packages/providers/yandex-music/src/metadata
  - Status: PASS
  - Exit code: 0
  - Duration ms: 1366
  - stdout sha256: ba712360ce57342faab53642fcc3cc44e101550b9ce564a5dfd49f090718d771
  - stderr sha256: b31e5630d0bbc686a3c3f6992722d44109e42a63634c611c88e7800e7590daa9
  - stdout bytes: 547
  - stderr bytes: 106
- Command: node packages/testing/scripts/run-yarn.mjs run lint
  - Status: PASS
  - Exit code: 0
  - Duration ms: 8179
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: f59ba696a15507a8febe0f9ea94ac75ccc5411952df61ee4cb3c971b47b6bc12
  - stdout bytes: 0
  - stderr bytes: 25
- Command: node packages/testing/scripts/run-yarn.mjs run typecheck
  - Status: PASS
  - Exit code: 0
  - Duration ms: 3268
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: ffbfd8ec2bfcf3e8f0e99a93f081f695da2de832eba56c5ae6943a4052680411
  - stdout bytes: 0
  - stderr bytes: 30
- Command: node packages/testing/scripts/run-yarn.mjs test
  - Status: PASS
  - Exit code: 0
  - Duration ms: 7084
  - stdout sha256: eda78ae93c941664738a9cc2aa9bf8b19229987eb48fffaf7895deef5914bb86
  - stderr sha256: c092adf4f01c4edadf4e36f2ed5dbf2ebb5101110bcfc32bf35aad11ffef717c
  - stdout bytes: 11886
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
  - Duration ms: 4872
  - stdout sha256: 359c3612e5ba95ae1031ea2f5327f81fc413ab6eb60d7c651704b0b5ded7350d
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 2048
  - stderr bytes: 0

### Product verification
- none

### Manual verification
- Check: Выполнить штатный CLI playlist по исходной lk-ссылке на существующем авторизованном аккаунте в новую папку. Дождаться completed первого трека и progress следующего, отправить SIGINT, зафиксировать paused/exit 4, затем resume и completed/exit 0. Проверить состав коллекции, конечные файлы, validation, tags/artwork и неизменность завершённых файлов; сохранять только безопасное evidence.
  - Status: PASS
  - Observed: "2026-10-14 10:31–10:38 Europe/Moscow. Штатный CLI по исходной lk-ссылке с UTM, существующая native авторизация, новый output, concurrency 1. Job da4e1b48-27b2-49dd-8b17-57e143c7b9e7: SIGINT после completed первого трека и физического prefix следующего 277349 байт; paused/exit 4. Новый resume: первый progress=277349, completed/exit 0, все 148 completed. 148 файлов validation PASS, теги/обложки 148/148, M3U8 148 записей, .part/candidate отсутствуют. Completed файл сохранил SHA-256/mtimeNs/inode, повторных download/metadata событий нет. Безопасное evidence docs/research/step-051-liked-collection-live-2026-10-14.json."
<!-- VERIFICATION-EVIDENCE:END -->

- Read-only API/schema/mapper proof и исходный CLI UNSUPPORTED_URL: [AUDIT-20261014T071038Z](../audits/AUDIT-20261014T071038Z.md).
- Изменены два admission-участка provider и resolver/metadata regression suites. До правки targeted command воспроизвёл 4 отказа; после — 3 test files / 61 tests PASS. Canonical Verification: 6/6 команд PASS. Первоначальный Harness-check выявил projection drift после in_progress; устранено штатным sync-projections без product changes.
- Реальная проверка 2026-10-14 10:31–10:38 (Europe/Moscow): штатный built CLI playlist по исходной lk-ссылке с UTM, concurrency 1, существующая авторизация, новый output. Job `da4e1b48-27b2-49dd-8b17-57e143c7b9e7`: первый трек completed, следующий остановлен настоящим SIGINT на 277349 байтах; paused/exit 4, physical .part и manifest partial.bytes совпали. Новый процесс resume начал progress с тех же 277349 байт и завершился completed/exit 0.
- Все 148 треков completed, failed/skipped/paused/unavailable отсутствуют. 148 конечных MP3 192 kbit/s независимо проверены существующим validator; title/artist/album и встроенные обложки присутствуют в 148/148. M3U8 содержит 148 записей, cover.jpg существует; recursive .part/candidate и referenced .part отсутствуют. Completed-файл сохранил SHA-256, mtimeNs и inode; повторных download.started/metadata.written для его trackKey нет. Три неудачные transient-попытки восстановлены штатным retry; terminal failures отсутствуют.
- Безопасные parsed events, команды/exit codes, manifest snapshots, file inspection и source/CLI/provider build digests: [live evidence](../../docs/research/step-051-liked-collection-live-2026-10-14.json). Credentials, account ID, signed URL и raw native/API errors не сохранялись. Полная матрица STEP-027 и desktop gate остаются отдельным обязательством.



## Blocker / Failure reason

Нет. Ready plan revision 1 реализован, автоматическая и реальная Verification пройдены; completion ожидает независимого review.
