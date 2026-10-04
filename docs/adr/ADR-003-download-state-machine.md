---
schema: 1
id: ADR-003
status: superseded
date: 2026-10-04
deciders:
  - yarkovaleksei
supersedes: []
superseded_by:
  - ADR-006
requirements:
  - REQ-013
  - REQ-014
  - REQ-017
  - REQ-018
  - REQ-020
  - REQ-024
steps:
  - STEP-014
  - STEP-016
  - STEP-017
  - STEP-019
---

# ADR-003 — State machine задания загрузки

## Context

Pause, resume, cancel, retry, пропуск существующих файлов и восстановление после перезапуска требуют формально описанных состояний (brief §15). Состояния должны быть покрыты unit-тестами; таблица переходов является публичным контрактом для CLI-событий и будущего UI.

## Problem

Нужна единая таблица допустимых переходов для трека и детерминированная агрегация статуса job, которую можно реализовать как данные и проверить тестами.

## Decision

Единица работы — трек в составе job (`DownloadTrackJob`), идентифицируемый позицией в плане (`trackKey` = позиция, а не `trackId`, чтобы повторы трека в плейлисте не конфликтовали). Статус job агрегируется из статусов треков и control-состояния job.

Состояния трека: `queued`, `resolving`, `ready`, `downloading`, `processing`, `retry_wait`, `paused`, `completed`, `skipped`, `failed`, `cancelled`. Терминальные: `completed`, `skipped`, `cancelled`; `failed` терминален до команды retry.

`retry_wait` хранит фазу `retryPhase` ∈ {`resolving`, `downloading`}, из которой он вошёл.

Разрешённые переходы:

| Из | В | Причина |
|---|---|---|
| queued | resolving | планировщик взял трек |
| resolving | ready | вариант выбран |
| resolving | retry_wait | transient-ошибка получения метаданных/вариантов (`retryPhase=resolving`) |
| ready | skipped | итоговый файл уже существует и валиден (skip-existing); путь записывается в manifest, трек попадает в `.m3u8` |
| processing | skipped | в режиме skip-existing итоговый файл появился до rename; существующий файл не заменяется, путь записывается в manifest |
| ready | downloading | воркер начал загрузку |
| downloading | processing | поток получен полностью |
| processing | completed | проверка и атомарный rename (точка фиксации) успешны |
| downloading | retry_wait | transient-ошибка или `STREAM_EXPIRED` (`retryPhase=downloading`) |
| retry_wait | resolving | backoff истёк, `retryPhase=resolving` |
| retry_wait | downloading | backoff истёк, `retryPhase=downloading` |
| downloading | paused | pause пользователя (в том числе SIGINT) |
| retry_wait | paused | pause пользователя при `retryPhase=downloading` |
| paused | downloading | resume пользователя (поток открывается заново, Range только при поддержке) |
| resolving, downloading, processing | failed | non-retryable ошибка |
| retry_wait | failed | исчерпан `maxAttempts` |
| queued, resolving, ready, downloading, paused, retry_wait | cancelled | cancel пользователя |
| processing | cancelled | cancel до точки фиксации (rename); после rename cancel для этого трека не действует |
| failed | queued | retry пользователя (счётчик попыток текущего запуска сбрасывается, история попыток сохраняется в manifest) |

Остальные переходы запрещены. Переходы из brief §15 сохранены; остальное добавлено для полноты модели.

**Control job.** Job имеет поле `control` ∈ {`running`, `paused`, `cancelled`}, сохраняемое в manifest. Пока `control ≠ running`, планировщик не переводит треки из `queued`, `ready` и `retry_wait` в активные фазы и не запускает новые; треки в состоянии `resolving` завершают текущий шаг и остаются в `ready`.

Переходы `control`: `running` ⇄ `paused`; из `running`/`paused` → `cancelled` (терминально); `resume` и `retry` для `cancelled` job — ошибка. `paused` имеет приоритет над «все треки терминальны» только пока есть нетерминальные треки. Глобальные non-retryable ошибки (`AUTH_ERROR`, `DiskFullError`, `PermissionError`) не порождают каскад из N failed-треков: job переводится в `control = paused` с записанной причиной, а затронутый трек остаётся `failed`; пользователь устраняет причину и выполняет `resume`.

SIGINT владельца = `pause` job: активные треки переходят в `paused`; треки в `resolving`/`processing` дожидаются завершения шага с ограниченным таймаутом (определяется в STEP-017); если шаг не завершился, аренда не освобождается и нормализация выполняется при следующем захвате.

**Статус job (детерминированная агрегация).**
- `cancelled` — `control = cancelled`;
- `paused` — `control = paused`;
- `interrupted` — производный статус: живой аренды job (ADR-004) нет (устарела), а нетерминальные треки остались при `control = running`;
- `completed` — все треки в `completed` или `skipped`;
- `completed_with_errors` — нет активных/ожидающих треков, есть хотя бы один `completed`/`skipped` и хотя бы один `failed` (например, недоступные треки по REQ provider-metadata);
- `failed` — нет активных/ожидающих треков, нет `completed`/`skipped`, есть `failed`;
- иначе `running` (только при живой аренде) либо `queued` (если ни один трек ещё не начат).

**Recovery** при любом захвате аренды (устаревшей или освобождённой, ADR-004): треки в `resolving`, `ready`, `downloading`, `retry_wait`, `processing` нормализуются в `queued` (recovery-переход доступен только recovery-логике), за исключением трека в `processing`, у которого итоговый файл существует, `.part` отсутствует и сверка идентичности (ожидаемый размер/маркер, записанный в manifest до rename) подтверждает, что это результат этого трека, — он переводится в `completed`; `paused` остаётся `paused`; `completed`/`skipped` пропускаются; `failed` возвращается в очередь только командой retry.

Изменение таблицы — только через новый ADR.

## Alternatives considered

### Состояние только на уровне job

Не позволяет частичный resume и повторять только failed-треки; отвергнуто.

### Неявное состояние через флаги

Трудно тестировать и расширять; отвергнуто.

## Consequences

Положительные: проверяемая модель, предсказуемые pause/resume/retry/skip, детерминированный итог job (в том числе для кодов завершения CLI и истории). Отрицательные: расширение модели требует ADR и миграции manifest.

## Security implications

Не применимо.

## Data / migration implications

Статус каждого трека и control job сохраняются в manifest (ADR-004); новые состояния требуют новой версии manifest или миграции.

## Compatibility / operational implications

Таблица переходов и статусы job — публичный контракт между core, CLI-событиями и будущим UI.
