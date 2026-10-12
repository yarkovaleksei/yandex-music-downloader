---
schema: 1
id: ADR-007
status: accepted
date: 2026-10-04
deciders:
  - yarkovaleksei
supersedes:
  - ADR-005
superseded_by: []
requirements:
  - REQ-017
  - REQ-018
  - REQ-019
  - REQ-029
  - REQ-031
  - REQ-037
  - REQ-044
steps:
  - STEP-004
  - STEP-017
  - STEP-018
  - STEP-019
  - STEP-025
  - STEP-030
  - STEP-042
  - STEP-043
  - STEP-044
  - STEP-045
  - STEP-046
  - STEP-049
---

# ADR-007 — Application API, события и результаты команд

## Context

Команды `account`, `jobs` и `doctor` поддерживают `--json`, но не создают job-события с `jobId` и `seq`. ADR-005 не определял их результат и одновременно запрещал CLI собственную схему.

## Problem

Нужен единый сериализуемый contract для потоковых job-событий и однократных результатов команд без создания CLI-локальной схемы.

## Decision

Application API остаётся транспорт-независимым и использует сериализуемые DTO без Node-типов и секретов. В `packages/shared` определяются два версионированных набора данных:

1. `JobEvent` — события job с `schemaVersion`, `event`, монотонным `seq` на job, `jobId`, необязательными `trackKey`, `trackId`, `durationMs` и payload. `subscribe` публикует только этот union; snapshot-запросы включают `listJobs`, `getJob` и preview.
2. `CommandResult` — результат не-потоковой команды с `schemaVersion`, `kind` (`result` или `error`), `command`, `data` либо безопасным error DTO (`code`, `message`, `retryable`, `details?`). Он используется для auth/account/jobs/doctor и команд управления, когда они не транслируют поток job.

`--json` печатает NDJSON, каждая строка которого — `JobEvent` или `CommandResult` из общего `CliRecord` union в `packages/shared`; CLI не создаёт собственный transport contract. Поток download печатает `JobEvent`, а команды без job — один `CommandResult`. Логи и человекочитаемый вывод не попадают в этот stdout. Desktop IPC передаёт те же DTO напрямую.

`createApplication(runtimeAdapters)` остаётся единственной точкой сборки; host-only адаптеры передаются ей хостом. Лимит concurrency общий для экземпляра. Команды управления подчиняются матрице аренды ADR-004 и recovery ADR-006.

## Consequences

Машиночитаемый вывод всех команд однозначно валидируется, а CLI и desktop сохраняют единый contract без утечки реализации provider.

## Alternatives considered

### Формат JSON только для job-событий

Отклонено: `account`, `jobs` и `doctor` не имеют job и остались бы без валидируемого contract.

### Отдельная схема в CLI

Отклонено: desktop пришлось бы дублировать transport contract, что нарушает границу application layer.

## Security implications

`JobEvent`, `CommandResult` и error DTO проходят централизованную редакцию по PRN-002; токены и signed URL в них запрещены.

## Data / migration implications

Постоянные данные не меняются; все DTO versioned через `schemaVersion`.

## Compatibility / operational implications

Все unions содержат `schemaVersion`; несовместимое изменение требует нового ADR. Новые клиенты используют этот ADR вместо ADR-005.
