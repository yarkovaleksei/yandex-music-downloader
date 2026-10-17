---
schema: 1
id: STEP-028
status: completed
type: adr
priority: medium
phase: desktop
depends_on:
  - STEP-027
requirements:
  - REQ-033
  - REQ-046
  - REQ-047
adrs:
  - ADR-014
  - ADR-015
  - ADR-016
architecture_refs:
  - docs/architecture.md#security-boundaries
  - docs/architecture.md#data-state-model
  - docs/architecture.md#deployment-runtime-assumptions
risk_flags:
  - architecture
  - security-sensitive
plan:
  status: ready
  revision: 2
  context_basis: sha256:ec5b4f1ec4c64f75a2c1b429cc73e552e6134931b2500a6c4665ab62f37faa4c
  content_hash: sha256:a33f0b7387dfcf3ce5050ef7c714157c50c04b83d5babffa8e33f2b4dbf9c86e
  reviewed_report: planning/plan-reviews/STEP-028/PLAN-REVIEW-20261016T150847Z.md
  planned_at: 2026-10-16T15:08:47+00:00
  execution_groups:
  context_components:
    - "ADR@ADR-014=sha256:d21dd58fd7f4167a6b4820ba1f26624fcf440fb7a3f9fdc926e1ec517a969f39"
    - "ADR@ADR-015=sha256:0fd7f2940c2f6ac5a15eda9b9c9ad7c6a961062d03a4eedd4e3dd03eb8750d53"
    - "ADR@ADR-016=sha256:5f6730e0a0beed792f678c7872463edce8645c0d2642f3c1303ba5c1fbe923c7"
    - "ARCH@docs/architecture.md#data-state-model=sha256:38ecd31bbd0a8b067d00ce90ed660453971643d751137a909f1f497e99ccd0fc"
    - "ARCH@docs/architecture.md#deployment-runtime-assumptions=sha256:7ecd7f0292c935338b551e3c3a5e9cc4276a1f9452ff944e5f9c08f6ef36d308"
    - "ARCH@docs/architecture.md#security-boundaries=sha256:f213ddc0354e3d3e9f61f234de7da6f7042599f8ec5b729713bdf760b82904ab"
    - "PRN@PRN-001=sha256:3b3801f207fafc3f77272f0e93570258a6d006964839d93a276accd814d548af"
    - "PRN@PRN-002=sha256:f29ee3fbdb9cf65cf9739d0907768bbf192ad88b8e443110d4d82f81c6b79ecb"
    - "PRN@PRN-003=sha256:16516d7d302fecda5f7615f9d55e29e04b588d671f8660640e1f61d1619e4ef8"
    - "REQ@REQ-033=sha256:eebd2c563c397a0e22045b2832633cdee5ec23fc88fb3b2a025f8a6f41181a2a"
    - "REQ@REQ-046=sha256:50ca6fd6d75bae1047eb03c96912188a8d04e11965c7cc0de64d04db186131f0"
    - "REQ@REQ-047=sha256:5b49d64a9f35b1a3853d2e6b523bab0a13abe1b0b4d12ef38bb9195507a33630"
    - "STEP@STEP-027=sha256:9684298e9dfaedbf9ef1e66d17b209ac7e9691fc17bee336d5f75a9355e97e50"
    - "STEP@STEP-028=sha256:e1f58f5c802cc73b2827069be0953c0750e26c715b3396acfb4cefb074914700"
---

# STEP-028 — ADR: SQLite, модель безопасности Electron и IPC

## Goal

Принять решения по SQLite-библиотеке и миграциям, модели безопасности Electron, typed IPC contract и secure storage; закрыть OQ-010.

## Context

Решения принимаются после стабилизации headless core (brief §49 STEP 4) и не должны ломать границы ADR-001.

## Scope

- ADR «SQLite persistence» (библиотека, миграции).
- ADR «Electron security model» и ADR «IPC contract».
- Решение по secure storage (OQ-010) в ADR либо `deferred`: Linux без `basic_text`, привязка Keychain к подписи приложения (связь со STEP-034).
- Роль SQLite относительно файловых manifest, общий каталог состояния CLI и desktop, единая система миграций.
- Где выполняется application: main process или `utilityProcess`; ограничения native-модулей SQLite для Electron.
- Обновить architecture baseline.

## Mutation policy

### Allowed

- `docs/adr/**`, `docs/architecture.md`, `docs/open-questions/**`, `docs/research/**`.

### Conditional

- Нет.

### Forbidden

- Production-код.
- Реализация future/unrelated STEP «заодно».

## Out of scope

- Реализация (STEP-029, STEP-030).

## Acceptance criteria

- ADR accepted и согласованы с ADR-001 и PRN-001/PRN-002.
- OQ-010 разрешён либо отложен с обоснованием.
- Двусторонняя traceability ADR↔STEP актуальна.

## Verification

- command: `python3 .harness/tools/validate.py --mode manual`
- manual: Независимая архитектурная проверка.

## Deliverables

- ADR и обновлённая architecture.

## Implementation plan

### 1. Сверить решения с Accepted ADR, REQ и кодом

- Сопоставить ADR-014/015/016 с ADR-001/004/006/007/010, REQ-033/046/047 и PRN-001/002/003
- Подтвердить по коду, что stores создаёт composition root (composition-root.ts, runtime-adapters.ts), boundaries запрещают apps импортировать persistence (eslint.boundaries.config.mjs), provider открывает браузер через child_process (auth-browser.ts)
- Подтвердить первоисточниками утверждения о better-sqlite3 13 (Node-API) и Electron safeStorage (main-only, basic_text)

**Files:**
- docs/adr/ADR-014-sqlite-persistence.md
- docs/adr/ADR-015-electron-security-model.md
- docs/adr/ADR-016-desktop-ipc-contract.md

**Risks:**
- Работоспособность Node-API bindings в Electron utilityProcess (H-001) остаётся ожиданием: ADR фиксирует её как обязательство STEP-029/030 без fallback, а не как доказанный факт
- Профиль клиента в RuntimeAdapters и параметризуемый namespace (H-002) требуют разрешения в контракте STEP-030 — prerequisite перед STEP PLAN STEP-030

### 2. Зафиксировать ADR-014 (SQLite persistence)

- Библиотека better-sqlite3 13 только в packages/persistence, создание store в composition root
- Общая база <stateDir>/state.sqlite3, WAL, BEGIN IMMEDIATE для аренды, сверка user_version в каждой транзакции записи
- Forward-only миграции N → N+1 с резервной копией, отказ без изменений для более новой схемы, идемпотентный импорт файловых manifest
- Отсутствие секретов в схеме и автоматическая проверка в STEP-029
- Owner-only права: stateDir 0700, база/WAL/SHM/резервные копии 0600 на POSIX, ACL профиля на Windows; проверка прав в обязательствах STEP-029

**Files:**
- docs/adr/ADR-014-sqlite-persistence.md

### 3. Зафиксировать ADR-015 (безопасность Electron и secure storage) и разрешить OQ-010

- Топология main / application host (utilityProcess) / preload / renderer
- Обязательные webPreferences, CSP-инварианты (default-src 'none', frame-src 'none', script-src 'self', исключения для MUI и обложек), запрет навигации включая will-frame-navigate, отклонение permissions
- Файловые действия без путей от renderer: «показать в папке» по jobId, каталоги только из системного диалога main через непрозрачный directoryRef, без fs-операций main по строкам renderer
- Desktop credential store на @napi-rs/keyring с namespace music-downloader.desktop.yandex-music, без plaintext/safeStorage fallback
- Перевести OQ-010 в resolved со ссылкой на ADR-015

**Files:**
- docs/adr/ADR-015-electron-security-model.md
- docs/open-questions/OQ-010-secure-storage.md

### 4. Зафиксировать ADR-016 (typed IPC contract)

- Единый contract module DesktopApi, каналы desktop-api:v1:<method>
- Проверка отправителя и runtime-схем в main до host, MessagePort main ↔ host
- Lint-запрет произвольных каналов и тесты валидации каждого метода как обязательства STEP-030
- Negative-тесты методов с каталогом: неизвестный directoryRef, локальный, UNC, WebDAV и device-пути отклоняются без fs-вызова

**Files:**
- docs/adr/ADR-016-desktop-ipc-contract.md

### 5. Обновить architecture baseline, индекс ADR и двустороннюю traceability

- Обновить разделы components, data-state-model, security-boundaries, deployment-runtime-assumptions и architecture debt (открытые решения — OQ-009 deferred, OQ-013 open)
- Добавить ADR-014/015/016 в docs/adr/README.md
- Проставить adrs в REQ-033/046/047 и STEP-028/029/030/031/032/034/035/036 в соответствии со steps/requirements ADR
- Пересобрать projections через sync-projections.py

**Files:**
- docs/architecture.md
- docs/adr/README.md
- docs/requirements/REQ-033-persist-sqlite.md
- docs/requirements/REQ-046-desk-security.md
- docs/requirements/REQ-047-desk-secure-storage.md
- planning/tasks/STEP-028.md
- planning/tasks/STEP-029.md
- planning/tasks/STEP-030.md
- planning/tasks/STEP-031.md
- planning/tasks/STEP-032.md
- planning/tasks/STEP-034.md
- planning/tasks/STEP-035.md
- planning/tasks/STEP-036.md

**Risks:**
- Frontmatter adrs в REQ/STEP вне Allowed: допускается только как обратная traceability, требуемая Acceptance; содержательные секции не меняются

### 6. Проверка и независимое ревью

- Запустить validate.py --mode manual
- Учесть findings F-001…F-004 из planning/reviews/STEP-028/REVIEW-20261016T145952Z.md (пути из renderer, CSP default-src, права файлов SQLite, статус OQ-011 в architecture.md)
- Получить независимый read-only архитектурный и security review ADR против acceptance criteria; производственный код не менять
- Записать в Evidence STEP-028 риски downstream: контракт STEP-030 (utilityProcess, packages/persistence) и STEP-032 (packages/shared)

## Evidence





<!-- VERIFICATION-EVIDENCE:START -->
- Verification run: 2026-10-16T15:09:18Z
- Status: PASS
- Automated resumed: false
- Git head: b54e0c94d18f62f3cc9001085b720aedac78c65b
- Worktree hash: sha256:14be259e3a927ae2ea93dd2f806a4f6e6f44473ebb22b209607e00397a26bf3d
- Verification contract basis: sha256:d445d35dc4330f737edb62ba505b5f4cd833f0ed502d5345b3e20106dcfde4d0
- Verification context basis: sha256:57124e58a01fd536226a809924912649667bf051d044a0855f9ad847bd516935
- Subject git head: b54e0c94d18f62f3cc9001085b720aedac78c65b
- Subject worktree hash: sha256:e5ffa609d03df9879d8b5a507a37d50752d414680e8c3147ae590d9f84738625
- Subject content hash: sha256:e6c7c8f74dc78066e9d14ff039816a950a52e3d1aa72c082957587c84a726bd5

### Automated verification
- Command: python3 .harness/tools/validate.py --mode manual
  - Status: PASS
  - Exit code: 0
  - Duration ms: 6510
  - stdout sha256: 76fc7eca2fdd80efbd8cc36d9df5b5ce582a78fed8b3b6e0d28f00787693bfcb
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 67
  - stderr bytes: 0

### Product verification
- none

### Manual verification
- Check: Независимая архитектурная проверка.
  - Status: PASS
  - Observed: "Независимый read-only architect reviewer: три раунда, итог PASS по ADR-014/015/016 против ADR-001/004/006/007/010, REQ-033/046/047, PRN-001/002/003 и кода. REVIEW-20261016T145952Z (lead + security) вернул FAIL с F-001…F-004; все findings исправлены в ADR-014/015/016 и architecture.md. Повторный независимый planning reviewer (PLAN-REVIEW-20261016T150847Z) подтвердил покрытие исправлений и отсутствие новых противоречий. Acceptance: ADR согласованы с ADR-001 и PRN-001/002; OQ-010 resolved через ADR-015; двусторонняя traceability взаимна. Это документальный review, не runtime proof: платформенные доказательства — STEP-029/030. Финальное подтверждение закрытия findings — следующий REVIEW."
<!-- VERIFICATION-EVIDENCE:END -->

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.

### Наблюдения принятия ADR

- Приняты ADR-014 (SQLite: `better-sqlite3` 13 на Node-API, общая база `<stateDir>/state.sqlite3`, WAL, forward-only миграции с резервной копией, сверка `user_version` в каждой транзакции записи, идемпотентный импорт файловых manifest), ADR-015 (application host в `utilityProcess`, конфигурация BrowserWindow, CSP-инварианты, desktop credential store на `@napi-rs/keyring` с namespace `music-downloader.desktop.yandex-music`) и ADR-016 (typed `DesktopApi` из единого contract module, проверка отправителя и схем в main). OQ-010 resolved через ADR-015.
- Ключевые факты сверены с первоисточниками: release notes better-sqlite3 v13.0.0, документация Electron `safeStorage`. Работоспособность native bindings в Electron — это ожидание; доказательство остаётся обязательством STEP-029/030 без fallback.
- Риск перед `STEP PLAN STEP-030`: Scope STEP-030 говорит «createApplication… в main», что противоречит ADR-015 (`utilityProcess`), а Mutation policy не разрешает `packages/persistence/**` (параметризуемый namespace keyring store). Контракт нужно поправить canonical-правкой до планирования.
- Риск перед `STEP PLAN STEP-032`: settings/history DTO для `DesktopApi` берутся из `packages/shared` (ADR-016), но Mutation policy STEP-032 этого не разрешает.
- Вне Allowed изменён только frontmatter `adrs` STEP-028…036 и REQ-033/046/047: это обратная traceability, которую требует acceptance criterion.





## Blocker / Failure reason

—
