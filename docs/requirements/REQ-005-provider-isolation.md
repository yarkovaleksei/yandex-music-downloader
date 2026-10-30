---
schema: 1
id: REQ-005
priority: critical
adrs:
  - ADR-001
  - ADR-002
---

# REQ-005 — [PROVIDER] Изоляция Yandex-specific кода

## Requirement

Любой импорт `@dvxch/yandex-music` и знание endpoint'ов Яндекс Музыки разрешены только внутри `packages/providers/yandex-music`. Нарушение границы блокируется ESLint boundary rule при локальном запуске lint.

## Rationale

Нарушение этой границы считается архитектурным дефектом.

## Acceptance

- ESLint запрещает импорт `@dvxch/yandex-music` вне `packages/providers/yandex-music`; тестовый файл-нарушитель вызывает ошибку lint.
- Публичный API provider package не экспортирует типы сторонней библиотеки.
- CLI и desktop зависят от provider package только транзитивно через application layer.
