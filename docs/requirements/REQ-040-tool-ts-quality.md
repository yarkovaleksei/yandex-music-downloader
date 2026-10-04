---
schema: 1
id: REQ-040
priority: high
source: brief
steps:
  - STEP-001
adrs:
  - ADR-001
---

# REQ-040 — [TOOLING] Строгий TypeScript и контроль качества кода

## Requirement

Все пакеты используют TypeScript со `strict: true`; применяются ESLint и Prettier; `any` без явного технического обоснования запрещён; dependency boundaries проверяются автоматически; runtime — Node.js 20+ (актуальная LTS).

## Rationale

Единое качество кода монорепозитория (brief §4.1, §43).

## Acceptance

- `npm run lint`, `npm run typecheck`, `npm run format:check` существуют и проходят на чистой ветке.
- Правило запрета неявного/необоснованного `any` включено в ESLint.
- ESLint boundary rules описывают направление зависимостей ADR-001 и падают на тестовом нарушении.
