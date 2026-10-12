---
schema: 1
id: STEP-047
status: completed
type: bugfix
priority: critical
phase: core
depends_on:
  - STEP-001
  - STEP-018
requirements:
  - REQ-005
  - REQ-029
  - REQ-044
adrs:
  - ADR-001
architecture_refs:
  - "docs/architecture.md#основные-компоненты-границы"
risk_flags:
  - security-sensitive
plan:
  status: ready
  revision: 2
  context_basis: sha256:d44cb3b87e6bb55d750312a9c5cbe077851c51d9e3e6dcad327b170697c9cdd7
  content_hash: sha256:6fe95ce35a15e215ebf48925e8344e54e7d689c3f44d9f0451a21d58701035e1
  reviewed_report: planning/plan-reviews/STEP-047/PLAN-REVIEW-20261011T191116Z.md
  planned_at: 2026-10-11T19:11:16+00:00
  execution_groups:
  context_components:
    - "ADR@ADR-001=sha256:0c9975737760fdee3b16ec2c99c8412cd98e81af5a0ce123cf70600a4a3200bc"
    - "ARCH@docs/architecture.md#основные-компоненты-границы=sha256:fbdabff4c712b9793cdefe9ef7f14d27253ce04e554c0e2e1ab730cb5bfb5a91"
    - "PRN@PRN-001=sha256:3b3801f207fafc3f77272f0e93570258a6d006964839d93a276accd814d548af"
    - "PRN@PRN-002=sha256:f29ee3fbdb9cf65cf9739d0907768bbf192ad88b8e443110d4d82f81c6b79ecb"
    - "PRN@PRN-003=sha256:16516d7d302fecda5f7615f9d55e29e04b588d671f8660640e1f61d1619e4ef8"
    - "REQ@REQ-005=sha256:132c5b89fda4c1ce731b1f83868e1b2fa608937489e1a3360de87ddafb859e46"
    - "REQ@REQ-029=sha256:91fdcfde9528026cacf957648d67f4b4600ce76f11c66590e1452aeff5a95485"
    - "REQ@REQ-044=sha256:54427009756971c5fd75791bae02f1df9fb15781afc1501f3e9f4bb88c879749"
    - "STEP@STEP-001=sha256:d106929a060d966df5a13bf5e4513b05be5a45f6895d37ef444ac3bb91349e25"
    - "STEP@STEP-018=sha256:ef554746f2dd587e4003775194675c6948f4b905d548119bfb60e491e7ec4659"
    - "STEP@STEP-047=sha256:f91fa5a47b8ceef98ae8d75f54dd9496f1791b092ef2960d8dcf58911dc49fb5"
---

# STEP-047 — ESLint: публичный application/contracts без ослабления границ

## Goal

Исправить ложный запрет публичного `@music-downloader/application/contracts` в ESLint, сохранив матрицу ADR-001 и запреты внутренних импортов, чтобы устранить prerequisite-блокировку STEP-019.

## Context

STEP-019 зафиксировал `yarn lint` с exit code 1 и 17 ошибками `boundaries/dependency`: экспорт `./contracts` уже объявлен в `packages/application/package.json` и используется Ready-планом CLI revision 3. В `eslint/boundaries-plugin.mjs` `resolveBare` помечает любой subpath как `deep`, а правило dependency безусловно отвергает `target.deep` при импорте из другого пакета.

STEP-001 создал enforcement границ, STEP-018 создал публичный application API; оба завершены. Изменение enforcement не входит в Scope STEP-019. Отдельного активного STEP для этого исправления при проверке canonical STEP/REQ не найдено. Новый product contract или архитектурное ребро не вводится: `application/contracts` остаётся публичной точкой входа того же слоя application.

Первая Verification после исправления contracts выявила четыре ошибки `boundaries/bypass` в `apps/cli/src/cli.smoke.test.ts` (`createRequire` и alias `require`) и ошибки форматирования четырёх файлов application/logging. Пользователь 2026-10-11 явно разрешил расширить Scope на устранение этих отказов и перепланировать STEP-047. Это ограниченное исправление prerequisites общей Verification; остальные изменения STEP-019 не входят в этот шаг.

## Scope

- Разрешить точный публичный specifier `@music-downloader/application/contracts` для источников, которым матрица ADR-001 уже разрешает зависимость от application.
- Сохранить применение матрицы к этому subpath независимо от формы импорта; публичность точки входа сама по себе не разрешает запрещённое ребро.
- Добавить regression-проверки публичного subpath и сохранения запретов внутренних, относительных и неизвестных subpath-импортов в существующий boundary suite.
- В CLI smoke-тесте заменить `createRequire`/alias `require` на разрешённое разрешение пути TypeScript без изменения поведения теста.
- Исправить только форматирование `packages/application/src/composition-root.ts`, `packages/logging/src/file-sink.test.ts`, `packages/logging/src/file-sink.ts` и `packages/logging/src/serializers.ts`.

## Mutation policy

### Allowed

- `eslint/boundaries-plugin.mjs` и `eslint/boundaries.test.ts` — весь объём изменений кода и тестов.
- По явному разрешению пользователя: `apps/cli/src/cli.smoke.test.ts` — только устранение `createRequire`/alias `require`; четыре перечисленных в Scope файла application/logging — только форматирование.
- STEP-047, его новые plan/review/evidence artifacts, обратные ссылки linked REQ/ADR и generated projections через deterministic tools.

### Conditional

- Дополнительных областей изменения кода нет. Если исправление требует выхода за перечисленные файлы и ограничения, зафиксировать blocker и вернуть вопрос владельцу Scope.

### Forbidden

- Изменение `eslint/boundaries.config.mjs`, flat-config, package exports, зависимостей, lockfile, CI или исходников application/CLI/других пакетов вне явно разрешённых правок.
- Новые разрешённые рёбра, общий допуск deep imports или произвольных subpath; обход через относительный путь, динамический импорт, отключение ESLint или inline-директивы.
- Переписывание исторических Ready-планов, их fingerprints и immutable reports завершённых STEP.

## Out of scope

- Реализация и завершение CLI STEP-019, изменение application API или DTO, создание универсального package resolver.
- UI/Electron, provider, новые exports и unrelated hardening.

## Acceptance criteria

- В `apps/cli` и виртуальном `apps/desktop` публичный `@music-downloader/application/contracts` проходит boundary lint для value/type-only import и re-export, литерального динамического import, require и TS import type()/import equals; production и тестовые файлы проверяются по той же политике.
- `core/*`, shared, provider, metadata, persistence, logging и testing не получают доступ к application/contracts: запрещённое матрицей ребро вызывает `boundaries/dependency`, включая type-only формы.
- Корневой `@music-downloader/application` остаётся разрешённым для apps. `@music-downloader/application/src/contracts.js`, `@music-downloader/application/dist/contracts.js`, `@music-downloader/application/contracts/internal`, неизвестные subpath и относительные импорты в другой workspace, включая путь через node_modules, остаются запрещёнными.
- Весь существующий независимый oracle матрицы ADR-001 и проверки shared type-only, testing, SDK-изоляции, запретов обходов и активности flat-config правил проходят без ослабления assertions, skip или отключения правил.
- `yarn lint` больше не выдаёт ошибку deep import для существующих импортов application/contracts в STEP-019; обязательная Verification и независимый schema-valid review дают PASS. Это не означает завершения STEP-019.
- CLI smoke-тест сохраняет сборку через установленный TypeScript и проверки help/usage, проходит без `createRequire`/alias `require`; четыре согласованных файла проходят форматирование без изменения поведения.

## Verification

- command: `yarn test eslint`
- command: `yarn lint`
- command: `yarn typecheck`
- command: `yarn test`
- command: `yarn format:check`
- command: `python3 .harness/tools/validate.py --mode manual`

## Deliverables

- Исправленное boundary rule и regression-тесты в двух разрешённых файлах.
- План, независимый review и factual Verification evidence STEP-047; prerequisite-связь STEP-019 → STEP-047.

## Implementation plan

### 1. Сохранить regression proof публичного contracts и границ

- Сохранить реализованные табличные формы value/type-only import, named/star re-export, literal dynamic import, require, TS import type и import equals для contracts и корневого application.
- Для production/test CLI и виртуального desktop доказать допуск; для core/shared/provider/metadata/persistence/logging/testing проверить forbiddenEdge независимым oracle. Проверить deepImport для src/dist/internal/unknown и crossRelative для workspace/node_modules. Существующие assertions не ослаблять.

**Files:**
- eslint/boundaries.test.ts

**Tests:**
- yarn test eslint

**Risks:**
- H-001 и H-002 доказываются yarn test eslint.

### 2. Сохранить точное исключение публичной точки входа

- Сохранить только точное исключение @music-downloader/application/contracts из deep; owner/group/byRelative и allowedEdges остаются неизменными. Комментарий ссылается на STEP-047. Не менять config/exports.

**Files:**
- eslint/boundaries-plugin.mjs

**Tests:**
- yarn test eslint
- yarn lint

### 3. Устранить согласованные отказы общей Verification

- В apps/cli/src/cli.smoke.test.ts заменить createRequire/require.resolve на fileURLToPath(import.meta.resolve(typescript/bin/tsc)); сохранить запуск execFile, build, таймауты и help/usage assertions. Добавить короткий русский комментарий причины.
- Выполнить Prettier только для packages/application/src/composition-root.ts и packages/logging/src/file-sink.test.ts, file-sink.ts, serializers.ts; проверить, что delta меняет только форматирование. Остальную реализацию STEP-019 не менять.

**Files:**
- apps/cli/src/cli.smoke.test.ts
- packages/application/src/composition-root.ts
- packages/logging/src/file-sink.test.ts
- packages/logging/src/file-sink.ts
- packages/logging/src/serializers.ts

**Tests:**
- yarn lint
- yarn test
- yarn format:check

### 4. Проверить scope и передать независимому review

- Синхронизировать projections и выполнить всю Verification через dispatcher. Записать factual evidence и подтвердить соблюдение расширенной пользователем Mutation policy.
- Передать результат независимому reviewer и обязательным specialized reviewers; не реализовывать остальной STEP-019 и не переписывать historical plans/reports.

**Tests:**
- yarn typecheck
- yarn test
- yarn format:check
- python3 .harness/tools/validate.py --mode manual

## Evidence



<!-- VERIFICATION-EVIDENCE:START -->
- Verification run: 2026-10-11T19:13:15Z
- Status: PASS
- Automated resumed: false
- Git head: a448cb4a4e1daf01d6a0cd75159f387639bcbd14
- Worktree hash: sha256:f019837586ef06b61409c61ee55d755bf5b84958bf36ba561838f29f9c3cc7a0
- Verification contract basis: sha256:1cf027d0766cc78e8c55b563a8130481e052bee2354eefef53a8b8c113f03273
- Subject git head: a448cb4a4e1daf01d6a0cd75159f387639bcbd14
- Subject worktree hash: sha256:85bf616b3f1a9affc760b2d1003911d794d2bdd2c11886f004feacd83e2331a5

### Automated verification
- Command: yarn test eslint
  - Status: PASS
  - Exit code: 0
  - Duration ms: 3573
  - stdout sha256: 15c122a7b876aa6294e382d089e57e8c596237c906b0b061655994a1c1840f12
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 1398
  - stderr bytes: 0
- Command: yarn lint
  - Status: PASS
  - Exit code: 0
  - Duration ms: 8078
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 0
  - stderr bytes: 0
- Command: yarn typecheck
  - Status: PASS
  - Exit code: 0
  - Duration ms: 3370
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 0
  - stderr bytes: 0
- Command: yarn test
  - Status: PASS
  - Exit code: 0
  - Duration ms: 7692
  - stdout sha256: e0c015d97c7430afc5d95df81afc1303464b43d2c167ee04a20123d48f3668fe
  - stderr sha256: 464e8bd6e706228b5170b70e947e266b64d8f50f28bc49b8687e3659d8f4269b
  - stdout bytes: 9985
  - stderr bytes: 2506
- Command: yarn format:check
  - Status: PASS
  - Exit code: 0
  - Duration ms: 2818
  - stdout sha256: 17aa973d3f004560237d9a95171210b0671deff23d61628eecf7322ff5938f20
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 66
  - stderr bytes: 0
- Command: python3 .harness/tools/validate.py --mode manual
  - Status: PASS
  - Exit code: 0
  - Duration ms: 4270
  - stdout sha256: d63e32db48a602aaf059ac3afe2292c7af5e5bcc62c63399e2a775a785fd20d0
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 482
  - stderr bytes: 0

### Product verification
- none

### Manual verification
- none
<!-- VERIFICATION-EVIDENCE:END -->

- Requirements Quality Gate: `python3 .harness/tools/requirements-quality.py --payload-file .harness/local/step-047-quality.json`, exit code 0, status PASS; completeness, clarity, measurability и scenarioCoverage — pass, findings отсутствуют.
- Источник отказа — canonical `STEP-019.md`, раздел Blocker / Failure reason; объявление публичного export проверено в `packages/application/package.json`, без выполнения новой runtime Verification в STEP ADD.



## Blocker / Failure reason

—
