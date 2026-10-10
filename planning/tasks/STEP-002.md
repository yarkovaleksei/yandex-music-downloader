---
schema: 1
id: STEP-002
status: planned
type: implementation
priority: high
phase: foundation
depends_on:
  - STEP-001
requirements:
  - REQ-041
adrs: []
architecture_refs:
  - docs/architecture.md#deployment-runtime-assumptions
risk_flags:
  - release-critical
plan:
  status: ready
  revision: 1
  context_basis: sha256:6b8de7b8eccdcdec49371fd36b03c96d27e7e55eab15b36fb6e1e071a2ec1776
  content_hash: sha256:a5ce4146191b4d061c1a8f8dcee9cbad8ce5dfe72bc8eef17d34f3e7bfc4f922
  reviewed_report: planning/plan-reviews/STEP-002/PLAN-REVIEW-20261010T044854Z.md
  planned_at: 2026-10-10T04:48:54+00:00
  execution_groups:
  context_components:
    - "ARCH@docs/architecture.md#deployment-runtime-assumptions=sha256:f301a436e0abeaf7aea31bffa46d170a9cde3219fb7d566834b3eb3ae57ac85a"
    - "PRN@PRN-001=sha256:3b3801f207fafc3f77272f0e93570258a6d006964839d93a276accd814d548af"
    - "PRN@PRN-002=sha256:f29ee3fbdb9cf65cf9739d0907768bbf192ad88b8e443110d4d82f81c6b79ecb"
    - "PRN@PRN-003=sha256:16516d7d302fecda5f7615f9d55e29e04b588d671f8660640e1f61d1619e4ef8"
    - "REQ@REQ-041=sha256:3377964ccb5091ec60e76e524a7148b5b938460ece7ef181d4bbc44f5fc8e102"
    - "STEP@STEP-001=sha256:d106929a060d966df5a13bf5e4513b05be5a45f6895d37ef444ac3bb91349e25"
    - "STEP@STEP-002=sha256:704fb169dfb360d03ea5c20e1c7ecbf16468e292c95dc66c64a39573489c6ae5"
---

# STEP-002 — CI workflow для TypeScript monorepo

## Goal

Добавить GitHub Actions workflow, выполняющий lint, typecheck, unit/integration tests и build CLI/core на каждый PR, не затрагивая Harness Integrity workflow.

## Context

Toolchain появляется в STEP-001; AGENTS.md требует проектировать product CI отдельным STEP после появления реального tooling.

## Scope

- Workflow `.github/workflows/ci.yml` для PR и push в main.
- Кэширование зависимостей, matrix по поддерживаемой LTS Node.js и ОС (ubuntu, windows, macos) для unit/integration тестов, чтобы кросс-ОС особенности файловой системы выявлялись рано.
- Явное исключение live provider tests из workflow.
- Обновить `docs/development.md` раздел CI/CD.

## Mutation policy

### Allowed

- .github/workflows/ci.yml, docs/development.md.

### Conditional

- Изменение `.github/workflows/harness-integrity.yml` запрещено; допустимо только чтение.

### Forbidden

- Сборки desktop и release workflow (STEP-035), secrets, изменение product-кода.
- Реализация future/unrelated STEP «заодно».

## Out of scope

- Release CI, desktop build matrix, публикация артефактов.

## Acceptance criteria

- Workflow запускает lint, typecheck, test, build и падает при провале любой задачи.
- Workflow не содержит `PROVIDER_TEST_TOKEN` и вызова `test:provider`.
- Тесты выполняются на Linux, Windows и macOS.
- Harness Integrity workflow не изменён (проверка git diff).

## Verification

- command: `python3 .harness/tools/validate.py --mode manual`
- command: `python3 -c "import pathlib, sys; text = pathlib.Path('.github/workflows/ci.yml').read_text(encoding='utf-8'); sys.exit(1 if any(item in text for item in ('PROVIDER_TEST_TOKEN', 'test:provider')) else 0)"`
- command: `git diff --exit-code origin/main -- .github/workflows/harness-integrity.yml`
- manual: Подтвердить успешный запуск workflow CI на PR (желательно draft): job quality и все 6 вариантов job test (ubuntu, windows, macos × Node 22.13.0 и 24) зелёные; приложить ссылку на запуск в Evidence и указать фактический тип PR.

## Deliverables

- `.github/workflows/ci.yml`, обновлённая документация CI.

## Implementation plan

### 1. Каркас workflow и закреплённые зависимости

- Создать .github/workflows/ci.yml с именем CI. Триггеры: pull_request в main и push в main (как у Harness Integrity). Права: permissions contents: read; concurrency по номеру PR или ref с отменой устаревших запусков только для pull_request; timeout-minutes у каждого job.
- Оформить файл по образцу harness-integrity.yml: перед каждым параметром workflow comment-блок с описанием и строкой «Пример:» (иначе validator по documented_config_globs из .harness/harness-policy.toml не пройдёт).
- Закрепить actions полными SHA с комментарием версии, как в harness-integrity.yml: actions/checkout — тот же SHA, что в baseline; actions/setup-node и actions/cache — SHA тегов, полученные git ls-remote по официальным репозиториям. Если сеть недоступна, остановиться и спросить, а не подставлять плавающий тег.
- Закрепить runner images, чтобы смена latest не меняла CI молча: ubuntu-24.04, windows-2025, macos-15 (проверить актуальность имён образов и поправить, если GitHub их переименовал).
- actions/checkout с persist-credentials: false. В workflow нет secrets, env с токенами и вызова live-suite provider; упоминаний его токена и имени script нет даже в комментариях (в описании говорить «live-тесты provider запускаются вручную»).

**Files:**
- .github/workflows/ci.yml

**Tests:**
- python3 -c с PyYAML на разработческой машине: файл парсится, есть триггеры, permissions, concurrency, оба job; запрещённых строк нет (локальная проверка; PyYAML не добавляется в Verification как зависимость).

**Risks:**
- SHA и имена runner images нельзя проверить офлайн; ошибка проявится при первом запуске на PR и исправляется в том же STEP.

### 2. Job quality и matrix-job test

- Job quality на ubuntu-24.04 с Node.js 24: checkout, setup-node, кэш, установка, затем lint, typecheck, format:check, build. Каждый шаг без continue-on-error, поэтому провал любой задачи роняет job.
- Job test: matrix os × node, где os = ubuntu-24.04, windows-2025, macos-15, node = 22.13.0 (нижняя граница engines) и 24; fail-fast: false, чтобы видеть все платформы сразу. Шаги: checkout, setup-node, кэш, установка, test. Один и тот же набор Vitest (unit и integration) работает на всех ОС; сборка выполняется один раз в quality.
- Установка и запуск везде через node packages/testing/scripts/run-yarn.mjs (install --immutable, run lint, run typecheck, run format:check, run build, test): единый путь, который не зависит от глобальных shims Corepack и одинаково работает на Windows.
- Кэш через actions/cache: каталоги .yarn/cache и .cache/corepack (всё состояние Yarn внутри рабочей копии по .yarnrc.yml), ключ из ОС, версии Node и hashFiles('yarn.lock'), restore-keys по ОС и Node. Setup-node без встроенного cache: yarn, потому что он требует Yarn в PATH до установки.
- Имена jobs и matrix-вариантов стабильны (quality, test), чтобы их можно было использовать в branch protection; настройка protection вне STEP.
- Перед коммитом проверить в чистой копии (временный git worktree или clone вне рабочего каталога) install --immutable и test без build, чтобы убедиться, что тесты не требуют артефактов dist; результат занести в Evidence.

**Files:**
- .github/workflows/ci.yml

**Tests:**
- Чистая копия: install --immutable и test на Linux проходят без предварительной сборки.
- Реальный запуск на PR проверяет всё остальное, включая Windows и macOS (manual из Verification).

**Risks:**
- Windows и macOS не проверялись ни разу (docs/development.md): первый запуск может выявить кроссплатформенные дефекты кода или тестов, чинить которые нужно вне mutation policy этого STEP (отдельный FIX/QUICK FIX после решения владельца). Это не отменяет Acceptance, а откладывает его закрытие.
- Фактическая работа Corepack на Windows runner (corepack.cmd через shell) подтверждается только реальным запуском.

### 3. Документация CI/CD

- Заменить раздел «CI/CD» в docs/development.md описанием фактического workflow: триггеры, job quality, matrix test, закрепление actions и образов, кэш, команды для локального воспроизведения (только существующие yarn-скрипты), явное исключение live-тестов provider, неизменность Harness Integrity workflow.
- Обновить раздел «Git и CI» и упоминание платформенной матрицы в блоке toolchain (Windows и macOS до первого успешного запуска остаются непроверенными; после запуска сослаться на Evidence STEP-002), не удаляя утверждения, на которые опираются consistency-тесты.
- Соблюсти ограничения eslint/consistency.test.ts: yarn-команды только из scripts, без npm install/ci/run/test, сохранить упоминания yarn@4.18.1, >=22.13.0 <25, run-yarn.mjs, STEP-001, ADR-001, «не проверя… подпис». Файл входит в format:check — отформатировать prettier.

**Files:**
- docs/development.md

**Tests:**
- Существующий consistency-тест docs/development.md и format:check остаются зелёными (запуск через run-yarn.mjs).

### 4. Проверка и ручное подтверждение на PR

- Выполнить validator, проверку отсутствия запрещённых строк в ci.yml и проверку неизменности harness-integrity.yml; сначала локально сверить lint, typecheck, test, build, format:check.
- Ручная проверка из Verification требует реального запуска на PR: после IMPLEMENT dispatcher вернёт ожидание manual-проверки; перед ней выполнить GIT COMMIT, PUSH, PR (draft PR выбирает политика Git и executor, не модель). Наблюдение в Evidence должно честно указать фактический тип PR, ссылку на запуск и результат каждого job.
- Если запуск выявил дефект workflow — исправить в этом STEP; если дефект кода или тестов на конкретной ОС — остановиться и вынести отдельным шагом, а не править продуктовый код (Forbidden).

**Files:**
- docs/development.md

**Tests:**
- Manual: ссылка на запуск, 1 job quality и 6 вариантов test зелёные.

**Risks:**
- Закрытие STEP зависит от внешнего запуска GitHub Actions и может потребовать нескольких итераций коммитов в ту же ветку.

## Evidence

<!-- VERIFICATION-EVIDENCE:START -->
- Verification run: 2026-10-10T06:53:00Z
- Status: MANUAL_REQUIRED
- Automated resumed: false
- Git head: 689573951a428231a7abc74aa19772d3f2688af3
- Worktree hash: sha256:344d87fcf4f2d43ff6366f6815b3ea60639ebfcfdb5d6342a46773c3f3f41e36
- Verification contract basis: sha256:b313430eb047dcbbccd80542378e17bf40af20a6ac3152441f1ffeec6c401a77
- Subject git head: 689573951a428231a7abc74aa19772d3f2688af3
- Subject worktree hash: sha256:712a7405ca3b0061c4df8874b3912cffcee0f3073bdd8067d461e1893e1365e6

### Automated verification
- Command: python3 .harness/tools/validate.py --mode manual
  - Status: PASS
  - Exit code: 0
  - Duration ms: 2968
  - stdout sha256: 6071542c8e9d0783374057b32b1e7ec2b7454ada40f8efe7265ac43c7c1fc7b4
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 366
  - stderr bytes: 0
- Command: python3 -c "import pathlib, sys; text = pathlib.Path('.github/workflows/ci.yml').read_text(encoding='utf-8'); sys.exit(1 if any(item in text for item in ('PROVIDER_TEST_TOKEN', 'test:provider')) else 0)"
  - Status: PASS
  - Exit code: 0
  - Duration ms: 31
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 0
  - stderr bytes: 0
- Command: git diff --exit-code origin/main -- .github/workflows/harness-integrity.yml
  - Status: PASS
  - Exit code: 0
  - Duration ms: 3
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 0
  - stderr bytes: 0

### Product verification
- none

### Manual verification
- Check: Подтвердить успешный запуск workflow CI на PR (желательно draft): job quality и все 6 вариантов job test (ubuntu, windows, macos × Node 22.13.0 и 24) зелёные; приложить ссылку на запуск в Evidence и указать фактический тип PR.
  - Status: PENDING
<!-- VERIFICATION-EVIDENCE:END -->

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.

## Blocker / Failure reason

—
