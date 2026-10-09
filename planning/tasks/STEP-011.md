---
schema: 1
id: STEP-011
status: completed
type: implementation
priority: high
phase: provider
depends_on:
  - STEP-010
requirements:
  - REQ-008
adrs:
  - ADR-002
architecture_refs:
  - docs/architecture.md#external-dependencies-integrations
risk_flags:
  - external-integration
plan:
  status: ready
  revision: 1
  context_basis: sha256:0d51a15746b1f63a0d547290f8bc9cc49ad80de47dc54a159b00af355d8cf517
  content_hash: sha256:495746ad795a96dd56d43775f86e9596270fb4d6d49f12d418ca215d913bf2f3
  reviewed_report: planning/plan-reviews/STEP-011/PLAN-REVIEW-20261009T161531Z.md
  planned_at: 2026-10-09T16:15:31+00:00
  execution_groups:
  context_components:
    - "ADR@ADR-002=sha256:9603d7e711e02ee4bc36d447b5397e944f34d00f15a3d773c4fec36cce4e4d17"
    - "ARCH@docs/architecture.md#external-dependencies-integrations=sha256:745b40d80b739a59467e156c30b839f7fb6c0cca9f347619f6856d1757324b1c"
    - "PRN@PRN-001=sha256:3b3801f207fafc3f77272f0e93570258a6d006964839d93a276accd814d548af"
    - "PRN@PRN-002=sha256:f29ee3fbdb9cf65cf9739d0907768bbf192ad88b8e443110d4d82f81c6b79ecb"
    - "PRN@PRN-003=sha256:16516d7d302fecda5f7615f9d55e29e04b588d671f8660640e1f61d1619e4ef8"
    - "REQ@REQ-008=sha256:ed6493b0d464a68665ec23f1b1e3ea18f4f325d6c0b8ea78b353339af124d552"
    - "STEP@STEP-010=sha256:6fed6a2d97223ed471806457a7e90cbc9a4abaaedf94d476c7e4ba385da09425"
    - "STEP@STEP-011=sha256:a00675a741ca8a9cf873b1e2ad528d995b7debf8aca6bb71394811cc693a4c22"
---

# STEP-011 — Provider contract tests на реальном API

## Goal

Создать отдельный suite `npm run test:provider`, проверяющий контракт provider на реальном API с токеном из окружения.

## Context

Offline suite не обнаруживает дрейф API; live-тесты запускаются вручную или по расписанию, а не в каждом PR.

## Scope

- Скрипт `test:provider` и набор тестов track/album/playlist/variants.
- Поведение при отсутствии `PROVIDER_TEST_TOKEN`.
- Документация запуска в `docs/development.md`.

## Mutation policy

### Allowed

- `packages/providers/yandex-music/test-live/**` (или эквивалент), скрипты, `docs/development.md`.

### Conditional

- Нет.

### Forbidden

- Запуск live-тестов из PR CI, хранение секретов в репозитории.
- Реализация future/unrelated STEP «заодно».

## Out of scope

- Scheduled CI для live-тестов (отдельное решение).

## Acceptance criteria

- `npm test` не запускает live-тесты и проходит без сети.
- `npm run test:provider` без токена завершается понятным сообщением без обращения к сети.
- С токеном suite проходит на реальном аккаунте (evidence).

## Verification

- command: `node packages/testing/scripts/run-yarn.mjs run lint`
- command: `node packages/testing/scripts/run-yarn.mjs run typecheck`
- command: `node packages/testing/scripts/run-yarn.mjs test`
- command: `node packages/testing/scripts/run-yarn.mjs build`
- command: `node --test packages/providers/yandex-music/test-live/runner.test.mjs`
- command: `python3 .harness/tools/validate.py --mode manual`
- manual: Реальный отдельный test:provider после Yarn build с PROVIDER_TEST_TOKEN только в окружении: public account/track/album/playlist/audio variants проходят на разрешённом аккаунте. Сохранить command без token value, дату, exit code, SDK/schema version, allowlisted stage/count observations и cleanup test-only памяти. No-token SKIP и synthetic doubles не заменяют этот real API PASS; native storage/browser не используются, raw Error/DTO/key/URL/headers/credentials не сохраняются.

## Deliverables

- Live contract suite и документация.

## Implementation plan

### 1. Добавить отдельную команду и test-only token composition

- По REQ-008/STEP-011 добавить root script test:provider, делегирующий Node ESM entry внутри provider/test-live. Yarn остаётся package manager; npm-compatible script работает после Yarn install. Зависимости, lockfile, ordinary test и PR workflow не меняются.
- В run.mjs сначала проверить PROVIDER_TEST_TOKEN: отсутствие/blank даёт фиксированное русское сообщение SKIP, exit 0 и отсутствие provider factory/import/network. Это явный пропуск, а не успешный real API proof. Предварительная сборка требуется только configured live path.
- Configured path динамически загружает public provider dist и использует test-only CredentialStore в памяти с существующим strict envelope v1 (accessToken, issuedAt, нейтральный accountId). getAccount проверяет токен; UID реального ответа используется для собственного playlist. Не добавлять production token setter/SDK export, не вызывать authenticate/browser/native store и не импортировать persistence.
- Изолировать memory store/provider lifecycle в finally: logout/clear только памяти, без изменения пользовательской native записи. Отказ загрузки, конфигурации или provider operation даёт ненулевой exit с безопасным stage/code; configured ошибки не превращаются в SKIP.

**Files:**
- package.json
- packages/providers/yandex-music/test-live/run.mjs
- packages/providers/yandex-music/test-live/runner.mjs

**Tests:**
- H-001: missing/blank token не вызывает factory/fetch; entry работает без предварительного provider build на no-token path.
- H-002: memory envelope/cleanup, configured failure exit и отсутствие browser/native взаимодействия проверяются с synthetic token/provider.

**Risks:**
- Env token допускается только в памяти текущего процесса; не передавать его через argv, файл, fixture или диагностический вывод.

### 2. Проверять реальные portable track/album/playlist/variant контракты

- После успешного getAccount последовательно вызвать public getTrack, getAlbum, getPlaylist и getAudioVariants. Использовать известные smoke IDs track 2224197/album 221173 и собственный users/<encoded account.id>/playlists/1000; разрешить документированные nonsecret overrides PROVIDER_TEST_TRACK_ID, PROVIDER_TEST_ALBUM_ID, PROVIDER_TEST_PLAYLIST_ID с проверкой provider-supported форматов.
- Проверять ID запроса/ответа там, где public contract гарантирует совпадение, доступность и обязательные поля track, структуру album, последовательные playlist positions с сохранением повторов и допустимые AudioVariant codec/container/bitrate-or-absence/lossless/key. Optional metadata не превращать в обязательные поля; не закреплять изменяемые title/counts/bitrate конкретного аккаунта как golden snapshot.
- Для известного доступного smoke track требовать реально возвращённые полные eligible variants. Недоступность catalog entry или AUTH_ERROR/API_CHANGED — failure, а не обход доступа, смена аккаунта, скрытый retry или fabricated variant. Override помогает выбрать доступные владельцу smoke resources.
- Suite обращается через public facade/реальный SDK/validated transports; не переиспользовать прежние verification runners с fixture capture/native authorization. В STEP-011 не добавлять полное скачивание/Range, artwork, modern encraw proof, TTL ожидание или core quality policy: предмет suite — заявленные metadata/variants.
- PASS печатать только после всех обязательных assertions реального configured suite и cleanup. Отдельные synthetic проверки не являются real API evidence.

**Files:**
- packages/providers/yandex-music/test-live/runner.mjs

**Tests:**
- Synthetic public-provider doubles проверяют вызовы/аргументы, portable contract assertions и failing stage для malformed или unavailable ответа.
- Manual configured live command проверяет account/track/album/playlist/variants на реальном API; фиксированные ресурсы не считаются универсально доступными.

**Risks:**
- Реальный live account и доступность ресурсов проверяются при RUN; отсутствие токена не разрешает закрыть live Acceptance.

### 3. Закрепить offline isolation и безопасный вывод suite

- Реализовать allowlisted вывод: фиксированные stage/status/domain codes, counts и PROVIDER_SCHEMA_VERSION. Не выводить raw Error/message/cause/stack, Node assertion actual/expected, DTO, account/playlist identifiers, variantKey, token, headers или URL. Не сохранять raw responses и не менять исторические fixtures/evidence STEP-009/010.
- Создать один offline Node test file test-live/runner.test.mjs с DI synthetic provider/factory и capture stdout/stderr. Покрыть H-001 no-token/blank/no-network-before-load, H-002 configured success/failure/cleanup и synthetic canary в token/ошибке/DTO/key. Проверить, что output не содержит canary и configured failure ненулевой. Это тесты прямых REQ-008/PRN-002 obligations, без теоретических дополнительных угроз.
- Добавить subprocess проверку actual no-token entry с удалённым PROVIDER_TEST_TOKEN из дочернего env; проверить SKIP/exit и отсутствие factory/network. Проверить root script mapping и отделение test-live от существующего Vitest src discovery/PR commands. Offline test не запускает настоящую сеть даже если родительский env содержит token.
- Обычный test остаётся offline по текущему Vitest config; новые guard/output проверки запускаются explicit Node offline command в STEP Verification. Не подключать live suite к ordinary test или PR CI и не вводить schedule.

**Files:**
- packages/providers/yandex-music/test-live/runner.mjs
- packages/providers/yandex-music/test-live/runner.test.mjs
- packages/providers/yandex-music/test-live/run.mjs

**Tests:**
- node --test packages/providers/yandex-music/test-live/runner.test.mjs — прямое executable proof H-001/H-002.
- node packages/testing/scripts/run-yarn.mjs test — существующий offline suite без real API вызовов.

**Risks:**
- Node test reporter может печатать assertion values; production live entry перехватывает все runtime ошибки до любого generic error reporter.

### 4. Документировать запуск и получить отдельное real API evidence

- Обновить только docs/development.md: Yarn install/build, основная команда yarn run test:provider и эквивалентное npm-compatible имя script; PROVIDER_TEST_TOKEN задаётся в окружении без literal значения в репозитории/команде evidence, nonsecret resource overrides и exact no-token SKIP/configured failure exit semantics.
- Разъяснить, что build выполняется до token-authored запуска, ordinary test не требует сети/токена, live suite ручной и не входит PR CI. Не добавлять сборщик токенов, изменение CLI login/storage, scheduled CI или новую dependency.
- При RUN выполнить canonical Verification и отдельно настоящий test:provider с токеном владельца/разрешённого аккаунта. Записать command без значения токена, exit code, capture date, SDK/schema version, safe stages/counts и ограничения одного аккаунта. Output cleanup должен подтвердить освобождение test-only памяти; native запись не затрагивается.
- Если real suite не пройден или токен отсутствует, оставить manual Verification pending/BLOCKED с фактической причиной. Старые успешные captures STEP-009/010 и synthetic doubles не подменяют новый suite PASS. Подтверждённый drift вне разрешённой test/script mutation surface требует отдельного corrective work, а не скрытой правки provider.

**Files:**
- docs/development.md
- planning/tasks/STEP-011.md

**Tests:**
- Полная canonical Verification: lint/typecheck/offline tests/build/Node guard tests/Harness integrity.
- Manual: actual отдельная root command с env token даёт все safe stages PASS и cleanup; без token SKIP проверен offline.

**Risks:**
- Ready означает готовность плана, а не прохождение будущего real API smoke.

## Evidence



<!-- VERIFICATION-EVIDENCE:START -->
- Verification run: 2026-10-09T16:29:42Z
- Status: PASS
- Automated resumed: false
- Git head: 2a19e5a72693ae741adfab8bbd464e120eed7785
- Worktree hash: sha256:3008ebf359e4847303e42c049cb4f617dc619e7e535b2bcf65df5afa2e3ae994
- Verification contract basis: sha256:cdd09f0ce90fe6ed4e812e7cc3bab30fe2237e013200f1bd860e8e87b0613d16
- Subject git head: 2a19e5a72693ae741adfab8bbd464e120eed7785
- Subject worktree hash: sha256:94f720f8ba180768f5b298044d01fa4809ea1e163bd61895313b601a8f8e9971

### Automated verification
- Command: node packages/testing/scripts/run-yarn.mjs run lint
  - Status: PASS
  - Exit code: 0
  - Duration ms: 5372
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: f59ba696a15507a8febe0f9ea94ac75ccc5411952df61ee4cb3c971b47b6bc12
  - stdout bytes: 0
  - stderr bytes: 25
- Command: node packages/testing/scripts/run-yarn.mjs run typecheck
  - Status: PASS
  - Exit code: 0
  - Duration ms: 2117
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: ffbfd8ec2bfcf3e8f0e99a93f081f695da2de832eba56c5ae6943a4052680411
  - stdout bytes: 0
  - stderr bytes: 30
- Command: node packages/testing/scripts/run-yarn.mjs test
  - Status: PASS
  - Exit code: 0
  - Duration ms: 3823
  - stdout sha256: 03b58d0b6998c4584c1c298d14fdffc3f88dc830c018b485e81f228a1421aab0
  - stderr sha256: f969fafb7bc32ecc492c8343f56269c9c47161d893e83a0d8b9b27fcf57b9aee
  - stdout bytes: 3725
  - stderr bytes: 21
- Command: node packages/testing/scripts/run-yarn.mjs build
  - Status: PASS
  - Exit code: 0
  - Duration ms: 414
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: 0157d8afc3a7265ca4e7c585e12c0dad6c6e3b575b60dd6b58851567da7c61d3
  - stdout bytes: 0
  - stderr bytes: 22
- Command: node --test packages/providers/yandex-music/test-live/runner.test.mjs
  - Status: PASS
  - Exit code: 0
  - Duration ms: 164
  - stdout sha256: f5d860a20a722310af5073633288fe72b6c8474dadb7a2cb09a18509e4262b6e
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 680
  - stderr bytes: 0
- Command: python3 .harness/tools/validate.py --mode manual
  - Status: PASS
  - Exit code: 0
  - Duration ms: 2467
  - stdout sha256: 396c8fc552f5c39b3b2ec0a2334966ff5c863de96432e1d6a2a17caee20a33ee
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 308
  - stderr bytes: 0

### Product verification
- none

### Manual verification
- Check: Реальный отдельный test:provider после Yarn build с PROVIDER_TEST_TOKEN только в окружении: public account/track/album/playlist/audio variants проходят на разрешённом аккаунте. Сохранить command без token value, дату, exit code, SDK/schema version, allowlisted stage/count observations и cleanup test-only памяти. No-token SKIP и synthetic doubles не заменяют этот real API PASS; native storage/browser не используются, raw Error/DTO/key/URL/headers/credentials не сохраняются.
  - Status: PASS
  - Observed: "Реальный root script npm run --silent test:provider, env PROVIDER_TEST_TOKEN передан только дочернему процессу; exit0. Capture 2026-10-09T16:28:03.174Z. SDK @dvxch/yandex-music0.3.0, PROVIDER_SCHEMA_VERSION1.1.0. Literal allowlisted output: PROVIDER_TEST: ACCOUNT_READY schema=1.1.0 | PROVIDER_TEST: TRACK_READY | PROVIDER_TEST: ALBUM_READY tracks=11 | PROVIDER_TEST: PLAYLIST_READY tracks=33 | PROVIDER_TEST: VARIANTS_READY count=2 | PROVIDER_TEST: MEMORY_CLEANUP_PASS | PROVIDER_TEST: PASS. Один разрешённый аккаунт; track2224197/album221173/собственный playlist1000. Токен подготовлен вне suite существующим public authenticate в отдельной временной composition с CredentialStore толькоRAM; пользователь подтвердил браузерный вход. Сам suite использовал только env-token и public account/track/album/playlist/variants, без authenticate/native storage/browser. Suite MEMORY_CLEANUP_PASS и parent MEMORY_CLEANUP_PASS, оба exit0; native запись не читалась и не изменялась. Output строго отфильтрован: без raw Error/DTO/key/URL/headers/credentials; токен никуда не записан. Проверены 486 protected baseline файлов, без изменений. Synthetic Node guard tests не заменяют этот actual root script PASS; scheduled CI/новая provider runtime logic/скачивание не вводились."
<!-- VERIFICATION-EVIDENCE:END -->

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.



## Blocker / Failure reason

—
