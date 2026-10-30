---
schema: 1
id: REQ-013
priority: critical
adrs:
  - ADR-003
  - ADR-006
---

# REQ-013 — [DOWNLOAD] Формальная state machine задания

## Requirement

Состояния и допустимые переходы задания и трека формально описаны (ADR-006) и реализованы в виде проверяемой state machine: queued → resolving → ready → downloading → processing → completed; ошибочные, пользовательские, skip- и recovery-переходы по таблице ADR. Недопустимый переход отвергается. Статус job агрегируется детерминированно (включая `completed_with_errors` и `interrupted`).

## Rationale

Корректность pause/resume/cancel/retry и восстановления зависит от явной модели.

## Acceptance

- Unit-тесты покрывают каждый разрешённый переход и отказ на каждом недопустимом переходе таблицы ADR.
- Текущий статус каждого задания и трека хранится в manifest и восстанавливается из него.
- `completed`, `skipped` и `cancelled` — терминальные состояния; из `failed` выход возможен только командой retry, кроме recovery `AUTH_REQUIRED` после успешного `auth` по ADR-006.
- Для набора статусов треков функция агрегации возвращает детерминированный статус job по правилам ADR-006 (в том числе `completed_with_errors` при недоступных треках и `interrupted` при устаревшей аренде).
