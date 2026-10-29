# Requirements Specification

> Tracked deterministic projection/index. Canonical REQ находятся в отдельных versioned REQ-NNN-*.md; этот файл не является источником истины.

| REQ | Название | Приоритет | Источник |
|---|---|---|---|
| [REQ-001](REQ-001-auth-flow.md) | [AUTH] Авторизация без передачи пароля | critical | brief |
| [REQ-002](REQ-002-auth-token-storage.md) | [AUTH] Безопасное хранение токена в CLI | critical | brief |
| [REQ-003](REQ-003-auth-session.md) | [AUTH] Определение аккаунта и истёкший токен | high | brief |
| [REQ-004](REQ-004-provider-abstraction.md) | [PROVIDER] Абстракция MusicProvider | critical | brief |
| [REQ-005](REQ-005-provider-isolation.md) | [PROVIDER] Изоляция Yandex-specific кода | critical | brief |
| [REQ-006](REQ-006-provider-metadata.md) | [PROVIDER] Получение метаданных track, album, playlist | critical | brief |
| [REQ-007](REQ-007-provider-schema.md) | [PROVIDER] Runtime-валидация ответов и версия совместимости | high | brief |
| [REQ-008](REQ-008-provider-contract-tests.md) | [PROVIDER] Отдельный набор contract-тестов реального API | high | brief |
| [REQ-009](REQ-009-url-resolver.md) | [URL] Распознавание и нормализация URL | critical | brief |
| [REQ-010](REQ-010-quality-selection.md) | [QUALITY] Выбор качества по фактически доступным вариантам | critical | brief |
| [REQ-011](REQ-011-download-plan.md) | [DOWNLOAD] Immutable DownloadPlan | critical | brief |
| [REQ-012](REQ-012-download-file-safety.md) | [DOWNLOAD] Запись через .part и атомарная финализация | critical | brief |
| [REQ-013](REQ-013-download-state-machine.md) | [DOWNLOAD] Формальная state machine задания | critical | brief |
| [REQ-014](REQ-014-download-retry.md) | [DOWNLOAD] Повторные попытки только для transient-ошибок | high | brief |
| [REQ-015](REQ-015-download-url-refresh.md) | [DOWNLOAD] Обработка устаревших signed URL | high | brief |
| [REQ-016](REQ-016-download-validation.md) | [DOWNLOAD] Валидация скачанного файла | high | brief |
| [REQ-017](REQ-017-queue-concurrency.md) | [QUEUE] Очередь загрузок и concurrency | critical | brief |
| [REQ-018](REQ-018-queue-control.md) | [QUEUE] Управление заданием: pause, resume, cancel, retry | high | brief |
| [REQ-019](REQ-019-queue-progress.md) | [QUEUE] События прогресса и ограничение достоверности скорости/ETA | medium | brief |
| [REQ-020](REQ-020-resume-manifest.md) | [RESUME] Manifest и восстановление после прерывания | critical | brief |
| [REQ-021](REQ-021-resume-range.md) | [RESUME] HTTP Range только при реальной поддержке | medium | brief |
| [REQ-022](REQ-022-fs-sanitizer.md) | [FILESYSTEM] Кроссплатформенный filename sanitizer | critical | brief |
| [REQ-023](REQ-023-fs-layout.md) | [FILESYSTEM] Структура каталогов для track, album, playlist | high | brief |
| [REQ-024](REQ-024-fs-existing-files.md) | [FILESYSTEM] Поведение при существующих файлах | medium | brief |
| [REQ-025](REQ-025-meta-tags.md) | [METADATA] Запись тегов в аудиофайлы | high | brief |
| [REQ-026](REQ-026-meta-cover.md) | [METADATA] Встроенная обложка и cover.jpg | high | brief |
| [REQ-027](REQ-027-meta-cache.md) | [METADATA] Локальный cache с TTL | medium | brief |
| [REQ-028](REQ-028-playlist-m3u8.md) | [PLAYLIST] Каталог playlist и файл .m3u8 | high | brief |
| [REQ-029](REQ-029-cli-commands.md) | [CLI] Команды CLI | critical | brief |
| [REQ-030](REQ-030-cli-options.md) | [CLI] Опции CLI и коды завершения | high | brief |
| [REQ-031](REQ-031-cli-json.md) | [CLI] Машиночитаемый режим --json | high | brief |
| [REQ-032](REQ-032-persist-manifest-store.md) | [PERSISTENCE] Файловое хранилище состояния в headless MVP | high | brief |
| [REQ-033](REQ-033-persist-sqlite.md) | [PERSISTENCE] SQLite и миграции для desktop | medium | brief |
| [REQ-034](REQ-034-diag-doctor.md) | [DIAGNOSTICS] Команда doctor | high | brief |
| [REQ-035](REQ-035-diag-logging.md) | [DIAGNOSTICS] Структурированное логирование | high | brief |
| [REQ-036](REQ-036-diag-observability.md) | [DIAGNOSTICS] Трассируемость операции загрузки | medium | brief |
| [REQ-037](REQ-037-diag-errors.md) | [DIAGNOSTICS] Иерархия доменных ошибок | high | brief |
| [REQ-038](REQ-038-sec-no-circumvention.md) | [SECURITY] Работа только с доступным аккаунту контентом | critical | brief |
| [REQ-039](REQ-039-sec-redaction.md) | [SECURITY] Запрет утечки секретов в логи и артефакты | critical | brief |
| [REQ-040](REQ-040-tool-ts-quality.md) | [TOOLING] Строгий TypeScript и контроль качества кода | high | brief |
| [REQ-041](REQ-041-tool-ci.md) | [TOOLING] Локальные проверки перед слиянием | high | brief |
| [REQ-042](REQ-042-tool-tests.md) | [TOOLING] Обязательные unit и integration тесты | high | brief |
| [REQ-043](REQ-043-tool-headless-gate.md) | [TOOLING] Критерий готовности headless MVP и перехода к UI | critical | brief |
| [REQ-044](REQ-044-desk-application-api.md) | [DESKTOP] Application API как единая граница для клиентов | high | brief |
| [REQ-045](REQ-045-desk-platforms.md) | [DESKTOP] Целевые платформы и независимость core | high | brief |
| [REQ-046](REQ-046-desk-security.md) | [DESKTOP] Модель безопасности Electron и typed IPC | critical | brief |
| [REQ-047](REQ-047-desk-secure-storage.md) | [DESKTOP] Токен в системном secure storage | critical | brief |
| [REQ-048](REQ-048-ui-stack.md) | [UI] Стек UI и соответствие брендбуку | medium | brief |
| [REQ-049](REQ-049-ui-url-preview.md) | [UI] Вставка URL и предпросмотр до скачивания | high | brief |
| [REQ-050](REQ-050-ui-downloads.md) | [UI] Экран загрузок, прогресс и управление | high | brief |
| [REQ-051](REQ-051-ui-history.md) | [UI] Экран истории | medium | brief |
| [REQ-052](REQ-052-ui-settings-account-diag.md) | [UI] Экраны Settings, Account и Diagnostics | medium | brief |
| [REQ-053](REQ-053-ui-e2e.md) | [UI] End-to-end сценарий desktop | medium | brief |
| [REQ-054](REQ-054-pack-installers.md) | [PACKAGING] Дистрибутивы для всех целевых ОС | medium | brief |
| [REQ-055](REQ-055-pack-update-signing.md) | [PACKAGING] Проверенные обновления portable-приложения | low | brief |
| [REQ-056](REQ-056-auth-browser-page.md) | [AUTH] Оформление приватной страницы Device Authorization | medium | user |
| [REQ-057](REQ-057-desktop-usable-ux.md) | Компактный desktop UX и понятная диагностика препятствий | high | user |
