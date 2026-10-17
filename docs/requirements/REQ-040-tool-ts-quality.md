---
schema: 1
id: REQ-040
priority: high
source: brief
steps:
  - STEP-001
  - STEP-037
  - STEP-055
adrs:
  - ADR-001
  - ADR-008
  - ADR-017
---

# REQ-040 — [TOOLING] Строгий TypeScript и контроль качества кода

## Requirement

Все пакеты используют TypeScript со `strict: true`; применяются ESLint и Prettier; `any` без явного технического обоснования запрещён; dependency boundaries проверяются автоматически. Менеджер пакетов — Yarn 4 workspaces; runtime — Node.js `>=22.14.0 <25` (ADR-017).

## Rationale

Единое качество кода монорепозитория (brief §4.1, §43).

## Acceptance

- `yarn run lint`, `yarn run typecheck`, `yarn run format:check` существуют и проходят на чистой ветке.
- Правило запрета неявного/необоснованного `any` включено в ESLint.
- ESLint boundary rules описывают направление зависимостей ADR-001 и падают на тестовом нарушении.
