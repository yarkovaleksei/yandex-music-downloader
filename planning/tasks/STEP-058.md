---
schema: 1
id: STEP-058
status: completed
type: implementation
priority: medium
phase: desktop
depends_on:
  - STEP-031
  - STEP-032
  - STEP-056
requirements:
  - REQ-010
  - REQ-025
  - REQ-026
  - REQ-028
  - REQ-048
  - REQ-049
  - REQ-050
  - REQ-051
  - REQ-052
  - REQ-057
  - REQ-058
adrs:
  - ADR-014
  - ADR-015
  - ADR-016
  - ADR-019
architecture_refs:
  - "docs/architecture.md#основные-компоненты-границы"
  - docs/architecture.md#data-state-model
  - docs/architecture.md#deployment-runtime-assumptions
architecture_outputs:
  - "docs/architecture.md#основные-компоненты-границы"
  - docs/architecture.md#data-state-model
  - docs/architecture.md#deployment-runtime-assumptions
risk_flags:
  - data-migration
  - security-sensitive
plan:
  status: ready
  revision: 1
  context_basis: sha256:129de40cab215128743ff410cfa5de7edf642a6d4448d8a1894e5ef1999f1688
  content_hash: sha256:c63e0c1d9412e44cc976a15d31bcec4751fa326bcfeabbce84f0d01f0468702a
  reviewed_report: planning/plan-reviews/STEP-058/PLAN-REVIEW-20261029T182507Z.md
  planned_at: 2026-10-29T18:25:08+00:00
  execution_groups:
    contracts:
      title: "Переносимые параметры и persistence compatibility"
      steps:
        - 1
      dependsOn: []
      mutationPaths:
        - packages/shared/src
        - packages/persistence/src
      verificationResponsibilities:
        - "Roundtrip/defaults/snapshot allowlists и legacy replay; целевые tests/typecheck"
      parallel: false
    integration:
      title: "Core output, provider DTO и desktop boundary"
      steps:
        - 2
        - 3
        - 4
      dependsOn:
        - contracts
      mutationPaths:
        - packages/shared/src
        - packages/application/src
        - packages/providers/yandex-music/src
        - packages/core/planner/src
        - packages/core/downloader/src
        - packages/metadata/src
        - apps/desktop/src/contract
        - apps/desktop/src/host
        - apps/desktop/src/preload
        - apps/desktop/src/main
      verificationResponsibilities:
        - "H-001 actual output/replay, H-002 same support/selection без fallback; IPC и job-owned auto-open; целевые tests/typecheck"
      parallel: false
    renderer:
      title: "Экраны и визуальное поведение"
      steps:
        - 5
        - 6
      dependsOn:
        - integration
      mutationPaths:
        - apps/desktop/src/renderer
      verificationResponsibilities:
        - "REQ058 UI и REQ057 regressions, component tests/theme/draft selection; целевые tests/typecheck"
      parallel: false
    evidence:
      title: "Linux Electron и макеты01–10"
      steps:
        - 7
      dependsOn:
        - renderer
      mutationPaths:
        - apps/desktop/e2e
        - apps/desktop/evidence/STEP-058
      verificationResponsibilities:
        - "Полные lint/typecheck/test/build/Electron и light/dark/wide screenshot checklist"
      parallel: false
    documentation:
      title: "Подтверждённые claims и валидация"
      steps:
        - 8
      dependsOn:
        - evidence
      mutationPaths:
        - docs/development.md
        - docs/architecture.md
        - apps/desktop/evidence/STEP-058
      verificationResponsibilities:
        - "Docs соответствуют code/Evidence, validate --mode manual"
      parallel: false
  context_components:
    - "ADR@ADR-014=sha256:d21dd58fd7f4167a6b4820ba1f26624fcf440fb7a3f9fdc926e1ec517a969f39"
    - "ADR@ADR-015=sha256:0fd7f2940c2f6ac5a15eda9b9c9ad7c6a961062d03a4eedd4e3dd03eb8750d53"
    - "ADR@ADR-016=sha256:5f6730e0a0beed792f678c7872463edce8645c0d2642f3c1303ba5c1fbe923c7"
    - "ADR@ADR-019=sha256:661497200e97275c9243a5f4b2594b02b1d04a026a4c6c9a65f4dc6f95dc3a7b"
    - "ARCH@docs/architecture.md#data-state-model=sha256:bac0a42e654feadbc18804cc8ef84f4ad2f2f5608fff6342592e6b9997098827"
    - "ARCH@docs/architecture.md#deployment-runtime-assumptions=sha256:fc520397c4d2e3737c000cc225b7b76b4ec3aef0d626169e608e2954cab41cf9"
    - "ARCH@docs/architecture.md#основные-компоненты-границы=sha256:8949a520f1887d212f3b1aa7fd830fb69a1c7e2415238032e7ee14eb7498d0a6"
    - "PRN@PRN-001=sha256:3b3801f207fafc3f77272f0e93570258a6d006964839d93a276accd814d548af"
    - "PRN@PRN-002=sha256:f29ee3fbdb9cf65cf9739d0907768bbf192ad88b8e443110d4d82f81c6b79ecb"
    - "PRN@PRN-003=sha256:16516d7d302fecda5f7615f9d55e29e04b588d671f8660640e1f61d1619e4ef8"
    - "REQ@REQ-010=sha256:4c3e20f37c1f07a769958dd0d5e88d8c04912b423b2dacd33cb5201bf43896e1"
    - "REQ@REQ-025=sha256:8467f35ac7f8235da2f28d4cea0d8ec9cf89f8c900729b0d27eae30c9ff4fc9c"
    - "REQ@REQ-026=sha256:14c7572b0af09eef9f704672275887d713d1d0becac1c1a91d9f3a4081f9ecbc"
    - "REQ@REQ-028=sha256:9e4bdaac5e5f3130ee37ce5d52b39df3dd4e884ce0ef1733f7a712cb42c8438f"
    - "REQ@REQ-048=sha256:034528c3e65fc23b8aaedfd63b1d8c3134079e05e9d7bb38b44cf259b5972249"
    - "REQ@REQ-049=sha256:605abb1d0414f1775b9eb876e3575ddc4a07477f6b89ca102ba4810183315197"
    - "REQ@REQ-050=sha256:057e45dda44290879b82883303fd638cb4863313ad70fe0329b4a18f160ebf35"
    - "REQ@REQ-051=sha256:d17bd02e7a7a0b61f9ce0d46aa8f82e35d508c906f4a0ba772c09f5221b63b41"
    - "REQ@REQ-052=sha256:a175b003a7089136c158a12c319af41b76224ed7f0129a98d3d3df0d18c17dc2"
    - "REQ@REQ-057=sha256:27aab3692da8cd65a23bc8fbc9e933cd83460bcea535f2561fbf28e3bdb9d1af"
    - "REQ@REQ-058=sha256:2a4181344bae47729fc065c8d1bd810dd26d8dab9fd60326a6eea45ad6fb1327"
    - "STEP@STEP-031=sha256:ec5bdfca46bb193cece7b4ac637c64a440be3e958cd81bb824f5e9fd5e87209f"
    - "STEP@STEP-032=sha256:fae227682d39f2eaa5277169a6868a00e75c4d3c39e652a98b98c654e174a0ed"
    - "STEP@STEP-056=sha256:d980488ba2ce34154dfc84dd7835a427f62b0da0b1285364577efe3d9033571b"
    - "STEP@STEP-058=sha256:78f0dea3b8489b9f1f2a267fc109e22dfc6c4284216d108d8a71bb5c67e3f321"
---

# STEP-058 — Недостающие функции desktop UI и соответствие макетам

## Goal

Реализовать недостающий функционал макетов и привести desktop-интерфейс к их компоновке и визуальному языку, сохранив принятые улучшения удобства REQ-057.

## Context

Сравнение `docs/brand/mockups/01..10` с текущей реализацией выявило отсутствие части сведений предпросмотра, вкладок загрузок, сортировки/календаря истории, переключателей обработки файлов, сохранения темы и подробностей аккаунта; выбор качества и уведомления реализованы иначе. Теги, обложки и `.m3u8` уже работают: задача добавляет управление ими, а не дублирует механизмы. STEP-031/032/056 завершены; их исторические Evidence и PASS не переписываются. Новое поведение закреплено REQ-058, исходные контракты качества и обработки сохраняются с его явными уточнениями.

Решение владельца от 2026-10-29: «Финальная платформенная проверка может и без него пройти. Там нет платформозависимых функций». STEP-054 не зависит от STEP-058 и может завершиться до него. STEP-058 также не ждёт STEP-054. Проверенные нативные артефакты сохраняют свой revision/build ID и не становятся доказательством новой UI-сборки.

## Scope

- Макеты 01/02: примеры ссылок, очистка URL, описание/длительность коллекции, автор и доступные изображения/миниатюры, честные состояния отсутствующих данных.
- Макет 03: вкладки состояний со счётчиками, названия и обложки загрузок, меню действий; сохранить свёрнутые подробности, массовые действия, достоверные progress/speed/ETA и безопасное скрытие завершённых.
- Макет 04: сортировка истории, календарный диапазон и дата со временем; сохранить поиск, ссылки, replay и удаление только записи.
- Макеты 05/07: вкладки настроек и «О программе», переключатели тегов/`cover.jpg`/`.m3u8`/открытия папки, сохранение темы; протянуть реальные параметры через существующие DTO/application/core и безопасное persistence, сохранить defaults старой конфигурации и снимок replay.
- Макет 08: применяемый/отменяемый выбор качества и реальных codec/bitrate вариантов с покрытием; сохранить REQ-010, отсутствие транскодирования и тихого fallback.
- Макет 06: доступные подтверждённые provider сведения аккаунта и безопасные fallback без выдуманных подписки, региона или форматов.
- Макет 09: оформление и содержание уведомлений; manual portable-обновления остаются по ADR-019. Макет 10: регрессионная сверка уже работающей авторизации.
- Визуальная сверка всех макетов в светлой/тёмной теме и на широком окне; обновить описание фактического UI/настроек и сохранить screenshots/checklist на mock данных.

## Mutation policy

### Allowed

- `apps/desktop/src/renderer/**` — экраны, тема, компоненты и tests.
- `apps/desktop/src/contract/**`, `apps/desktop/src/preload/**`, `apps/desktop/src/host/**` — типизированные безопасные операции и DTO для перечисленных функций.
- `packages/shared/src/**`, `packages/application/src/**` — переносимые параметры, preview/account/history DTO, снимок эффективных настроек и tests.
- `packages/core/planner/src/**`, `packages/core/downloader/src/**`, `packages/core/filesystem/src/**`, `packages/metadata/src/**` — реализация явного выбора доступного варианта и параметров обработки по REQ-058, без изменения прежних defaults и алгоритмов lifecycle.
- `packages/persistence/src/**` — сохранение новых настроек и совместимая forward-only миграция по ADR-014, если нужна.
- `apps/desktop/e2e/**`, `apps/desktop/evidence/STEP-058/**` — Linux regression/visual Evidence на синтетических данных; историческое Evidence других STEP не изменяется.
- `docs/development.md`, `docs/architecture.md#основные-компоненты-границы`, `docs/architecture.md#data-state-model`, `docs/architecture.md#deployment-runtime-assumptions` — подтверждённый результат реализации, настройки и границы платформенной приёмки.

### Conditional

- `apps/desktop/src/main/**` — только существующие IPC/notification/folder операции для перечисленных UI-функций, без новых платформенных интеграций, полномочий и изменения updater/security модели.
- `packages/providers/yandex-music/src/**` — только provider-owned проекция подтверждённых metadata/вариантов/account сведений через существующий API; без нового входа и live-запросов как обязательной проверки.
- `apps/desktop/package.json`, `package.json`, `yarn.lock` — только необходимый для календаря/существующего MUI UI компонент; обосновать выбор на PLAN, не менять packaging/toolchain.

### Forbidden

- Изменение CI, упаковки, installers, native bindings, secure storage и платформенных механизмов; изменение ADR-014/015/016/019 задним числом.
- Добавление зависимости STEP-054 от STEP-058, повторная Windows/macOS приёмка ради этого STEP или перенос старых PASS на новые артефакты.
- Выдуманные account данные, жёсткая привязка подписки к FLAC, обещание недоступных codec/bitrate и тихое снижение качества.
- Удаление аудиофайлов при очистке UI, обход application/provider границ, secrets в DTO/Evidence, unrelated hardening.

## Out of scope

- Новые платформы, перепаковка финальных наборов STEP-054, настройка production update feed, автоматическая установка обновлений.
- Переработка Device Authorization макета 10, новый auth/download API, транскодирование и обход provider ограничений.
- Откат согласованных REQ-057 улучшений ради буквального повторения иллюстративной геометрии макетов.

## Acceptance criteria

- Все перечисленные функции REQ-058 реализованы; для каждого макета 01–10 имеется screenshot и проверяемый checklist с объяснением допустимых отличий REQ-057.
- Настройки сохраняются после restart и реально управляют тегами, `cover.jpg`, `.m3u8`, темой и открытием папки. Старые настройки и действующие задания сохраняют прежнее поведение, replay использует исходный снимок.
- Проверены фильтры/счётчики загрузок, сортировка/календарь истории, меню и доступность действий; реальные названия/обложки не подменяются техническими ID при наличии metadata.
- Отмена качества ничего не меняет; применяются только подтверждённые варианты с честным покрытием. Старые `best/lossless/high/normal` сохраняют REQ-010, отсутствующие account/preview данные имеют fallback без утечки секретов.
- Linux-проверки и Electron E2E проходят; STEP-054 остаётся независимым, новые Windows/macOS прогоны не являются Acceptance этого STEP. Готовность новых артефактов не заявляется по историческим отчётам.
- Документация отражает подтверждённые настройки, ограничения и связь макетов с UI без изменения принятых архитектурных решений.

## Verification

- command: `npm run lint`
- command: `npm run typecheck`
- command: `npm test`
- command: `npm run build`
- command: `node apps/desktop/e2e/run.mjs`
- command: `python3 .harness/tools/validate.py --mode manual`
- manual: На Linux со mock provider сверить макеты01–10 в light/dark и широком окне; сохранить screenshots/checklist в apps/desktop/evidence/STEP-058. Проверить вкладки/счётчики/menu, inclusive calendar range, sorting/date+time, draft Apply/Cancel, optional metadata/account fallback, notifications и auth regression. Settings/theme восстановить после restart; H-001: реальные tags/embedded cover/cover.jpg/m3u8 и replay/resume используют исходный snapshot; H-002: предлагаемые exact codec/container подтверждены существующим processing либо явно unavailable и preview/resolver согласованы. Сверить docs с code/Evidence и отсутствие реальных account данных/секретов. Native Windows/macOS и packaging не требуются; отчёты STEP-054 не доказывают новую UI-сборку.

## Deliverables

- Реализованный UI и переносимые параметры REQ-058 с целевыми tests и Linux E2E.
- Screenshots и checklist по всем десяти макетам в `apps/desktop/evidence/STEP-058/**`.
- `docs/development.md` — настройки и пользовательские сценарии после реализации.
- `docs/architecture.md#основные-компоненты-границы`, `docs/architecture.md#data-state-model`, `docs/architecture.md#deployment-runtime-assumptions` — фактические UI/DTO/settings изменения и границы платформенного Evidence.

## Implementation plan

### 1. Согласовать переносимые параметры и совместимость сохранённых данных

- Сохранить QualityPreference best/lossless/high/normal; добавить optional variantSelection={codec,container,lossless,bitrate?} без provider-private key. При наличии selector имеет приоритет над preset без fallback; отсутствующий bitrate означает вариант без сообщённого bitrate, а не wildcard. Реальный AudioVariant трека сохраняется в manifest.
- DesktopSettings расширить writeTags=true, saveCoverFile=true, writeM3u8=true, openFolderOnComplete=false, theme=light|dark (default light). Встроенная обложка сохраняет default true независимо от text tags/cover.jpg. Settings quality остаётся preset, variantSelection относится к конкретному источнику.
- EffectiveDownload хранит variantSelection и эффективные параметры обработки/автооткрытия. Старые settings и полные snapshots без новых полей нормализуются в прежние defaults; legacy без snapshot сохраняет disabled replay. Replay/resume не подставляют текущие настройки; чтение не переписывает исторический snapshot.
- Расширить обе явные settings/effectiveDownload allowlists и storage roundtrip. Использовать существующие JSON desktop_settings/job_settings без DDL, если структурная миграция не нужна; фактически необходимая миграция — только ADR-014 forward-only/backup/schema guards.

**Files:**
- packages/shared/src/domain.ts
- packages/shared/src/desktop-settings.ts
- packages/shared/src/desktop-state.ts
- packages/shared/src/application.ts
- packages/persistence/src/desktop-state-store.ts
- packages/shared/src/application.test.ts
- packages/persistence/src/desktop-state-store.test.ts

**Tests:**
- H-001, npm test: roundtrip новых полей, defaults старых settings/full snapshots, legacy replay disabled, секреты не проходят projection.

### 2. Протянуть параметры до варианта и фактических выходных файлов

- ApplicationFacade фиксирует effective settings один раз; Jobs сохраняет snapshot до manager.run и передаёт исходные параметры в manager на create/resume/retry/replay. CLI defaults, lifecycle/leases/control/checkpoints/finalization и immutable DownloadPlan сохраняются.
- Quality resolver: прежний supports-фильтр, точное сравнение variantSelection, первый совпавший вариант в порядке provider. При отсутствии — QualityUnavailableError трека без снижения качества; остальные продолжаются. Прежние четыре preset-ветки не переписывать.
- Передавать writeTags/saveCoverFile/неизменный embedArtwork через manager/processing ports/pipeline в MetadataWriteRequest. writeTags=false пропускает только текстовые properties; встроенная обложка и cover.jpg независимы. writeM3u8 управляет существующей manager.writePlaylist точкой до job.completed, не меняя каталог/порядок/нумерацию/исключение неуспешных треков.
- H-002: одинаковый support predicate preview/resolver; каждый предлагаемый codec/container подтверждён существующим processing/metadata/validation на синтетическом файле либо unavailable. Raw provider FLAC/flac-mp4 не доказывает поддержку; без транскодирования и нового capability framework.

**Files:**
- packages/application/src/application.ts
- packages/application/src/jobs.ts
- packages/application/src/composition-root.ts
- packages/application/src/adapters/download-files.ts
- packages/core/planner/src/quality.ts
- packages/core/downloader/src/ports.ts
- packages/core/downloader/src/pipeline.ts
- packages/core/downloader/src/manager.ts
- packages/metadata/src/index.ts
- packages/core/planner/src/quality.test.ts
- packages/core/downloader/src/manager.test.ts
- packages/metadata/src/index.test.ts
- packages/application/src/desktop-state.integration.test.ts
- packages/application/src/playlist.integration.test.ts

**Tests:**
- H-001, npm test: реальные output on/off, независимое чтение tags/embedded cover, отдельные cover.jpg/m3u8; смена defaults/restart/replay/resume сохраняют исходный snapshot.
- H-002, npm test: exact match/no match/partial coverage/повторы позиций, прежние presets, no fallback и согласованный preview/selection support.

### 3. Расширить provider metadata и безопасные application DTO

- Добавить только подтверждённые существующим ответом provider optional metadata: описание коллекции, автор/изображение, account email/регион/подписка/форматы. Schemas/mappers расширять под фактическую форму; отсутствующие данные остаются отсутствием. Новый auth/download endpoint и обязательный live account тест не добавлять.
- PreviewDto: description?, durationMs? с честной полнотой агрегата, authorArtwork? и миниатюры через существующие fetchArtwork/ArtworkDto bytes. Отсутствующие duration/artwork имеют fallback. Renderer не получает ArtworkRef.key, signed URL или raw payload.
- Explicit preview варианты: уникальные безопасные descriptors и available/total по позициям после того же support-фильтра resolver; без констант 320/256/128/FLAC из картинки. Preset coverage сохраняется.
- JobSnapshot получает title/author из manifest plan и сохранённый openFolderOnComplete; downloadArtwork(jobId) → ArtworkDto|null по аналогии historyArtwork независимо от list/control. Ошибка изображения даёт placeholder; AccountFacade allowlist-ит optional поля, форматы не выводятся из подписки. Расширить safe cache projection.

**Files:**
- packages/shared/src/provider.ts
- packages/shared/src/domain.ts
- packages/shared/src/application.ts
- packages/providers/yandex-music/src/index.ts
- packages/providers/yandex-music/src/metadata/schemas.ts
- packages/providers/yandex-music/src/metadata/mappers.ts
- packages/application/src/application.ts
- packages/application/src/preview.ts
- packages/application/src/jobs.ts
- packages/application/src/cached-provider.ts
- packages/application/src/cache-payload.ts
- packages/application/src/preview.test.ts
- packages/application/src/application.contract.test.ts
- packages/providers/yandex-music/src/metadata/metadata.test.ts

**Tests:**
- npm test: track/album/playlist и повторы; optional/fallback metadata/account; DTO/cache не содержат fixture credentials/CDN signed URL; list/control доступны без картинки.

### 4. Синхронизировать typed desktop boundary и main действия

- Расширить strict contract module schemas для settings/variantSelection, snapshot/preview/account и downloadArtwork; синхронизировать host/preload. Сохранить opaque directoryRef/executableRef, единый namespace и запрет передачи renderer путей/provider keys.
- На новом полном completed main использует сохранённый job flag openFolderOnComplete и существующее host-resolved show-in-folder(jobId). false/cancelled/failed/completed_with_errors не открывают папку; default output и list/refresh истории не заменяют каталог задания. Сохранить существующую дедупликацию, без нового persisted delivery protocol.
- Уведомления различают полный успех/частичную ошибку/отмену и сохраняют error-pause безопасные сообщения. Системные вызовы только main; новые Electron полномочия не добавлять.

**Files:**
- apps/desktop/src/contract/desktop-api.ts
- apps/desktop/src/host/application-handler.ts
- apps/desktop/src/preload/index.ts
- apps/desktop/src/main/broker.ts
- apps/desktop/src/main/job-notifications.ts
- apps/desktop/src/contract/desktop-api.test.ts
- apps/desktop/src/preload/preload.test.ts
- apps/desktop/src/main/job-notifications.test.ts

**Tests:**
- npm test: strict valid/invalid inputs, прежние path/ref/secret invariants; auto-open только enabled+completed и original job folder, partial/error/cancel/list ничего не открывают.

### 5. Реализовать Главную, черновик качества и вкладки настроек

- Добавить примеры/очистку URL с существующей invalidation preview, описание/длительность/автора/изображения/миниатюры и честные fallback; загрузка только по явному действию.
- Draft quality отделить от applied: открытие копирует applied, Apply применяет доступный descriptor/preset, Cancel/Escape/backdrop ничего не меняют. Показывать actual/partial coverage; смена источника сбрасывает устаревшие варианты, исходный best default не меняется.
- Settings разделить на Основные/Загрузка/Файлы/Внешний вид/О программе, разместить старые поля/new switches. Сохранить FFmpeg optional/help и OUTCOME_UNKNOWN без автоматического повтора mutation. Updates оставить manual ADR-019 с честно disabled ненастроенным feed.
- App получает theme из getSettings; sidebar switch и вкладка сохраняют единый подтверждённый state через saveSettings без сброса остальных полей, restart восстанавливает тему. Сохранить fullwidth/fixed sidebar/REQ057. Использовать MUI и native type=date, без новой зависимости/toolchain.

**Files:**
- apps/desktop/src/renderer/App.tsx
- apps/desktop/src/renderer/Settings.tsx
- apps/desktop/src/renderer/theme.ts
- apps/desktop/src/renderer/Updates.tsx
- apps/desktop/src/renderer/App.test.tsx
- apps/desktop/src/renderer/Settings.test.tsx
- apps/desktop/src/renderer/Updates.test.tsx

**Tests:**
- npm test: clear/examples/no autostart/fallback; Apply/Cancel/Escape/backdrop, partial/no variants/source change; все вкладки/switches/theme restart и сохранность других settings.

### 6. Дополнить загрузки, историю, аккаунт и уведомления

- Downloads: Очередь=queued/paused/interrupted, Активные=running, Завершённые=completed/cancelled, Ошибки=failed/completed_with_errors. Счётчики и список используют один predicate только видимых заданий после штатного hide.
- Карточки title/author/artwork/fallback и меню допустимых действий сохраняют свёрнутые аккордеоны, progress/speed/ETA, массовые pause/resume, folder actions, partial/unknown-outcome notices и hide без удаления jobs/history/files.
- History: TableSortLabel по отображаемым столбцам со стабильными ties, два native date поля inclusive по локальным дням, объяснение неверного диапазона и предсказуемый unknown bytes order; дата со временем. Поиск/type/replay/tooltip/links/artwork/record-only removal сохраняются.
- Account показывает подтверждённые optional поля либо Нет данных, без связи форматов с подпиской. Уведомления оформить по09 и различать outcome; auth10 только regression. Сверить структуру/иерархию с макетами, quantity helper переиспользовать; REQ057 компактность и ширина сохраняются.

**Files:**
- apps/desktop/src/renderer/Downloads.tsx
- apps/desktop/src/renderer/useDownloads.ts
- apps/desktop/src/renderer/History.tsx
- apps/desktop/src/renderer/Account.tsx
- apps/desktop/src/renderer/App.tsx
- apps/desktop/src/renderer/Downloads.test.tsx
- apps/desktop/src/renderer/History.test.tsx
- apps/desktop/src/renderer/Account.test.tsx

**Tests:**
- npm test: mixed state tabs/counters/menu/mass/hide; sort asc/desc/search/type/dates/границы дней/time/replay/remove; account fallback, outcome notices, keyboard и existing auth.

### 7. Подтвердить Linux сценарии и воспроизводимые screenshots

- Обновить synthetic E2E provider/download scenario под новые DTO/settings, проверить preview → exact/preset → download → history/replay и restart settings/theme. Existing Electron runner без real account/live network и без изменения packaging/native STEP054.
- Новый воспроизводимый mock DesktopApi visual fixture в apps/desktop/e2e или evidence/STEP058; исторический STEP056 fixture только input. Linux screenshots/checklist по01–10/light/dark/wide включают mixed downloads/calendar/settings/partial quality/account fallback/notices/auth; synthetic данные, revision/команды/mock inputs, без secrets.
- Полный lint/typecheck/test/build/Electron E2E; concrete paths tests H-001 snapshot/output/replay и H-002 supported exact selection/processing записать в Evidence. Группы выполнять последовательно после устранения фактических отказов; Windows/macOS/VM/installer/production feed не требуются.

**Files:**
- apps/desktop/e2e/provider.mjs
- apps/desktop/e2e/download.spec.mjs
- apps/desktop/e2e/STEP-058-visual-fixture.mjs
- apps/desktop/evidence/STEP-058/**

**Tests:**
- node apps/desktop/e2e/run.mjs: полный Linux Electron с restart/параметрами.
- Manual: матрица01–10/light/dark/wide; старые platform PASS не переносятся на новую сборку.

### 8. Синхронизировать фактическую документацию и Evidence

- После реализации обновить docs/development.md: UI-вкладки, settings/defaults, snapshots/replay, exact supported variants/coverage, visual reproduction и account fallback; не описывать неподтверждённое как поставленное.
- Только разрешённые architecture anchors: компоненты/границы — safe DTO и main folder owner; data/state — JSON normalization и effective snapshot; deployment — Linux Evidence STEP058 без переноса native reports на новый build. ADR и независимость STEP054 сохранить.
- Сохранить checklist/observed results/test/screenshots ссылки и validate. Literal output не реконструировать; manual результаты и ограничения отметить отдельно. Коммит после реализации автоматически не делать.

**Files:**
- docs/development.md
- docs/architecture.md#основные-компоненты-границы
- docs/architecture.md#data-state-model
- docs/architecture.md#deployment-runtime-assumptions
- apps/desktop/evidence/STEP-058/**

**Tests:**
- python3 .harness/tools/validate.py --mode manual
- Manual: code/docs/Evidence, defaults, provider/IPC, manual updates и ограничения согласованы.

## Evidence


<!-- VERIFICATION-EVIDENCE:START -->
- Verification run: 2026-10-29T19:39:43Z
- Status: PASS
- Automated resumed: false
- Verification mode: full
- Incremental executed checks: 6
- Incremental reused checks: 0
- Targeted feedback reused: 0
- Incremental fallback reason: RISK_REQUIRES_FULL
- Git head: c9bb8326e85d7c5ffa15573603b62beab4667a9e
- Worktree hash: sha256:4c70b367360db06b6d407ef94e849a54e35a86da87ee043a492b5e690f42bbf9
- Verification contract basis: sha256:c38e5aee037aab84a928e310959b4925f5ae582e5686f4c6e9bed1da66586081
- Verification context basis: sha256:cfcb25be34e9eec1e031b5fb90ad5fe57cf79a087415b5f125b8ce6386c6490f
- Subject git head: c9bb8326e85d7c5ffa15573603b62beab4667a9e
- Subject worktree hash: sha256:95df5ddb3eaae9c365566be095567c696393c6a700fee06df4ae849df78d8ec7
- Subject content hash: sha256:193950a6679745a5d0275dfd465d7e977f2dc5423af753be88ed7d504e96963f

### Automated verification
- Command: npm run lint
  - Status: PASS
  - Exit code: 0
  - Duration ms: 15989
  - stdout sha256: a9abc4bc51d6729860fb000bf87c02e5a80cc830999d05e640c5651c7e3daa6a
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 147
  - stderr bytes: 0
  - Provenance: executed
- Command: npm run typecheck
  - Status: PASS
  - Exit code: 0
  - Duration ms: 7976
  - stdout sha256: 73ad7967b0b62b903e0e14e90a6a3971d720cb1ab6b744714e6d2ef05dd89743
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 83
  - stderr bytes: 0
  - Provenance: executed
- Command: npm test
  - Status: PASS
  - Exit code: 0
  - Duration ms: 41079
  - stdout sha256: 2e070d964e5ed62997d040faf4dc03b8e5d64554401c4587d51eac5661cf4619
  - stderr sha256: afb738bdcd2ac2b0fdcd55e6bd82a9c2096f77fce7b4217e9dbf6a9398a98a53
  - stdout bytes: 19177
  - stderr bytes: 4700
  - Provenance: executed
- Command: npm run build
  - Status: PASS
  - Exit code: 0
  - Duration ms: 765
  - stdout sha256: 4a84685762211c33a9f2ac6336f7b1d29d9e1f9d26373ef0b9a167bf0a587116
  - stderr sha256: 351b524197fb492920789369e7f1a271420c757633fbb553b280a181ac4c31a4
  - stdout bytes: 88
  - stderr bytes: 360
  - Provenance: executed
- Command: node apps/desktop/e2e/run.mjs
  - Status: PASS
  - Exit code: 0
  - Duration ms: 11586
  - stdout sha256: 469b746009d32d992aa1b2476e7f2e5be84346390e0b0a13c4668d7da1a52690
  - stderr sha256: f9da309c0cf0358236b2f6515a681e6cc6d365550bef13f0dcbc91c10d778afb
  - stdout bytes: 283
  - stderr bytes: 163
  - Provenance: executed
- Command: python3 .harness/tools/validate.py --mode manual
  - Status: PASS
  - Exit code: 0
  - Duration ms: 5873
  - stdout sha256: f3c3153f26dc99c9cd0b924437ab6d607ee8bf2e9cbfd3fa9333a89fda6b4c8b
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 135
  - stderr bytes: 0
  - Provenance: executed

### Product verification
- none

### Manual verification
- Check: На Linux со mock provider сверить макеты01–10 в light/dark и широком окне; сохранить screenshots/checklist в apps/desktop/evidence/STEP-058. Проверить вкладки/счётчики/menu, inclusive calendar range, sorting/date+time, draft Apply/Cancel, optional metadata/account fallback, notifications и auth regression. Settings/theme восстановить после restart; H-001: реальные tags/embedded cover/cover.jpg/m3u8 и replay/resume используют исходный snapshot; H-002: предлагаемые exact codec/container подтверждены существующим processing либо явно unavailable и preview/resolver согласованы. Сверить docs с code/Evidence и отсутствие реальных account данных/секретов. Native Windows/macOS и packaging не требуются; отчёты STEP-054 не доказывают новую UI-сборку.
  - Status: PASS
  - Observed: "На Linux сверены все десять mockup: 31 screenshot, hashes source/reference inputs, light/dark, 1920px wide, inclusive 25–27 октября и sorting, tabs/counts/menu, optional metadata fallback, draft Apply/Cancel, четыре notification состояния и provider-owned auth HTML. CHECKLIST.md, visual-evidence.json и browser-commands.txt сохранены в apps/desktop/evidence/STEP-058. Настройки/theme/replay после restart подтверждены настоящим Electron E2E; contracts-integration-tests.txt доказывает H-001 actual tags/embedded cover/cover.jpg/m3u8 и original snapshot, H-002 exact support/selection и отсутствие fallback. Использованы synthetic данные без реального аккаунта/секретов. Docs сверены с code/Evidence. Native Windows/macOS и packaging не выполнялись, STEP-054 независим. После F-001/F-002 целевой browser прогон подтвердил Settings(light) → sidebar dark → немедленный Save без отката темы; реальный UI cancel без job.completed показал «Отменено», обновил counters, console errors=0. fix-visual-evidence.json и два fix screenshots дополняют неизменённые исходные31 capture. Независимый исходный reproducer2/2 и permanent renderer regression28/28 PASS; прочие ранее проверенные manual surfaces не затронуты."
<!-- VERIFICATION-EVIDENCE:END -->

2026-10-29: задача добавлена по запросу владельца после сравнения десяти макетов с реализацией. Владелец явно разрешил завершить STEP-054 независимо от STEP-058. Production-код при добавлении задачи не менялся.

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.


## Blocker / Failure reason

—
