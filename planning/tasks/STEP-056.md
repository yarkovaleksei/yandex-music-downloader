---
schema: 1
id: STEP-056
status: completed
type: implementation
priority: high
phase: desktop
depends_on:
  - STEP-031
  - STEP-032
requirements:
  - REQ-050
  - REQ-051
  - REQ-052
  - REQ-057
adrs: []
architecture_refs:
  - "docs/architecture.md#основные-потоки"
  - "docs/architecture.md#известный-architecture-debt-drift"
architecture_outputs:
  - "docs/architecture.md#известный-architecture-debt-drift"
risk_flags:
  - data-migration
  - security-sensitive
plan:
  status: ready
  revision: 2
  context_basis: sha256:a74be7aa94bdd3eddb6775c97f70148de23ff57019cea1d72aaeb4dc6d980565
  content_hash: sha256:4c4b1c3c29ce887b737d7b6d87d576000e0e6ad3ca3391b56f226149e26c78ba
  reviewed_report: planning/plan-reviews/STEP-056/PLAN-REVIEW-20261029T073713Z.md
  planned_at: 2026-10-29T07:37:13+00:00
  execution_groups:
  context_components:
    - "ARCH@docs/architecture.md#известный-architecture-debt-drift=sha256:ea129bff2b269f5c3689cb4a4d8a2aa47a088cfe620ca2267d43526b541319fb"
    - "ARCH@docs/architecture.md#основные-потоки=sha256:e7842c107b39127d5776d5575d975efcf69df8d05024b630a938e1dc510e7575"
    - "PRN@PRN-001=sha256:3b3801f207fafc3f77272f0e93570258a6d006964839d93a276accd814d548af"
    - "PRN@PRN-002=sha256:f29ee3fbdb9cf65cf9739d0907768bbf192ad88b8e443110d4d82f81c6b79ecb"
    - "PRN@PRN-003=sha256:16516d7d302fecda5f7615f9d55e29e04b588d671f8660640e1f61d1619e4ef8"
    - "REQ@REQ-050=sha256:057e45dda44290879b82883303fd638cb4863313ad70fe0329b4a18f160ebf35"
    - "REQ@REQ-051=sha256:d17bd02e7a7a0b61f9ce0d46aa8f82e35d508c906f4a0ba772c09f5221b63b41"
    - "REQ@REQ-052=sha256:a175b003a7089136c158a12c319af41b76224ed7f0129a98d3d3df0d18c17dc2"
    - "REQ@REQ-057=sha256:27aab3692da8cd65a23bc8fbc9e933cd83460bcea535f2561fbf28e3bdb9d1af"
    - "STEP@STEP-031=sha256:ec5bdfca46bb193cece7b4ac637c64a440be3e958cd81bb824f5e9fd5e87209f"
    - "STEP@STEP-032=sha256:fae227682d39f2eaa5277169a6868a00e75c4d3c39e652a98b98c654e174a0ed"
    - "STEP@STEP-056=sha256:e5ddec2353513423e5493b2c06b31183b7b7b2ca90b9abacd631940f7bd61373"
---

# STEP-056 — Компактные загрузки, история и полезная desktop-диагностика

## Goal

Выполнить все 12 UX-правок владельца по REQ-057 с диагностикой только препятствий использованию, сохранив данные, безопасность и работающие загрузки.

## Context

Владелец 2026-10-29 разрешил отступление от макетов после реального использования больших списков на широком мониторе. Скриншоты показывают ограничение maxWidth, длинные строки исполнителей плейлиста, вертикальные действия, неверные склонения и необъяснённый NOT_APPLICABLE. Последние уточнения владельца требуют скрывать неприменимые проверки и проверять только то, что мешает пользоваться приложением.

STEP-031/032 completed; их исторические отчёты не переписываются. STEP-033 уже имеет незакоммиченные E2E/CI/docs изменения и ожидает внешнюю приёмку; они сохраняются. Новый STEP не зависит от CI/платформенной приёмки STEP-033 и не закрывает её вместо владельца. Принятые границы ADR-001/013/014/015/016 остаются входными ограничениями: provider-specific код только в provider, main authority для путей/ссылок, общая SQLite, FFmpeg optional. CLI doctor по REQ-034 не сокращается.

## Scope

- Sticky sidebar на высоту окна, левое выравнивание пунктов, независимая прокрутка меню при нехватке высоты; убрать общее ограничение ширины контента.
- Свёрнутые по умолчанию аккордеоны заданий: ссылка на источник, состояние, N/total и кнопки в заголовке; подробности треков внутри, управление не раскрывает аккордеон.
- Общие pause/resume по разрешённым состояниям с итогом/частичными ошибками без автоматического повтора mutation; открыть настроенную папку загрузок, сохранить индивидуальное открытие папки задания.
- «Убрать завершённые»: скрыть terminal задания только из Загрузок, сохранять это между запусками; не удалять историю, manifest, контроль, аренды и аудио, не скрывать активные/приостановленные.
- История: названия-ссылки, доступные обложки, отсутствие списка треков/всех исполнителей у плейлиста; компактные действия в строку/иконки с доступными подписями.
- Tooltip отключённого replay старой записи объясняет обновление/отсутствие исходных параметров и рекомендует открыть источник на Главной и заново выбрать папку/качество; убрать постоянную простыню текста.
- Общие русские склонения количеств, включая граничные числа 11–14 и 111.
- FFmpeg: проверка только возле настройки, Alert info о необязательности и установка/публичная ссылка по ОС; без автоматического скачивания.
- Общая desktop-диагностика: только необходимые вход/provider/account/metadata/variants/storage/filesystem/runtime проверки; скрыть неприменимые/служебные строки, FFmpeg исключить из общего запуска и результата. Для нужных проверок дать смысл, причину, действие; зависимые пропуски пояснять. Не выдавать отсутствие доказательства за успех.
- После реализации обновить описание фактического UX/диагностики и границ готовности в разрешённых docs и сохранить визуальные доказательства большого списка/широкого окна.

## Mutation policy

### Allowed

- `apps/desktop/src/**`, `apps/desktop/evidence/STEP-056/**` — UI, DesktopApi/main/preload/host wiring, необходимые тесты и безопасные синтетические screenshots.
- `packages/application/src/**`, `packages/shared/src/**` — минимальные переносимые DTO/операции для ссылок, обложек, массовых действий, папки, скрытия списка и полезных объяснений; без секретов.
- `docs/development.md` — только desktop-команда и Testing/диагностика соответствующих возможностей.
- `docs/architecture.md#известный-architecture-debt-drift` — только текущие сведения об изменённом desktop UX/диагностике; соседние gates сохранить.
- Текущий STEP и его новые artifacts, generated projections через инструменты.

### Conditional

- `packages/persistence/src/**` — при необходимости отдельная проекция видимости Загрузок в общей SQLite и следующая forward-only миграция с backup/version guards; не вторая копия job store.
- `packages/persistence/platform-check/check.mjs` — только согласование существующего migration check с фактической поддерживаемой схемой после v3; проверки данных/backup и внешние platform gates не ослаблять.
- `packages/providers/yandex-music/src/**` — только необходимая provider-owned проекция публичных ссылок/доступных обложек, без нового auth/download API и live-запусков.
- `apps/desktop/e2e/**` — только адаптация существующего незавершённого STEP-033 сценария к аккордеонам/новым подписям, без изменения его целей или CI/native Acceptance.

### Forbidden

- Изменение CLI doctor контракта/набора проверок и exit semantics, Accepted ADR/OQ/исторических STEP/review/evidence, CI, packaging, root dependencies/lockfile и Harness.
- Прямой доступ renderer к путям/credentials/provider API; signed URL/raw native errors в DTO/storage/logs; provider-specific построение ссылок в UI.
- Удаление аудиофайлов, authoritative jobs/control/leases ради очистки интерфейса; скрытая остановка активных заданий; автоматический повтор mutation при OUTCOME_UNKNOWN.
- Отмена незакоммиченных STEP-033 изменений или реализация будущих STEP заодно.

## Out of scope

- Packaging/подпись/автообновление, установка или bundling FFmpeg, изменение CLI doctor.
- Повторные live/platform квалификации и закрытие STEP-033/054 без их внешнего Evidence.

## Acceptance criteria

- Все восемь групп Acceptance REQ-057 реализованы; все 12 пунктов владельца и уточнения диагностики имеют соответствие code/test/визуальному Evidence.
- Большой список и широкое окно подтверждают sticky/левую навигацию, полную ширину, свёрнутые задания с доступным управлением и компактную читаемую историю без простыни исполнителей.
- Общие действия и открытие папок соблюдают состояния и main authority; неизвестные исходы не вызывают повторов, частичные отказы видны.
- Очистка Загрузок переживает restart и сохраняет историю/исходные задания/контроль/аренды/аудио; активные и приостановленные записи не исчезают.
- Desktop-диагностика не запускает/не учитывает FFmpeg в общей проверке, скрывает неприменимые/служебные пункты и объясняет каждую необходимую проблему с действием; CLI doctor сохраняет полный прежний контракт.
- Публичные ссылки и обложки безопасны, legacy replay имеет доступный tooltip с инструкцией, склонения верны; FFmpeg остаётся optional с OS-specific помощью возле настройки.
- Незакоммиченная работа STEP-033 сохранена; документация соответствует результату и не заявляет закрытие CI/native/packaging gates.

## Verification

- command: `npm run lint`
- command: `npm run typecheck`
- command: `npm test`
- command: `npm run build`
- command: `node apps/desktop/e2e/run.mjs`
- command: `python3 .harness/tools/validate.py --mode manual`
- manual: На синтетических больших списках проверить все 12 UX-пунктов и уточнения диагностики: широкое/обычное/низкое окно, sticky/scroll, аккордеоны/actions, links/covers/tooltips, склонения, batch/clear и OS-specific FFmpeg помощь. Сохранить screenshots/checklist apps/desktop/evidence/STEP-056; H-001/H-002 требуют fresh npm test.
- manual: Сверить разрешённые docs с code/Evidence; сохранить соседние ограничения, незакоммиченную работу STEP-033 и pending external STEP-033/054 gates. Не заявлять native/CI/keyring/live-provider квалификацию по синтетическим тестам.

## Deliverables

- Исправленный desktop UX, необходимые API/persistence/provider проекции и тесты, визуальный checklist с соответствием 12 пунктам.
- Актуальные docs/development.md и docs/architecture.md#известный-architecture-debt-drift с сохранёнными соседними ограничениями.

## Implementation plan

### 1. Отдельная сохраняемая видимость Загрузок

- Добавить отдельную от history_hidden проекцию desktop visibility и следующую forward-only SQLite миграцию v3, используя существующие backup/version guards. Очистка перечитывает состояния и скрывает только terminal jobs; manifests, control, leases, history, snapshots и аудио неизменны.
- Применять скрытие только пока job terminal: resumed/retried/paused job снова виден. Сохранить общий CLI listJobs; добавить минимальный desktop API/DTO и host handler.
- H-001: доказать npm test сохранность данных, reopen, migration и terminal-only фильтрацию.
- Исправить подтверждённую регрессию platform-check/check.mjs: user_version сверять с supportedSchemaVersion, schema_migrations с фактическим sqliteMigrations; сохранить DATA_PRESERVED/BACKUP и прежние platform gates. Уже реализованные UX units сохранить, не переделывать; устранить только подтверждённые failures и закончить Verification/review.

**Files:**
- packages/shared/src/desktop-state.ts
- packages/persistence/src/sqlite-migrations.ts
- packages/persistence/src/desktop-state-store.ts
- packages/persistence/src/desktop-state-store.test.ts
- packages/persistence/src/sqlite-migrations.test.ts
- packages/application/src/jobs.ts
- packages/application/src/application.ts
- packages/application/src/desktop-state.integration.test.ts
- apps/desktop/src/contract
- apps/desktop/src/host/application-handler.ts
- packages/persistence/platform-check/check.mjs

### 2. Безопасные ссылки, обложки и папки

- Публичные ссылки строит provider-owned код через порт; сохранить полные track/album/legacy encoded-owner playlist/UUID/lk.UUID IDs буквально, без Yandex grammar в UI/application.
- Передавать доступные обложки безопасным ArtworkDto через существующие provider/cache/application возможности; fallback при отсутствии, без CDN/signed URL/raw paths в renderer.
- Main открывает configured downloads folder из trusted settings и сохраняет per-job reveal; источники и фиксированная OS-specific FFmpeg помощь проходят узкий HTTPS allowlist. Проверить provider/application/broker seams синтетическими тестами.

**Files:**
- packages/shared/src/provider.ts
- packages/shared/src/application.ts
- packages/shared/src/desktop-state.ts
- packages/providers/yandex-music/src
- packages/application/src/jobs.ts
- packages/application/src/cached-provider.ts
- packages/application/src/application.ts
- apps/desktop/src/contract
- apps/desktop/src/main
- apps/desktop/src/host/application-handler.ts
- apps/desktop/src/preload

### 3. Компактные Загрузки и общие действия

- Аккордеоны свёрнуты по умолчанию; заголовок содержит источник-ссылку, статус, N/total, прогресс и индивидуальные действия. Кнопки/ссылки не переключают раскрытие, доступны с клавиатуры.
- Общие pause/resume обрабатывают допустимые состояния, частичные отказы видны; OUTCOME_UNKNOWN ведёт только к refresh, без повторной mutation. Добавить общую папку и Убрать завершённые; перечитывать desktop projection после событий/reconnect.
- Сохранить REQ-050 progress/speed/ETA/pending/notifications. Mock API тесты доказывают collapsed/control isolation, смешанные состояния, partial failure и no retry.

**Files:**
- apps/desktop/src/renderer/Downloads.tsx
- apps/desktop/src/renderer/useDownloads.ts
- apps/desktop/src/renderer/App.tsx
- apps/desktop/src/renderer/App.test.tsx
- apps/desktop/src/renderer/Downloads.test.tsx

### 4. Навигация, История и склонения

- Sticky sidebar с выравниванием влево и независимой прокруткой низкого окна; убрать общий maxWidth контента.
- История: название-ссылка, доступная обложка/fallback, компактные горизонтальные действия/иконки с подписями. Playlist не перечисляет треки и их совокупных исполнителей; artist отдельного трека сохраняется.
- Legacy replay остаётся disabled; доступный с клавиатуры tooltip объясняет запись предыдущей версии и предлагает открыть источник на Главной, выбрать папку/качество и создать загрузку. Удалить постоянный абзац, не угадывать settings.
- Общий helper русских форм и тесты 1/2/5/11/21/22/25/111; тесты history link/cover/tooltip/actions.

**Files:**
- apps/desktop/src/renderer/App.tsx
- apps/desktop/src/renderer/History.tsx
- apps/desktop/src/renderer/Downloads.tsx
- apps/desktop/src/renderer/quantity.ts
- apps/desktop/src/renderer/quantity.test.ts
- apps/desktop/src/renderer/App.test.tsx
- apps/desktop/src/renderer/History.test.tsx

### 5. Полезная диагностика и отдельный optional FFmpeg

- Явная desktop collection policy до выполнения collector: проверять только необходимые runtime/provider/auth/account/metadata/audioVariants/storage/filesystem условия; общий refresh не вызывает FFmpeg runner и не учитывает FFmpeg в summary. CLI doctor сохраняет полный default набор и exit semantics.
- Скрыть NOT_APPLICABLE и служебные пункты без пользовательского действия. Нужные проверки объясняют смысл, безопасную причину и исправление; зависимые пропуски показывают реальную блокирующую проверку. Старые saved optional rows не возвращаются в desktop и не дают ложный успех; сохранить timestamp/error distinction.
- Settings FFmpeg: Alert info о необязательности, помощь по ОС и отдельная явная проверка. Main разрешает executable из trusted setting/opaque selected ref; raw path renderer не исполняется. Без автоустановки.
- H-002: npm test spy доказывает noFFmpeg общей desktop диагностики, работу отдельной проверки и неизменность CLI. Покрыть old saved DTO, necessary failures/dependent skips, OS help и безопасный IPC.

**Files:**
- packages/application/src/diagnostics.ts
- packages/application/src/composition-root.ts
- packages/application/src/application.ts
- packages/application/src/diagnostics.test.ts
- packages/application/src/doctor.integration.test.ts
- packages/application/src/desktop-state.integration.test.ts
- packages/persistence/src/desktop-state-store.ts
- packages/shared/src/desktop-state.ts
- apps/desktop/src/contract
- apps/desktop/src/host/application-handler.ts
- apps/desktop/src/main
- apps/desktop/src/renderer/Diagnostics.tsx
- apps/desktop/src/renderer/Settings.tsx
- apps/desktop/src/renderer/Diagnostics.test.tsx
- apps/desktop/src/renderer/Settings.test.tsx

### 6. Проверки и сохранение STEP-033

- Минимально адаптировать существующий E2E STEP-033 к аккордеонам/подписям только при необходимости, сохранив сценарий. Выполнить все шесть canonical commands без сокращения, H001/H002 требуют fresh npm test.
- Синтетический большой список: обычное/широкое/низкое окно, sticky/scroll, collapsed headers/actions, links/covers/tooltips, plurals, batch/clear, OS help и diagnostics. Сохранить screenshots/checklist всех 12 пунктов в evidence056, без реальных DB/keyring/account.
- Сверить исходный diff: незакоммиченные E2E/CI/docs STEP-033 сохранены; локальные проверки не закрывают external CI/native gates.

**Files:**
- apps/desktop/e2e
- apps/desktop/evidence/STEP-056

### 7. Точечная документация после реализации

- После подтверждения code/Evidence обновить только desktop-команду и относящиеся Testing/diagnostics разделы development; architecture только известный architecture debt/drift.
- Сохранить pending внешние STEP-033/054 gates, packaging/platform ограничения и историческую Evidence. Accepted ADR и основные потоки не менять; семантически сверить факты без несвязанных дополнительных проверок.

**Files:**
- docs/development.md
- docs/architecture.md#известный-architecture-debt-drift

## Evidence




<!-- VERIFICATION-EVIDENCE:START -->
- Verification run: 2026-10-29T07:55:42Z
- Status: PASS
- Automated resumed: false
- Verification mode: full
- Incremental executed checks: 6
- Incremental reused checks: 0
- Targeted feedback reused: 0
- Incremental fallback reason: RISK_REQUIRES_FULL
- Git head: 59ce6eaa9c54916b2037de8bf101cbb6797b3b8d
- Worktree hash: sha256:17e43b6a4408e7f1c9e48ff67a0637bf3d47c8f63e7f1724912dea8a826ea6e0
- Verification contract basis: sha256:ed84130d694e71b0673d67b0547198bac105d6aac05b799cfe02a359669781c4
- Verification context basis: sha256:182619108d9b97bb4e71719e2174db59ef437e6c1e787a8ec96a8327c6d9220a
- Subject git head: 59ce6eaa9c54916b2037de8bf101cbb6797b3b8d
- Subject worktree hash: sha256:306a069c18cd0be589d973a8f9b1b9278ab3c6019d0d6f2374493878fdf746fa
- Subject content hash: sha256:8af1784e1a220fa33c888b25e0fa2eb97067d7796cded8b7446f90cb83f0944f

### Automated verification
- Command: npm run lint
  - Status: PASS
  - Exit code: 0
  - Duration ms: 15791
  - stdout sha256: a9abc4bc51d6729860fb000bf87c02e5a80cc830999d05e640c5651c7e3daa6a
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 147
  - stderr bytes: 0
  - Provenance: executed
- Command: npm run typecheck
  - Status: PASS
  - Exit code: 0
  - Duration ms: 8275
  - stdout sha256: 73ad7967b0b62b903e0e14e90a6a3971d720cb1ab6b744714e6d2ef05dd89743
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 83
  - stderr bytes: 0
  - Provenance: executed
- Command: npm test
  - Status: PASS
  - Exit code: 0
  - Duration ms: 39014
  - stdout sha256: 964c77b8c72d34b607ed8e489317c96005ce9fcb564d40e13a21faea4fe0b1d7
  - stderr sha256: 3c4c76d8653394ff419a0f3357ad47df7e1a5d05c4ff06dbbb7c714c6282b867
  - stdout bytes: 16809
  - stderr bytes: 4700
  - Provenance: executed
- Command: npm run build
  - Status: PASS
  - Exit code: 0
  - Duration ms: 667
  - stdout sha256: 4a84685762211c33a9f2ac6336f7b1d29d9e1f9d26373ef0b9a167bf0a587116
  - stderr sha256: 351b524197fb492920789369e7f1a271420c757633fbb553b280a181ac4c31a4
  - stdout bytes: 88
  - stderr bytes: 360
  - Provenance: executed
- Command: node apps/desktop/e2e/run.mjs
  - Status: PASS
  - Exit code: 0
  - Duration ms: 9777
  - stdout sha256: 686283f8f3b471cd4f943c9ee6b1649a553cf2fc1db729a6d27fdfcb74295320
  - stderr sha256: 453cb83aba38c0950dfb69c0a89f029f7e479de0ac3c8d9580bd25429e8cf803
  - stdout bytes: 281
  - stderr bytes: 326
  - Provenance: executed
- Command: python3 .harness/tools/validate.py --mode manual
  - Status: PASS
  - Exit code: 0
  - Duration ms: 5271
  - stdout sha256: ca73798d9bde23bfbc90f3999919a35ec66c02f63102abe8d872326eadae12b8
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 135
  - stderr bytes: 0
  - Provenance: executed

### Product verification
- none

### Manual verification
- Check: На синтетических больших списках проверить все 12 UX-пунктов и уточнения диагностики: широкое/обычное/низкое окно, sticky/scroll, аккордеоны/actions, links/covers/tooltips, склонения, batch/clear и OS-specific FFmpeg помощь. Сохранить screenshots/checklist apps/desktop/evidence/STEP-056; H-001/H-002 требуют fresh npm test.
  - Status: PASS
  - Observed: "Все12 пункты визуально проверены Chrome/Playwright на синтетических38jobs и3history в1920/1280 инизком360px окне. Screenshots/checklist apps/desktop/evidence/STEP-056/README.md; keyboardtooltip, controlsisolated, batchpause18/18, clear10оставляет28/history3, FFmpegOShelp. H001/H002 дополнительно требуют текущего npmtestPASS. FIX F001: actual renderer cover-pending с двумя неразрешающимися artwork promises сразу показывает3строки; hide оставляет2. apps/desktop/evidence/STEP-056/history-pending-covers.png и history-pending-covers-hide.png; application/UI targetedregressionPASS."
- Check: Сверить разрешённые docs с code/Evidence; сохранить соседние ограничения, незакоммиченную работу STEP-033 и pending external STEP-033/054 gates. Не заявлять native/CI/keyring/live-provider квалификацию по синтетическим тестам.
  - Status: PASS
  - Observed: "Docs056 независимый docs pass: desktop-команда, Testing и architecture debt/drift соответствуютcode/Evidence. Baseline033CI/E2E и pendingCI/nativegates сохранены; реальныйprovider/keyring/platform qualification не заявлены."
<!-- VERIFICATION-EVIDENCE:END -->

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.




## Blocker / Failure reason

—
