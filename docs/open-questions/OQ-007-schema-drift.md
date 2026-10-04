---
schema: 1
id: OQ-007
status: open
affects:
  - STEP-009
  - STEP-025
created_at: 2026-10-04T17:57:04Z
resolved_at: null
---

# OQ-007 — Как корректно определять API schema drift?

## Context

Brief §29, §45: drift не должен превращаться в generic runtime exception; нужна стратегия runtime-схем и классификации.

## Decision needed

Выбрать стратегию runtime-валидации и признаки drift (какие поля критичны, как отличить drift от сетевой ошибки).

## Resolution

—
