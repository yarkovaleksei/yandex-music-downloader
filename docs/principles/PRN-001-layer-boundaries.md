---
schema: 1
id: PRN-001
status: active
severity: blocking
scope: project
superseded_by: null
requirements:
  - REQ-005
  - REQ-004
  - REQ-044
adrs:
  - ADR-001
  - ADR-002
---

# PRN-001 — Границы слоёв и изоляция Yandex-кода

## Rule

UI, Electron и CLI не знают ничего о Yandex API; Yandex-специфичный код и пакет `@dvxch/yandex-music` находятся только в `packages/providers/yandex-music`; зависимости идут по направлению ADR-001. Нарушение границы — архитектурный дефект.

## Rationale

API неофициальный и нестабильный; проект рассчитан на независимость core и клиентов от источника (brief §56).

## Applies to

Любые изменения импортов и зависимостей между пакетами, новые клиенты, новые provider-ы, IPC и application API.

## Exceptions / approved deviation

Исключений нет. Изменение границ возможно только новым ADR, заменяющим ADR-001/ADR-002.
