---
schema: 1
id: STEP-055
status: completed
type: implementation
priority: medium
phase: desktop
depends_on: []
requirements:
  - REQ-040
adrs:
  - ADR-008
  - ADR-017
architecture_refs:
  - docs/architecture.md#deployment-runtime-assumptions
risk_flags:
  - release-critical
plan:
  status: ready
  revision: 2
  context_basis: sha256:2edf7cc7de4e00bb7778e9791e07c0bf43c5337ba96ba67e7e5d2106dc2e8392
  content_hash: sha256:6a84a594d86ff0b52c026cd883226a5051853cfd9bde39a266ff76c5ee430b92
  reviewed_report: planning/plan-reviews/STEP-055/PLAN-REVIEW-20261016T165645Z.md
  planned_at: 2026-10-16T16:56:45+00:00
  execution_groups:
  context_components:
    - "ADR@ADR-008=sha256:2003e2ad894a57050dc2a171d3c06186ed627a54094598c9b23bf853303fdc1e"
    - "ADR@ADR-017=sha256:4b0466ed1a5ce6426d8af2e6cf5b994c69956e211bf63726d476a60cc7ec2469"
    - "ARCH@docs/architecture.md#deployment-runtime-assumptions=sha256:8fea3897a05a28d78e3f786196d7d5d11ee3c3152cae1cee4350eee96e989e81"
    - "PRN@PRN-001=sha256:3b3801f207fafc3f77272f0e93570258a6d006964839d93a276accd814d548af"
    - "PRN@PRN-002=sha256:f29ee3fbdb9cf65cf9739d0907768bbf192ad88b8e443110d4d82f81c6b79ecb"
    - "PRN@PRN-003=sha256:16516d7d302fecda5f7615f9d55e29e04b588d671f8660640e1f61d1619e4ef8"
    - "REQ@REQ-040=sha256:468a917125d5bae63f202c21b8828d76e25c9e904a232bd65028d7c6a64bf118"
    - "STEP@STEP-055=sha256:3a14d6e7d95fbd307a41d0dd948fd8a0bb0867302055667e888c750ca670b0ad"
---

# STEP-055 — Нижняя граница Node.js 22.14.0

## Goal

Поддерживаемый диапазон Node.js везде в репозитории равен `>=22.14.0 <25` (ADR-017), чтобы `better-sqlite3` 13 (Node-API 10) работал на нижней границе.

## Context

[ADR-017](../../docs/adr/ADR-017-node-api-10-runtime-floor.md): `better-sqlite3` 13 падает на Node.js 22.13.0 (Node-API 9), работает с 22.14.0. Диапазон закреплён в нескольких местах; consistency-тесты сверяют их между собой. Prerequisite STEP-029.

## Scope

- `package.json` `engines.node` и проверка версии в `packages/testing/scripts/run-yarn.mjs`.
- `eslint/boundaries.config.mjs` (`nodeRange`) и `eslint/consistency.test.ts`.
- `.github/workflows/ci.yml`: версия Node.js `22.13.0` → `22.14.0` в матрице и примерах комментариев.
- `docs/development.md`, `docs/architecture.md`, REQ-040: формулировка диапазона.
- `packages/application/src/diagnostics.ts` (`supportedNode` — проверка runtime в `doctor`) и тесты `diagnostics.test.ts`, `doctor.integration.test.ts` с `nodeVersion: '22.13.0'`.
- Скрипты `packages/testing/scripts/verify-step-001*` и `verify-toolchain.mjs` — версия нижней границы.

## Mutation policy

### Allowed

- Перечисленные в Scope файлы.

### Conditional

- `.nvmrc` — только если он фиксирует нижнюю границу.

### Forbidden

- Изменение Accepted ADR-008/012/013/014 (исторические записи), зависимостей и `yarn.lock`; production-логика — только граница в `supportedNode`.
- Реализация future/unrelated STEP «заодно».

## Out of scope

- `better-sqlite3` и SQLite store (STEP-029).
- Состав CI runner images (STEP-054).

## Acceptance criteria

- Все места, где закреплён диапазон, содержат `>=22.14.0 <25`; consistency-тесты это проверяют.
- `run-yarn.mjs` и `doctor` (`UNSUPPORTED_RUNTIME`) отклоняют Node.js 22.13.x и принимают 22.14.0.
- CI-матрица использует Node.js 22.14.0 вместо 22.13.0.

## Verification

- command: `npm run lint`
- command: `npm run typecheck`
- command: `npm test`
- command: `python3 .harness/tools/validate.py --mode manual`

## Deliverables

- Согласованный диапазон Node.js в конфигурации, CI, документации и REQ-040.

## Implementation plan

### 1. Конфигурация и скрипты toolchain

- package.json engines.node → `>=22.14.0 <25`
- eslint/boundaries.config.mjs nodeRange.min → '22.14.0'; JSDoc со ссылкой на ADR-008 и ADR-017
- packages/testing/scripts/run-yarn.mjs: minNode [22,14,0], JSDoc и сообщение `требуется >=22.14.0 <25 (ADR-008, ADR-017)`
- verify-toolchain.mjs: ожидаемое engines.node `>=22.14.0 <25`
- verify-step-001.mjs и verify-step-001-manual.sh: нижняя версия 22.14.0
- Проверить .nvmrc: содержит 24 (рекомендуемая версия), не нижнюю границу — не менять

**Files:**
- package.json
- eslint/boundaries.config.mjs
- packages/testing/scripts/run-yarn.mjs
- packages/testing/scripts/verify-toolchain.mjs
- packages/testing/scripts/verify-step-001.mjs
- packages/testing/scripts/verify-step-001-manual.sh

### 2. doctor

- diagnostics.ts supportedNode: нижняя граница 22.14 (minor >= 14 при major 22)
- diagnostics.test.ts и doctor.integration.test.ts: фиктивный nodeVersion '22.13.0' → '22.14.0'; граничные кейсы 22.13.1 → UNSUPPORTED_RUNTIME, 22.14.0 → ok

**Files:**
- packages/application/src/diagnostics.ts
- packages/application/src/diagnostics.test.ts
- packages/application/src/doctor.integration.test.ts

### 3. CI и документация

- ci.yml test job: matrix.node '22.13.0' → '22.14.0' и примеры в комментариях
- docs/development.md: диапазон `>=22.14.0 <25` со ссылкой на ADR-017; нижняя версия в описании CI и verify-step-001
- docs/architecture.md (deployment-runtime-assumptions): `>=22.14.0 <25` (ADR-008, ADR-017)
- REQ-040 уже содержит новый диапазон по решению владельца — сверить

**Files:**
- .github/workflows/ci.yml
- docs/development.md
- docs/architecture.md
- docs/requirements/REQ-040-tool-ts-quality.md

**Risks:**
- Имена checks меняются на 'Node.js 22.14.0' — владельцу обновить required checks в branch protection (вне репозитория)

### 4. Consistency-тесты (proof H-001)

- eslint/consistency.test.ts: импортировать nodeRange; проверить nodeRange.min === '22.14.0' и engines.node === `>=${nodeRange.min} <25`
- Для docs/development.md, docs/architecture.md, REQ-040, run-yarn.mjs, verify-toolchain.mjs, verify-step-001.mjs, verify-step-001-manual.sh и .github/workflows/ci.yml проверить наличие нового значения (диапазон или '22.14.0' в matrix.node) и отсутствие подстроки '22.13'
- Граничный тест assertNodeSupported (22.13.9 и 25.0.0 отклоняются, 22.14.0 и 24.21.0 принимаются) через dynamic import run-yarn.mjs, чтобы не требовать .d.mts (typecheck: noImplicitAny)

**Files:**
- eslint/consistency.test.ts

### 5. Проверка

- Дополнительно: git grep '22\.13' с pathspec, исключающим docs/adr, docs/research, planning/tasks, planning/reviews, planning/plan-reviews, planning/audits — пусто
- npm run lint, npm run typecheck, npm test, validate.py

## Evidence

<!-- VERIFICATION-EVIDENCE:START -->
- Verification run: 2026-10-16T16:57:15Z
- Status: PASS
- Automated resumed: false
- Git head: 08cab18090c844a34e7a4d8713963e3f2e33bb6e
- Worktree hash: sha256:2ea79080b5e673a915e21522cdb911c194391dc48e2b6eb2380971417063b4cf
- Verification contract basis: sha256:0daade76853affff17d9e8542208a6178d361ad01b01c40dbb4d103e96937ced
- Verification context basis: sha256:b89f52c4f3a23bfa0c94efc97e96cd89ca128c61a3897ce2626b9564f0a0e5e5
- Subject git head: 08cab18090c844a34e7a4d8713963e3f2e33bb6e
- Subject worktree hash: sha256:cfce125849bf977c825304ae4dd3c05fcb1b32e6e5f1ba3f0fcc0ff6b114518a
- Subject content hash: sha256:2ab3f5b101d8bcf212505f2113933ef3d4c131720e95704388e34ce252bf6715

### Automated verification
- Command: npm run lint
  - Status: PASS
  - Exit code: 0
  - Duration ms: 8179
  - stdout sha256: a9abc4bc51d6729860fb000bf87c02e5a80cc830999d05e640c5651c7e3daa6a
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 147
  - stderr bytes: 0
- Command: npm run typecheck
  - Status: PASS
  - Exit code: 0
  - Duration ms: 3169
  - stdout sha256: 73ad7967b0b62b903e0e14e90a6a3971d720cb1ab6b744714e6d2ef05dd89743
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 83
  - stderr bytes: 0
- Command: npm test
  - Status: PASS
  - Exit code: 0
  - Duration ms: 7152
  - stdout sha256: d5eeb42b40d430f8346463f7aeef5f572b19f2dc5b3134312d86986b57d5fff4
  - stderr sha256: 1cc05c4dcfacf77b7b8296c958a87bd42477d624ab66e7d92a2ad497a0d19834
  - stdout bytes: 11940
  - stderr bytes: 2506
- Command: python3 .harness/tools/validate.py --mode manual
  - Status: PASS
  - Exit code: 0
  - Duration ms: 4871
  - stdout sha256: f99cbc1b3de1efa272219c596b411a65a9ee138b58925fa0d2e13d62766fa96a
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 135
  - stderr bytes: 0

### Product verification
- none

### Manual verification
- none
<!-- VERIFICATION-EVIDENCE:END -->

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.

## Blocker / Failure reason

—
