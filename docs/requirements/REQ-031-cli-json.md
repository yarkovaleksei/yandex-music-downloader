---
schema: 1
id: REQ-031
priority: high
adrs:
  - ADR-005
  - ADR-007
---

# REQ-031 — [CLI] Машиночитаемый режим --json

## Requirement

Режим `--json` выводит в stdout записи в формате NDJSON из общего union `CliRecord` application layer: поток загрузки — `JobEvent` (например `track.progress` с `jobId`, `trackId`, `progress`), команды без job — один `CommandResult` с результатом или безопасной ошибкой. CLI не определяет собственную схему. Человекочитаемый вывод и логи не смешиваются со stdout. Записи не содержат секретов.

## Rationale

Нужен для автоматических тестов, будущей интеграции Electron и сторонней автоматизации.

## Acceptance

- Каждая строка stdout в режиме `--json` — валидный JSON, проходящий проверку по схеме `CliRecord` из `packages/shared`; `account`, `jobs` и `doctor` возвращают один `CommandResult`.
- Тест запускает загрузку на mock provider и проверяет последовательность событий job/track от создания до завершения.
- Автоматическая проверка подтверждает отсутствие токенов и signed URL в событиях.
