---
schema: 1
id: STEP-032
status: completed
type: implementation
priority: medium
phase: desktop
depends_on:
  - STEP-031
  - STEP-025
requirements:
  - REQ-033
  - REQ-051
  - REQ-052
adrs:
  - ADR-014
  - ADR-016
architecture_refs:
  - "docs/architecture.md#основные-потоки"
risk_flags:
  - data-migration
  - security-sensitive
plan:
  status: ready
  revision: 1
  context_basis: sha256:fbd70cc59f288f4852a148329cf6846a61ba49d15f9a1ca6885693eb2daa9dbf
  content_hash: sha256:9fb0e729d51bee819b273c896443ee261ddfd872199843352ae05ae5c64e15c4
  reviewed_report: planning/plan-reviews/STEP-032/PLAN-REVIEW-20261028T194713Z.md
  planned_at: 2026-10-28T19:47:13+00:00
  execution_groups:
  context_components:
    - "ADR@ADR-014=sha256:d21dd58fd7f4167a6b4820ba1f26624fcf440fb7a3f9fdc926e1ec517a969f39"
    - "ADR@ADR-016=sha256:5f6730e0a0beed792f678c7872463edce8645c0d2642f3c1303ba5c1fbe923c7"
    - "ARCH@docs/architecture.md#основные-потоки=sha256:e7842c107b39127d5776d5575d975efcf69df8d05024b630a938e1dc510e7575"
    - "PRN@PRN-001=sha256:3b3801f207fafc3f77272f0e93570258a6d006964839d93a276accd814d548af"
    - "PRN@PRN-002=sha256:f29ee3fbdb9cf65cf9739d0907768bbf192ad88b8e443110d4d82f81c6b79ecb"
    - "PRN@PRN-003=sha256:16516d7d302fecda5f7615f9d55e29e04b588d671f8660640e1f61d1619e4ef8"
    - "REQ@REQ-033=sha256:eebd2c563c397a0e22045b2832633cdee5ec23fc88fb3b2a025f8a6f41181a2a"
    - "REQ@REQ-051=sha256:d17bd02e7a7a0b61f9ce0d46aa8f82e35d508c906f4a0ba772c09f5221b63b41"
    - "REQ@REQ-052=sha256:f2af6b7ed5ec038404cb4d310c205a22273e02158cffcb660493e084f69e4806"
    - "STEP@STEP-025=sha256:d09938a32c6f1b55148503027dce3bebc541f7c3a0451d281d2d65217ee9c7b1"
    - "STEP@STEP-031=sha256:ec5bdfca46bb193cece7b4ac637c64a440be3e958cd81bb824f5e9fd5e87209f"
    - "STEP@STEP-032=sha256:99cdc0697c524135ee67e5dd5bdae48d51dc97ddb17fdf66e54888717635b1fe"
---

# STEP-032 — UX: History, Settings, Account и Diagnostics

## Goal

Реализовать экраны History, Settings, Account и Diagnostics по макетам брендбука.

## Context

Макеты: `docs/brand/mockups/04..06`.

Совместимость истории: прежний manifest не сохранял `overwrite`, поэтому точное восстановление настроек старых заданий невозможно. По REQ-051 такие записи доступны для просмотра, удаления из истории и открытия папки, но без повторной загрузки; новые задания сохраняют полный эффективный снимок.

## Scope

- History: поиск, фильтры, Download again, Remove from history (без удаления файлов), Open folder.
- Settings: output, quality, concurrency, predefined templates, overwrite, FFmpeg, logging.
- Account: состояние авторизации, выход.
- Diagnostics: результаты doctor/provider health с повторным запуском.
- После реализации обновить описание desktop-команды в `docs/development.md`, сохранив ограничения packaging и платформенной квалификации.

## Mutation policy

### Allowed

- `apps/desktop/**`, `packages/application/**` (минимальные расширения API).

### Conditional

- `packages/persistence/**` — миграция схемы SQLite следующей версии для settings и безопасной диагностики provider (ADR-014, REQ-033), соответствующие store и необходимые операции истории по REQ-051 без удаления аудиофайлов.
- `packages/shared/**` — минимальные порты и DTO истории/settings/диагностики без секретов.
- `docs/development.md` — только описание возможностей `yarn run desktop` в Development commands; без изменения соседних подсистем.

### Forbidden

- Доступ renderer к fs/токенам напрямую.
- Реализация future/unrelated STEP «заодно».

## Out of scope

- Packaging.

## Acceptance criteria

- Удаление записи из истории не изменяет файловую систему.
- Настройки сохраняются между перезапусками.
- Выход из аккаунта удаляет токен из secure storage.
- Diagnostics показывает результаты проверок и позволяет их перезапустить.

## Verification

- command: `npm run lint`
- command: `npm run typecheck`
- command: `npm test`
- command: `npm run build`
- command: `python3 .harness/tools/validate.py --mode manual`
- manual: На синтетических данных сверить History/Settings/Account с макетами 04/05/06 и Diagnostics с doctor DTO; проверить replay/remove/reveal, legacy refusal, сохранение настроек после перезапуска, logout на mock secure store и refresh всех диагностических статусов. Сохранить screenshots и checklist без реальных account данных.
- manual: Сверить изменённое описание yarn run desktop в Development commands с code и Evidence; убедиться, что ограничения packaging/платформенной квалификации и соседние описания сохранены.

## Deliverables

- Экраны и тесты.
- Актуальное описание desktop-команды и результаты визуальной сверки.

## Implementation plan

### 1. Добавить переносимые контракты истории и настроек

- Добавить отдельные DTO истории, настроек, безопасной диагностики и полного эффективного снимка создания задания; сохранить ApplicationApi, JobSnapshot и ManifestStore совместимыми.
- История содержит jobId/source/title/kind/count/date, подтверждённый размер либо null и доступность replay с причиной отказа. Настройки: quality best/lossless/high/normal, concurrency 1..8, overwrite, закрытые naming presets, logging, FFmpeg только doctor. Секреты и Node-объекты запрещены.

**Files:**
- packages/shared/src/application.ts
- packages/shared/src/index.ts
- packages/shared/src/desktop-settings.ts
- packages/shared/src/desktop-state.ts

**Tests:**
- Сериализуемость DTO и совместимость прежних контрактов.

### 2. Расширить общую SQLite миграцией v1→v2

- Добавить таблицы desktop settings, безопасного последнего результата diagnostics, history tombstones и effective settings snapshot по jobId. Jobs/manifest v1/leases/control/import остаются единственным источником заданий.
- Сохранить существующий backup runner, forward-only транзакции, отказ будущей схеме и user_version guard для каждой новой записи.
- Remove history пишет tombstone и фильтрует только историю; не удаляет manifest/leases/import/audio/каталоги. Сохранять только проверенную allowlist projection без raw provider responses/credentials/signed URL.

**Files:**
- packages/persistence/src/sqlite-migrations.ts
- packages/persistence/src/sqlite-manifest-store.ts
- packages/persistence/src/desktop-state-store.ts
- packages/persistence/src/index.ts
- packages/persistence/src/sqlite-migrations.test.ts
- packages/persistence/src/desktop-state-store.test.ts

**Tests:**
- Populated v1→v2 сохраняет jobs/leases/control/import и создаёт backup; ошибка оставляет последнюю успешную версию, reopen продолжает.
- Future schema неизменна; stale connection отказывает новой записи; fixture-secret отсутствует в DB/WAL/backup. Tombstone переживает reopen и повторный импорт.

### 3. Реализовать application операции и фактическое применение настроек

- Добавить facade методы settings/history/hide/replay через минимальный persistence port. История строится из завершённых manifests: plan.title/имеющиеся исполнители/source.kind/tracks/timestamps; размер только полный подтверждённый набор checkpoint sizes, иначе null.
- Сохранить полный эффективный снимок нового задания до выполнения. Source/quality/destination сверяются с manifest, overwrite/naming явные; ошибка snapshot не запускает задание. Replay принимает jobId, создаёт новый id через существующий путь из authoritative source/snapshot; текущие defaults не подменяют исходные. Legacy без snapshot отказывает без создания.
- Desktop settings загрузить до scheduler/logger construction; concurrency/logging применяются после перезапуска с явным UI hint. Сохранить единый scheduler и leases, CLI defaults/precedence/API не менять.
- Output/quality/overwrite/naming применяются к новым desktop jobs с сохранением явного выбора Главной. Закрытые presets отображаются на существующие layout helpers в application filesystem adapter; core/metadata не менять.
- FFmpeg setting меняет существующий doctor probe; filesystem doctor использует настроенный output. Сохранять только безопасный diagnostic DTO.

**Files:**
- packages/application/src/application.ts
- packages/application/src/composition-root.ts
- packages/application/src/runtime-adapters.ts
- packages/application/src/jobs.ts
- packages/application/src/adapters/download-files.ts
- packages/application/src/diagnostics.ts
- packages/application/src/desktop-state.ts
- packages/application/src/desktop-state.integration.test.ts

**Tests:**
- Новый application экземпляр восстанавливает все настройки и реально применяет runtime/job settings. Replay после изменения defaults сохраняет исходные настройки; legacy не вызывает create.
- Remove history сохраняет состав и bytes fixture-аудиокаталога. Doctor использует выбранные output/FFmpeg и безопасно сохраняет результат.

### 4. Расширить DesktopApi с main authority

- Провести новые методы через единую таблицу DesktopApi/preload/main/host с runtime schemas и CommandResult.
- Output сохраняется через directoryRef системного диалога; после restart reserved default-output ref разрешается main через trusted application settings. DisplayPath не восстанавливает registry и не даёт файловых полномочий.
- FFmpeg выбирается main-only диалогом и opaque ref; main подставляет путь. Renderer не задаёт executable path. Replay передаёт только jobId; reveal сохраняет main-only jobId/trackKey путь.
- OUTCOME_UNKNOWN mutation требует перечитать snapshot, без автоматического повтора create.

**Files:**
- apps/desktop/src/contract/desktop-api.ts
- apps/desktop/src/contract/desktop-api.test.ts
- apps/desktop/src/main/broker.ts
- apps/desktop/src/main/directory-registry.ts
- apps/desktop/src/main/index.ts
- apps/desktop/src/host/application-handler.ts
- apps/desktop/src/transport
- apps/desktop/src/preload

**Tests:**
- Runtime schemas принимают валидный ввод и отвергают лишние поля/значения. Raw path/UNC/WebDAV/device/unknown refs не доходят до host/fs.
- Default-output работает после restart main/host. Fixture secrets не проходят сериализованные ответы/события.

### 5. Добавить четыре экрана и навигацию

- MUI History/Settings/Account по макетам04/05/06, Diagnostics по существующему DTO; сохранить Главную/Downloads.
- History: поиск metadata, фильтры типа/периода, count/size/date, replay/hide/reveal; неизвестный размер и legacy refusal честно объясняются.
- Settings: output/quality/concurrency/presets/overwrite/FFmpeg doctor/logging, сохранение/ошибки/restart hint. Account показывает реальные id/displayName/status и logout, без придуманных subscription/region.
- Diagnostics показывает все doctor/provider checks включая optional/skipped/api-changed, время последнего результата и refresh; ошибка refresh не выдаётся за свежий успех. Всё только DesktopApi, тексты/комментарии по-русски.

**Files:**
- apps/desktop/src/renderer/App.tsx
- apps/desktop/src/renderer/History.tsx
- apps/desktop/src/renderer/Settings.tsx
- apps/desktop/src/renderer/Account.tsx
- apps/desktop/src/renderer/Diagnostics.tsx
- apps/desktop/src/renderer/App.test.tsx
- apps/desktop/src/renderer/History.test.tsx
- apps/desktop/src/renderer/Settings.test.tsx
- apps/desktop/src/renderer/Account.test.tsx
- apps/desktop/src/renderer/Diagnostics.test.tsx

**Tests:**
- Vitest/jsdom: поиск/фильтры изменяют список; settings save/load; legacy refusal; replay/hide/reveal wiring; logout и refresh.
- Logout удаляет credential только mock secure store. Основные сценарии STEP031 сохранены.

### 6. Закрыть proof obligations и визуальную проверку

- H-001 через npm test: migration/backup/refusal/version guards, fixture-secret absence, audio неизменно после hide. H-002 через npm test: settings restart/effective values, exact replay/legacy refusal, opaque host boundary.
- Использовать существующие Vitest/jsdom и visual tooling. Сохранить synthetic screenshots/checklist четырёх экранов, пустых состояний, settings и refresh, без реальных account/credentials.
- Полный canonical Verification запускает dispatcher, набор команд не сокращать.

**Files:**
- apps/desktop/evidence/STEP-032

**Tests:**
- npm run lint
- npm run typecheck
- npm test
- npm run build
- python3 .harness/tools/validate.py --mode manual

### 7. Обновить только описание desktop-команды

- После подтверждения реализации изменить только yarn run desktop в Development commands: фактически поставленные экраны/возможности и нужное объяснение legacy replay.
- Сверить с code/Evidence; сохранить ограничения packaging/платформенной квалификации и соседние описания. Accepted ADR/архитектурные потоки не менять.

**Files:**
- docs/development.md#development-commands

**Tests:**
- Семантическая сверка точечного documentation delta.

## Evidence


<!-- VERIFICATION-EVIDENCE:START -->
- Verification run: 2026-10-28T20:12:52Z
- Status: PASS
- Automated resumed: false
- Verification mode: full
- Incremental executed checks: 5
- Incremental reused checks: 0
- Targeted feedback reused: 0
- Incremental fallback reason: RISK_REQUIRES_FULL
- Git head: 0d61180fcc5b8c6dbabc561e1dc072a00a0c880c
- Worktree hash: sha256:2d05c3430e461befb0b0897c717ef66c4d7dfefdaeb5838cf0cef52ecd24887c
- Verification contract basis: sha256:e13b2af7895160f3eec7dfc6da78ad8b9a5cbf56ebe0077443f0e0262c21b4d8
- Verification context basis: sha256:b41abd94979aae7071d7d6a088ef14b12aa24cfa6923b73a185e03f87d486e66
- Subject git head: 0d61180fcc5b8c6dbabc561e1dc072a00a0c880c
- Subject worktree hash: sha256:4768431e175574d058cc62f047999d02e83a82cc953eeb6e585575f026286b6c
- Subject content hash: sha256:7249f19306a070c8170af43196a46eb6b32197bb50c2fefc25057c02a74100e0

### Automated verification
- Command: npm run lint
  - Status: PASS
  - Exit code: 0
  - Duration ms: 15685
  - stdout sha256: a9abc4bc51d6729860fb000bf87c02e5a80cc830999d05e640c5651c7e3daa6a
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 147
  - stderr bytes: 0
  - Provenance: executed
- Command: npm run typecheck
  - Status: PASS
  - Exit code: 0
  - Duration ms: 10077
  - stdout sha256: 73ad7967b0b62b903e0e14e90a6a3971d720cb1ab6b744714e6d2ef05dd89743
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 83
  - stderr bytes: 0
  - Provenance: executed
- Command: npm test
  - Status: PASS
  - Exit code: 0
  - Duration ms: 38766
  - stdout sha256: 1bb88af68267d36d7f13df7afbea255b46593fb0090f1ba5232d4f9e4a3ab440
  - stderr sha256: a61fe36a7fe39ca0217191e67caf2a381fab9557688927b1b2f5a12c7daea18e
  - stdout bytes: 16205
  - stderr bytes: 4700
  - Provenance: executed
- Command: npm run build
  - Status: PASS
  - Exit code: 0
  - Duration ms: 664
  - stdout sha256: 4a84685762211c33a9f2ac6336f7b1d29d9e1f9d26373ef0b9a167bf0a587116
  - stderr sha256: 351b524197fb492920789369e7f1a271420c757633fbb553b280a181ac4c31a4
  - stdout bytes: 88
  - stderr bytes: 360
  - Provenance: executed
- Command: python3 .harness/tools/validate.py --mode manual
  - Status: PASS
  - Exit code: 0
  - Duration ms: 5020
  - stdout sha256: fb1813d57cefe6f8c918b07d3f5d198be4222a822e1268a152e47d602b3103fc
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 135
  - stderr bytes: 0
  - Provenance: executed

### Product verification
- none

### Manual verification
- Check: На синтетических данных сверить History/Settings/Account с макетами 04/05/06 и Diagnostics с doctor DTO; проверить replay/remove/reveal, legacy refusal, сохранение настроек после перезапуска, logout на mock secure store и refresh всех диагностических статусов. Сохранить screenshots и checklist без реальных account данных.
  - Status: PASS
  - Observed: "Первичный browser mock прогон четырёх экранов и всех действий сохранён apps/desktop/evidence/STEP-032; неизменённые экраны сохраняют прежнее доказательство. После FIX в свежем Chrome bundle отдельно пройден replay OUTCOME_UNKNOWN: History остаётся открыт с видимым предупреждением и reconciliation без повтора mutation; новый screenshot/YAML сохранены. F001 exact canonical playlist IDs и replay доказаны application regression tests; реальные credentials/DB не используются. SQLite/restart/logout подтверждаются integration/mock secure store tests, не browser fixture."
- Check: Сверить изменённое описание yarn run desktop в Development commands с code и Evidence; убедиться, что ограничения packaging/платформенной квалификации и соседние описания сохранены.
  - Status: PASS
  - Observed: "Разрешённый desktop paragraph docs/development.md по-прежнему соответствует исправленной реализации и Evidence: экраны/history/settings/account/doctor, legacy refusal/restart hint; packaging/platform/keyring и соседние descriptions сохранены. FIX текст возможностей не меняет."
<!-- VERIFICATION-EVIDENCE:END -->

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.


## Blocker / Failure reason

—
