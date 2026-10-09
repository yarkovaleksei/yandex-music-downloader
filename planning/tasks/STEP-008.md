---
schema: 1
id: STEP-008
status: completed
type: implementation
priority: critical
phase: provider
depends_on:
  - STEP-006
  - STEP-003
  - STEP-004
requirements:
  - REQ-001
  - REQ-002
  - REQ-003
  - REQ-039
adrs:
  - ADR-009
  - ADR-010
  - ADR-002
architecture_refs:
  - docs/architecture.md#external-dependencies-integrations
  - docs/architecture.md#security-boundaries
risk_flags:
  - security-sensitive
  - external-integration
plan:
  status: ready
  revision: 3
  context_basis: sha256:4c73aec3b2a7a8d7ca966137a9aaf01674e5347c94cd0eab7f5b9e201511e95e
  content_hash: sha256:ed93b5cb0a97fad4f0b66197c53e6766e3acbe10c87206ac5f67bb50a700f400
  reviewed_report: planning/plan-reviews/STEP-008/PLAN-REVIEW-20261008T214459Z.md
  planned_at: 2026-10-08T21:44:59+00:00
  execution_groups:
  context_components:
    - "ADR@ADR-002=sha256:9603d7e711e02ee4bc36d447b5397e944f34d00f15a3d773c4fec36cce4e4d17"
    - "ADR@ADR-009=sha256:49e51470b212b80dcde0694e02d07c588763070df76c37cd89d112da580beecf"
    - "ADR@ADR-010=sha256:1b537392c517e85d1b83cd757d0c2b26e88587c82e3e48c42c2802be5e33a75a"
    - "ARCH@docs/architecture.md#external-dependencies-integrations=sha256:745b40d80b739a59467e156c30b839f7fb6c0cca9f347619f6856d1757324b1c"
    - "ARCH@docs/architecture.md#security-boundaries=sha256:1fb8b1276fc829d50a70930422b9207f8e907ad24da1447e1d32ddb08a4adcbe"
    - "OQ@OQ-001=sha256:33eb64aca6df2153cd4ac1f9771be4a4b8809b420acece16151d52a922c7c399"
    - "PRN@PRN-001=sha256:3b3801f207fafc3f77272f0e93570258a6d006964839d93a276accd814d548af"
    - "PRN@PRN-002=sha256:f29ee3fbdb9cf65cf9739d0907768bbf192ad88b8e443110d4d82f81c6b79ecb"
    - "PRN@PRN-003=sha256:16516d7d302fecda5f7615f9d55e29e04b588d671f8660640e1f61d1619e4ef8"
    - "REQ@REQ-001=sha256:bc1700aedb2e43628cae048a8e61f544c0e0d7093b399cf2729420aaab626d85"
    - "REQ@REQ-002=sha256:57b2efdb8feefc31d5701a6d4be255b8905908c1704d2b7f171a1022fe6e0629"
    - "REQ@REQ-003=sha256:42d546ded1413585e1802a22330255b27299822fa66238583a5f86f6a35e3036"
    - "REQ@REQ-039=sha256:0fdeff2aa145fbee383ca4c7900eed5938d4feb9d0d91125c7bd1d6f07d83ca5"
    - "STEP@STEP-003=sha256:d44b1efab2bcb4a844c3ac708626a1569e846fb6034b4aae8b752fa91b7e7405"
    - "STEP@STEP-004=sha256:eeb3c1c0af282136ed1585f49e27773d6cf44db8d5f02d4271138dc0fafdf4e7"
    - "STEP@STEP-006=sha256:bb2b5af572d47a1a6a35977e8a14065977d4d1f6eaecc85daefcd759536c8f5f"
    - "STEP@STEP-008=sha256:b01f982e665c331131b4b89f367a59978149c2e71883cc7f8fc56040c7402a4e"
---

# STEP-008 — Provider: авторизация, аккаунт и хранилище токена CLI

## Goal

Реализовать авторизацию, получение аккаунта, обработку истёкшего токена и хранилище токена CLI по решениям ADR STEP-006.

## Context

OQ-001 определяет поддерживаемый flow; STEP зависит от resolution этого вопроса и принятых ADR.

## Scope

- Реализация `authenticate`, `getAccount` и `logout` в provider package; `logout` удаляет credentials только через `CredentialStore`.
- Хранилище токена CLI по ADR (за интерфейсом в shared; без plaintext в settings/logs/manifest).
- Нормализация ошибок авторизации в `AuthenticationError`/`AUTH_ERROR`.
- Unit-тесты на mock HTTP/библиотеку; live-проверка вручную.

## Mutation policy

### Allowed

- `packages/providers/yandex-music/**`, реализация хранилища токена в разрешённом ADR пакете, тесты.

### Conditional

- Дополнение интерфейса хранилища в `packages/shared` — минимально необходимое.

### Forbidden

- Хранение/запрос пароля, логирование токенов, прямой импорт библиотеки вне provider package, CLI-команды (STEP-019).
- Реализация future/unrelated STEP «заодно».

## Out of scope

- Desktop secure storage (STEP-030).

## Acceptance criteria

- Авторизация завершается получением аккаунта на live-прогоне (evidence); тесты на mock подтверждают маппинг ошибок.
- Токен не обнаруживается в settings/logs/manifest (автоматическая проверка).
- Истёкший токен даёт `AuthenticationError` без retry.
- `logout` удаляет токен из разрешённого хранилища и следующий `getAccount` возвращает состояние «не авторизован».
- Права хранилища токена соответствуют ADR и проверяются тестом.

## Verification

- command: `node packages/testing/scripts/run-yarn.mjs run lint`
- command: `node packages/testing/scripts/run-yarn.mjs run typecheck`
- command: `node packages/testing/scripts/run-yarn.mjs test`
- command: `python3 .harness/tools/validate.py --mode manual`
- manual: Live production provider: собственный реальный аккаунт — Device Authorization без password prompt, account после auth, logout и getAccount=null; приложить отредактированный вывод отдельного provider verification runner без токенов/challenge/private URL.
- manual: Native CredentialStore на Windows/macOS/Linux: выбранный current-user backend, write/read/delete и persistence в новом процессе с несекретным canary; удаление canary после проверки. Linux: явно Secret Service и именно default GNOME Keyring collection с непустым master password. Недоступный/locked/access denied backend безопасно отказывает без fallback. На каждой ОС приложить безопасный фактический вывод; недоступные проверки остаются pending.

## Deliverables

- Auth-часть provider, хранилище токена, тесты.

## Implementation plan

### 1. Подготовить приватные auth-схемы и проверяемый transport

- По ADR-009 сохранить @dvxch/yandex-music@0.3.0 и закрепить точную Zod 4 dependency в provider; обновить yarn.lock штатным Yarn. Не изменять shared и non-auth MusicProvider.
- Добавить OAuth/account raw schemas до Request.unwrap/deJson и schema shared Account после проекции. Проверять обязательные ID, access/token type, device/user code, HTTPS verification URI, положительные конечные interval/lifetime и optional refresh token. Новые неиспользуемые поля допустимы.
- Внутренний ClientOptions.fetch wrapper сохраняет status/тип операции и проверяет JSON до моделей; OAuth errors отдельно от success. retries: 0 для обоих Clients, без refresh/replay/debug raw output. NETWORK_ERROR, SERVICE_UNAVAILABLE, AUTH_ERROR и PROVIDER_RESPONSE_INVALID различать по ADR-009; исключения/JSON/schema issues не переносить в публичные cause/message. PROVIDER_RESPONSE_INVALID использует обязательное сообщение ADR-009; AUTH_ERROR содержит инструкцию music-downloader auth.
- Комментарии к новым границам/ошибкам писать кратко по-русски со ссылкой @link на ADR-009/010.

**Files:**
- packages/providers/yandex-music/src/auth-schemas.ts
- packages/providers/yandex-music/src/auth-transport.ts
- packages/providers/yandex-music/package.json
- yarn.lock

**Tests:**
- Mock fetch: валидные account/OAuth responses, additive fields, malformed JSON/critical fields, OAuth refusal/pending/slow_down, HTTP 401/403/429/5xx/network; проверки числа запросов retries=0.

### 2. Реализовать системный CredentialStore CLI

- В packages/persistence реализовать CredentialStore как native @napi-rs/keyring wrapper; закрепить точную совместимую 2.1 dependency после проверки опубликованного API, обновить yarn.lock. Provider не импортирует persistence.
- Service namespace music-downloader.cli.yandex-music, одна запись текущего пользователя с постоянным безопасным идентификатором без account/token. Linux явно secret-service, Windows current-user Credential Manager Enterprise по binding, macOS Login Keychain. Никаких token-файлов, shell argv, keyutils или plaintext fallback.
- read даёт null только при подтверждённом отсутствии, clear идемпотентен для отсутствия, write заменяет запись только при успешной native operation. Permission denial преобразовать в PERMISSION_DENIED, прочие unavailable/locked/corrupt — безопасный неретрайный DOWNLOAD_ERROR без raw native cause.
- Сохранить каркас package exports и существующие marker tests; добавить узкий native seam для offline mock проверок. POSIX 0600/ACL token-файла неприменимы: проверить выбранный backend и current-user границу; protected default GNOME collection проверяется при подготовке supported Linux окружения.

**Files:**
- packages/persistence/src/cli-credential-store.ts
- packages/persistence/src/index.ts
- packages/persistence/package.json
- yarn.lock

**Tests:**
- Native mocks: read/write/replace/delete/absent, permission/locked/backend unavailable, отсутствие fallback, Linux exact backend option и namespace; store не разбирает Yandex envelope.

### 3. Добавить приватный browser challenge и Device Authorization lifecycle

- Provider получает challenge через отдельный неавторизованный OAuth Client; запускает временный HTTP server только на 127.0.0.1 и открывает системный browser без передачи credentials в argv.
- Страница по непредсказуемому пути показывает только user code и официальную HTTPS verification URI (проверенный flow ya.ru по ADR-010); без access/refresh/device token, внешних ресурсов, кеширования и Referer. Неизвестные пути не раскрывают challenge; отмена через страницу. AuthInteraction.notify получает только безопасное уведомление.
- Polling использует server interval/deadline; pending продолжает flow, slow_down увеличивает интервал, denial/timeout/отмена прекращают flow с AUTH_ERROR. Завершение/ошибка/отмена закрывают server и отбрасывают challenge. Process termination закрывает ресурсы; публичный authenticate не расширяется параметрами/signal.
- При невозможности открыть browser или обслужить страницу возвращать безопасную ошибку и завершать ресурсы; не печатать fallback user code/loopback URL.

**Files:**
- packages/providers/yandex-music/src/device-authorization.ts
- packages/providers/yandex-music/src/auth-browser.ts

**Tests:**
- Mock browser/OAuth и fake clock: pending/slow_down/success/denial/timeout/cancel, resource cleanup; local HTTP check loopback/path/headers/page content.

### 4. Реализовать authenticate/getAccount/logout и приватные credentials

- Auth-реализация provider экспортирует только свои constructor зависимости CredentialStore/AuthInteraction и shared Account; non-auth методы и application/CLI wiring остаются будущим STEP. Отдельные OAuth и авторизованный API Clients создаются с корректным transport Authorization, смена client.token не используется как его обновление.
- Валидировать secret JSON envelope v1: accessToken, optional refreshToken, issuedAt Unix ms, optional expiresAt только из подтверждённого положительного expiresIn, accountId; неизвестная версия/повреждённая запись даёт безопасную неретрайную ошибку и не перезаписывается автоматически.
- authenticate после получения credentials проверяет account, пишет envelope через store, только затем возвращает Account/заменяет active state. До успешной записи сохраняет прежнюю запись, store failure не объявляет auth успешным. Повреждённая запись восстанавливается только явным logout/auth.
- getAccount читает сохранённый envelope для повторного запуска; отсутствие авторизации даёт null, expiry/revocation — AuthenticationError без retry/refresh, сеть/store не маскируются null.
- logout сначала блокирует дальнейшее использование текущих in-memory credentials/Authorization/account, затем clear; успех только после подтверждённого удаления/отсутствия. При clear failure память всё равно сброшена и операция ошибочна; после успешного logout getAccount null без HTTP/store resurrection.

**Files:**
- packages/providers/yandex-music/src/yandex-music-auth.ts
- packages/providers/yandex-music/src/auth-credentials.ts
- packages/providers/yandex-music/src/index.ts

**Tests:**
- Auth/session mocks: account before persistence, replacement/store failure, absent/restart/corrupt/version/expiry/revoked, logout success/failure; счётчики подтверждают отсутствие refresh/replay и запросов после logout.

### 5. Доказать auth/store и отсутствие секретов в пределах STEP-008

- В node packages/testing/scripts/run-yarn.mjs test включить canary credentials/challenge и захват всех observable provider/store surfaces: notify, safe errors/serialization, console/stdout/stderr и fixtures settings/logs/manifest. Подтвердить отсутствие access/refresh/device/user code и приватного URL; централизованная logger redaction принадлежит STEP-004, который должен быть завершён до IMPLEMENT STEP-008, не реализовывать его здесь. Секрет допускается только в native secret value и приватной странице user code.
- Proof obligations Semantic Blast Radius H-001/H-002 закрыть конкретными вышеописанными canary tests и request counters через exact node packages/testing/scripts/run-yarn.mjs test; до fresh PASS они остаются planned, а не утверждением безопасности.
- Подготовить отдельные provider live verification и native store probes внутри разрешённых пакетов; они не являются CLI-командами STEP-019, не сохраняют сырой HTTP/body/credentials и публикуют только безопасные status/counters. Native probe использует случайный несекретный canary, подтверждает read/write/delete и persistence в новом процессе, затем удаляет запись.
- Выполнить live authenticate/account/logout/getAccount на собственном реальном аккаунте, сохранить отредактированное evidence. Для Windows/macOS/Linux отдельно проверить native read/write/delete/current-user backend/persistence после перезапуска и отказ недоступного store без fallback; Linux supported environment — защищённая непустым master password именно default GNOME collection. Mock не заменяет platform proof; недоступная платформа/аккаунт остаются явным pending manual gate.
- Запустить обязательные lint/typecheck/unit/validate, синхронизировать projections и передать результат dispatcher; завершение implementation-like STEP требует независимого review. Не добавлять CLI, doctor, desktop storage или metadata/audio возможности.

**Files:**
- packages/providers/yandex-music/src/*.test.ts
- packages/providers/yandex-music/verification/**
- packages/persistence/src/*.test.ts
- packages/persistence/verification/**

**Tests:**
- node packages/testing/scripts/run-yarn.mjs run lint
- node packages/testing/scripts/run-yarn.mjs run typecheck
- node packages/testing/scripts/run-yarn.mjs test
- python3 .harness/tools/validate.py --mode manual

## Evidence







<!-- VERIFICATION-EVIDENCE:START -->
- Verification run: 2026-10-09T10:36:28Z
- Status: PASS
- Automated resumed: false
- Git head: 2a19e5a72693ae741adfab8bbd464e120eed7785
- Worktree hash: sha256:8beb2ee81ea65d6a539d7f564e7940af4fa72022917e4ab8609c90db6c1afec4
- Verification contract basis: sha256:3abc5961c6af17eac457cf4f83172e93a06b3b95a4bb5154cb71d235e7de821a
- Subject git head: 2a19e5a72693ae741adfab8bbd464e120eed7785
- Subject worktree hash: sha256:94952aee993945fae8b6cef2cea143eec34dd3606416212f8e080b6fe943c022

### Automated verification
- Command: node packages/testing/scripts/run-yarn.mjs run lint
  - Status: PASS
  - Exit code: 0
  - Duration ms: 4270
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: f59ba696a15507a8febe0f9ea94ac75ccc5411952df61ee4cb3c971b47b6bc12
  - stdout bytes: 0
  - stderr bytes: 25
- Command: node packages/testing/scripts/run-yarn.mjs run typecheck
  - Status: PASS
  - Exit code: 0
  - Duration ms: 1566
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: ffbfd8ec2bfcf3e8f0e99a93f081f695da2de832eba56c5ae6943a4052680411
  - stdout bytes: 0
  - stderr bytes: 30
- Command: node packages/testing/scripts/run-yarn.mjs test
  - Status: PASS
  - Exit code: 0
  - Duration ms: 3574
  - stdout sha256: 43747ceaa9d5c0ffca54cecda808df410e9bf7923c8cb8f83ecc7b86e7708a7c
  - stderr sha256: f969fafb7bc32ecc492c8343f56269c9c47161d893e83a0d8b9b27fcf57b9aee
  - stdout bytes: 3324
  - stderr bytes: 21
- Command: python3 .harness/tools/validate.py --mode manual
  - Status: PASS
  - Exit code: 0
  - Duration ms: 2266
  - stdout sha256: 396c8fc552f5c39b3b2ec0a2334966ff5c863de96432e1d6a2a17caee20a33ee
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 308
  - stderr bytes: 0

### Product verification
- none

### Manual verification
- Check: Live production provider: собственный реальный аккаунт — Device Authorization без password prompt, account после auth, logout и getAccount=null; приложить отредактированный вывод отдельного provider verification runner без токенов/challenge/private URL.
  - Status: PASS
  - Observed: "2026-10-09 после FIX F-001…F-005: владелец повторно подтвердил вход в браузере («Готово»). Production YandexMusicProviderAuth через отдельный verification runner прошёл authenticate, getAccount, logout и следующий getAccount=null; exit code 0. Literal captured stdout: LIVE_AUTH: PASS (browser-opened, authenticated, account-confirmed, logout-confirmed); LIVE_AUTH_CLEANUP: PASS. Изолированная native canary-запись удалена; токены/challenge/private URL не выводились."
- Check: Native CredentialStore на Windows/macOS/Linux: выбранный current-user backend, write/read/delete и persistence в новом процессе с несекретным canary; удаление canary после проверки. Linux: явно Secret Service и именно default GNOME Keyring collection с непустым master password. Недоступный/locked/access denied backend безопасно отказывает без fallback. На каждой ОС приложить безопасный фактический вывод; недоступные проверки остаются pending.
  - Status: PASS
  - Observed: "2026-10-09: изолированная native-store-probe.mjs (@napi-rs/keyring 2.1.0) подтверждает write/read/new-process persistence/delete, NATIVE_STORE_CANARY: PASS и NATIVE_STORE_CLEANUP: PASS на Linux Secret Service, Windows x64 VirtualBox Credential Manager Enterprise и macOS 15.7.7 build 24G720 darwin arm64 Login Keychain. Linux D-Bus default=/org/freedesktop/secrets/collection/login; владелец разблокировал непустым паролем; отдельные недоступный session bus и locked/cancelled unlock дали безопасный FAIL без fallback, отсутствие canary подтверждено, Login восстановлен. macOS read-only security default-keychain -d user подтвердил ~/Library/Keychains/login.keychain-db. Windows и macOS вывод предоставлен скриншотами пользователя; exit code Windows отдельно не показывался, не реконструирован. Evidence: .harness/local/step008-manual-20261009.txt, step008-windows-pass-20261009.json, step008-macos-probe-20261009.json. Production entries не затронуты. В FIX изменялся только provider auth; native store и SHA-256 пробы 1f2427cd579315fe8cf44586275701702a576cd3faac26c669e489b90377ef68 неизменны, платформенное evidence применимо к исправленной версии."
<!-- VERIFICATION-EVIDENCE:END -->

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.

### Наблюдения ручной проверки

- Linux: `node packages/persistence/verification/native-store-probe.mjs` завершился с exit code 0. Изолированная несекретная canary-запись успешно записана и прочитана через Secret Service текущего пользователя; новый процесс подтвердил persistence; удаление записи подтверждено отдельным `NATIVE_STORE_CLEANUP: PASS`. Production credentials не затронуты.
- Linux default collection — `/org/freedesktop/secrets/collection/login`. Скриншот и D-Bus подтвердили `Locked=true`; владелец сообщил о вводе пароля при разблокировке, после чего native persistence/cleanup прошли. Пароль не запрашивался и не сохранялся. Отдельные пробы недоступного Secret Service и заблокированного `Login` дали ожидаемый безопасный отказ без fallback; отсутствие canary-записи подтверждено. После пробы `Login` снова разблокирован владельцем.
- Native probe: `packages/persistence/verification/native-store-probe.mjs`; safe live runner и исполняемый пример composition: `packages/providers/yandex-music/verification/README.md`. После сборки импорты runner, `CliCredentialStore` и `Entry` проверены без live OAuth; наблюдался `LIVE_RUNNER_IMPORTS: PASS`.
- Live account flow выполнен 2026-10-09: владелец подтвердил вход в браузере. Safe literal output: `LIVE_AUTH: PASS (browser-opened, authenticated, account-confirmed, logout-confirmed)` и `LIVE_AUTH_CLEANUP: PASS`; exit code 0. Production provider прошёл authenticate/account/logout/getAccount=null, отдельная native canary-запись удалена. Безопасное evidence live/Linux probes: `.harness/local/step008-manual-20261009.txt`.
- Windows x64 в VirtualBox: пользователь предоставил скриншот повторной native-пробы с `NATIVE_STORE_CANARY: PASS (Credential Manager Enterprise/current-user, current-user, persistence)` и `NATIVE_STORE_CLEANUP: PASS`. Подтверждены запись/чтение, persistence в новом процессе и удаление отдельной несекретной записи; Node.js 24.21.0, Yarn 4.18.1, binding 2.1.0. Номер exit code на скриншоте отдельно не показан и не реконструировался. Safe evidence: `.harness/local/step008-windows-pass-20261009.json`.
- macOS 15.7.7 (build 24G720), Node platform `darwin arm64`: пользователь предоставил скриншоты native-пробы с `NATIVE_STORE_CANARY: PASS (Login Keychain/current-user, current-user, persistence)` и `NATIVE_STORE_CLEANUP: PASS`, а также read-only `security default-keychain -d user`, подтвердивший пользовательскую `~/Library/Keychains/login.keychain-db`. Native write/read/new-process persistence/cleanup и фактическая Login Keychain подтверждены. Evidence: `.harness/local/step008-macos-probe-20261009.json`.
- Все перечисленные manual observations передаются dispatcher. Первый независимый review зафиксирован в `planning/reviews/STEP-008/REVIEW-20261009T102024Z.md`; его findings исправлены в текущем FIX и требуют проверки закрытия.







## Blocker / Failure reason

—

### Исправления первого review

- F-001: private `auth-errors.ts` и raw/post-mapping branches возвращают обязательное сообщение ADR-009; public `getAccount` regression проверяет сообщение, код, отсутствие retry и один запрос.
- F-002: schema/serializer используют `schemaVersion: 1` по ADR-010; тесты проверяют чтение после restart и фактическую запись при авторизации.
- F-003: initial `/device/code` HTTP 400 с валидным OAuth отказом преобразуется в `AuthenticationError`; public tests проверяют `access_denied`/`invalid_client`, отсутствие открытия браузера/записи/retry.
- F-004: signal отмены передаётся account request и проверяется перед записью credentials. Regression с реальным private HTTP cancel проверяет abort, `AUTH_ERROR`, отсутствие записи, сохранение прежней записи и закрытие сервера.
- F-005: canary test проверяет фактические notify/account/console/stdout/stderr; пустые literals будущих settings/logs/manifest удалены. Реализация этих будущих артефактов не входит в STEP-008.
- Нативное хранилище и `native-store-probe.mjs` в FIX не менялись; evidence Linux/Windows/macOS применимо к тем же байтам пробы и backend.
