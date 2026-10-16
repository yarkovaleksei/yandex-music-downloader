---
schema: 1
id: STEP-054
status: in_progress
type: implementation
priority: medium
phase: desktop
depends_on: []
requirements:
  - REQ-041
  - REQ-045
adrs:
  - ADR-014
architecture_refs:
  - docs/architecture.md#deployment-runtime-assumptions
risk_flags:
  - release-critical
plan:
  status: ready
  revision: 1
  context_basis: sha256:6110419b80bc82871567ed5547262bc7ee2f8dd9e0a605108d7d38b23c7abb16
  content_hash: sha256:b95b7ae6addd5eaee7c7e4bd9371ea30fd41dd7f3867bf1c2995f8100eda7801
  reviewed_report: planning/plan-reviews/STEP-054/PLAN-REVIEW-20261016T154346Z.md
  planned_at: 2026-10-16T15:43:46+00:00
  execution_groups:
  context_components:
    - "ADR@ADR-014=sha256:d21dd58fd7f4167a6b4820ba1f26624fcf440fb7a3f9fdc926e1ec517a969f39"
    - "ARCH@docs/architecture.md#deployment-runtime-assumptions=sha256:7ecd7f0292c935338b551e3c3a5e9cc4276a1f9452ff944e5f9c08f6ef36d308"
    - "PRN@PRN-001=sha256:3b3801f207fafc3f77272f0e93570258a6d006964839d93a276accd814d548af"
    - "PRN@PRN-002=sha256:f29ee3fbdb9cf65cf9739d0907768bbf192ad88b8e443110d4d82f81c6b79ecb"
    - "PRN@PRN-003=sha256:16516d7d302fecda5f7615f9d55e29e04b588d671f8660640e1f61d1619e4ef8"
    - "REQ@REQ-041=sha256:3377964ccb5091ec60e76e524a7148b5b938460ece7ef181d4bbc44f5fc8e102"
    - "REQ@REQ-045=sha256:4c9dfa9b7d9be32ffc28ff8a30624457bb0a9dec267f12d4613a48590e93d741"
    - "STEP@STEP-054=sha256:6b36ebf91aba67165b508e51a24b67e4d70bca05bdb1c946a3be9561ced3b861"
---

# STEP-054 — macOS x64 в CI-матрице тестов

## Goal

CI-матрица тестов на PR запускает существующие проверки и на macOS x64, чтобы native-модули (`better-sqlite3`, `@napi-rs/keyring`) проверялись на всех четырёх целевых платформах.

## Context

[ADR-014](../../docs/adr/ADR-014-sqlite-persistence.md) требует, чтобы STEP-029 доказал загрузку `better-sqlite3` и тесты persistence на Node.js для Windows x64, macOS arm64/x64 и Linux x64. Текущая матрица `.github/workflows/ci.yml` покрывает `ubuntu-24.04`, `windows-2025` и `macos-15` (arm64), а macOS x64 в ней нет. REQ-045 называет macOS x64 целевой платформой. Mutation policy STEP-029 не включает `.github/**`, поэтому владелец продукта решил вынести runner в отдельный STEP. Изначально он был prerequisite STEP-029; после блокировки CI биллингом (см. Blocker) STEP-029 подтверждает платформы ручным набором и от STEP-054 не зависит.

## Scope

- Добавить в матрицу `test` job `.github/workflows/ci.yml` поддерживаемый GitHub-hosted macOS x64 runner с закреплённой меткой образа.
- Сохранить обе версии Node.js матрицы и существующие шаги без ослабления (`fail-fast: false`, без `continue-on-error`).
- Подтвердить архитектуру runner в логе job (`node -p process.arch` = `x64`).

## Mutation policy

### Allowed

- `.github/workflows/ci.yml` (только матрица и диагностика архитектуры test job).

### Conditional

- `docs/development.md` — только строка о составе CI-матрицы, если она там описана.

### Forbidden

- Production-код и зависимости.
- `harness-integrity.yml`, `harness-windows-group.yml`, live-тесты provider и `PROVIDER_TEST_TOKEN` (REQ-041).
- Реализация future/unrelated STEP «заодно».

## Out of scope

- SQLite store и `better-sqlite3` (STEP-029).
- Сборки desktop-дистрибутивов (STEP-035).

## Acceptance criteria

- Test job CI содержит вариант macOS x64 для каждой версии Node.js матрицы; лог подтверждает `process.arch` = `x64`.
- Существующие варианты Linux, Windows и macOS arm64 сохранены без изменений.
- Workflow не использует `PROVIDER_TEST_TOKEN` и не запускает `test:provider`.

## Verification

- command: `python3 .harness/tools/validate.py --mode manual`
- manual: Run CI на PR с этим изменением: все варианты test job, включая macOS x64, — PASS, лог macOS x64 показывает `x64`.

## Deliverables

- Обновлённый `.github/workflows/ci.yml`.

## Implementation plan

### 1. Добавить macOS x64 в матрицу test job

- В .github/workflows/ci.yml добавить macos-15-intel (GitHub-hosted Intel x64, пара к macos-15) в matrix.os test job
- Обновить комментарии-примеры матрицы (4 ОС × 2 Node.js = 8 вариантов)
- Не менять node-версии, fail-fast: false, ключ кеша, шаги install/test и прочие jobs

**Files:**
- .github/workflows/ci.yml

**Risks:**
- Метка runner устареет при выводе образа из эксплуатации — фиксируется exact label, как для остальных ОС
- Если macOS x64 упадёт из-за кода, STEP-054 не может его исправить (production-код запрещён): BLOCKED и отдельное исправление
- Общий кеш по runner.os для arm64/x64 корректен: .yarnrc.yml supportedArchitectures кладёт в .yarn/cache бинарники обеих архитектур (H-002 опровергнута)

### 2. Диагностика архитектуры

- Добавить в test job шаг после Setup Node.js и до install, выполняющий отдельно `node -p process.platform` и `node -p process.arch`, без secrets, сети и зависимости от shell

**Files:**
- .github/workflows/ci.yml

### 3. Обновить описание CI

- В docs/development.md в строках о runner images и составе матрицы test job добавить macos-15-intel и изменить число вариантов с 6 на 8

**Files:**
- docs/development.md

### 4. Проверка

- python3 .harness/tools/validate.py --mode manual
- Разобрать изменённый workflow локальным YAML-парсером
- prettier --check docs/development.md через format:check
- Проверить, что в ci.yml нет PROVIDER_TEST_TOKEN и test:provider
- После публикации PR: весь workflow CI зелёный, лог macOS x64 показывает darwin и x64 (manual Verification); владельцу добавить новые required checks в branch protection при необходимости

## Evidence

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.

## Blocker / Failure reason

2026-10-16: изменение `ci.yml` опубликовано в [PR #30](https://github.com/yarkovaleksei/yandex-music-downloader/pull/30), но GitHub не запустил Windows/macOS jobs: «recent account payments have failed or your spending limit needs to be increased» (run 38926508109). Владелец восстановит биллинг не раньше 2026-11-07; manual Verification (прогон CI) отложена до этого. По решению владельца STEP-029 подтверждает платформы ручным прогоном и от STEP-054 больше не зависит.
