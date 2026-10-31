---
schema: 1
id: ADR-020
status: accepted
date: 2026-10-31
deciders:
  - yarkovaleksei (решение владельца продукта)
supersedes:
  - ADR-017
superseded_by: []
requirements:
  - REQ-040
  - REQ-033
---

# ADR-020 — Поддерживается только Node.js 24

## Context

[ADR-017](ADR-017-node-api-10-runtime-floor.md) задал диапазон Node.js `>=22.14.0 <25`, и CI проверял обе границы: 22.14.0 и 24. Пользователи получают только desktop-сборки (Windows exe, macOS ZIP, Linux AppImage), которые используют Node.js, встроенный в Electron 45 (Node.js 24.22.0, Node-API 10). CLI не публикуется отдельным пакетом и запускается только из исходников.

## Problem

Поддержка Node.js 22 нужна только тем, кто собирает проект из исходников, и требует второго прогона тестов в CI и в проверке toolchain. Отдельной аудитории с Node.js 22 нет.

## Decision

Поддерживается только Node.js 24 LTS: диапазон `>=24.0.0 <25`. Верхняя граница, Corepack/Yarn и остальное решение ADR-008 не меняются; `better-sqlite3` 13 (ADR-014) сохраняется, Node.js 24 предоставляет Node-API 10.

Диапазон закреплён в `engines`, `run-yarn.mjs`, `verify-toolchain.mjs`, `nodeRange` boundaries, проверке runtime в doctor, consistency-тестах, CI-матрице, `verify-workspace`, документации и REQ-040.

## Alternatives considered

### Сохранить `>=22.14.0 <25`

Сохраняет сборку из исходников на Node.js 22 ценой второго прогона CI. Отвергнуто: такой аудитории нет.

### Опубликовать CLI в npm

Сделало бы поддержку нескольких версий Node.js значимой для пользователей, но требует сборки CLI в один пакет, решения по нативным модулям и отдельного выпуска. Отложено.

## Consequences

- Сборка и запуск из исходников на Node.js 22 отклоняются `run-yarn.mjs`, `engines` и doctor.
- CI запускает unit tests только на Node.js 24; нижняя граница 24.0.0 отдельно не проверяется.
- Desktop-сборки не затронуты: Electron поставляет собственный Node.js 24.

## Security implications

Не применимо: решение меняет только диапазон runtime.

## Data / migration implications

Не применимо: данных и форматов не меняет.

## Compatibility / operational implications

Разработчикам с Node.js 22 нужно перейти на Node.js 24 (`.nvmrc`). При публикации CLI отдельным пакетом диапазон пересматривается новым ADR.
