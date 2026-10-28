---
schema: 1
id: STEP-031
status: completed
type: implementation
priority: medium
phase: desktop
depends_on:
  - STEP-030
requirements:
  - REQ-049
  - REQ-050
adrs:
  - ADR-015
  - ADR-016
architecture_refs:
  - "docs/architecture.md#основные-потоки"
risk_flags:
  - none
plan:
  status: ready
  revision: 1
  context_basis: sha256:8e29e56ce4497f6915a2bbbc35fdd595f35fbac3cc5b407497cdc0280813524d
  content_hash: sha256:23f5d16d4589ee5ac84ab764f6ca372925ef421ad8b95138afc81c141532a0ed
  reviewed_report: planning/plan-reviews/STEP-031/PLAN-REVIEW-20261028T184759Z.md
  planned_at: 2026-10-28T18:47:59+00:00
  execution_groups:
  context_components:
    - "ADR@ADR-015=sha256:0fd7f2940c2f6ac5a15eda9b9c9ad7c6a961062d03a4eedd4e3dd03eb8750d53"
    - "ADR@ADR-016=sha256:5f6730e0a0beed792f678c7872463edce8645c0d2642f3c1303ba5c1fbe923c7"
    - "ARCH@docs/architecture.md#основные-потоки=sha256:e7842c107b39127d5776d5575d975efcf69df8d05024b630a938e1dc510e7575"
    - "PRN@PRN-001=sha256:3b3801f207fafc3f77272f0e93570258a6d006964839d93a276accd814d548af"
    - "PRN@PRN-002=sha256:f29ee3fbdb9cf65cf9739d0907768bbf192ad88b8e443110d4d82f81c6b79ecb"
    - "PRN@PRN-003=sha256:16516d7d302fecda5f7615f9d55e29e04b588d671f8660640e1f61d1619e4ef8"
    - "REQ@REQ-049=sha256:605abb1d0414f1775b9eb876e3575ddc4a07477f6b89ca102ba4810183315197"
    - "REQ@REQ-050=sha256:057e45dda44290879b82883303fd638cb4863313ad70fe0329b4a18f160ebf35"
    - "STEP@STEP-030=sha256:d6bbd9d29d198811a20bcae770aa916c52eaa3a8c749f5d87c678c6dcc8f251d"
    - "STEP@STEP-031=sha256:7f3e9ab1e1138267e3d5dfc47d2b82179224ad2f61b6312f860feb3c1c7e7112"
---

# STEP-031 — UX: предпросмотр URL, загрузки, прогресс и уведомления

## Goal

Реализовать главный экран (URL → preview) и экран Downloads с прогрессом, управлением и уведомлениями по макетам брендбука.

## Context

Макеты: `docs/brand/mockups/01..03, 07..09`.

## Scope

- Поле URL, preview для track/album/playlist, выбор качества и папки.
- Аддитивная безопасная проекция автора и доступных качеств в существующем application preview для REQ-049; без URL, credentials и raw provider payload в DTO.
- Downloads: прогресс job/track, скорость/ETA при достоверности, Pause/Resume/Cancel/Retry/Open folder.
- Уведомления о завершении и ошибках.
- Тесты компонентов на mock application.
- После реализации обновить описание возможностей desktop-команды в `docs/development.md`, сохранив ограничения соседних экранов и packaging.

## Mutation policy

### Allowed

- `apps/desktop/src/renderer/**`, `apps/desktop/src/preload/**`, `apps/desktop/src/main/**` (минимально необходимое).
- `apps/desktop/evidence/STEP-031/**` — результаты визуальной сверки и подтверждённых проверок.

### Conditional

- `apps/desktop/package.json`, `yarn.lock` — только devDependencies и их транзитивные зависимости для тестов компонентов в существующем Vitest; штатным Yarn.
- `docs/development.md` — только описание возможностей `yarn run desktop` в Development commands; без изменения соседних подсистем.
- `packages/shared/src/application.ts`, `packages/application/src/preview.ts` и их целевые тесты — только аддитивные безопасные поля автора и доступных качеств предпросмотра по REQ-049. Варианты получать существующим `MusicProvider.getAudioVariants`, классифицировать существующей семантикой `resolveVariant`; core/provider и прежние поля DTO не менять.

### Forbidden

- Прямой доступ к provider и core из renderer.
- Реализация future/unrelated STEP «заодно».

## Out of scope

- History/Settings/Account/Diagnostics (STEP-032).

## Acceptance criteria

- Preview показывает все поля REQ ui-url-preview для track/album/playlist на mock application.
- Скорость и ETA скрыты при недостатке данных.
- Недопустимые по state machine действия недоступны.
- Экраны сверены с макетами (review checklist в Evidence).

## Verification

- command: `npm run lint`
- command: `npm run typecheck`
- command: `npm test`
- command: `npm run build`
- command: `python3 .harness/tools/validate.py --mode manual`
- manual: Сверить mock screenshots Главной empty/preview, Downloads, тёмной Главной, качества и уведомлений с docs/brand/mockups/01..03, 07..09; сохранить checklist и screenshots без реальных account данных в apps/desktop/evidence/STEP-031.
- manual: Проверить UI-путь URL → preview → доступное качество с покрытием коллекции → системный выбор папки → явный старт → Downloads/управление/reveal/уведомления; скорость и ETA отсутствуют без данных, job.completed с ошибками не выдаётся за успех, OUTCOME_UNKNOWN не повторяет операцию.
- manual: Сверить только описание yarn run desktop в docs/development.md, Development commands, с фактическим кодом и Evidence; сохранить ограничения History/Settings/Account/Diagnostics, packaging и платформенной квалификации.

## Deliverables

- Экраны и тесты.
- Актуальное описание команды desktop и результаты визуальной сверки.

## Implementation plan

### 1. Дополнить безопасный preview авторами и фактической доступностью качества

- Для REQ-049 сохранить существующие source/title/kind/tracks/artwork и их формы: track/album содержат плоские metadata, playlist — записи {position,track}. Добавить только необязательные безопасные поля автора и покрытия качеств: preference плюс число доступных позиций и общее число позиций. Для track/album использовать реальные artists, для playlist — owner; отсутствие автора показывать честно, без выдуманного имени.
- Для каждой available-позиции получать варианты через существующий MusicProvider.getAudioVariants и проверять best/lossless/high/normal существующим resolveVariant. В коллекциях сохранять повторные позиции и явно передавать покрытие N/total; не выдавать preference за конкретный codec/bitrate или гарантию доступа ко всем трекам. unavailable/unknown не считать доступными. Не менять core/provider, прежние DTO и lifecycle скачивания.
- В DTO возвращать только allowlisted авторские строки и агрегаты availability; не копировать AudioVariant.key, provider payload, URL, credentials или artwork references. Preview по-прежнему не открывает audio stream. При отсутствии данных о размере UI сообщает, что объём не определён; размер не вычислять по выдуманному bitrate.

**Files:**
- packages/shared/src/application.ts
- packages/application/src/preview.ts
- packages/application/src/preview.test.ts
- packages/application/src/application.contract.test.ts

**Tests:**
- Проверить track/album/playlist, автора и покрытие качества на mock MusicProvider: lossy/lossless/пустые варианты, unknown/unavailable и повторные playlist-позиции; результат классификации совпадает с resolveVariant.
- Расширить существующую проверку безопасной preview projection: прежние поля сохраняются, raw variant/секреты/URL не экспортируются и audio stream до старта не открывается.

### 2. Собрать главный экран и выбор параметров загрузки

- Заменить минимальную центральную оболочку главным экраном и навигацией Главная/Загрузки по макетам 01/02/07. Сохранить существующий минимальный вход через браузер и статус соединения; полные History/Settings/Account/Diagnostics не реализовывать.
- Через DesktopApi выполнить resolve → preview для введённого URL, показать локальную ошибку под полем при unsupported/invalid URL. Показать тип, название, автора, число треков, обложку из base64 DTO, список metadata с учётом playlist wrapper и честное состояние отсутствующих metadata/объёма. При смене URL не разрешать запуск устаревшего preview.
- Диалог качества по макету 08 заполнять фактическим покрытием из preview: только доступные предпочтения, частичное покрытие коллекции подписать N/total. Не обещать MP3 320/FLAC по одному названию preference. Папку выбирать исключительно DesktopApi.selectDirectory: displayPath только для текста, directoryRef для createDownload; отмена диалога сохраняет предыдущее значение.
- Вызвать createDownload только явной кнопкой после успешного preview и выбора качества/папки; ожидание preview или отмена диалогов не создаёт job. Временное локальное состояние формы не сохранять как настройки STEP-032. Новые comments писать кратко по-русски с @link к owning contract там, где логика неочевидна.

**Files:**
- apps/desktop/src/renderer/App.tsx
- apps/desktop/src/renderer/main.tsx
- apps/desktop/src/renderer/theme.ts
- apps/desktop/src/renderer/**

**Tests:**
- Компонентные сценарии resolve/preview для трёх типов и unsupported URL, отсутствие createDownload до явного клика, выбор quality/directoryRef и отмена выбора папки.

### 3. Подключить Downloads к snapshots и потоку событий

- Для REQ-050 подписаться через DesktopApi.subscribe с unsubscribe при unmount; начальную очередь брать listJobs. Job и позиционный trackKey — ключи отображения; не схлопывать повтор одного trackId в плейлисте.
- createDownload ждёт manager.run, поэтому события job.created/plan.created/progress должны подхватывать активный job и обновлять его через getJob/listJobs до разрешения createDownload Promise. События дополняют snapshot, а статус/управление определяются актуальным snapshot; UI не ждёт окончания Promise, чтобы показать очередь.
- Показывать job N/total и проценты из job.progress payload completed/total/fraction; при отсутствии события считать завершённые/skipped по snapshot. Track progress читать из bytes/fraction, скорость — optional speed в bytes/s, ETA — optional eta в ms. При отсутствии достоверного поля скрывать значение; UI не строит собственный прогноз.
- После команд, job.completed и восстановления host перечитывать snapshot. job.completed не равен успешному итогу: completed_with_errors/failed и pauseReason отражать по свежему состоянию. При OUTCOME_UNKNOWN показывать безопасное сообщение и перечитывать состояние без автоматического повторного createDownload/команды. Не добавлять собственный persisted store, scheduler или новый IPC protocol.

**Files:**
- apps/desktop/src/renderer/**

**Tests:**
- Управляемый mock DesktopApi доставляет события до завершения createDownload Promise: очередь и progress уже видны; проверяются N/total, проценты, track progress и скрытые speed/ETA при отсутствии полей.
- Mock job.completed со snapshot completed_with_errors/failed отображает ошибку, а host reconnect/OUTCOME_UNKNOWN приводит к reconciliation без replay.

### 4. Добавить допустимые действия загрузки и уведомления

- Отобразить Pause/Resume/Cancel/Retry/Open folder через существующие DesktopApi.pause/resume/cancel/retry/showItemInFolder. Disabled определять по актуальным job/track status и текущему запросу: Pause для queued/running, Resume для paused/interrupted, Cancel для нетерминальных queued/running/paused/interrupted, Retry при failed tracks в незакрытом cancelled состоянии; completed/cancelled не предлагать неуместные control actions. Поведение retry paused job оставить существующей state machine: retry сам по себе не снимает паузу.
- Open folder включать только когда snapshot содержит resultPath, передавать только jobId и при необходимости trackKey; renderer не отправляет путь и не вызывает shell. Командная ошибка остаётся видимой, после ответа обновляется snapshot.
- Для завершения и ошибок добавить интерфейсные уведомления по макету 09. Системные Notification создавать только в main по существующим событиям host и свежему getJob snapshot: отличать успех от completed_with_errors/failed и ошибки от cancellation; не просить permissions renderer и не добавлять новый generic IPC метод. Повторная reconciliation одного результата не создаёт повторных уведомлений.
- Сохранить прежние CSP, BrowserWindow security options, allowlist directoryRef и изоляцию preload. Для уведомлений использовать только безопасные summaries без account identity, URL и credentials; недоступность системных уведомлений не скрывает интерфейсное сообщение.

**Files:**
- apps/desktop/src/renderer/**
- apps/desktop/src/main/index.ts
- apps/desktop/src/main/**

**Tests:**
- Mock component test проверяет каждый вызов DesktopApi и disabled состояния; Open folder передаёт ID без пути.
- Проверить завершение/ошибку и main-only системные уведомления через небольшой mock существующей main boundary; после snapshot с частичной ошибкой нет ложного уведомления об успешной загрузке.

### 5. Доказать поведение компонентными тестами в существующем Vitest

- Расширить существующие App tests до render/interaction/event сценариев mock DesktopApi, не обращаясь к provider, ОС credential store или реальной сети. При необходимости добавить только тестовые devDependencies apps/desktop (DOM environment и средства React interaction) штатным Yarn; Vitest environment задавать локально тесту, без изменения root config.
- Собрать минимальный набор тестов из предыдущих шагов: поля preview трёх типов, реальное покрытие качества, явный старт, unsupported URL, progress и отсутствующие speed/ETA, каждый control action/disabled, reconciliation и уведомления. Fixtures соответствуют фактическим DTO и payload; не добавлять тесты для недоказанных security hypotheses.
- Сохранить существующие проверки авторизации/изоляции, обновив только ожидания минимальной оболочки, которые изменились из-за Главная/Загрузки. Не отключать существующие проверки и не расширять test tooling на весь monorepo.

**Files:**
- apps/desktop/src/renderer/App.test.tsx
- apps/desktop/src/renderer/**
- apps/desktop/src/main/**
- apps/desktop/package.json
- yarn.lock

**Tests:**
- Выполнить обязательный полный npm test, а также lint/typecheck/build и Harness validator из Verification.

### 6. Сверить внешний вид с макетами и сохранить ограниченное Evidence

- Сверить Главную empty/preview, Downloads, тёмную Главную, диалог качества и success/error уведомления с docs/brand/mockups/01..03 и 07..09: структура, отступы, палитра, типографика, доступность действий и читаемость progress. Тёмная тема использует текущие theme tokens/локальный UI выбор без Settings persistence.
- Для screenshots использовать mock DesktopApi и синтетические названия/авторов через bounded renderer visual fixture; реальные account данные, credentials и signed URL не экспортировать. Сохранить screenshots и checklist с фактическими отклонениями в apps/desktop/evidence/STEP-031. Не копировать из макетов неподдерживаемые bitrate, обновления, History или массовые действия, которых нет в контракте.
- Проверить пользовательский путь: URL → preview → quality → system folder dialog → явный запуск → Downloads → controls/reveal и уведомления; разделить подтверждённые mock/локальные наблюдения и непроверенные платформы. Не заявлять packaging/cross-platform qualification по screenshots.

**Files:**
- apps/desktop/src/renderer/**
- apps/desktop/evidence/STEP-031/**

**Tests:**
- Semantic/visual checklist с привязкой каждого относящегося к STEP макета и записи реальных результатов проверок; скриншоты показывают mock данные.

### 7. Обновить описание desktop-команды и завершить Verification

- После подтверждения реализации заменить только описание yarn run desktop в docs/development.md, Development commands: перечислить Главная/Downloads, preview, явный старт, управление и уведомления. Сохранить сведения о сборке/keyring и границы последующих полных History/Settings/Account/Diagnostics и packaging.
- Проверить, что bounded current-state утверждения docs/PROJECT.md и docs/architecture.md не требуют delta: они описывают этапы/слои/потоки и не заявляют отсутствие поставляемых экранов. Не исправлять посторонние исторические claims docs/development.md.
- Выполнить все обязательные команды Verification, сохранить factual output/exit code и ссылки на visual checklist, передать результат независимому REVIEW; не ставить completed/Ready самостоятельно.

**Files:**
- docs/development.md
- apps/desktop/evidence/STEP-031/**

**Tests:**
- Semantic сверка описания desktop-команды с кодом и Evidence, сохранение ограничений соседних STEP.

## Evidence


<!-- VERIFICATION-EVIDENCE:START -->
- Verification run: 2026-10-28T19:23:21Z
- Status: PASS
- Automated resumed: false
- Verification mode: full
- Incremental executed checks: 5
- Incremental reused checks: 0
- Targeted feedback reused: 0
- Incremental fallback reason: IMPACT_MAP_NOT_CONFIGURED
- Git head: f308e4d62e10cc08f5f4e4a102c73d01787e86f4
- Worktree hash: sha256:bf84dee7fba3be5f39f4ce6f0644027aa7f51bb4826ae501447dc13885ba4344
- Verification contract basis: sha256:ceb9dc1b21fc474373c4d6a47f7af260a676bfd15d7b39f3aee7f53d0282a9c7
- Verification context basis: sha256:b205c39e07e870259a860e4dd9a1796c74f4f2ccaa5a9acd3ac29021b70efc2e
- Subject git head: f308e4d62e10cc08f5f4e4a102c73d01787e86f4
- Subject worktree hash: sha256:d38874e45cd01bc3df361633047ae775dd27935b480d0cff38ead7c0236068a7
- Subject content hash: sha256:7cb273c3aa3684e754643fc271a6293e09a858c2988e144e7e00da0930f04e90

### Automated verification
- Command: npm run lint
  - Status: PASS
  - Exit code: 0
  - Duration ms: 13535
  - stdout sha256: a9abc4bc51d6729860fb000bf87c02e5a80cc830999d05e640c5651c7e3daa6a
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 147
  - stderr bytes: 0
  - Provenance: executed
- Command: npm run typecheck
  - Status: PASS
  - Exit code: 0
  - Duration ms: 8175
  - stdout sha256: 73ad7967b0b62b903e0e14e90a6a3971d720cb1ab6b744714e6d2ef05dd89743
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 83
  - stderr bytes: 0
  - Provenance: executed
- Command: npm test
  - Status: PASS
  - Exit code: 0
  - Duration ms: 38103
  - stdout sha256: be47c9d0e7d63ac99c6803d8b9a0c6dda344ba748fb7f9ea92f4e4dd2921cb0c
  - stderr sha256: 537459c76856b4cf5ed71457905eeb05fa5a78ee9a8e5141ba7974f4d4ff3836
  - stdout bytes: 14355
  - stderr bytes: 4498
  - Provenance: executed
- Command: npm run build
  - Status: PASS
  - Exit code: 0
  - Duration ms: 615
  - stdout sha256: 4a84685762211c33a9f2ac6336f7b1d29d9e1f9d26373ef0b9a167bf0a587116
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 88
  - stderr bytes: 0
  - Provenance: executed
- Command: python3 .harness/tools/validate.py --mode manual
  - Status: PASS
  - Exit code: 0
  - Duration ms: 4870
  - stdout sha256: cdd67defa246bbdfdc5f5473dc6121ba8730b9f6842ee9093fb211c9334bc236
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 135
  - stderr bytes: 0
  - Provenance: executed

### Product verification
- none

### Manual verification
- Check: Сверить mock screenshots Главной empty/preview, Downloads, тёмной Главной, качества и уведомлений с docs/brand/mockups/01..03, 07..09; сохранить checklist и screenshots без реальных account данных в apps/desktop/evidence/STEP-031.
  - Status: PASS
  - Observed: "На Linux x64 Chrome/Playwright визуально сверены mock screenshots Главной empty/preview, Downloads, тёмной темы, качества и success/error уведомлений с макетами 01..03 и 07..09. Сохранены 9 PNG, snapshots, синтетическая fixture, SHA-256 и checklist в apps/desktop/evidence/STEP-031. Реальных account данных нет. После FIX дополнительно просмотрен AUTH_REQUIRED snapshot без job.completed: уведомление видно, auth-pause PNG и snapshot сохранены."
- Check: Проверить UI-путь URL → preview → доступное качество с покрытием коллекции → системный выбор папки → явный старт → Downloads/управление/reveal/уведомления; скорость и ETA отсутствуют без данных, job.completed с ошибками не выдаётся за успех, OUTCOME_UNKNOWN не повторяет операцию.
  - Status: PASS
  - Observed: "В browser fixture пройден URL→preview→quality с покрытием→mock system-folder boundary→явный старт→Downloads, Pause/Resume/reveal и success/error. Скриншот created показывает скрытые скорость/ETA при отсутствии payload; отдельный progress показывает 54%, 1.0 МБ/с и 12с только из payload. OUTCOME_UNKNOWN/no replay и события до create Promise покрыты целевыми компонентными тестами. Нативные диалоги не выдаются за browser proof; main boundary сохранена. Подробности: apps/desktop/evidence/STEP-031/README.md. F-001 исправлен: AUTH_REQUIRED/DISK_FULL по свежим snapshots уведомляют без job.completed, обычная пауза/cancel исключены; 15 целевых regression tests PASS и отдельная browser-проверка AUTH_REQUIRED PASS."
- Check: Сверить только описание yarn run desktop в docs/development.md, Development commands, с фактическим кодом и Evidence; сохранить ограничения History/Settings/Account/Diagnostics, packaging и платформенной квалификации.
  - Status: PASS
  - Observed: "Строка yarn run desktop в docs/development.md сверена с фактическими App/Downloads/main notifications; перечислены поставленные функции, сохранены ограничения соседних экранов и packaging. Изменена только разрешённая строка."
<!-- VERIFICATION-EVIDENCE:END -->

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.


## Blocker / Failure reason

—
