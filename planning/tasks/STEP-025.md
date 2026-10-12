---
schema: 1
id: STEP-025
status: completed
type: hardening
priority: high
phase: hardening
depends_on:
  - STEP-019
  - STEP-009
  - STEP-023
  - STEP-006
requirements:
  - REQ-034
  - REQ-007
  - REQ-002
  - REQ-016
  - REQ-029
  - REQ-031
adrs:
  - ADR-009
  - ADR-010
  - ADR-002
  - ADR-007
architecture_refs:
  - docs/architecture.md#reliability-observability
  - docs/architecture.md#external-dependencies-integrations
risk_flags:
  - external-integration
plan:
  status: ready
  revision: 1
  context_basis: sha256:cbdab26ad5c47f5d04e8b8bb0e45072d5c8ce69e13cf24b2e72d895948f8105a
  content_hash: sha256:b8ea1c90b142b57425ba267e01b46915ea1ae98d282cb69824f314b276420e9b
  reviewed_report: planning/plan-reviews/STEP-025/PLAN-REVIEW-20261012T075626Z.md
  planned_at: 2026-10-12T07:56:26+00:00
  execution_groups:
  context_components:
    - "ADR@ADR-002=sha256:9603d7e711e02ee4bc36d447b5397e944f34d00f15a3d773c4fec36cce4e4d17"
    - "ADR@ADR-007=sha256:04d6b08c651797508a14cb298d43f539d5364b851981d6d9064800f288b6b42c"
    - "ADR@ADR-009=sha256:49e51470b212b80dcde0694e02d07c588763070df76c37cd89d112da580beecf"
    - "ADR@ADR-010=sha256:1b537392c517e85d1b83cd757d0c2b26e88587c82e3e48c42c2802be5e33a75a"
    - "ARCH@docs/architecture.md#external-dependencies-integrations=sha256:745b40d80b739a59467e156c30b839f7fb6c0cca9f347619f6856d1757324b1c"
    - "ARCH@docs/architecture.md#reliability-observability=sha256:a9c337102c2ed62fdaca7173e8e2c05ffe6d68a1d99140fe986a552b3cc636d4"
    - "OQ@OQ-007=sha256:8149a769a326311380fff629178d7e3bc7c6580428911fd457b98dfc4fbbd592"
    - "PRN@PRN-001=sha256:3b3801f207fafc3f77272f0e93570258a6d006964839d93a276accd814d548af"
    - "PRN@PRN-002=sha256:f29ee3fbdb9cf65cf9739d0907768bbf192ad88b8e443110d4d82f81c6b79ecb"
    - "PRN@PRN-003=sha256:16516d7d302fecda5f7615f9d55e29e04b588d671f8660640e1f61d1619e4ef8"
    - "REQ@REQ-002=sha256:57b2efdb8feefc31d5701a6d4be255b8905908c1704d2b7f171a1022fe6e0629"
    - "REQ@REQ-007=sha256:6ecccc57a941d7a16855333f973f4fc2e9d3184e121a3f643f96d78d22ccaa74"
    - "REQ@REQ-016=sha256:8c9328e7124607f8d857913ec6b4d446c9aa533d81ff65fd005e84e1d741567e"
    - "REQ@REQ-029=sha256:91fdcfde9528026cacf957648d67f4b4600ce76f11c66590e1452aeff5a95485"
    - "REQ@REQ-031=sha256:80a8f3757da8dcef57f9f1ba5d17758363e06a91cc4b03c1d54b42b30a24fa74"
    - "REQ@REQ-034=sha256:255ce0d0ae37b69e759dcd38141dc5c0101a874bc60e245d3850d216537feab6"
    - "STEP@STEP-006=sha256:bb2b5af572d47a1a6a35977e8a14065977d4d1f6eaecc85daefcd759536c8f5f"
    - "STEP@STEP-009=sha256:eb191ddce635810bb63fbeddbdf905bc7796ff7a6e9fe3ccf0055393c7ca3cc3"
    - "STEP@STEP-019=sha256:48362e7f320bf7ef42460a0cb146b241e6eab5996d3ff8f29a69ec1360eb3a55"
    - "STEP@STEP-023=sha256:ad2af19f30b86b848e544b51df1cf514bf763224978a8c2c18f1ec40a1c141f2"
    - "STEP@STEP-025=sha256:f09d4349938a66bdbde443073816eee34efaa175d7bb784ecf423c1f37dbefc7"
---

# STEP-025 — Doctor и provider health

## Goal

Реализовать команду `doctor` и сквозную диагностику provider health, различающую несовместимость API и сетевые ошибки.

## Context

Doctor — критерий перехода к UI (brief §48); использует решения ADR по drift detection (OQ-007).

## Scope

- Проверки runtime, provider, auth, account, metadata, variants, filesystem, FFmpeg (optional), состояние хранилища.
- Отдельный статус «API changed».
- Вывод в человекочитаемом и `--json` формате.
- Права токена-файла и каталога вывода.

## Mutation policy

### Allowed

- `apps/cli/**` (doctor), `packages/application/**` (diagnostics API), `packages/providers/yandex-music/**` (health probes), тесты.

### Conditional

- Нет.

### Forbidden

- Изменение контракта MusicProvider без ADR.
- Реализация future/unrelated STEP «заодно».

## Out of scope

- UI Diagnostics (STEP-032).

## Acceptance criteria

- На mock provider каждая проверка управляемо даёт OK/FAIL, а exit code соответствует результату.
- Структурно изменённый ответ даёт статус «API changed», отличный от сетевой ошибки.
- Отсутствие FFmpeg — optional и не даёт ненулевого кода.
- `PROVIDER_SCHEMA_VERSION` выводится в doctor.

## Verification

- command: `npm run lint`
- command: `npm run typecheck`
- command: `npm test`
- command: `python3 .harness/tools/validate.py --mode manual`
- manual: Запустить собранный doctor и doctor --json на реальном окружении; записать статусы всех проверок, PROVIDER_SCHEMA_VERSION и фактический exit code, без секретов.

## Deliverables

- Doctor, diagnostics API, тесты.

## Implementation plan

### 1. Безопасные provider probes и runtime-отчёт application

- Оставить MusicProvider и shared DTO без изменений; определить application-owned статусы/checks внутри существующего DiagnosticsDto.configuration и safe schemaVersion. Обязательный FAIL или зависимый skipped делает available=false; optional FFmpeg и неприменимые token permissions не блокируют успех.
- Добавить provider-only read probe credentials с parseCredentials: available/absent/corrupt/access-denied/unavailable и expiry; не раскрывать secrets/accountId/raw native messages, не write/clear/refresh/authenticate. Native lock reason не угадывать; факт подтверждения secure configuration не выводить как установленный по одному успешному read.
- В application выполнить runtime Node >=22.13.0 <25, native storage/auth, getAccount для provider/account, getTrack/getAudioVariants для canary 2224197 из provider fixtures, manifestStore.list и filesystem probe. Изолировать отказы, выводить код нормализованной ошибки и API changed для API_CHANGED/PROVIDER_RESPONSE_INVALID; отличать NETWORK_ERROR/SERVICE_UNAVAILABLE/AUTH_ERROR.
- Добавить runtime host hooks для управляемых тестов и output directory; дефолт canary/schema version задаёт composition root, vendor details не уходят в CLI. Нет stream download, job/lease/recovery mutations; проверка filesystem создаёт и удаляет только свой временный файл/каталог, путь и errno message не экспортируются. FFmpeg через bounded execFile -version без shell, его отсутствие optional.

**Files:**
- packages/application/src/diagnostics.ts
- packages/application/src/diagnostic-runtime.ts
- packages/application/src/composition-root.ts
- packages/application/src/runtime-adapters.ts
- packages/application/src/contracts.ts
- packages/providers/yandex-music/src/health.ts
- packages/providers/yandex-music/src/index.ts

**Tests:**
- Управляемые OK/FAIL каждого обязательного check; optional absent FFmpeg; skipped dependencies; permissions not-applicable для native keyring.

**Risks:**
- Native CredentialStore уже скрывает lock reason: показывать безопасный unavailable, без предположений. Наличие canary не гарантирует доступность всем аккаунтам: TRACK_UNAVAILABLE сохраняется как отдельный отказ, не API drift.

### 2. Команда doctor и согласованный CLI-вывод

- Добавить doctor в parser/help и executeCommand → api.diagnostics(); разрешить только необходимую --output для doctor и существующий --json. Конфигурация output: flags → env → settings → Music, передать application через runtime host options.
- Человекочитаемо показать каждый check, optional/not installed, API changed и PROVIDER_SCHEMA_VERSION; --json публикует ровно один existing application CommandResult, без событий/logs в stdout. available=false даёт exit3; true exit0. Cleanup сохраняет существующую политику ошибок.
- Обновить README CLI/application/provider health в пределах Mutation policy с командами и ограничениями native permissions/configuration, canary и real doctor.

**Files:**
- apps/cli/src/arguments.ts
- apps/cli/src/configuration.ts
- apps/cli/src/runner.ts
- apps/cli/src/commands.ts
- apps/cli/src/output.ts
- apps/cli/src/exit-code.ts
- apps/cli/README.md
- packages/application/README.md

**Tests:**
- Parser/configuration doctor output; mock runner single CliRecord и exit0/3; help/bin smoke doctor вместо прежнего usage ожидания.

### 3. Доказательства Acceptance и обязательств blast radius

- Через npm test доказать H-001: настоящие provider raw schema malformed vs thrown network доходят до application doctor/CLI отдельными безопасными статусами и exit3, additive raw fields проходят.
- Через npm test доказать H-002: отчёт/логи/CLI не содержат тестовых credentials/accountId/native exception/signed URL, probes не write/clear/authenticate/openAudioStream; runtime storage corruption/permission/no credentials не маскируются.
- Запустить lint/typecheck/full tests/validate, затем собранный doctor --json и human на реальном окружении без изменения credentials; сохранить summary check statuses/schema version/exit, результат FAIL конкретного окружения не подменять PASS.

**Tests:**
- Application diagnostics unit/integration; CLI runner/bin smoke; provider credential health tests.

## Evidence



<!-- VERIFICATION-EVIDENCE:START -->
- Verification run: 2026-10-12T08:16:46Z
- Status: PASS
- Automated resumed: false
- Git head: 3a740e4d11bcb846fb0929510657a12724d1f6cd
- Worktree hash: sha256:b0fddcddbb3321addb2b3d791d91bab0ea0e7e196ad939139fc4511f18192188
- Verification contract basis: sha256:f92a9809d4c44b66d828671565eba254d4c672d15ac8e2c0a0602364e2d49b04
- Subject git head: 3a740e4d11bcb846fb0929510657a12724d1f6cd
- Subject worktree hash: sha256:1e4dc2e5d327d859fcefe358ee396662cadabeacf7c41f669e58320425008d90

### Automated verification
- Command: npm run lint
  - Status: PASS
  - Exit code: 0
  - Duration ms: 7525
  - stdout sha256: a9abc4bc51d6729860fb000bf87c02e5a80cc830999d05e640c5651c7e3daa6a
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 147
  - stderr bytes: 0
- Command: npm run typecheck
  - Status: PASS
  - Exit code: 0
  - Duration ms: 3068
  - stdout sha256: 73ad7967b0b62b903e0e14e90a6a3971d720cb1ab6b744714e6d2ef05dd89743
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 83
  - stderr bytes: 0
- Command: npm test
  - Status: PASS
  - Exit code: 0
  - Duration ms: 7142
  - stdout sha256: 618724f15d5cfbb860744711b4e3a65b7e0c33a4e09f2651178ab126bf55a6fa
  - stderr sha256: 0c6252620625732669539afd1e1c7519381ef00b64ceaf1e6b81a2254910aafe
  - stdout bytes: 10411
  - stderr bytes: 2506
- Command: python3 .harness/tools/validate.py --mode manual
  - Status: PASS
  - Exit code: 0
  - Duration ms: 4669
  - stdout sha256: 6c59683a7a976eb4bd19afef7210544d9e3b1a2eaadca30992fc648e11f973e9
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 424
  - stderr bytes: 0

### Product verification
- none

### Manual verification
- Check: Запустить собранный doctor и doctor --json на реальном окружении; записать статусы всех проверок, PROVIDER_SCHEMA_VERSION и фактический exit code, без секретов.
  - Status: PASS
  - Observed: "Собранный CLI: node apps/cli/dist/index.js doctor --output /tmp/step025-doctor-output, также с --json. Оба exit 0. Все обязательные проверки OK; FFmpeg установлен, optional OK; native tokenPermissions skipped NOT_APPLICABLE. PROVIDER_SCHEMA_VERSION 1.1.0. --json: ровно один валидный CommandResult diagnostics, stdout без human/logs; human: пустой stdout, статусы в stderr. Credentials/accountId/URL/raw native messages отсутствуют. configurationConfirmed=false: успешное чтение не подтверждает защищённую настройку keyring. Сохранены literal stdout/stderr в project-local live-json.json/live-human.json."
<!-- VERIFICATION-EVIDENCE:END -->

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.



## Blocker / Failure reason

—
