---
schema: 1
id: ADR-008
status: accepted
date: 2026-10-06
deciders:
  - yarkovaleksei
supersedes: []
superseded_by: []
requirements:
  - REQ-040
---

# ADR-008 — Yarn workspaces для monorepo

## Context

ADR-001 фиксирует npm workspaces как менеджер пакетов. Проверка toolchain показала, что `npm install` на поддерживаемой нижней версии Node.js меняет metadata platform-specific optional dependencies в lockfile, созданном другой версией npm. Это не меняет слоевые границы ADR-001, но лишает clean-install проверки воспроизводимости.

## Problem

Нужен единый менеджер пакетов с фиксированной версией клиента и детерминированным lockfile для всех поддерживаемых Node.js runtime.

## Decision

После принятия этого ADR проект использует Yarn 4 с workspaces и `nodeLinker: node-modules`. Версия Yarn фиксируется через `packageManager` в корневом `package.json`; `yarn.lock` — единственный lockfile. Поддерживаемый runtime ограничен диапазоном Node.js `>=22.13.0 <25`, в котором Corepack доступен как bootstrap-механизм Yarn. Решение заменяет только пункт 8 ADR-001 о npm workspaces; модель слоёв, package layout и npm-compatible scripts остаются без изменений.

## Alternatives considered

### Оставить npm workspaces

Не принято: lockfile зависит от metadata, нормализуемой различными поддерживаемыми npm CLI.

### Yarn Plug'n'Play

Не принято: `node-modules` снижает риск несовместимости tooling и Electron-экосистемы на ранней стадии проекта.

## Consequences

Все development, CI и release-инструкции используют `yarn install --immutable` и `yarn run`. `package-lock.json`, `.npmrc` и npm-специфичные проверки удаляются в миграции toolchain.

## Security implications

Yarn фиксируется в manifest и запускается через Corepack; это уменьшает риск непреднамеренного использования другой версии package manager. Scoped registry policy для внутренних пакетов сохраняется в Yarn-эквивалентной конфигурации.

## Data / migration implications

Не применимо: меняются только dependency metadata и lockfile, пользовательские данные и schema не затрагиваются.

## Compatibility / operational implications

Поддерживаются только Node.js `>=22.13.0 <25`, включая Node.js 22 и 24 LTS. CI и документация обязаны вызывать Corepack/Yarn явно до установки зависимостей; Node.js 25 и новее не поддерживаются этим contract.
