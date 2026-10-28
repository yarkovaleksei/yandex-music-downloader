---
schema: 1
id: STEP-030
status: completed
type: implementation
priority: medium
phase: desktop
depends_on:
  - STEP-028
  - STEP-018
  - STEP-029
requirements:
  - REQ-045
  - REQ-046
  - REQ-047
  - REQ-048
adrs:
  - ADR-001
  - ADR-007
  - ADR-014
  - ADR-015
  - ADR-016
architecture_refs:
  - "docs/architecture.md#основные-компоненты-границы"
  - docs/architecture.md#security-boundaries
  - docs/architecture.md#deployment-runtime-assumptions
risk_flags:
  - security-sensitive
  - architecture
plan:
  status: ready
  revision: 2
  context_basis: sha256:c8faba98f6026d13ec3bd183a6300f2a9c1bae16131d65ae0200b4951b2aa802
  content_hash: sha256:e96c51bc821c04dabeb897f4319675a834f655eac3f9bf95a21160cfd449d71e
  reviewed_report: planning/plan-reviews/STEP-030/PLAN-REVIEW-20261027T105233Z.md
  planned_at: 2026-10-27T10:52:33+00:00
  execution_groups:
  context_components:
    - "ADR@ADR-001=sha256:0c9975737760fdee3b16ec2c99c8412cd98e81af5a0ce123cf70600a4a3200bc"
    - "ADR@ADR-007=sha256:04d6b08c651797508a14cb298d43f539d5364b851981d6d9064800f288b6b42c"
    - "ADR@ADR-014=sha256:d21dd58fd7f4167a6b4820ba1f26624fcf440fb7a3f9fdc926e1ec517a969f39"
    - "ADR@ADR-015=sha256:0fd7f2940c2f6ac5a15eda9b9c9ad7c6a961062d03a4eedd4e3dd03eb8750d53"
    - "ADR@ADR-016=sha256:5f6730e0a0beed792f678c7872463edce8645c0d2642f3c1303ba5c1fbe923c7"
    - "ARCH@docs/architecture.md#deployment-runtime-assumptions=sha256:8fea3897a05a28d78e3f786196d7d5d11ee3c3152cae1cee4350eee96e989e81"
    - "ARCH@docs/architecture.md#security-boundaries=sha256:f213ddc0354e3d3e9f61f234de7da6f7042599f8ec5b729713bdf760b82904ab"
    - "ARCH@docs/architecture.md#основные-компоненты-границы=sha256:71b9f3e670ab43120ca3a2daa79ddd7d72a21d67ea7e4c668174bbd4e0997e5c"
    - "OQ@OQ-010=sha256:5336b503d085a8cd21a14910ab7dbd5dcfdaa046e9a9f9671e50db26a3a1193a"
    - "PRN@PRN-001=sha256:3b3801f207fafc3f77272f0e93570258a6d006964839d93a276accd814d548af"
    - "PRN@PRN-002=sha256:f29ee3fbdb9cf65cf9739d0907768bbf192ad88b8e443110d4d82f81c6b79ecb"
    - "PRN@PRN-003=sha256:16516d7d302fecda5f7615f9d55e29e04b588d671f8660640e1f61d1619e4ef8"
    - "REQ@REQ-045=sha256:4c9dfa9b7d9be32ffc28ff8a30624457bb0a9dec267f12d4613a48590e93d741"
    - "REQ@REQ-046=sha256:50ca6fd6d75bae1047eb03c96912188a8d04e11965c7cc0de64d04db186131f0"
    - "REQ@REQ-047=sha256:5b49d64a9f35b1a3853d2e6b523bab0a13abe1b0b4d12ef38bb9195507a33630"
    - "REQ@REQ-048=sha256:c6d84b9da3f742170648ea6f2a5c92cf27b47101e614390fe1fe5cb4ec7a32dd"
    - "STEP@STEP-018=sha256:ef554746f2dd587e4003775194675c6948f4b905d548119bfb60e491e7ec4659"
    - "STEP@STEP-028=sha256:0b26eaa1ff27fe883b551af84df8b8463676622f7c1176ce364d00eaf6e67616"
    - "STEP@STEP-029=sha256:225e789d542dd1f1ead2af9ef5342d9f7457639bc2b7c8b83fadf61687d96141"
    - "STEP@STEP-030=sha256:fcfebe3b3c5aebedb600e2ebfac9ff93d8d688bddb28a56467c1b9e7c68b5d56"
---

# STEP-030 — Desktop shell: Electron, React, MUI, typed IPC, secure storage

## Goal

Создать минимальную desktop-оболочку (main, application host в `utilityProcess`, preload, renderer) с typed IPC, безопасной конфигурацией окна и токеном в системном secure storage.

## Context

UI является клиентом application layer; renderer не имеет доступа к fs/provider/токенам.

## Scope

- Electron main, application host в `utilityProcess`, preload и renderer; Vite, React, TypeScript, MUI, тема по брендбуку.
- Typed `DesktopApi` как проекция application API и общих DTO (ADR-007, ADR-016); запрет произвольных IPC-каналов. Main является IPC broker; `createApplication(runtimeAdapters)`, provider, SQLite и credential store работают в application host согласно ADR-015.
- Secure storage токена по ADR-015 (OQ-010): application выбирает CLI или desktop namespace через нейтральный профиль клиента; desktop не импортирует persistence и не получает токен.
- Минимальный экран и связь с application layer.
- После подтверждения реализации синхронизировать `docs/development.md`: фактическую сборку Electron preload, перечень workspace и связанные команды сборки desktop.

## Mutation policy

### Allowed

- `apps/desktop/**`, подключение в monorepo toolchain, `packages/application/**` (минимальное расширение).
- `packages/persistence/**` — только параметризация существующего keyring store для отдельного desktop namespace по ADR-015 и соответствующие тесты; без изменения CLI namespace.

### Conditional

- `docs/development.md` — только введение о сборке preload, разделы Development commands и Workspace в части фактически реализованного desktop toolchain; сохранить описания остальных пакетов и возможностей.

### Forbidden

- Прямой доступ renderer к fs/child_process/токенам/provider, nodeIntegration, полные экраны UX.
- Реализация future/unrelated STEP «заодно».

## Out of scope

- Экраны UX (STEP-031/032), packaging.

## Acceptance criteria

- Тест конфигурации окна подтверждает contextIsolation=true, nodeIntegration=false, sandbox=true.
- Все IPC-вызовы проходят через typed `DesktopApi`; произвольные channel strings запрещены lint-правилом.
- Токен хранится в системном secure storage; plaintext fallback отсутствует.
- Сборка и smoke-запуск выполнены на Windows x64, macOS arm64/x64 и Linux x64 (evidence).

## Verification

- command: `npm run lint`
- command: `npm run typecheck`
- command: `npm test`
- command: `npm run build`
- command: `python3 .harness/tools/validate.py --mode manual`
- manual: На Windows x64, macOS arm64, macOS x64 (при Rosetta отметить это в отчёте) и Linux x64 выполнить target-side build из текущих исходников и запустить desktop platform-check; JSON report с exit code сборки, exact source/build/runtime identity, загрузкой SQLite/keyring в utilityProcess, SQLite записью/чтением после перезапуска, keyring write/read/restart/delete и screenshot главного окна.
- manual: На каждой целевой ОС проверить реальную авторизацию desktop через системный браузер, account после перезапуска и logout; подтвердить системный secure storage, отсутствие plaintext fallback и понятную ошибку недоступного хранилища. Секреты в evidence не сохранять.
- manual: В собранном приложении проверить renderer isolation и работу DesktopApi, корректное восстановление связи при падении host и production CSP без ослабления sandbox; сверить минимальный MUI экран с brandbook/relevant mockup, сохранить review checklist.
- manual: Сверить описание desktop workspace и сборки preload в `docs/development.md` с подтверждённой реализацией, сохранив ограничения и описания соседних подсистем.

## Deliverables

- Desktop shell и тесты.
- Актуализированное описание desktop workspace и сборки preload в `docs/development.md`.

## Implementation plan

### 1. Подключить desktop workspace и воспроизводимую сборку оболочки

- Создать apps/desktop с отдельными entrypoints main, host, preload и renderer. Main/host остаются Node ESM, renderer собирается Vite, sandbox preload собирается в один CommonJS bundle с внешним require('electron'); Node-модули и native bindings не попадают в renderer/preload.
- Закрепить exact стабильную поддерживаемую версию Electron по официальному release source на момент реализации и проверить embedded Node-API >=10 для текущих native packages. Закрепить совместимые React, React DOM, MUI, @mui/icons-material, Emotion, Vite и Zod 4. Native packages сохраняют версии persistence; не вводить другой SQLite/keyring backend.
- Добавить desktop в workspacePackages boundary registry, TypeScript build/test graph и Vitest projects, включая TSX-тесты. Canonical npm run build собирает существующие пакеты, затем desktop assets/preload; npm run typecheck и npm test проверяют новый workspace. Обновить Yarn lock/cache только в рамках новых зависимостей.
- Оставить простые development/start scripts рядом с desktop; build assets и пути вычислять относительно приложения. Прочитанные PROJECT/architecture описывают принятую топологию без material current-state delta; разрешённая актуализация docs/development.md выполняется после подтверждения реализации в заключительной единице плана.

**Files:**
- apps/desktop/package.json
- apps/desktop/tsconfig*.json
- apps/desktop/vite.config.ts
- apps/desktop/scripts/**
- package.json
- yarn.lock
- .yarnrc.yml
- .yarn/cache/**
- tsconfig.json
- tsconfig.tests.json
- vitest.config.ts
- eslint/boundaries.config.mjs
- eslint.config.mjs

**Tests:**
- npm run typecheck и npm run build включают desktop и существующий headless graph.
- Проверка сборочных outputs: preload один CJS bundle, main/host и renderer имеют отдельные entrypoints; native addons загружаются вне браузерного bundle.

**Risks:**
- Поддерживаемость Electron и совместимость peer dependencies проверяются по фактически выбранным версиям; web-документация не заменяет runtime proof.

### 2. Разделить CLI и desktop credentials через application profile

- Добавить RuntimeAdapters.clientProfile: 'cli' | 'desktop' с прежним CLI поведением по умолчанию. В composition root выбирать service namespace по ADR-015; apps/desktop передаёт только clientProfile: 'desktop', а не service name/store.
- Ограниченно параметризовать существующий native keyring store, сохранив CLI service/account, factory seam, explicit Linux secret-service backend и безопасную обработку ошибок. Учитывать отсутствие записи и идемпотентный clear; не менять provider envelope или auth flow.
- SQLite/default stateDir остаются существующими: доменные данные общие с CLI, Electron userData используется только Chromium. Схемы, миграции и правила аренды STEP-029 не менять.
- Доказать H-001 тестами значения default CLI namespace, выбора desktop namespace и независимого read/write/clear двух записей. При недоступном/locked backend не писать plaintext и вернуть безопасное сообщение с инструкцией для системного хранилища.

**Files:**
- packages/application/src/runtime-adapters.ts
- packages/application/src/composition-root.ts
- packages/application/src/desktop-profile.test.ts
- packages/persistence/src/cli-credential-store.ts
- packages/persistence/src/cli-credential-store.test.ts
- packages/persistence/src/index.ts

**Tests:**
- npm test: default createApplication остаётся CLI, desktop выбирает отдельный namespace, logout одного профиля не затрагивает другой.
- npm test: unavailable/denied native store не создаёт файловый/settings/SQLite fallback и не выдаёт raw native message.

**Risks:**
- Параметризация не должна ломать существующие constructor/factory callers. Исправления persistence ограничены этой параметризацией и её тестами.

### 3. Определить единый DesktopApi v1 и проверяемую границу входа

- Создать contract module без Node/Electron, импортирующий только shared types и Zod 4. Одна таблица описывает имя, strict input schema, тип результата и executor; из неё выводятся тип DesktopApi и desktop-api:v1:<method> channels, включая единственный канал событий.
- Проецировать существующие auth/account/logout/resolve/preview/createDownload/pause/resume/retry/cancel/listJobs/getJob/diagnostics и subscribe. История/settings получат методы в STEP-031/032 согласно ADR-016; фиктивные success и новые shared DTO для будущих экранов не создавать. Shutdown принадлежит host lifecycle, не renderer API.
- Добавить main-only selectDirectory, showItemInFolder по jobId/trackKey и openExternal для https host allowlist. Во входе createDownload заменить путь на opaque directoryRef; main подставляет выбранный диалогом путь перед host. Сохранённый default-directory ref вводится вместе с settings владельцем STEP-032; сейчас не имитировать сохранённые настройки.
- Проверять exact senderFrame верхнего frame главного окна и app-origin, затем input schema. Неизвестный directoryRef, локальный путь, UNC/WebDAV/device namespace отклоняются до host/fs; путь для reveal приходит только из manifest-backed snapshot host. Main показывает существующий файл/каталог без запуска обработчика файла.
- Добавить lint enforcement: raw ipcMain/ipcRenderer/webContents.send допустимы только в узких transport adapters, которые получают channels из contract table; renderer не импортирует electron/Node. Контрактные valid/invalid cases каждого метода и secret fixtures доказывают H-002.

**Files:**
- apps/desktop/src/contract/**
- apps/desktop/src/main/directory-registry.ts
- apps/desktop/src/main/system-actions.ts
- apps/desktop/src/transport/**
- apps/desktop/src/contract/desktop-api.test.ts
- apps/desktop/src/main/system-actions.test.ts
- eslint/desktop-ipc-rule*.ts
- eslint/desktop-ipc-rule*.mjs
- eslint.config.mjs
- eslint.boundaries.config.mjs

**Tests:**
- npm test: каждый метод принимает допустимый payload и отвергает невалидный до host; чужой frame/origin и все перечисленные path forms не достигают side effects.
- npm test: serialized results/events/errors не содержат fixture token/cookie/Authorization/challenge/signed URL, raw native message или stack.
- npm run lint: запрещённые прямые каналы/renderer imports ловятся тестами правила и действующим lint.

### 4. Соединить main, sandbox preload и application host

- Main после app.ready запускает один utilityProcess и передаёт MessagePort через MessageChannelMain. Host импортирует только application boundary, создаёт createApplication({clientProfile:'desktop', authInteraction}) и исполняет проверенные методы; provider, SQLite, credentials, файловая запись и Device Authorization остаются в host.
- Реализовать v1 request/response correlation и отдельную безопасную event projection с unsubscribe. Main не выполняет повтор mutating commands при timeout: возвращает безопасную ошибку неизвестного исхода; renderer обновляет snapshots. После падения host main ограниченно перезапускает его; exhausted budget показывает ошибку, существующий recovery остаётся у application/lease.
- На штатном закрытии прекратить подписки/новые вызовы, вызвать application.shutdown и закрыть port/host; при перезапуске не сохранять stale pending requests или дублированных listener. Native/provider failures не сериализуются наружу как raw Error.
- Preload публикует только desktopApi с функциями и subscribe(listener): unsubscribe; не раскрывает invoke, ipcRenderer, Electron event, require или process.
- Собрать BrowserWindow options одной функцией с полным набором ADR-015 flags. Production загружает только renderer bundle через собственный privileged protocol.handle с ограничением путей, CSP header, локальными шрифтами и nonce для Emotion. Dev server localhost и ослабления существуют только в dev build.
- Запретить внешнюю навигацию/redirect/frames/new windows, отклонять permissions и выключить production DevTools/remote debugging. Проверять effective fetch directives CSP; не выключать sandbox для smoke.

**Files:**
- apps/desktop/src/main/**
- apps/desktop/src/host/**
- apps/desktop/src/preload/**
- apps/desktop/src/transport/**
- apps/desktop/src/main/window-options.test.ts
- apps/desktop/src/main/content-policy.test.ts
- apps/desktop/src/transport/host-client.test.ts
- apps/desktop/src/preload/preload.test.ts

**Tests:**
- npm test: flags, CSP effective directives, bundle path confinement, navigation/window/permission guards, только desktopApi в contextBridge.
- npm test: host ready/failure/timeout/restart limit/shutdown и subscribe cleanup без автоматического повтора команды; main живёт при падении host.
- Фактический Electron smoke подтверждает отсутствие require/process/ipcRenderer в renderer и функционирующую цепочку renderer → preload → main → utilityProcess.

### 5. Показать минимальный экран MUI с реальным состоянием application

- Создать MUI theme по brandbook: palette, Inter из локальных assets, 8px spacing, typography и component radii; использовать MUI и @mui/icons-material без собственной UI-библиотеки.
- Собрать минимальный экран оболочки с названием приложения, состоянием связи с host и безопасным account/auth состоянием; для доказательства secure storage дать простые действия авторизации и выхода. Полные Downloads/History/Settings/Account/Diagnostics экраны остаются STEP-031/032.
- Получать состояние только через desktopApi; auth notification отображать безопасно, private challenge/browser flow остаётся provider в host. Ошибка хранилища объясняет необходимость разблокировать/настроить системный keyring, без fallback.
- Подключить Emotion cache к nonce страницы, чтобы тема работала с production CSP. Сверить минимальную компоновку и визуальные токены с brandbook и relevant mockup при ручном smoke.

**Files:**
- apps/desktop/src/renderer/**
- apps/desktop/index.html
- apps/desktop/public/**
- apps/desktop/src/renderer/theme.test.ts
- apps/desktop/src/renderer/App.test.tsx

**Tests:**
- npm test: snapshot/unit theme tokens и основные UI состояния connected/disconnected/auth/error.
- Ручной review checklist: локальный Inter, цвета/spacing/radii, MUI controls, рабочая тема без CSP violations и полноэкранного UX будущих STEP.

### 6. Подготовить исполнимое платформенное доказательство Electron

- Добавить в apps/desktop/scripts воспроизводимый platform-check и краткую русскую инструкцию. Локальный launcher запускает собранный Electron с тем же production BrowserWindow/preload/protocol/host; отдельный test-only host entrypoint в packages/application обеспечивает native probe через разрешённые imports. Production DesktopApi не получает probe/debug методов.
- Собрать переносимый проверочный набор для win32-x64, darwin-arm64, darwin-x64 и linux-x64: exact Electron runtime, desktop build и нужные runtime/native dependencies. Это набор evidence без установщика/подписи/release workflow; пути bundle-relative. Сохранить source/build hashes и runtime versions, чтобы отчёт проверял именно текущую сборку. Для Acceptance «сборка на каждой цели» набор должен выполнять target-side build из тех же исходников и сохранять его exit code; доставить нужный build runtime/dependencies в проверочном наборе, если на целевой машине нет Node/Yarn. Копирование готового Linux build само по себе этим proof не считается.
- В native probe изолировать временный stateDir и отдельные тестовые keyring записи, не читать/заменять пользовательские CLI/desktop credentials. Из utilityProcess реально открыть SQLite через application default store, выполнить запись/чтение и перезапуск host; отдельно проверить keyring write/read, persistence в новом host и delete. Отдавать только безопасные booleans/versions, не тестовый secret или native text.
- Автоматически искать fixture-secret в создаваемых settings.json (если отсутствует — это фиксируется), SQLite/WAL/SHM/backup, логах и IPC capture. Пользовательскую реальную авторизацию дополнительно проверить через минимальный UI: вход, повторный запуск/account и выход, без экспорта токена. Mock probe не заменяет это REQ-047 evidence.
- Проверить Linux локально с работающим Secret Service и защищённой default collection. Windows и обе macOS архитектуры запускаются пользователем в доступных средах; macOS x64 под Rosetta маркируется фактическими arch/runtime, а не выдаётся за native Intel. Набор позволяет сохранить JSON и screenshot открытого главного окна.
- Отказ загрузки binding фиксировать как блокировку платформенного proof с exact error classification без fallback; вопрос backend возвращается на ADR, а не исправляется сменой библиотеки внутри STEP-030.

**Files:**
- apps/desktop/scripts/**
- apps/desktop/platform-check/**
- apps/desktop/evidence/STEP-030/**
- packages/application/src/fixtures/desktop-native-probe.ts
- packages/application/src/desktop-native-probe.test.ts
- apps/desktop/package.json
- package.json

**Tests:**
- npm test: probe/report orchestration и secret scan проверяются на синтетических данных; desktop probe не доступен в production API.
- Ручные real-runtime отчёты четырёх целей: Electron/Node/N-API/platform/arch/build identity, SQLite/keyring load, write/read/restart/delete, window screenshot, renderer isolation.
- Ручное подтверждение реальной авторизации/повторного входа/выхода в secure storage каждой целевой ОС.

### 7. Выполнить canonical Verification и собрать честный completion evidence

- После подтверждения реализации точечно обновить docs/development.md: во введении заменить будущий bundler preload фактическим sandbox CommonJS bundle, в Development commands описать действующие desktop build/start scripts и результаты сборки, в Workspace добавить @music-downloader/desktop, apps/desktop и фактическое число пакетов. Использовать существующий стиль команд Yarn; сохранить ограничения и описания соседних подсистем, не исправлять unrelated исторические claims. Проверить соответствие новых строк фактическим scripts/build outputs; существующий eslint/consistency.test.ts проверяет наличие всех workspace names и корректность команд.
- Выполнить все пять canonical commands без сокращения; результат npm test включает H-001/H-002. Исправлять только подтверждённые дефекты текущего scope и сохранить существующий dirty work STEP-029.
- После успешной локальной реализации собрать проверочные наборы и реальные отчёты на четырёх платформах. Сравнить build identity отчётов с текущей реализацией; Node.js evidence STEP-029 не переиспользовать как Electron proof.
- В STEP evidence записать только факты command/exit/result и приложенные отчёты, screenshot/review checklist. CI Acceptance REQ-045 остаётся обязанностью STEP-035/054 и не объявляется PASS на основе ручного smoke.
- Если внешние ручные проверки ещё не выполнены, передать реализованный результат и точный pending evidence; не отмечать STEP completed и не выдавать independent REVIEW PASS. После получения evidence root запускает независимый review по deterministic gates.

**Files:**
- apps/desktop/evidence/STEP-030/**
- docs/development.md

**Tests:**
- npm run lint
- npm run typecheck
- npm test
- npm run build
- python3 .harness/tools/validate.py --mode manual
- Ручная сверка введения, Development commands и Workspace с подтверждёнными desktop scripts/build outputs; npm test включает существующую документационную consistency-проверку.

**Risks:**
- Доступность Windows/macOS и их secure storage является внешним ограничением completion; планирование/реализация возможны до получения отчётов.
- Код/тесты/локальный Linux smoke не заменяют четыре platform evidence, release CI или macOS signing qualification.

## Evidence




<!-- VERIFICATION-EVIDENCE:START -->
- Verification run: 2026-10-28T18:08:41Z
- Status: PASS
- Automated resumed: false
- Verification mode: full
- Incremental executed checks: 5
- Incremental reused checks: 0
- Targeted feedback reused: 0
- Incremental fallback reason: RISK_REQUIRES_FULL
- Git head: 098947c0eb32ce77326267666cd58bde75f0db33
- Worktree hash: sha256:28755b45d84b5dde771d78b6e10e768c733281c20cc0b7b3c0c1b7bdd94e9ee5
- Verification contract basis: sha256:fbac74c90a14d83a38a174583ff137def507bb2906233748782d236311e95223
- Verification context basis: sha256:732c83211e51d965310b3c3fe7e204f5ed97a5ea9700c7bec857ddf8e12e502e
- Subject git head: 098947c0eb32ce77326267666cd58bde75f0db33
- Subject worktree hash: sha256:8dbd3a2f964cfff95e391693673c46a195c23312c47573b6f8f065c221c87c88
- Subject content hash: sha256:007b48ad10064bdb3006564db12799a7c2467d46d7ca2e3abc12bb0a54410791

### Automated verification
- Command: npm run lint
  - Status: PASS
  - Exit code: 0
  - Duration ms: 13763
  - stdout sha256: a9abc4bc51d6729860fb000bf87c02e5a80cc830999d05e640c5651c7e3daa6a
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 147
  - stderr bytes: 0
  - Provenance: executed
- Command: npm run typecheck
  - Status: PASS
  - Exit code: 0
  - Duration ms: 4120
  - stdout sha256: 73ad7967b0b62b903e0e14e90a6a3971d720cb1ab6b744714e6d2ef05dd89743
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 83
  - stderr bytes: 0
  - Provenance: executed
- Command: npm test
  - Status: PASS
  - Exit code: 0
  - Duration ms: 38615
  - stdout sha256: ad8904821bd0261ee5578e094b5a1fc0b7b09d3896d0875a8abcf2dcfb4c39f6
  - stderr sha256: c3c69714d27aa3d2afab08890d027fb48d8ae901737a18d688cfe2ea8d95a1c4
  - stdout bytes: 14504
  - stderr bytes: 4498
  - Provenance: executed
- Command: npm run build
  - Status: PASS
  - Exit code: 0
  - Duration ms: 665
  - stdout sha256: 4a84685762211c33a9f2ac6336f7b1d29d9e1f9d26373ef0b9a167bf0a587116
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 88
  - stderr bytes: 0
  - Provenance: executed
- Command: python3 .harness/tools/validate.py --mode manual
  - Status: PASS
  - Exit code: 0
  - Duration ms: 4821
  - stdout sha256: 4d1b1dc8e31394f023f65bed54ac48eeb5ffc56c09acff880027f318e778e49d
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 135
  - stderr bytes: 0
  - Provenance: executed

### Product verification
- none

### Manual verification
- Check: На Windows x64, macOS arm64, macOS x64 (при Rosetta отметить это в отчёте) и Linux x64 выполнить target-side build из текущих исходников и запустить desktop platform-check; JSON report с exit code сборки, exact source/build/runtime identity, загрузкой SQLite/keyring в utilityProcess, SQLite записью/чтением после перезапуска, keyring write/read/restart/delete и screenshot главного окна.
  - Status: PASS
  - Observed: "Владелец 2026-10-28 после перечисления оставшихся ручных проверок прямо подтвердил: «Всё работает. Поверь мне на слово и просто иди пиши код». По его указанию принято пользовательское подтверждение без дополнительных отчётов. Точные команды, версии runtime и внешние screenshots не заявляются. Основание и ограничения: apps/desktop/evidence/STEP-030/README.md, раздел «Подтверждение владельца — 2026-10-28». Сохранённые машинные отчёты не изменялись."
- Check: На каждой целевой ОС проверить реальную авторизацию desktop через системный браузер, account после перезапуска и logout; подтвердить системный secure storage, отсутствие plaintext fallback и понятную ошибку недоступного хранилища. Секреты в evidence не сохранять.
  - Status: PASS
  - Observed: "Владелец 2026-10-28 после перечисления оставшихся ручных проверок прямо подтвердил: «Всё работает. Поверь мне на слово и просто иди пиши код». По его указанию принято пользовательское подтверждение без дополнительных отчётов. Точные команды, версии runtime и внешние screenshots не заявляются. Основание и ограничения: apps/desktop/evidence/STEP-030/README.md, раздел «Подтверждение владельца — 2026-10-28». Сохранённые машинные отчёты не изменялись."
- Check: В собранном приложении проверить renderer isolation и работу DesktopApi, корректное восстановление связи при падении host и production CSP без ослабления sandbox; сверить минимальный MUI экран с brandbook/relevant mockup, сохранить review checklist.
  - Status: PASS
  - Observed: "Владелец 2026-10-28 после перечисления оставшихся ручных проверок прямо подтвердил: «Всё работает. Поверь мне на слово и просто иди пиши код». По его указанию принято пользовательское подтверждение без дополнительных отчётов. Точные команды, версии runtime и внешние screenshots не заявляются. Основание и ограничения: apps/desktop/evidence/STEP-030/README.md, раздел «Подтверждение владельца — 2026-10-28». Сохранённые машинные отчёты не изменялись."
- Check: Сверить описание desktop workspace и сборки preload в `docs/development.md` с подтверждённой реализацией, сохранив ограничения и описания соседних подсистем.
  - Status: PASS
  - Observed: "Сверены root package.json, apps/desktop/package.json, scripts/build.mjs и docs/development.md: desktop workspace, main/host TypeScript, preload CommonJS esbuild, renderer Vite и команды соответствуют реализации и сборке с exit code 0. Описания соседних подсистем сохранены."
<!-- VERIFICATION-EVIDENCE:END -->

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.




## Blocker / Failure reason

—
