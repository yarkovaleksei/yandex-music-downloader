# Requirements Status

> Tracked deterministic projection lifecycle state. Статус выводится из canonical REQ + STEP completion proofs.

| REQ | Название | Статус | Реализующие STEP | Evidence |
|---|---|---|---|---|
| [REQ-001](REQ-001-auth-flow.md) | [AUTH] Авторизация без передачи пароля | partial | STEP-005, STEP-008, STEP-019 | sha256:3b571c238a4e4ba0e230d2cb6bf0bdd18e7ce659eb01d8e214551b2abe372016, sha256:e0b2393178cfca0e45390c3e03393ff50233d9d425d08dbb4e85877b03e0f3e3 |
| [REQ-002](REQ-002-auth-token-storage.md) | [AUTH] Безопасное хранение токена в CLI | partial | STEP-006, STEP-008, STEP-018, STEP-019, STEP-025 | sha256:2148d7fdfa0cbdbb210f706b4a5cb59d7ed5af5330ca0f4ab4c4c9fa03f35689, sha256:e0b2393178cfca0e45390c3e03393ff50233d9d425d08dbb4e85877b03e0f3e3 |
| [REQ-003](REQ-003-auth-session.md) | [AUTH] Определение аккаунта и истёкший токен | partial | STEP-008, STEP-017, STEP-019 | sha256:e0b2393178cfca0e45390c3e03393ff50233d9d425d08dbb4e85877b03e0f3e3 |
| [REQ-004](REQ-004-provider-abstraction.md) | [PROVIDER] Абстракция MusicProvider | completed | STEP-003 | sha256:bfce0c7d4101696c7098994ea3e1022d71fc0992b5082d5e4a2abc73720977f1 |
| [REQ-005](REQ-005-provider-isolation.md) | [PROVIDER] Изоляция Yandex-specific кода | partial | STEP-009, STEP-026 | sha256:0b2d72a8658737eb75b4f9f801391b11fcc5307210bc5f1e2a1b7b87b1c74c53 |
| [REQ-006](REQ-006-provider-metadata.md) | [PROVIDER] Получение метаданных track, album, playlist | completed | STEP-009, STEP-038, STEP-039 | sha256:0b2d72a8658737eb75b4f9f801391b11fcc5307210bc5f1e2a1b7b87b1c74c53, sha256:067111c594be1cf63c913f1ba50c11cb55eda98b96857d17db2496f252ef786c, sha256:0a106beadd2def9518a55a4c101b52ed5b789f85c12d6e4880043eea3664e95a |
| [REQ-007](REQ-007-provider-schema.md) | [PROVIDER] Runtime-валидация ответов и версия совместимости | partial | STEP-006, STEP-009, STEP-025 | sha256:2148d7fdfa0cbdbb210f706b4a5cb59d7ed5af5330ca0f4ab4c4c9fa03f35689, sha256:0b2d72a8658737eb75b4f9f801391b11fcc5307210bc5f1e2a1b7b87b1c74c53 |
| [REQ-008](REQ-008-provider-contract-tests.md) | [PROVIDER] Отдельный набор contract-тестов реального API | completed | STEP-011 | sha256:8e91cc7e70139f2f7dd0b060c35d1bbbb87bf187d59278aa0326a49e4cc78dbe |
| [REQ-009](REQ-009-url-resolver.md) | [URL] Распознавание и нормализация URL | partial | STEP-007, STEP-019 | sha256:87fa392591a6c635fb740956bec005af657195438dffa57818ffe6abada9f5a8 |
| [REQ-010](REQ-010-quality-selection.md) | [QUALITY] Выбор качества по фактически доступным вариантам | completed | STEP-010, STEP-013 | sha256:d2a69e8167bbb967a40bde6ae54251aaf4188ee99f3fc1b31cbce29522148891, sha256:def4481f4c9ae0edb17d714a7238ee90267a18508712f400e9258a31fc4e21eb |
| [REQ-011](REQ-011-download-plan.md) | [DOWNLOAD] Immutable DownloadPlan | completed | STEP-013, STEP-016 | sha256:def4481f4c9ae0edb17d714a7238ee90267a18508712f400e9258a31fc4e21eb, sha256:80d8c86e01ed14e2921b64c7705f749c8d086649f5c5705f7d0bc4555ac5b71d |
| [REQ-012](REQ-012-download-file-safety.md) | [DOWNLOAD] Запись через .part и атомарная финализация | completed | STEP-015 | sha256:43315d91a4fe577189f02f4a998f1dab45c657b42a57721434b552858ae332f8 |
| [REQ-013](REQ-013-download-state-machine.md) | [DOWNLOAD] Формальная state machine задания | partial | STEP-014, STEP-019 | sha256:03a7f4a71571504f74d00a9375f81b405bc7da52ae71e612af78274e59ac6230 |
| [REQ-014](REQ-014-download-retry.md) | [DOWNLOAD] Повторные попытки только для transient-ошибок | partial | STEP-014, STEP-017 | sha256:03a7f4a71571504f74d00a9375f81b405bc7da52ae71e612af78274e59ac6230 |
| [REQ-015](REQ-015-download-url-refresh.md) | [DOWNLOAD] Обработка устаревших signed URL | partial | STEP-010, STEP-017 | sha256:d2a69e8167bbb967a40bde6ae54251aaf4188ee99f3fc1b31cbce29522148891 |
| [REQ-016](REQ-016-download-validation.md) | [DOWNLOAD] Валидация скачанного файла | planned | STEP-020, STEP-023, STEP-025 | — |
| [REQ-017](REQ-017-queue-concurrency.md) | [QUEUE] Очередь загрузок и concurrency | planned | STEP-017, STEP-019 | — |
| [REQ-018](REQ-018-queue-control.md) | [QUEUE] Управление заданием: pause, resume, cancel, retry | planned | STEP-017 | — |
| [REQ-019](REQ-019-queue-progress.md) | [QUEUE] События прогресса и ограничение достоверности скорости/ETA | planned | STEP-017 | — |
| [REQ-020](REQ-020-resume-manifest.md) | [RESUME] Manifest и восстановление после прерывания | partial | STEP-016, STEP-017, STEP-026 | sha256:80d8c86e01ed14e2921b64c7705f749c8d086649f5c5705f7d0bc4555ac5b71d |
| [REQ-021](REQ-021-resume-range.md) | [RESUME] HTTP Range только при реальной поддержке | completed | STEP-016 | sha256:80d8c86e01ed14e2921b64c7705f749c8d086649f5c5705f7d0bc4555ac5b71d |
| [REQ-022](REQ-022-fs-sanitizer.md) | [FILESYSTEM] Кроссплатформенный filename sanitizer | completed | STEP-012 | sha256:ae2b80abc1d5c52c4370aa82e55831622f132ab4fac28532286bca6772cebca4 |
| [REQ-023](REQ-023-fs-layout.md) | [FILESYSTEM] Структура каталогов для track, album, playlist | completed | STEP-012 | sha256:ae2b80abc1d5c52c4370aa82e55831622f132ab4fac28532286bca6772cebca4 |
| [REQ-024](REQ-024-fs-existing-files.md) | [FILESYSTEM] Поведение при существующих файлах | partial | STEP-015, STEP-017 | sha256:43315d91a4fe577189f02f4a998f1dab45c657b42a57721434b552858ae332f8 |
| [REQ-025](REQ-025-meta-tags.md) | [METADATA] Запись тегов в аудиофайлы | planned | STEP-020, STEP-021 | — |
| [REQ-026](REQ-026-meta-cover.md) | [METADATA] Встроенная обложка и cover.jpg | planned | STEP-017, STEP-021 | — |
| [REQ-027](REQ-027-meta-cache.md) | [METADATA] Локальный cache с TTL | planned | STEP-024 | — |
| [REQ-028](REQ-028-playlist-m3u8.md) | [PLAYLIST] Каталог playlist и файл .m3u8 | planned | STEP-022 | — |
| [REQ-029](REQ-029-cli-commands.md) | [CLI] Команды CLI | planned | STEP-019, STEP-025 | — |
| [REQ-030](REQ-030-cli-options.md) | [CLI] Опции CLI и коды завершения | planned | STEP-019 | — |
| [REQ-031](REQ-031-cli-json.md) | [CLI] Машиночитаемый режим --json | planned | STEP-019, STEP-025 | — |
| [REQ-032](REQ-032-persist-manifest-store.md) | [PERSISTENCE] Файловое хранилище состояния в headless MVP | partial | STEP-016, STEP-018 | sha256:80d8c86e01ed14e2921b64c7705f749c8d086649f5c5705f7d0bc4555ac5b71d |
| [REQ-033](REQ-033-persist-sqlite.md) | [PERSISTENCE] SQLite и миграции для desktop | planned | STEP-028, STEP-029 | — |
| [REQ-034](REQ-034-diag-doctor.md) | [DIAGNOSTICS] Команда doctor | planned | STEP-025 | — |
| [REQ-035](REQ-035-diag-logging.md) | [DIAGNOSTICS] Структурированное логирование | completed | STEP-004 | sha256:bc40dd17c32479af131f868292e28dc2f8f1e96ff40940d0f6689dda84037d99 |
| [REQ-036](REQ-036-diag-observability.md) | [DIAGNOSTICS] Трассируемость операции загрузки | partial | STEP-004, STEP-017, STEP-021, STEP-023 | sha256:bc40dd17c32479af131f868292e28dc2f8f1e96ff40940d0f6689dda84037d99 |
| [REQ-037](REQ-037-diag-errors.md) | [DIAGNOSTICS] Иерархия доменных ошибок | partial | STEP-003, STEP-019 | sha256:bfce0c7d4101696c7098994ea3e1022d71fc0992b5082d5e4a2abc73720977f1 |
| [REQ-038](REQ-038-sec-no-circumvention.md) | [SECURITY] Работа только с доступным аккаунту контентом | completed | STEP-005, STEP-010 | sha256:3b571c238a4e4ba0e230d2cb6bf0bdd18e7ce659eb01d8e214551b2abe372016, sha256:d2a69e8167bbb967a40bde6ae54251aaf4188ee99f3fc1b31cbce29522148891 |
| [REQ-039](REQ-039-sec-redaction.md) | [SECURITY] Запрет утечки секретов в логи и артефакты | completed | STEP-004, STEP-008 | sha256:bc40dd17c32479af131f868292e28dc2f8f1e96ff40940d0f6689dda84037d99, sha256:e0b2393178cfca0e45390c3e03393ff50233d9d425d08dbb4e85877b03e0f3e3 |
| [REQ-040](REQ-040-tool-ts-quality.md) | [TOOLING] Строгий TypeScript и контроль качества кода | completed | STEP-001, STEP-037 | sha256:7b4e802b915feb1f9c06c7f35392a394273cecd480e08371b1d10eb53bde7253, sha256:45829ee630d29877d114cca2f4777b31ddac10529a23cfb3a82f468e7316abf6 |
| [REQ-041](REQ-041-tool-ci.md) | [TOOLING] CI на pull request | partial | STEP-002, STEP-035 | sha256:0ff62ac0c7180065f7c8bbb6fe556c9f0d13781793ebaae02bef4e5d68b1a203 |
| [REQ-042](REQ-042-tool-tests.md) | [TOOLING] Обязательные unit и integration тесты | partial | STEP-003, STEP-026 | sha256:bfce0c7d4101696c7098994ea3e1022d71fc0992b5082d5e4a2abc73720977f1 |
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
