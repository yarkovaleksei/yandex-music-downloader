---
schema: 1
id: STEP-025
status: planned
type: hardening
priority: high
phase: hardening
depends_on:
  - STEP-019
  - STEP-009
  - STEP-023
  - STEP-006
requirements:
  - REQ-034
  - REQ-007
  - REQ-002
  - REQ-016
  - REQ-029
  - REQ-031
adrs:
  - ADR-002
  - ADR-007
architecture_refs:
  - "docs/architecture.md#reliability-observability"
  - "docs/architecture.md#external-dependencies-integrations"
risk_flags:
  - external-integration
plan:
  status: not_planned
  revision: 0
  context_basis: null
  content_hash: null
  reviewed_report: null
  planned_at: null
---

# STEP-025 — Doctor и provider health

## Goal

Реализовать команду `doctor` и сквозную диагностику provider health, различающую несовместимость API и сетевые ошибки.

## Context

Doctor — критерий перехода к UI (brief §48); использует решения ADR по drift detection (OQ-007).

## Scope

- Проверки runtime, provider, auth, account, metadata, variants, filesystem, FFmpeg (optional), состояние хранилища.
- Отдельный статус «API changed».
- Вывод в человекочитаемом и `--json` формате.
- Права токена-файла и каталога вывода.

## Mutation policy

### Allowed

- `apps/cli/**` (doctor), `packages/application/**` (diagnostics API), `packages/providers/yandex-music/**` (health probes), тесты.

### Conditional

- Нет.

### Forbidden

- Изменение контракта MusicProvider без ADR.
- Реализация future/unrelated STEP «заодно».

## Out of scope

- UI Diagnostics (STEP-032).

## Acceptance criteria

- На mock provider каждая проверка управляемо даёт OK/FAIL, а exit code соответствует результату.
- Структурно изменённый ответ даёт статус «API changed», отличный от сетевой ошибки.
- Отсутствие FFmpeg — optional и не даёт ненулевого кода.
- `PROVIDER_SCHEMA_VERSION` выводится в doctor.

## Verification

- command: `npm run lint`
- command: `npm run typecheck`
- command: `npm test`
- command: `python3 .harness/tools/validate.py --mode manual`
- manual: Запустить `doctor` на реальном окружении.

## Deliverables

- Doctor, diagnostics API, тесты.

## Implementation plan

Заполняется командой `STEP PLAN STEP-025`. Пока semantic planning-review не дал PASS для текущих context basis + content hash, `plan.status` не может быть `ready`.

## Evidence

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.

## Blocker / Failure reason

—
