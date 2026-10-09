---
schema: 1
id: ADR-005
status: superseded
date: 2026-10-04
deciders:
  - yarkovaleksei
supersedes: []
superseded_by:
  - ADR-007
requirements:
  - REQ-017
  - REQ-018
  - REQ-019
  - REQ-031
  - REQ-037
  - REQ-044
steps: []
---

# ADR-005 — Контракт application API и событий

## Context

CLI (`--json`, NDJSON) и desktop (IPC) должны получать одинаковую информацию из application layer, не зная про provider (brief §3, §27, §39, §56). Без единого контракта схема событий оказалась бы в CLI, а desktop пришлось бы дублировать её.

## Problem

Нужно определить транспорт-независимый API application layer, формат событий и ошибок и способ подключения runtime-специфичных реализаций.

## Decision

1. Application API не зависит от транспорта и оперирует сериализуемыми DTO (plain data, без классов и функций, без типов Node). Токены и другие секреты не передаются через API.
2. Единый версионированный union событий (`schemaVersion`, `event`, монотонный `seq` на job, `jobId`, `trackKey?` — идентичность трека в плане, `trackId?` — атрибут, `durationMs?`, payload) определён в `packages/shared` и используется как для observability-событий core, так и для публикации клиентам. Application предоставляет `subscribe(listener)` и snapshot-запросы (`listJobs`, `getJob`, получение обложки для preview). `seq` позволяет согласовать snapshot и подписку; `subscribe` покрывает job своего экземпляра, job других процессов видны только через snapshot.
3. Ошибки передаются как DTO с `code`, `message` (безопасное пользовательское), `retryable`, `details?` без секретов; `instanceof` между пакетами и процессами не используется — клиенты различают ошибки по `code`.
4. CLI NDJSON (`--json`) и desktop IPC — проекции union событий 1:1; CLI не определяет собственную схему событий и не расширяет контракт.
5. `createApplication(runtimeAdapters)` — единственная точка сборки. `runtimeAdapters` — host-only примитивы (системное secure storage, native-модуль SQLite, пути ОС), которые может предоставить только хост; Node-реализации по умолчанию (файловый `ManifestStore`, logger, metadata) подключает application, поэтому CLI их не импортирует. Для тестов и E2E допускается подмена provider через необязательный адаптер `providerOverride` (mock provider), недоступный в production-сборках.
6. Лимит параллелизма (`concurrency`) — общий для экземпляра приложения (процесса), а не для отдельного job.
7. Команды управления job (`pause`, `resume`, `cancel`, `retry`) принимаются через API и подчиняются матрице команд ADR-004: `resume` на живом job в состоянии `running` отклоняется ошибкой, остальные команды для чужого живого job превращаются в control-запросы через канал `ManifestStore`.

## Alternatives considered

### Схема событий внутри CLI

Desktop дублирует или импортирует её из CLI, нарушая границы; отвергнуто.

### Передавать классы ошибок через IPC

Подклассы `Error` теряются при сериализации; отвергнуто.

## Consequences

Положительные: один контракт для CLI и desktop, тестируемость на mock application. Отрицательные: изменение union событий — изменение публичного контракта (версионируется).

## Security implications

Секреты не входят в DTO и события; редакция применяется до публикации (PRN-002).

## Data / migration implications

Не применимо: форматы хранения не затрагиваются.

## Compatibility / operational implications

Union событий и DTO версионируются полем `schemaVersion`; обратно несовместимые изменения требуют нового ADR.
