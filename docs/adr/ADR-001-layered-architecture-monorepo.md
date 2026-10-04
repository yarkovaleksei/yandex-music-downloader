---
schema: 1
id: ADR-001
status: accepted
date: 2026-10-04
deciders:
  - yarkovaleksei
supersedes: []
superseded_by: []
requirements:
  - REQ-004
  - REQ-005
  - REQ-029
  - REQ-040
  - REQ-044
  - REQ-045
steps:
  - STEP-001
  - STEP-003
  - STEP-012
  - STEP-018
  - STEP-019
  - STEP-030
---

# ADR-001 — Слоистая архитектура и структура monorepo

## Context

Проект состоит из headless CLI (этап 1) и Electron UI (этап 2) поверх одного downloader core. Brief §6, §7, §56 требует, чтобы UI, Electron и CLI ничего не знали о Yandex API, а core можно было тестировать с mock provider.

## Problem

Нужно зафиксировать слои, направление зависимостей и структуру пакетов так, чтобы нарушение границ обнаруживалось автоматически, а добавление desktop и других provider-ов не требовало переработки core.

## Decision

Принимается monorepo на TypeScript (`strict: true`) со слоями и направлением зависимостей:

```text
apps/cli, apps/desktop
        ↓
packages/application      (API операций + composition root: createApplication(runtimeAdapters))
        ↓
packages/core/*           (downloader, planner, queue, retry, manifest, filesystem, validation)
        ↓
packages/shared           (доменные типы, ошибки, контракт MusicProvider, порты, DTO и события; без Node built-ins и ввода-вывода)
        ↑
packages/providers/yandex-music, packages/metadata, packages/persistence, packages/logging   (реализации портов)
```

Правила:

1. `apps/*` зависят только от `packages/application` и типов контракта из `packages/shared`; они не импортируют provider, core, metadata, persistence и logging напрямую.
2. `packages/application` — единственный composition root: подключает конкретный provider и реализации портов. Runtime-специфичные реализации (например, secure storage Electron доступно только в main process, native-модуль SQLite собирается под конкретный runtime) передаются клиентом как `runtimeAdapters` в `createApplication`, а не импортируются application-слоем статически.
3. `packages/core/*` зависят от `packages/shared` и портов, но не от provider, Electron и React. Порядок зависимостей внутри `core/*` фиксируется boundary rules в STEP-001 (filesystem, retry, manifest, validation не зависят от downloader и queue).
4. `packages/providers/yandex-music`, `packages/metadata`, `packages/persistence`, `packages/logging` зависят от `packages/shared` и не зависят от `packages/core/*` и друг от друга.
5. `packages/shared` не использует Node built-ins и ввод-вывод, чтобы типы контракта можно было импортировать в preload и renderer.
6. `packages/testing` содержит mock provider и тестовые утилиты; зависит от shared.
7. Правила исполняются ESLint boundary rules; нарушение блокирует CI.
8. Менеджер пакетов — npm workspaces (brief использует команды `npm run ...`); остальной toolchain (тестовый раннер, формат модулей, сборка) выбирается в STEP-001 как implementation decision и фиксируется в `docs/development.md`. Runtime — Node.js ≥ 20; конкретная поддерживаемая LTS для CI и разработки выбирается в STEP-001. Изменение структуры пакетов — только через новый ADR.

Структура каталогов соответствует brief §7 с добавлением `packages/application` и `packages/logging`.

## Alternatives considered

### Единый пакет без разделения на слои

Проще на старте, но границы не проверяются автоматически; отвергнуто из-за требования изолировать provider и core.

### Плоская структура пакетов без портов

Core зависел бы от конкретных реализаций metadata/persistence, что усложняет SQLite-реализацию и тестирование; отвергнуто.

## Consequences

Положительные: автоматически проверяемые границы, тестируемость core с mock provider, заменяемость persistence и provider, возможность подключать runtime-специфичные реализации в Electron main. Отрицательные: больше пакетов и конфигурации на старте.

## Security implications

Граница application layer ограничивает поверхность доступа UI к токенам и provider; токен не передаётся через application API; модель безопасности Electron — отдельный ADR перед desktop.

## Data / migration implications

Не применимо: ADR не определяет формат данных.

## Compatibility / operational implications

Добавление новых provider-ов и target-архитектур не требует изменения core. Структура пакетов меняется только через ADR.
