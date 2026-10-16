---
schema: 1
id: STEP-053
status: planned
type: documentation
priority: medium
phase: hardening
depends_on:
  - STEP-027
  - STEP-024
requirements: []
adrs: []
architecture_refs:
  - docs/architecture.md#основные-компоненты-границы
  - docs/architecture.md#external-dependencies-integrations
  - docs/architecture.md#известный-architecture-debt-drift
risk_flags:
  - none
plan:
  status: not_planned
  revision: 0
  context_basis: null
  content_hash: null
  reviewed_report: null
  planned_at: null
---

# STEP-053 — Синхронизировать описание принятого headless MVP

## Goal

Привести текущее описание headless MVP в architecture и development к проверенным коду, принятым решениям и итогам STEP-027, сохранив границы desktop и исторических доказательств.

## Context

PROJECT RECONCILE 2026-10-16 обнаружил документальный drift: docs/architecture.md и docs/development.md называют STEP-027 planned, хотя canonical STEP завершён, а AUDIT-20261015T172147Z.md фиксирует явное GO владельца. Architecture всё ещё относит выбор metadata library и FFmpeg к будущим решениям, хотя ADR-012/013 accepted, taglib-wasm используется в packages/metadata, music-metadata — в core-validation. Реализованный TTL cache представлен только общим намерением.

STEP-040 завершён и покрывал foundation/provider, а STEP-028 принимает будущие desktop-решения. Новый STEP синхронизирует факты о принятом headless MVP, не переоткрывая их исторические контракты. Это документационная работа без нового product REQ и архитектурного решения.

## Scope

- Сверить описание metadata, validation, cache, application и CLI с публичными exports, composition root, tests и evidence завершённых STEP-020/021/023/024/025/026/027.
- Указать принятые ADR-012/013 и фактические runtime dependencies; отделить их решения от будущих SQLite, Electron/IPC и packaging.
- Исправить текущие утверждения о planned STEP-027: привести ссылку на итоговую приёмку и GO от 2026-10-15, не распространяя их на будущие версии и desktop.
- Проверить фактические ограничения provider/live/platform evidence: более поздняя матрица не заменяет исторические единичные Range/transport probes.

## Mutation policy

### Allowed

- docs/architecture.md, docs/development.md — фактическое описание и проверяемые ссылки.
- STEP-053 и его новые plan/review/evidence artifacts; generated projections через deterministic tools.

### Conditional

- docs/adr/README.md — только исправление индексных ссылок при подтверждённом пропуске, без изменения Accepted ADR.

### Forbidden

- Production-код, tests, dependencies, lockfile, CI и Harness.
- Изменения REQ, решений Accepted ADR, статусов OQ и исторических STEP, plans, reviews, audits или fingerprints.
- Снятие completion/readiness blockers путём переписывания истории или ослабления deterministic gates.

## Out of scope

- Реализация desktop, SQLite, IPC, packaging и новые возможности headless.
- Повторная приёмка на трёх ОС, новые live-запуски и исправление предполагаемых production-дефектов.
- Исправление механизма проверки исторических completion proofs в Harness.

## Acceptance criteria

- Architecture и development согласованы с completed STEP-027 и итоговым GO; desktop остаётся будущей работой со своими Acceptance/Verification.
- Metadata writer, базовая validation без обязательного FFmpeg и TTL cache описаны по фактическим exports/config/tests; выбор metadata/FFmpeg не назван непринятым решением.
- Каждое новое существенное утверждение имеет проверяемый source/STEP/ADR/evidence; ограничения исторических, synthetic и real-platform proof сохранены.
- Product source/config/tests, REQ/Accepted ADR/OQ и исторические доказательства не изменены; документация проходит применимые проверки и независимый review.

## Verification

- command: `node packages/testing/scripts/run-yarn.mjs exec prettier --check docs/development.md`
- command: `python3 .harness/tools/check-command-references.py --json`
- command: `python3 .harness/tools/validate.py --mode manual`
- manual: Сопоставить изменённые утверждения с code/exports/tests, Accepted ADR-012/013 и финальным audit STEP-027. Сохранить исторические failed/partial attempts, ограничения provider/platform proof и различие между GO для принятого source и будущей desktop-приёмкой.
- manual: Классифицировать ранее зафиксированные четыре command-reference findings в completed STEP-008/044/049/050 отдельно; не менять исторические контракты ради формального отсутствия DRIFT.

## Deliverables

- Актуальные docs/architecture.md и docs/development.md.
- Evidence со ссылками на источники и независимый PASS review документационного изменения.

## Implementation plan

Заполняется командой `STEP PLAN STEP-053`. Пока semantic planning-review не дал PASS для текущих context basis + content hash, `plan.status` не может быть `ready`.

## Evidence

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.

## Blocker / Failure reason

Планирование и выполнение требуют штатной проверки prerequisites. Reconcile обнаружил NO_EXECUTABLE_STEP из-за completion-contract-stale завершённых зависимостей; исторические PASS не отменены и обход gate не разрешён.
