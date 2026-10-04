---
schema: 1
id: REQ-029
priority: critical
source: brief
steps:
  - STEP-019
  - STEP-025
adrs:
  - ADR-001
  - ADR-007
---

# REQ-029 — [CLI] Команды CLI

## Requirement

CLI `music-downloader` предоставляет команды `auth`, `account`, `download <URL>`, `track <URL>`, `album <URL>`, `playlist <URL>`, `jobs`, `resume <JOB_ID>`, `retry <JOB_ID>`, `cancel <JOB_ID>`, `doctor`. CLI общается только с application layer и не знает про Yandex API. Ctrl+C во время загрузки приводит к корректной паузе (см. REQ управления заданием). Для удаления авторизации существует команда `logout`. Параметры настраиваются по приоритету: флаги CLI, затем переменные окружения, затем файл конфигурации; значения по умолчанию: `--output` — музыкальный каталог пользователя ОС, `--quality` — `best`. Команды `jobs`, `account` и `doctor` поддерживают `--json`. Логи пишутся в stderr (stdout зарезервирован под результат и события) и при настройке в файл.

## Rationale

Headless CLI — обязательный продукт первого этапа (brief §25).

## Acceptance

- `music-downloader --help` перечисляет все команды; команды загрузки и управления покрыты smoke-тестами в STEP-019, `doctor` — в STEP-025.
- `jobs` показывает список заданий с jobId, источником и статусом; `resume`/`retry`/`cancel` с несуществующим JOB_ID завершаются понятной ошибкой.
- Статический анализ зависимостей подтверждает, что `apps/cli` не импортирует provider package напрямую.
