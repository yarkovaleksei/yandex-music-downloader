# Глоссарий проекта

Этот файл предназначен для **доменных и продуктовых терминов конкретного проекта** и заполняется/обновляется после `PROJECT INIT`.

Термины самого AI Development Harness (`REQ`, `ADR`, `STEP`, `Evidence`, `Projection`, `Drift`, `Gate` и т. п.) определены отдельно:

- [`.harness/docs/GLOSSARY.md`](../.harness/docs/GLOSSARY.md)

Добавляй сюда термин только если его единое значение важно для требований, архитектуры, UX или реализации конкретного продукта.

| Термин | Определение | Связанные REQ/ADR | Примечание |
|---|---|---|---|
| Provider | Реализация контракта `MusicProvider` для конкретного источника музыки; сейчас — только Яндекс Музыка. | REQ-004, REQ-005, ADR-002 | Единственное место с Yandex-специфичным кодом. |
| MediaReference | Нормализованная ссылка на сущность источника: тип (track/album/playlist) и канонический идентификатор. | REQ-009, ADR-002 | Получается из URL через `resolveUrl`. |
| AudioVariant | Фактически доступный текущему аккаунту вариант аудио: codec, bitrate, lossless, container. | REQ-010, ADR-002 | Состав определяет provider; связь «подписка = кодек» запрещена. |
| DownloadPlan | Immutable список треков операции с позициями, формируемый до физической загрузки. | REQ-011, ADR-004 | Основа resume и нумерации. |
| Job / DownloadJob | Операция загрузки одной сущности (track/album/playlist); состоит из `DownloadTrackJob`. | REQ-013, ADR-003 | Статус job агрегируется из статусов треков. |
| Manifest | Versioned JSON-состояние job, позволяющее восстановиться после прерывания. | REQ-020, ADR-004 | Не содержит секретов. |
| `.part` | Временный файл записи, переименовываемый атомарно в итоговое имя только после успешной валидации. | REQ-012, ADR-004 | Хранится в каталоге назначения. |
| Quality preference | Настройка пользователя: `best`, `lossless`, `high`, `normal`. | REQ-010, OQ-011 | Сопоставляется с реальными variants; правила `high`/`normal` ещё не зафиксированы. |
| Provider health | Классификация проблем provider: `NETWORK_ERROR`, `AUTH_ERROR`, `API_CHANGED`, `SERVICE_UNAVAILABLE`, `PROVIDER_RESPONSE_INVALID`. | REQ-007, REQ-034, ADR-002 | Отображается в `doctor`. |
| Headless MVP | Первый этап: полнофункциональный CLI без графического интерфейса. | REQ-043 | Gate перехода к UI — STEP-027. |
| Application layer | Слой `packages/application` — единственный API для клиентов (CLI, desktop) и composition root. | REQ-044, ADR-001 | Клиенты не знают про provider. |
| Signed URL | Подписанная ссылка CDN на аудио с ограниченным временем жизни. | REQ-015, ADR-004 | Не хранится в manifest и не логируется. |
| Lease (аренда job) | Эксклюзивное право процесса писать manifest и `.part` job; хранится в manifest/store (PID, hostname, heartbeat). | REQ-020, ADR-004 | Устаревшая аренда позволяет recovery. |
| Control job | Поле `running`/`paused`/`cancelled`, управляющее запуском новых треков job. | REQ-013, ADR-003 | Сохраняется в manifest. |
