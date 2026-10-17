---
schema: 1
id: ADR-017
status: accepted
date: 2026-10-16
deciders:
  - yarkovaleksei (решение владельца продукта, STEP PLAN STEP-029)
supersedes: []
superseded_by: []
requirements:
  - REQ-040
  - REQ-033
steps:
  - STEP-055
  - STEP-029
---

# ADR-017 — Нижняя граница Node.js 22.14.0 (Node-API 10)

## Context

[ADR-008](ADR-008-yarn-workspaces.md) ограничил runtime диапазоном Node.js `>=22.13.0 <25`. [ADR-014](ADR-014-sqlite-persistence.md) выбрал `better-sqlite3` 13 и потребовал доказать его загрузку во всём поддерживаемом диапазоне. При планировании STEP-029 независимый reviewer установил, а проверка в scratch подтвердила:

- все опубликованные `better-sqlite3` 13.x собраны с `NAPI_VERSION=10`;
- Node.js 22.13.0 поддерживает Node-API 9, и `new Database(':memory:')` на нём завершается SIGSEGV (exit 139);
- Node.js 22.14.0 сообщает `process.versions.napi` = 10, и `better-sqlite3` 13.0.3 открывает базу (SQLite 3.53.4); на 22.16.0 и 24.21.0 тоже работает.

## Problem

Выбранная ADR-014 библиотека несовместима с нижней границей поддерживаемого runtime. Нужно либо сменить библиотеку, либо сдвинуть границу.

## Decision

Нижняя граница поддерживаемого Node.js поднимается до **22.14.0**: диапазон `>=22.14.0 <25`. Верхняя граница, Corepack/Yarn и остальное решение ADR-008 не меняются. `better-sqlite3` 13 (ADR-014) сохраняется.

Изменение применяется одним toolchain STEP-055 во всех местах, где закреплён диапазон: `engines`, проверка в `run-yarn.mjs`, `nodeRange` boundaries и consistency-тесты, CI-матрица (`22.13.0` → `22.14.0`), документация и REQ-040. STEP-029 зависит от него.

## Alternatives considered

### `better-sqlite3` 12.x

Работает на Node-API 9, но не является Node-API binary: для Electron требует отдельной сборки (`electron-rebuild`), что противоречит основанию выбора ADR-014. Отвергнуто.

### Встроенный `node:sqlite`

Нет native-зависимости, но на Node 22 модуль в активной разработке и не проверен в Electron (ADR-014). Отвергнуто.

## Consequences

- Пользователи Node.js 22.13.x должны обновиться до 22.14.0+; `run-yarn.mjs` и `engines` сообщают об этом явно.
- CI проверяет новую нижнюю границу 22.14.0 и верхнюю 24.
- Electron вне этого решения: он поставляет собственный Node.js, совместимость с Node-API 10 подтверждает STEP-030.

## Security implications

Не применимо: решение меняет только диапазон runtime.

## Data / migration implications

Не применимо: данных и форматов не меняет.

## Compatibility / operational implications

ADR-008 не переписывается: этот ADR заменяет только значение нижней границы в его пункте о runtime и в формулировке диапазона ADR-014. Основания: [Node.js — Node-API version matrix](https://nodejs.org/api/n-api.html#node-api-version-matrix), [better-sqlite3 v13.0.0](https://github.com/WiseLibs/better-sqlite3/releases), локальная проверка Node 22.13.0/22.14.0/24.21.0 на Linux x64.
