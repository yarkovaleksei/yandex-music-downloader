---
schema: 1
id: STEP-010
status: completed
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
  - ADR-009
  - ADR-002
architecture_refs:
  - docs/architecture.md#external-dependencies-integrations
  - docs/architecture.md#security-boundaries
risk_flags:
  - external-integration
  - security-sensitive
plan:
  status: ready
  revision: 1
  context_basis: sha256:611f0170ff01db9a568fafc8ac50bfe5b1a8581d1d6af7ddd7819f5ea24c6014
  content_hash: sha256:08d7b7755b723436b9c5947d91c5ca5a9159e1a07823be93dca6d02867e93848
  reviewed_report: planning/plan-reviews/STEP-010/PLAN-REVIEW-20261009T144222Z.md
  planned_at: 2026-10-09T14:42:22+00:00
  execution_groups:
  context_components:
    - "ADR@ADR-002=sha256:9603d7e711e02ee4bc36d447b5397e944f34d00f15a3d773c4fec36cce4e4d17"
    - "ADR@ADR-009=sha256:49e51470b212b80dcde0694e02d07c588763070df76c37cd89d112da580beecf"
    - "ARCH@docs/architecture.md#external-dependencies-integrations=sha256:745b40d80b739a59467e156c30b839f7fb6c0cca9f347619f6856d1757324b1c"
    - "ARCH@docs/architecture.md#security-boundaries=sha256:1fb8b1276fc829d50a70930422b9207f8e907ad24da1447e1d32ddb08a4adcbe"
    - "OQ@OQ-002=sha256:34d9adc4ff319cabf941aba6007a69ba6893fcf5783e9d66e89e7a73f0de2f15"
    - "OQ@OQ-003=sha256:9d973d7742793d41fd1aecef480167ef376a972239da9ebef18c379bfaaccadc"
    - "OQ@OQ-008=sha256:bfa600a6600b7218fb6781fbe360e1b25ed1813aadb67d00a61e24a391e565cb"
    - "OQ@OQ-012=sha256:e45e0c4002305f92d43591fa4b154c4707f104e6792a0979516f6b0c7f97f79b"
    - "PRN@PRN-001=sha256:3b3801f207fafc3f77272f0e93570258a6d006964839d93a276accd814d548af"
    - "PRN@PRN-002=sha256:f29ee3fbdb9cf65cf9739d0907768bbf192ad88b8e443110d4d82f81c6b79ecb"
    - "PRN@PRN-003=sha256:16516d7d302fecda5f7615f9d55e29e04b588d671f8660640e1f61d1619e4ef8"
    - "REQ@REQ-010=sha256:a96fbb30edd4e2f555b44a8a004c87ab49ece4d85692ebfad940cbc877c4e25a"
    - "REQ@REQ-015=sha256:154edca0807abb77d56c39b6e708659307f97ac6e851e0c33869c6d4c9b6ba59"
    - "REQ@REQ-038=sha256:c3c9386d5726e32dd3eb46f00ea755a04f169db0a69c2c7b487c37a9601a507c"
    - "STEP@STEP-005=sha256:cb280369edd87e0a4560c9e2d78ddba902bebde1a9c1d20699cf193946b6838c"
    - "STEP@STEP-009=sha256:eb191ddce635810bb63fbeddbdf905bc7796ff7a6e9fe3ccf0055393c7ca3cc3"
    - "STEP@STEP-010=sha256:1eb515d6ef292780d49f1e4efa84b434681e0845b9c451bae6f16ccfb03a0ee2"
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

- command: `node packages/testing/scripts/run-yarn.mjs run lint`
- command: `node packages/testing/scripts/run-yarn.mjs run typecheck`
- command: `node packages/testing/scripts/run-yarn.mjs test`
- command: `node packages/testing/scripts/run-yarn.mjs build`
- command: `python3 .harness/tools/validate.py --mode manual`
- manual: Live authored audio: один авторизованный аккаунт/один доступный full трек; getAudioVariants и openAudioStream через public provider/SDK/raw validation, полный plaintext поток до EOF без записи аудио на диск. Safe command/exit/codec/container/bitrate-or-absence/lossless/byte counts/contentLength/schema observations, actual nonzero Range либо full-start fallback, cleanup/restoration credentials. Modern encraw live только при реально reported preview=false; иначе exclusion и synthetic-only proof указаны явно. Без токенов, headers, URL, ключей или unredacted body в evidence; synthetic tests не заменяют live EOF.
- manual: Scoped handoff и H-001/H-002 traceability: product delta только provider, shared MusicProvider/auth lifecycle/resolver/metadata и dependencies/unrelated baseline сохранены. Fresh offline tests доказывают raw preview/current-account gating, same snapshot, stable variantKey restart/exact descriptor, external XML/CDN без OAuth, safe errors/no secrets/no hidden retry; byte-exact Range/fallback/contentLength, cancellation и разрешённый synthetic encraw plaintext. PROVIDER_SCHEMA_VERSION minor 1.1.0, public API только shared/own types. Historical live evidence сохранён; quality policy/core retry/manifest/CLI/cache/doctor и повторная native qualification вне scope.

## Deliverables

- Audio-часть provider, тесты.

## Implementation plan

### 1. Добавить audio methods в текущую credential-owning facade

- Реализовать getAudioVariants/openAudioStream в YandexMusicProviderAuth/YandexMusicProvider и подтвердить полный shared MusicProvider через TypeScript. По ADR-002/009 shared, auth policy, CredentialStore и зависимости не менять.
- Каждая audio операция один раз читает private credentials и использует один operation-local snapshot для track availability, download-info/XML и открытия CDN; не присваивает active при завершении. Reuse raw-before-SDK helpers приватно, без token getter/SDK callback в public API.
- Расширить own AuthFetchResponse только optional body: ReadableStream<Uint8Array>|null для streaming injection; existing auth/metadata fake fetch остаются совместимыми. JSON API получает OAuth, внешний XML/CDN использует отдельный transport с безопасными headers, без Authorization/cookies/SDK client headers.
- openAudioStream принимает shared signal/offset; отказ для loggedOut/expired credentials предшествует network, без автоматического refresh/replay.

**Files:**
- packages/providers/yandex-music/src/yandex-music-auth.ts
- packages/providers/yandex-music/src/auth-transport.ts
- packages/providers/yandex-music/src/index.ts
- packages/providers/yandex-music/src/audio/

**Tests:**
- Public structural MusicProvider assignment, existing auth/metadata/resolver suite; H-001: единый snapshot credentials на всех API steps и внешние requests без OAuth.

**Risks:**
- Существующие SDK retrieve/streamToFileFromUrls нельзя применять для аудиобайтов: они буферизуют/пишут файлы/повторяют операции.

### 2. Валидировать доступность и маппить только разрешённые audio variants

- По ADR-009 валидировать исходные legacy download-info и modern result.downloadInfo до SDK deJson: типы codec/bitrate/preview/downloadInfoUrl/direct, transport/urls/key/isLossless и используемых optional полей. Additive unused поля допускаются; critical malformed shape даёт safe PROVIDER_RESPONSE_INVALID; explicit API_CHANGED сохраняется без invented vendor marker.
- Перед audio выдачей и перед каждым open подтвердить track identity и available=true в том же snapshot. Explicit denial/unknown не разрешают загрузку. preview=true или отсутствующий preview исключают кандидат; неверный присутствующий boolean — schema error. Modern raw preview проверяется до модели, которая его теряет.
- Использовать pinned SDK tracksDownloadInfo(...,false) и tracksLosslessInfo(...,lossless); request quality является API selector, а не гарантией FLAC или пользовательской политикой high/normal. Маппить фактические codec/bitrate/lossless/container из проверенных полей, с явной таблицей поддерживаемых codec/container; unknown codec/transport не выдавать как известный.
- Legacy MP3 -> mp3 подтверждён STEP-005; flac -> flac и aac-mp4/flac-mp4 -> m4a проверяются synthetic plaintext signatures в RUN. Несогласованность codec/isLossless не повышает lossy до lossless; bitrate 0 у FLAC не публикуется как измеренный bitrate (optional bitrate отсутствует). Пустой список eligible допустим; core owner выбирает QualityUnavailable при policy, open отсутствующего точного варианта даёт QualityUnavailableError.
- Для признанных modern encraw обязательны raw preview=false и валидный выданный API ключ. Unknown preview не требует новых live попыток и не считается blocker для full legacy MP3. Полный список/проекция AudioVariant дополнительно runtime-валидируются.

**Files:**
- packages/providers/yandex-music/src/audio/schemas.ts
- packages/providers/yandex-music/src/audio/variants.ts
- packages/providers/yandex-music/src/audio/transport.ts

**Tests:**
- H-001 raw-before-deJson spy; legacy MP3/modern AAC fallback/FLAC, omitted optional bitrate, no subscription constants, malformed critical/additive unused, denied/unknown/preview/missing preview/unknown transport.

**Risks:**
- Modern preview=false не наблюдался в STEP-005; encrypted/modern support нельзя заявить live только по synthetic tests. OQ-011 и quality ranking остаются core STEP-013.

### 3. Закрепить secret-free variant identity и свежую выдачу ссылок

- Ввести внутренний versioned deterministic opaque variantKey из descriptor trackId/source/API-selector/codec/bitrate-or-absence/lossless/container/transport. Не включать URL, XML signature, ключ, token, ordinal или session-local registry; stable key сохраняется при перестановке API списка и новом экземпляре provider.
- При open декодировать/валидировать key и принадлежность trackId, повторно получить текущую availability и полный eligible descriptor; сравнить все доменные поля, включая lossless и отсутствие bitrate. Отсутствующий либо изменившийся вариант — QualityUnavailableError без снижения качества.
- Получать DownloadInfo/LosslessDownloadInfo заново при каждом open; old model/directLink не кешировать между открытиями. Legacy getDirectLink остаётся SDK signer, но wrapper предварительно валидирует UTF-8 XML используемых host/path/ts/s и URL и replay-ит те же bytes без дополнительного запроса; modern URLs/key только в локальной памяти операции.
- API URL/endpoint строится provider, XML/CDN HTTPS URLs проверяются по используемой структуре; SDK forwarded OAuth удаляется именно на внешнем transport boundary. Один выбранный URL, без mirror race, automatic fallback или скрытого повторного открытия.

**Files:**
- packages/providers/yandex-music/src/audio/variant-key.ts
- packages/providers/yandex-music/src/audio/links.ts
- packages/providers/yandex-music/src/audio/transport.ts

**Tests:**
- H-001: сохранённый ключ открывается на новом provider экземпляре через тот же shared interface, reordered list/новые URL/key не меняют identity; другой track/codec/bitrate/lossless/container не открывается. XML проверяется до SDK signer; counts подтверждают отсутствие повторов/mirrors.

**Risks:**
- Непрозрачный key — идентификатор варианта, не обещание универсального TTL или содержание секретов.

### 4. Открывать ленивый поток и сообщать фактические Range capabilities

- CDN fetch возвращает ReadableStream без arrayBuffer полного аудио и записи на диск. Bounded prefix для проверки plaintext container сохраняется и воспроизводится перед остальными bytes; backpressure, EOF и midstream network failure передаются безопасно.
- Для raw offset использовать один Range bytes=offset- и проверить статус/Content-Range/Content-Length с конечными safe integer значениями. Coherent single-part 206 возвращает фактический requested startOffset и acceptsRanges=true; contentLength — полный размер из Content-Range, не длина suffix. Unknown full size остаётся undefined.
- 200 при игнорировании Range возвращает полный поток startOffset=0/acceptsRanges=false без второго запроса. Неверный/несогласованный 206, unexpected multipart или 416 — безопасный отказ с отменой body, а не фиктивный resume; отрицательный/нецелый offset отклоняется до запросов. Accept-Ranges header сам по себе не доказывает успешный resume. Эти проверки согласованы с RFC 9110 §§14.4/15.3.7 (https://www.rfc-editor.org/rfc/rfc9110.html#section-14.4).
- Для допущенного encraw использовать public SDK encrawDecipher и ограниченный streaming bridge Node/Web: наружу только plaintext. Не реализовывать непроверенный CTR seek: при offset запрашивается полный поток с нуля, acceptsRanges=false/startOffset=0. Key заново из API, не public state.
- AbortSignal действует до заголовков и во время чтения; reader.cancel прерывает upstream. EOF/error/cancel освобождают reader/listeners/decryption state. Caller abort сохраняет семантику AbortError, transport timeout/network failure классифицируется отдельно; cleanup не делает повторов.

**Files:**
- packages/providers/yandex-music/src/audio/stream.ts
- packages/providers/yandex-music/src/audio/container.ts
- packages/providers/yandex-music/src/audio/encraw.ts

**Tests:**
- H-002: byte-exact suffix при ненулевом offset, 200 ignored Range full bytes, malformed/mismatched 206/416 и total length; cancel до headers/после prefix/во время чтения, reader.cancel, EOF/partial network error/backpressure без whole-file buffering.
- H-002: synthetic API-authorized preview=false encraw с эфемерным test key даёт точные plaintext bytes/container; encrypted offset возвращает full-start fallback. Unknown/denied variants не доходят до CDN.

**Risks:**
- Полный resume encraw не заявляется. Исходное evidence Range относится только к prefix MP3; ненулевой Range и authored cancel доказываются RUN tests/live observations.

### 5. Нормализовать contextual stream errors и исключить секреты из диагностики

- Классифицировать API auth refusal/known credential expiry как AUTH_ERROR; malformed critical JSON/XML/domain shape как PROVIDER_RESPONSE_INVALID с обязательным сообщением ADR-009; network и 429/5xx — NETWORK_ERROR/SERVICE_UNAVAILABLE. No hidden retry.
- STREAM_EXPIRED применим к отказу ранее выданной signed CDN-ссылки только при подтверждённом current-account разрешённом полном том же варианте. Один HTTP 401/403 вне этого endpoint/availability context не считается ни auth, ни expiry: unknown CDN refusal остаётся safe DownloadError. Не объявлять любой 401 истечением или устанавливать fixed TTL; новое open принадлежит core retry budget (REQ-015, future STEP-017).
- Не передавать library message/cause/raw body/URL/key в public Error, logger/events или fixture capture; safe codes/messages и allowlisted observations. Existing redactor не гарантирует удаления signed signature из URL path, поэтому полный URL вовсе не поступает в logs. Проверить сериализацию/inspection ошибок и captured output на synthetic secrets.
- Совместимое дополнение audio/XML schemas требует minor PROVIDER_SCHEMA_VERSION=1.1.0 по ADR-009; адаптировать актуальные provider version checks, сохранить исторические live literals/provenance STEP-009 с версией capture 1.0.0. Doctor/live suite CLI tooling вне scope.

**Files:**
- packages/providers/yandex-music/src/audio/errors.ts
- packages/providers/yandex-music/src/audio/audio.test.ts
- packages/providers/yandex-music/src/audio/stream.test.ts
- packages/providers/yandex-music/src/audio/fixtures/
- packages/providers/yandex-music/src/index.ts
- packages/providers/yandex-music/src/metadata/metadata.test.ts

**Tests:**
- H-001: synthetic signature/key отсутствуют в variantKey, errors/JSON/cause/log capture и persisted fixture fields; OAuth отсутствует в XML/CDN requests.
- Contextual STREAM_EXPIRED vs API AUTH_ERROR vs unknown CDN DownloadError; service/network/schema errors and exact request counts. Existing suites сохраняют metadata/auth boundaries.

**Risks:**
- Generic normalizeDomainError(status401/403) для CDN не используется. Реальные URL/key/credentials в fixtures запрещены; synthetic runtime данные отмечаются явно.

### 6. Выполнить ограниченный live proof и зафиксировать handoff

- Добавить provider verification/live-audio-runner.mjs по существующему private-auth runner: один доступный аккаунт/один подтверждённый полный трек, получить variants authored facade и прочитать выбранный full stream до EOF без записи аудио на диск. При необходимости user подтверждает вход; original native credential сохраняется только в RAM и восстанавливается/temporary session очищается в finally.
- Safe capture: command/exit/status/counts, selected codec/container/bitrate-or-absence/lossless/schema version, actual bytes/contentLength/Range observations и cleanup. Raw URL/key/headers/body не логировать и не сохранять; fixtures с allowlisted redacted fields и provenance/synthetic substitutions.
- Если доступен raw variant с Range, отдельный bounded ненулевой Range check сравнивает небольшой suffix с прочитанными bytes; 200 fallback фиксируется фактически. Modern live encraw проверять только при реальном raw preview=false; иначе зафиксировать исключение и synthetic-only coverage без дополнительных login циклов/поиска аккаунтов.
- Зафиксировать H-001/H-002 runtime proof в canonical Verification и scoped/manual evidence, сохранить hashes исходного product baseline. Quality resolver/retries/manifest/CLI/cache/doctor/native-platform verification остаются future owners; no shared/dependency/logging changes.

**Files:**
- packages/providers/yandex-music/verification/live-audio-runner.mjs
- packages/providers/yandex-music/verification/README.md
- planning/tasks/STEP-010.md

**Tests:**
- Fresh offline lint/typecheck/test/build и Harness validation; manual authored live full EOF, count/container/Range observations и credential cleanup.

**Risks:**
- Live scope один аккаунт/трек; отсутствие допустимого modern preview не разрешает ослабить gate. Недоступный live account остаётся pending Verification, не synthetic PASS.

## Evidence





<!-- VERIFICATION-EVIDENCE:START -->
- Verification run: 2026-10-09T15:50:42Z
- Status: PASS
- Automated resumed: false
- Git head: 2a19e5a72693ae741adfab8bbd464e120eed7785
- Worktree hash: sha256:d6fc54ce25488f275e8d525947077c39c9999c0642c3dd63f021edcb3e8120a1
- Verification contract basis: sha256:d8704261fb8ca13985c79fe84c3ac4ce4a48dc0863ea2243c6cc9f615a27d38e
- Subject git head: 2a19e5a72693ae741adfab8bbd464e120eed7785
- Subject worktree hash: sha256:334fe47bb619b90643604ff40ccfd499826261df6337aee6696e5d8e3cad8a30

### Automated verification
- Command: node packages/testing/scripts/run-yarn.mjs run lint
  - Status: PASS
  - Exit code: 0
  - Duration ms: 5071
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
  - Duration ms: 3722
  - stdout sha256: 516b1dc95e12061092cba51e0c8384f382bd94f0a0c92c1eac46f5a1f04e98c1
  - stderr sha256: f969fafb7bc32ecc492c8343f56269c9c47161d893e83a0d8b9b27fcf57b9aee
  - stdout bytes: 3853
  - stderr bytes: 21
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
  - Duration ms: 2517
  - stdout sha256: 396c8fc552f5c39b3b2ec0a2334966ff5c863de96432e1d6a2a17caee20a33ee
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 308
  - stderr bytes: 0

### Product verification
- none

### Manual verification
- Check: Live authored audio: один авторизованный аккаунт/один доступный full трек; getAudioVariants и openAudioStream через public provider/SDK/raw validation, полный plaintext поток до EOF без записи аудио на диск. Safe command/exit/codec/container/bitrate-or-absence/lossless/byte counts/contentLength/schema observations, actual nonzero Range либо full-start fallback, cleanup/restoration credentials. Modern encraw live только при реально reported preview=false; иначе exclusion и synthetic-only proof указаны явно. Без токенов, headers, URL, ключей или unredacted body в evidence; synthetic tests не заменяют live EOF.
  - Status: PASS
  - Observed: "Финальный child command node .harness/local/step010-live-composition.mjs exit0 внутри управляющей Node composition/CliCredentialStore DI. Captured FULL_EOF_PASS(bytes5650599,contentLength5650599,containermp3), RANGE_SAMPLE_PASS(acceptsRangestrue,startOffset8,matchedBytes56), MODERN_PREVIEW_OBSERVATION(not-confirmed-full), PASS(schema1.1.0), parent CLEANUP_PASS и exit0. Один собственный account/track, MP3 192kbps losslessfalse, два eligiblelegacyvariants. Actual HTTP308->200 и308->206, XMLfieldpresence true без raw значений. Modern previewunknown исключён, encraw live не заявлен. Literal output/команда/ограничения README, safe provenance audio-live-observations.json. Native originalbackup толькоRAM; временнаясессия native сохранена между probechildruns и finallyочищена. Последующее lint исправление затронуло только equivalent ASCII diagnostic predicate, production paths не менялись. После FIX F-001 наблюдение остаётся captured live evidence до исправления; повторного live запуска не было. Exact FIX patch меняет только best-effort cleanup/error ветки checkedStream; prefix/Range/EOF и все API/signing paths неизменны. Fresh offline suite 23 tests включает исправленный failure path; исходный live EOF не заменён synthetic proof."
- Check: Scoped handoff и H-001/H-002 traceability: product delta только provider, shared MusicProvider/auth lifecycle/resolver/metadata и dependencies/unrelated baseline сохранены. Fresh offline tests доказывают raw preview/current-account gating, same snapshot, stable variantKey restart/exact descriptor, external XML/CDN без OAuth, safe errors/no secrets/no hidden retry; byte-exact Range/fallback/contentLength, cancellation и разрешённый synthetic encraw plaintext. PROVIDER_SCHEMA_VERSION minor 1.1.0, public API только shared/own types. Historical live evidence сохранён; quality policy/core retry/manifest/CLI/cache/doctor и повторная native qualification вне scope.
  - Status: PASS
  - Observed: "Scope delta только provider source/tests/verification плюс STEP010 Evidence/projections. SHA256105 protectedfiles outsideprovider unchanged; root/providerpackage/lockfile unchanged. Public AudioVariant/AudioStream/ownAuthFetch без SDK types/token getter; auth/browser/resolver/sharedcontracts preserved, currentmetadata versionassert адаптирован к1.1.0 historicalcapture1.0.0 сохранён. H1/H2 publicrealSDK/offline tests: strictrawpreview/availability, snapshots/keyrestart/exactdescriptor, externalXMLCDNnoOAuth, safe serialization/causes/logs, typedHTTP/nohiddenretry; streamsbyteexactRange/fallback/fullsizeunknown, cancel/EOFcleanup, syntheticencraw. Real HTTPredirect established private onehopHTTPS/noauth/sameRangeSignal; architectPASS existingADR. Tests/realprovenance не сохраняют realcredentials/privateURL/key/аудиобайты; negativecases synthetic. Future corequality/retries/manifest/cache/CLI/doctor/nativeplatformqualification отсутствуют. FIX F-001 ограничен stream.ts/audio.test.ts: safe midstream NETWORK_ERROR и reader release подтверждены новым public native-body regression, 23 audio tests PASS. SHA256 105 protected files снова совпали. Полный canonical Verification после FIX: все пять commands PASS."
<!-- VERIFICATION-EVIDENCE:END -->

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.

### Фактический audio handoff

- Provider facade реализует `getAudioVariants`/`openAudioStream` на одном private credential snapshot: availability/raw preview проверяются до SDK, key содержит только полный descriptor, каждое open получает новый link/key. Schema version `1.1.0`, shared/dependencies не менялись.
- Auth JSON разрешён только для HTTPS API origin и известных endpoint paths; link XML независимо от hostname и CDN не получают SDK OAuth. Raw errors нормализуются до SDK; XML-signing и encraw decipher остаются SDK helpers, файл/whole-audio buffering/mirror retries не используются.
- Public/stream offline tests покрывают mapping/preview/raw malformed, stable key на новом provider и изменённый descriptor, safe errors, actual Range suffix/unknown full size, split prefix/AbortSignal/EOF cleanup и synthetic encraw. Подтверждённые transport defects исправлены в IMPLEMENT; они не являются новым architecture contract.
- Финальный live Node composition: exit `0`, MP3 192 kbps, full EOF `5650599` bytes и такой же `contentLength`; Range offset `8`, byte-exact sample `56` bytes. Один HTTPS redirect `308` до `200`/`206`; отдельный architect pass подтвердил HTTP relocation в принятом private transport. Native session cleanup — PASS, parent exit `0`. Safe literal output и ограничения — `packages/providers/yandex-music/verification/README.md`, allowlisted provenance — `audio-live-observations.json` там же.
- Modern raw preview остался unknown, поэтому full modern/encraw live поток не открывался; decryption proof — явно synthetic. Предыдущие неуспешные live попытки не считаются PASS. Source/config baseline: 105 файлов вне provider без изменений; auth/browser/resolver, зависимости и historical STEP-009 capture сохранены. Quality policy/core retry/manifest/cache/CLI/doctor и platform native qualification вне scope.


### Исправление по независимому review

- `F-001` из `planning/reviews/STEP-010/REVIEW-20261009T154741Z.md`: отказ `reader.cancel()` после разрыва upstream больше не прерывает безопасную классификацию ошибки. Cleanup перехватывает собственный отказ и гарантирует освобождение reader; наружу выходит retryable `NETWORK_ERROR` без исходного message/cause.
- Добавлен один regression через public provider: native body выдаёт валидный MP3 prefix и затем ошибку; assertions проверяют доменный код, отсутствие raw cause и освобождение lock. Целевой audio suite — 23 tests PASS.
- FIX затрагивает только `src/audio/stream.ts` и `src/audio/audio.test.ts` внутри provider. Live EOF/Range остаются захваченными наблюдениями до FIX; успешный путь чтения не изменён, изменён только cleanup. Новый live прогон не заявляется.



## Blocker / Failure reason

—
