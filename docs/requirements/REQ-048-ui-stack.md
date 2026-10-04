---
schema: 1
id: REQ-048
priority: medium
source: brief
steps:
  - STEP-030
adrs: []
---

# REQ-048 — [UI] Стек UI и соответствие брендбуку

## Requirement

UI реализуется на React, TypeScript, Vite и MUI с `@mui/icons-material` без собственного UI kit; визуальные решения следуют `docs/brand/brandbook.md` и макетам `docs/brand/mockups`. Макеты нормативны только для визуального оформления и компоновки; конкретные кодеки, значения качества по умолчанию и переключатели на макетах не являются требованиями (они определяются REQ качества и настроек).

## Rationale

Единый визуальный язык и скорость разработки (brief §4.4).

## Acceptance

- Тема MUI реализует токены brandbook (цвета, типографика Inter, радиусы, spacing), что подтверждается snapshot/unit-тестом темы.
- В проекте нет собственной библиотеки базовых компонентов UI; используются компоненты MUI.
- Экраны сверены с макетами в `docs/brand/mockups` (review checklist в STEP).
