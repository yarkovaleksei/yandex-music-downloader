---
schema: 1
id: STEP-001
status: blocked
type: implementation
priority: critical
phase: foundation
depends_on: []
requirements:
  - REQ-040
adrs:
  - ADR-001
  - ADR-008
architecture_refs:
  - "docs/architecture.md#основные-компоненты-границы"
  - docs/architecture.md#deployment-runtime-assumptions
risk_flags:
  - architecture
plan:
  status: ready
  revision: 1
  context_basis: sha256:f8521010456653783b7be9e785566f453f87a42d56349a8dda2b80628a13aafa
  content_hash: sha256:0ca66c83f46d6c0a68214806342515ea1b464b52384d5da90e60569b13293d47
  reviewed_report: planning/plan-reviews/STEP-001/PLAN-REVIEW-20261006T182940Z.md
  planned_at: 2026-10-06T18:29:40+00:00
  execution_groups:
  context_components:
    - "ADR@ADR-001=sha256:0c9975737760fdee3b16ec2c99c8412cd98e81af5a0ce123cf70600a4a3200bc"
    - "ADR@ADR-008=sha256:2003e2ad894a57050dc2a171d3c06186ed627a54094598c9b23bf853303fdc1e"
    - "ARCH@docs/architecture.md#deployment-runtime-assumptions=sha256:f301a436e0abeaf7aea31bffa46d170a9cde3219fb7d566834b3eb3ae57ac85a"
    - "ARCH@docs/architecture.md#основные-компоненты-границы=sha256:199b2ee2dfd38c0d4e06c44b9234d1aaaf2f22cee09bb48ef3a6c634cacdfcb4"
    - "PRN@PRN-001=sha256:3b3801f207fafc3f77272f0e93570258a6d006964839d93a276accd814d548af"
    - "PRN@PRN-002=sha256:f29ee3fbdb9cf65cf9739d0907768bbf192ad88b8e443110d4d82f81c6b79ecb"
    - "PRN@PRN-003=sha256:16516d7d302fecda5f7615f9d55e29e04b588d671f8660640e1f61d1619e4ef8"
    - "REQ@REQ-040=sha256:d2cb812c2f6f7323f775944dde0ff254f8bc2dbf6c0afa12f81802d593934c70"
    - "STEP@STEP-001=sha256:04edaf4e0c0cca3962fe668575c2f7c3a2b6f12792fea035e909b5395e749935"
---

# STEP-001 — Monorepo и toolchain контроля качества

## Goal

Создать каркас monorepo по ADR-001 с TypeScript strict, ESLint (включая boundary rules), Prettier и тестовым раннером, чтобы все следующие STEP получали единые команды проверки.

## Context

Репозиторий содержит только Harness и документацию; production-кода и toolchain нет. Выбор менеджера пакетов, workspace tooling, тестового раннера и формата модулей — implementation decision этого STEP (brief §7: структура, §43: качество).

## Scope

- Корневой `package.json` с Yarn 4 workspaces, `packageManager`, `nodeLinker: node-modules` и скриптами `lint`, `typecheck`, `format:check`, `test`, `build`.
- Пустые пакеты-скелеты по ADR-001: `packages/shared`, `packages/core/*`, `packages/providers/yandex-music`, `packages/metadata`, `packages/persistence`, `packages/application`, `packages/logging`, `packages/testing`, `apps/cli`.
- tsconfig с `strict: true`, `noImplicitAny`, project references.
- Использовать Node.js `>=22.13.0 <25` для CI и разработки; зафиксировать в `engines` и `docs/development.md`.
- Boundary rules порядка зависимостей внутри `packages/core/*` (ADR-001 п.3) и запрет Node built-ins в `packages/shared`.
- ESLint + Prettier; boundary rules направления зависимостей ADR-001 и запрет импорта `@dvxch/yandex-music` вне provider package; запрет необоснованного `any`.
- Тестовый раннер и по одному smoke-тесту на пакет-скелет.
- Заполнить `docs/development.md` фактическими командами и требованиями (Node.js 20+).

## Mutation policy

### Allowed

- Корневые конфигурационные файлы toolchain, `packages/**`, `apps/cli/**` (только скелет), `docs/development.md`, `.gitignore` (добавления для build-артефактов).

### Conditional

- Изменение `AGENTS.md` project routing — только если появляется project/technology skill.

### Forbidden

- Реализация доменной логики, provider, CLI-команд, GitHub Actions workflow (отдельный STEP-002), `apps/desktop`.
- Реализация future/unrelated STEP «заодно».

## Out of scope

- Бизнес-логика, desktop, CI, публикация пакетов.

## Acceptance criteria

- `corepack enable && yarn install --immutable` завершается без ошибок на чистом клоне.
- `yarn run lint`, `yarn run typecheck`, `yarn run format:check`, `yarn test`, `yarn build` проходят на скелете.
- Тестовый файл с импортом `@dvxch/yandex-music` вне provider package и файл с нарушением направления зависимостей ADR-001 падают в `yarn run lint` (негативная проверка зафиксирована в Evidence).
- `strict: true` включён во всех пакетах; `docs/development.md` содержит фактические команды.

## Verification

- command: `node packages/testing/scripts/verify-toolchain.mjs`
- command: `node packages/testing/scripts/run-yarn.mjs install --immutable`
- command: `node packages/testing/scripts/run-yarn.mjs run lint`
- command: `node packages/testing/scripts/run-yarn.mjs test`
- command: `node packages/testing/scripts/run-yarn.mjs run typecheck`
- command: `node packages/testing/scripts/run-yarn.mjs run format:check`
- command: `node packages/testing/scripts/run-yarn.mjs run build`
- command: `node packages/testing/scripts/verify-step-001.mjs`
- command: `python3 .harness/tools/validate.py --mode manual`

## Deliverables

- Скелет monorepo, конфигурация toolchain, обновлённый `docs/development.md`.

## Implementation plan

### 1. Восстановить воспроизводимый workspace и безопасно перейти на Yarn

- Исходить из фактического незавершённого npm-каркаса с 15 пакетами; статус и Evidence прежних npm-прогонов не считать доказательством Yarn. Перед изменением сохранить байтовую копию package.json, workspace manifests, .npmrc, package-lock.json и затрагиваемых конфигов в отдельном ignored temporary directory; записать список собственных изменений. При неуспешной генерации/установке восстановить только собственные migration-изменения из этой копии, сохранить diagnostics и посторонние изменения, не выполнять reset/clean. Резервную копию исходного uncommitted lockfile сохранять до успешной проверки миграции.
- Зафиксировать packageManager yarn@4.18.1 (проверенный engines >=18.12), private и ESM; engines.node >=22.13.0 <25, .nvmrc 24. Сохранить текущие совместимые версии toolchain, закрепить точные версии прямых devDependencies из проверенного lockfile; дополнительные тестовые/resolver-зависимости закреплять с проверкой peer/engines на Node 22.13.0 и 24. Не обновлять всё до latest и не добавлять Yandex SDK.
- Внутренние зависимости заменить с * на workspace:*; все 15 packages private. .yarnrc.yml: nodeLinker node-modules, enableGlobalCache false, enableMirror false, enableTelemetry false, cacheFolder .yarn/cache и globalFolder .cache/yarn/global; все Yarn state paths writable внутри workspace/copy; scope music-downloader с npmRegistryServer https://registry.invalid/ и только HTTPS. Задать supportedArchitectures для current/linux/darwin/win32, x64/arm64, glibc/musl; убедиться, что lockfile содержит необходимые optional variants, не объявлять это выполненной проверкой других ОС.
- Создать yarn.lock закреплённым клиентом с non-immutable install только на этапе генерации. Удалить .npmrc и package-lock.json после сохранения резервной копии и успешного создания Yarn-конфигурации; все последующие installs immutable. Ignore только generated .yarn/cache, install-state, node_modules, dist/coverage/tsbuildinfo и локальные caches; yarn.lock/.yarnrc.yml остаются tracked deliverables.
- Создать dependency-free packages/testing/scripts/run-yarn.mjs: spawn Corepack из PATH с cwd корня/изолированной копии, COREPACK_HOME в её ignored .cache/corepack, стандартной проверкой packageManager и signatures; exact Yarn проверять verify-toolchain.mjs. Корневой Node guard выполняется до любого install и отвергает Node вне >=22.13.0 <25. Для пользовательского setup документировать corepack enable, а read-only Node installation — corepack enable --install-directory <writable-bin> и PATH только текущей сессии либо wrapper. Канонический Verification использует node run-yarn.mjs, который вызывает тот же corepack yarn без записи global shims/cache.

**Files:**
- package.json
- packages/**/package.json
- apps/cli/package.json
- .yarnrc.yml
- yarn.lock
- .npmrc
- package-lock.json
- .gitignore
- .nvmrc
- packages/testing/scripts/run-yarn.mjs

**Tests:**
- node packages/testing/scripts/verify-toolchain.mjs
- corepack yarn install --immutable

**Risks:**
- Перенос scoped registry — обязательство ADR-008, а не необязательная оптимизация.
- Фиксация Yarn не гарантирует отсутствие ошибок Corepack/peer dependencies: версии проверяются фактически.
- Backup не заменяет Acceptance и не должен попасть в коммит.

### 2. Довести TypeScript и workspace skeleton до полного strict-контракта

- Сохранить ровно packages/shared, core/{downloader,planner,queue,retry,manifest,filesystem,validation}, providers/yandex-music, metadata,persistence,application,logging,testing и apps/cli; src содержит только маркеры и русские пояснения, по smoke-тесту на пакет. Никакой доменной логики, CLI commands, desktop или CI.
- Проверить effective strict/noImplicitAny и всё семейство strict-флагов всех tsconfig.json и tsconfig.test.json. NodeNext/ES2023, composite/references на фактические workspace dependencies, declaration/dist, verbatimModuleSyntax/noUncheckedIndexedAccess/isolatedModules; root solution tsc -b и отдельная non-composite noEmit-программа включает весь test/config/tooling TypeScript.
- Тестовые globs оформить единым источником eslint/boundaries.config.mjs для *.test/spec и test/tests/__tests__/e2e/fixtures; разворачивать brace patterns для tsconfig exclude и проверить consistency. Не исключать production-файлы как тесты только по имени вне определённых globs.
- Для shared production compiler types:[] и ES2023 без DOM; необходимые чистые web-compatible API ReadableStream, AbortSignal/AbortController, URL/URLSearchParams, TextEncoder/TextDecoder разрешать точечными ambient типами, не добавлять I/O globals. Тестовая программа с Node types не заменяет отдельную проверку shared production config.
- Везде exports с condition @music-downloader/source на src и default dist; customConditions TypeScript и Vitest resolve/ssr.conditions согласованы. Vitest projects для всех workspace и eslint/tooling tests; cross-package smoke подтверждает src-resolution без dist до build.

**Files:**
- tsconfig.base.json
- tsconfig.json
- tsconfig.tests.json
- packages/**/tsconfig*.json
- packages/**/src/**
- apps/cli/tsconfig*.json
- apps/cli/src/**
- vitest.config.ts
- eslint/boundaries.config.mjs

**Tests:**
- corepack yarn run typecheck
- corepack yarn test
- corepack yarn run build
- eslint/strict.test.ts
- eslint/consistency.test.ts

**Risks:**
- Рабочий build без ошибок не доказывает typecheck всех тестов: проверять listFiles или инъекцию test type error в копии.

### 3. Реализовать полную исполнимую матрицу границ ADR-001

- Единая таблица eslint/boundaries.config.mjs разделяет обязательства ADR/PRN и локальные ужесточения STEP. apps -> application и shared только type-only; application -> shared/core/providers/metadata/persistence/logging; core -> shared и допустимые core peers; providers/metadata/persistence/logging -> shared без взаимных imports или core; testing -> shared. testing разрешён только тестовым globs внутри packages/** кроме shared; apps/**, включая их тесты, не получают прямого доступа к testing или другим слоям вне application/type-only shared.
- В core матрице filesystem/retry/manifest/validation запрещено зависеть от downloader и queue (ADR-001); planner -> downloader/queue запрещается как локальное ужесточение; остальные core peer-рёбра не запрещать произвольно, cycles ловятся project references. Таблица не создаёт ненужные dependencies: manifests/references отражают только реально объявленные рёбра.
- Для core запрет electron/react/react-dom/@mui; для application запрет electron и известных runtime-native SQLite/secure storage модулей (better-sqlite3/sqlite3/keytar/@napi-rs/keyring/electron-store) с требованием runtimeAdapters; дополнительные запреты core native/application React явно пометить STEP-ужесточением. Обычные сторонние библиотеки core/application разрешены, неизвестный native-модуль — документированный остаточный риск. Запрещённый внешний модуль блокируется также для type-only/re-export.
- @dvxch/yandex-music и subpaths только в providers/yandex-music для всех source/test групп и будущих virtual packages; shared запрещает Node builtins с node: и без него, сторонние зависимости по пустому allowlist, I/O globals включая process/fetch/XMLHttpRequest/indexedDB/window и обходы globalThis/self/window.
- Генерировать ограничения на все ts/tsx/mts/cts/js/mjs/cjs, все workspace bare/deep/cross-relative imports и re-exports. Future packages закрыты по умолчанию внутри групп. Нужные пути нормализовать по owning package; alias/relative imports не должны обходить правило.
- apps value-import shared включая import {type X} и export {type X} запрещены, import type/export type разрешены. @typescript-eslint/no-import-type-side-effects и AST проверка inline re-export закрывают runtime import {}; эмиссия проверяется в памяти TypeScript API.
- Все boundary и обходозакрывающие правила объединить в отдельный eslint.boundaries.config.mjs без type-information; запуск --no-inline-config, Node API allowInlineConfig false. Учесть ImportExpression, require/createRequire и TSImportType: буквальные specifiers проверяются по тем же ограничениям либо весь соответствующий обход запрещён; вычисляемые неразрешимые specifiers fail-closed. calculateConfigForFile проверяет, что flat-config overrides не теряют другие запреты.

**Files:**
- eslint/boundaries.config.mjs
- eslint.boundaries.config.mjs
- eslint/**

**Tests:**
- eslint/boundaries.test.ts
- eslint/consistency.test.ts
- corepack yarn run lint

**Risks:**
- Не ослаблять ADR-001/PRN-001 локальными исключениями, включая тесты apps.
- Позитивные allow-cases обязательны, иначе blanket-ban не является корректным контрактом.

### 4. Завершить правила качества и ограничить форматирование разрешёнными файлами

- Основной ESLint pass: typescript-eslint recommended, no-explicit-any error, ban-ts-comment с описанием, consistent-type-imports, reportUnusedDisableDirectives error; eslint-comments require-description/no-use только disable-next-line и корректный disable-enable-pair.
- Type-aware no-unsafe-assignment/argument/member-access/call/return для production packages/**/src и apps/cli/src с projectService и исключением test-globs. Разрешение workspace из src не зависит от dist. Обоснованный explicit any допускается только описанным eslint-disable-next-line для конкретного quality rule; boundary pass никогда не принимает директивы.
- lint = два независимых ESLint pass --max-warnings 0. Prettier allowlist ограничить packages/apps/cli/eslint/toolchain-root configs/.yarnrc.yml/docs/development.md; исключить node_modules/caches/build и весь Harness/docs/planning вне development. yarn.lock — generated, вручную не форматировать.
- Проверить, что основной quality pass и boundary pass одновременно принимают обоснованный any без warning; unsafe any из library return ловится production type-aware rules.

**Files:**
- eslint.config.mjs
- eslint.boundaries.config.mjs
- package.json
- .prettierignore
- .prettierrc.json
- .editorconfig
- .gitattributes

**Tests:**
- corepack yarn run lint
- corepack yarn run format:check
- eslint/quality.test.ts

**Risks:**
- Один quality config без production unsafe-rules не полностью доказывает запрет необоснованного any.

### 5. Добавить независимые regression-тесты полного toolchain-контракта

- Сохранить 15 smoke-тестов и добавить cross-workspace src-resolution. Boundary tests через ESLint Node API проверяют конкретные ruleId, fatalErrorCount 0 и отсутствующие warnings; покрыть все ADR группы, subpaths, relative/deep imports, dynamic/require/type-import и директивные обходы.
- Записать independent oracle непосредственно по ADR-001 п.1–6, а не вывести ожидаемые рёбра из реализации таблицы. Негативные случаи: apps->core/provider/persistence/shared value; retry->downloader и manifest->queue; provider/logging->core, persistence->metadata; Yandex SDK вне provider; shared node/process/fetch/I/O; core/application forbidden modules.
- Позитивные случаи: apps->application и shared import type; application->provider/core/logging; core/downloader->retry; provider->Yandex SDK; test application->testing; обычная внешняя библиотека core и type-only внешний модуль application. Для src/test всех групп и virtual apps/desktop/providers/other проверять итоговые rule options без потери bans.
- consistency: discovered 15 workspace keys/name/path, actual dependencies subset allowlist и workspace: protocol, references совпадают с workspace dependencies, testing только devDependencies/test globs, Yarn workspace locators в yarn.lock вместо npm link:true, Node/packageManager и registry/cache policy, test glob expansion. strict тест TypeScript API для всех production/test configs.
- TypeScript transpileModule проверяет runtime emission apps: import type без runtime shared, import {type} и export {type} дают запрещённую эмиссию. Quality tests проверяют необоснованный/обоснованный explicit any и production no-unsafe cases с реальными temporary files или подходящим type-aware project.

**Files:**
- eslint/boundaries.test.ts
- eslint/consistency.test.ts
- eslint/strict.test.ts
- eslint/quality.test.ts
- vitest.config.ts
- packages/**/src/*.test.ts
- apps/cli/src/*.test.ts

**Tests:**
- corepack yarn test
- corepack yarn run typecheck

**Risks:**
- Тесты не должны зависеть от ранее собранного dist или от npm/package-lock.

### 6. Сделать воспроизводимые проверки в изолированных копиях и обновить development

- Добавить dependency-free node verify-toolchain.mjs и run-yarn.mjs для guard Node range, exact Yarn version, локальной Corepack cache и проверки packageManager/config; ошибки bootstrap передавать с exit code, без обхода signatures. Все канонические команды установки/quality через закреплённый Corepack client и один run-yarn wrapper; лог показывает фактический corepack yarn argv.
- Переписать packages/testing/scripts/verify-step-001-manual.sh как wrapper автоматической Node verification с отдельной чистой копией на каждую версию 22.13.0 и 24; явно обеспечить доступность обеих runtime через nvm до проверки либо принять их executable paths. Не выполнять nvm install внутри канонического runner: provisioning отдельно, с escalation при sandbox failure. При отсутствии обязательной runtime возвращать FAIL с точной причиной, а не PASS/skip.
- Node verification берёт исходный git ls-files -co --exclude-standard -z из репозитория, копирует текущие tracked/untracked исходники в mktemp/mkdtemp без .git/node_modules/dist/caches; не использует git diff в копии. Corepack cache/shims writable temporary paths, версия Yarn проверяется, SHA-256 yarn.lock до/после install одинаков. Для обоих runtime выполнить чистый immutable install, lint/test до build, typecheck/format:check/build; отдельные временные нарушения по одному за раз.
- Для Yandex import, retry->downloader и apps shared value запуск corepack yarn run lint должен иметь exit!=0 и ожидаемый boundary ruleId. Inline-disable сценарий проверяет unused directive в основном pass, boundary ruleId прямым --no-inline-config проходом, затем чистый lint exit0. Проверить mismatch yarn.lock/install immutable fail и недостающий workspace не резолвится через публичный registry в отдельной негативной копии. Удалять только собственные temporary directories в finally/trap с защитой точного пути, выводить commands/exit/observed facts.
- docs/development.md полностью заменить незаполненный шаблон фактической русской инструкцией: точные toolchain версии, Node range и Corepack prerequisites/setup/writable fallback, Yarn commands, 15 packages, двухкатегорийная boundary/core matrix, pure shared API, typecheck/test globs, scoped registry, ignored caches, обновление yarn.lock при deps. CI относится к STEP-002, bundler preload — к последующему STEP. Наблюдения о npm references соседних STEP вынести в handoff с PROJECT RECONCILE, не менять соседние scope.

**Files:**
- packages/testing/scripts/verify-toolchain.mjs
- packages/testing/scripts/verify-step-001.mjs
- packages/testing/scripts/verify-step-001-manual.sh
- docs/development.md
- packages/testing/scripts/run-yarn.mjs

**Tests:**
- node packages/testing/scripts/verify-step-001.mjs

**Risks:**
- Проверка Node22+24 на Linux не доказывает runtime Windows/macOS: STEP-002 владеет CI платформами.
- Verification изменяет только ignored/generated outputs и temporary fixtures; tracked source/config/lockfile не должен меняться.

### 7. Передать завершённую реализацию канонической верификации

- До передачи result устранить зафиксированный blocker STEP-001 в рамках текущего contract, сохранить старые immutable план-review и npm Evidence как историю; не считать их fresh proof.
- Выполнить sync-projections до deterministic validation, если projections менялись; result SUCCESS передать dispatcher, который запускает нижеуказанный Verification contract и пишет generated Evidence.
- Записывать factual output/exit/hash/observations и не устанавливать completed до независимого schema-valid STEP REVIEW PASS.

**Files:**
- planning/tasks/STEP-001.md

**Tests:**
- python3 .harness/tools/validate.py --mode manual

**Risks:**
- PLAN не изменяет production/toolchain; actual Yarn migration исполняется отдельным STEP IMPLEMENT.

## Evidence


<!-- VERIFICATION-EVIDENCE:START -->
- Verification run: 2026-10-06T15:34:03Z
- Status: MANUAL_REQUIRED
- Git head: 984253235b7b72b6ae404375a4aed5470d15eda7
- Worktree hash: sha256:344faa9639d61d2fbd092c6e0d35ea8461c05e62f2a2db1bc7c95e9cd27ca6c6
- Verification contract basis: sha256:25b50c3cbfb0b4e444ea62af998d37a30c0177be16e0b18cf0881e3e855527ed
- Subject git head: 984253235b7b72b6ae404375a4aed5470d15eda7
- Subject worktree hash: sha256:eecf8fccde67ff171a7b837c0868dfebe6390ae5d9acae0a4cf4ff7070b81bca

### Automated verification
- Command: npm ci
  - Status: PASS
  - Exit code: 0
  - Duration ms: 1416
  - stdout sha256: 9226db264cce9916e19970f80ebdfd7d6506d5d85a5299222867d46de44d446f
  - stderr sha256: 6f675f950749ebdd688a1a4e1900dba52ae340b19015be8b046df5a45757c447
  - stdout bytes: 274
  - stderr bytes: 522
- Command: npm run lint
  - Status: PASS
  - Exit code: 0
  - Duration ms: 1516
  - stdout sha256: a9abc4bc51d6729860fb000bf87c02e5a80cc830999d05e640c5651c7e3daa6a
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 147
  - stderr bytes: 0
- Command: npm test
  - Status: PASS
  - Exit code: 0
  - Duration ms: 1419
  - stdout sha256: 696e0f837f5e53ba292248cbf14f0a507480a1284ccf50d7684db0aa39ce2767
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 1311
  - stderr bytes: 0
- Command: npm run typecheck
  - Status: PASS
  - Exit code: 0
  - Duration ms: 815
  - stdout sha256: 73ad7967b0b62b903e0e14e90a6a3971d720cb1ab6b744714e6d2ef05dd89743
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 83
  - stderr bytes: 0
- Command: npm run format:check
  - Status: PASS
  - Exit code: 0
  - Duration ms: 564
  - stdout sha256: 98901b276ac1a3b1fdb8e365f969b8e012e9fb8c9895eb38aecf82be76e2474b
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 242
  - stderr bytes: 0
- Command: npm run build
  - Status: PASS
  - Exit code: 0
  - Duration ms: 214
  - stdout sha256: 674152d2abeff6b4ca1368dcc45ed832cbb733e0e405892d05433600c3dc7658
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 49
  - stderr bytes: 0
- Command: python3 .harness/tools/validate.py --mode manual
  - Status: PASS
  - Exit code: 0
  - Duration ms: 1566
  - stdout sha256: 4723a5c0272a45e8f2a1aee25aa42abc1449f81ba2edb534a667c4574a77384b
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 66
  - stderr bytes: 0

### Manual verification
- Check: Чистый клон: скопировать git ls-files -co --exclude-standard в пустой каталог, npm install (exit 0), package-lock.json не изменился, npm ci без EBADENGINE; прогон на нижней границе engines и на Node 24; зафиксировать command, exit code и observed facts в Evidence.
  - Status: PENDING
- Check: Негативная lint-проверка boundary rules: по одному временному файлу за прогон (импорт @dvxch/yandex-music вне provider; core/retry -> core/downloader; value-import shared в apps/cli/src) npm run lint даёт exit code != 0 и ожидаемый boundary ruleId; для случая с eslint-disable-next-line основной проход падает на неиспользованной директиве, boundary ruleId показать прямым вызовом boundary-прохода с --no-inline-config; затем удалить файлы и убедиться в exit 0 для npm run lint; зафиксировать command, exit code и observed facts в Evidence.
  - Status: PENDING
<!-- VERIFICATION-EVIDENCE:END -->

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.


## Blocker / Failure reason

Требуется новая планировка и реализация Yarn migration после принятия ADR-008.
