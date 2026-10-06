# Requirements Status

> Tracked deterministic projection lifecycle state. Статус выводится из canonical REQ + STEP completion proofs.

| REQ | Название | Статус | Реализующие STEP | Evidence |
|---|---|---|---|---|
| [REQ-001](REQ-001-auth-flow.md) | [AUTH] Авторизация без передачи пароля | planned | STEP-005, STEP-008, STEP-019 | — |
| [REQ-002](REQ-002-auth-token-storage.md) | [AUTH] Безопасное хранение токена в CLI | planned | STEP-006, STEP-008, STEP-018, STEP-019, STEP-025 | — |
| [REQ-003](REQ-003-auth-session.md) | [AUTH] Определение аккаунта и истёкший токен | planned | STEP-008, STEP-017, STEP-019 | — |
| [REQ-004](REQ-004-provider-abstraction.md) | [PROVIDER] Абстракция MusicProvider | planned | STEP-003 | — |
| [REQ-005](REQ-005-provider-isolation.md) | [PROVIDER] Изоляция Yandex-specific кода | planned | STEP-009, STEP-026 | — |
| [REQ-006](REQ-006-provider-metadata.md) | [PROVIDER] Получение метаданных track, album, playlist | planned | STEP-009 | — |
| [REQ-007](REQ-007-provider-schema.md) | [PROVIDER] Runtime-валидация ответов и версия совместимости | planned | STEP-006, STEP-009, STEP-025 | — |
| [REQ-008](REQ-008-provider-contract-tests.md) | [PROVIDER] Отдельный набор contract-тестов реального API | planned | STEP-011 | — |
| [REQ-009](REQ-009-url-resolver.md) | [URL] Распознавание и нормализация URL | planned | STEP-007, STEP-019 | — |
| [REQ-010](REQ-010-quality-selection.md) | [QUALITY] Выбор качества по фактически доступным вариантам | planned | STEP-010, STEP-013 | — |
| [REQ-011](REQ-011-download-plan.md) | [DOWNLOAD] Immutable DownloadPlan | planned | STEP-013, STEP-016 | — |
| [REQ-012](REQ-012-download-file-safety.md) | [DOWNLOAD] Запись через .part и атомарная финализация | planned | STEP-015 | — |
| [REQ-013](REQ-013-download-state-machine.md) | [DOWNLOAD] Формальная state machine задания | planned | STEP-014, STEP-019 | — |
| [REQ-014](REQ-014-download-retry.md) | [DOWNLOAD] Повторные попытки только для transient-ошибок | planned | STEP-014, STEP-017 | — |
| [REQ-015](REQ-015-download-url-refresh.md) | [DOWNLOAD] Обработка устаревших signed URL | planned | STEP-010, STEP-017 | — |
| [REQ-016](REQ-016-download-validation.md) | [DOWNLOAD] Валидация скачанного файла | planned | STEP-020, STEP-023, STEP-025 | — |
| [REQ-017](REQ-017-queue-concurrency.md) | [QUEUE] Очередь загрузок и concurrency | planned | STEP-017, STEP-019 | — |
| [REQ-018](REQ-018-queue-control.md) | [QUEUE] Управление заданием: pause, resume, cancel, retry | planned | STEP-017 | — |
| [REQ-019](REQ-019-queue-progress.md) | [QUEUE] События прогресса и ограничение достоверности скорости/ETA | planned | STEP-017 | — |
| [REQ-020](REQ-020-resume-manifest.md) | [RESUME] Manifest и восстановление после прерывания | planned | STEP-016, STEP-017, STEP-026 | — |
| [REQ-021](REQ-021-resume-range.md) | [RESUME] HTTP Range только при реальной поддержке | planned | STEP-016 | — |
| [REQ-022](REQ-022-fs-sanitizer.md) | [FILESYSTEM] Кроссплатформенный filename sanitizer | planned | STEP-012 | — |
| [REQ-023](REQ-023-fs-layout.md) | [FILESYSTEM] Структура каталогов для track, album, playlist | planned | STEP-012 | — |
| [REQ-024](REQ-024-fs-existing-files.md) | [FILESYSTEM] Поведение при существующих файлах | planned | STEP-015, STEP-017 | — |
| [REQ-025](REQ-025-meta-tags.md) | [METADATA] Запись тегов в аудиофайлы | planned | STEP-020, STEP-021 | — |
| [REQ-026](REQ-026-meta-cover.md) | [METADATA] Встроенная обложка и cover.jpg | planned | STEP-017, STEP-021 | — |
| [REQ-027](REQ-027-meta-cache.md) | [METADATA] Локальный cache с TTL | planned | STEP-024 | — |
| [REQ-028](REQ-028-playlist-m3u8.md) | [PLAYLIST] Каталог playlist и файл .m3u8 | planned | STEP-022 | — |
| [REQ-029](REQ-029-cli-commands.md) | [CLI] Команды CLI | planned | STEP-019, STEP-025 | — |
| [REQ-030](REQ-030-cli-options.md) | [CLI] Опции CLI и коды завершения | planned | STEP-019 | — |
| [REQ-031](REQ-031-cli-json.md) | [CLI] Машиночитаемый режим --json | planned | STEP-019, STEP-025 | — |
| [REQ-032](REQ-032-persist-manifest-store.md) | [PERSISTENCE] Файловое хранилище состояния в headless MVP | planned | STEP-016, STEP-018 | — |
| [REQ-033](REQ-033-persist-sqlite.md) | [PERSISTENCE] SQLite и миграции для desktop | planned | STEP-028, STEP-029 | — |
| [REQ-034](REQ-034-diag-doctor.md) | [DIAGNOSTICS] Команда doctor | planned | STEP-025 | — |
| [REQ-035](REQ-035-diag-logging.md) | [DIAGNOSTICS] Структурированное логирование | planned | STEP-004 | — |
| [REQ-036](REQ-036-diag-observability.md) | [DIAGNOSTICS] Трассируемость операции загрузки | planned | STEP-004, STEP-017, STEP-021, STEP-023 | — |
| [REQ-037](REQ-037-diag-errors.md) | [DIAGNOSTICS] Иерархия доменных ошибок | planned | STEP-003, STEP-019 | — |
| [REQ-038](REQ-038-sec-no-circumvention.md) | [SECURITY] Работа только с доступным аккаунту контентом | planned | STEP-005, STEP-010 | — |
| [REQ-039](REQ-039-sec-redaction.md) | [SECURITY] Запрет утечки секретов в логи и артефакты | planned | STEP-004, STEP-008 | — |
| [REQ-040](REQ-040-tool-ts-quality.md) | [TOOLING] Строгий TypeScript и контроль качества кода | completed | STEP-001, STEP-037 | sha256:7b4e802b915feb1f9c06c7f35392a394273cecd480e08371b1d10eb53bde7253, sha256:45829ee630d29877d114cca2f4777b31ddac10529a23cfb3a82f468e7316abf6 |
| [REQ-041](REQ-041-tool-ci.md) | [TOOLING] CI на pull request | planned | STEP-002, STEP-035 | — |
| [REQ-042](REQ-042-tool-tests.md) | [TOOLING] Обязательные unit и integration тесты | planned | STEP-003, STEP-026 | — |
| [REQ-043](REQ-043-tool-headless-gate.md) | [TOOLING] Критерий готовности headless MVP и перехода к UI | planned | STEP-027 | — |
| [REQ-044](REQ-044-desk-application-api.md) | [DESKTOP] Application API как единая граница для клиентов | planned | STEP-018 | — |
| [REQ-045](REQ-045-desk-platforms.md) | [DESKTOP] Целевые платформы и независимость core | planned | STEP-030, STEP-035 | — |
| [REQ-046](REQ-046-desk-security.md) | [DESKTOP] Модель безопасности Electron и typed IPC | planned | STEP-028, STEP-030 | — |
| [REQ-047](REQ-047-desk-secure-storage.md) | [DESKTOP] Токен в системном secure storage | planned | STEP-028, STEP-030 | — |
| [REQ-048](REQ-048-ui-stack.md) | [UI] Стек UI и соответствие брендбуку | planned | STEP-030 | — |
| [REQ-049](REQ-049-ui-url-preview.md) | [UI] Вставка URL и предпросмотр до скачивания | planned | STEP-031 | — |
| [REQ-050](REQ-050-ui-downloads.md) | [UI] Экран загрузок, прогресс и управление | planned | STEP-031 | — |
| [REQ-051](REQ-051-ui-history.md) | [UI] Экран истории | planned | STEP-032 | — |
| [REQ-052](REQ-052-ui-settings-account-diag.md) | [UI] Экраны Settings, Account и Diagnostics | planned | STEP-032 | — |
| [REQ-053](REQ-053-ui-e2e.md) | [UI] End-to-end сценарий desktop | planned | STEP-033 | — |
| [REQ-054](REQ-054-pack-installers.md) | [PACKAGING] Дистрибутивы для всех целевых ОС | planned | STEP-034, STEP-035 | — |
| [REQ-055](REQ-055-pack-update-signing.md) | [PACKAGING] Архитектура автообновления и подписания | planned | STEP-034, STEP-036 | — |
