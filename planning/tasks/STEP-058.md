---
schema: 1
id: STEP-058
status: planned
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
  - docs/architecture.md#основные-компоненты-границы
  - docs/architecture.md#data-state-model
  - docs/architecture.md#deployment-runtime-assumptions
architecture_outputs:
  - docs/architecture.md#основные-компоненты-границы
  - docs/architecture.md#data-state-model
  - docs/architecture.md#deployment-runtime-assumptions
risk_flags:
  - data-migration
  - security-sensitive
plan:
  status: not_planned
  revision: 0
  context_basis: null
  content_hash: null
  reviewed_report: null
  planned_at: null
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
- manual: На Linux со mock provider сверить макеты 01–10, обе темы и широкое окно; сохранить screenshots/checklist в apps/desktop/evidence/STEP-058. Проверить названные функции, состояние после restart и отсутствие реальных account данных/секретов; сверить документацию с фактическим результатом. Нативные Windows/macOS прогоны не требуются.

## Deliverables

- Реализованный UI и переносимые параметры REQ-058 с целевыми tests и Linux E2E.
- Screenshots и checklist по всем десяти макетам в `apps/desktop/evidence/STEP-058/**`.
- `docs/development.md` — настройки и пользовательские сценарии после реализации.
- `docs/architecture.md#основные-компоненты-границы`, `docs/architecture.md#data-state-model`, `docs/architecture.md#deployment-runtime-assumptions` — фактические UI/DTO/settings изменения и границы платформенного Evidence.

## Implementation plan

Заполняется командой `STEP PLAN STEP-058`. Пока semantic planning-review не дал PASS для текущих context basis + content hash, `plan.status` не может быть `ready`.

## Evidence

2026-10-29: задача добавлена по запросу владельца после сравнения десяти макетов с реализацией. Владелец явно разрешил завершить STEP-054 независимо от STEP-058. Production-код при добавлении задачи не менялся.

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.

## Blocker / Failure reason

—
