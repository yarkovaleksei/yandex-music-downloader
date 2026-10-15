# Project Roadmap

> Tracked deterministic projection. Полный contract каждого STEP находится в configured protocol.taskDirectory.

| STEP | Название | Type | Priority | Status | Depends on | REQ |
|---|---|---|---|---|---|---|
| STEP-001 | Monorepo и toolchain контроля качества | implementation | critical | completed | — | REQ-040 |
| STEP-002 | CI workflow для TypeScript monorepo | implementation | high | completed | STEP-001 | REQ-041 |
| STEP-003 | Доменная модель, ошибки и контракт MusicProvider | implementation | critical | completed | STEP-001 | REQ-004, REQ-037, REQ-042 |
| STEP-004 | Структурированное логирование и редакция секретов | implementation | high | completed | STEP-003 | REQ-035, REQ-039, REQ-036 |
| STEP-005 | Spike: проверка API Яндекс Музыки | research | critical | completed | STEP-001 | REQ-001, REQ-038 |
| STEP-006 | ADR: стратегия адаптера, авторизация и хранение токена | adr | critical | completed | STEP-005, STEP-003 | REQ-002, REQ-007 |
| STEP-007 | Resolver ссылок Яндекс Музыки | implementation | critical | completed | STEP-003 | REQ-009 |
| STEP-008 | Provider: авторизация, аккаунт и хранилище токена CLI | implementation | critical | completed | STEP-006, STEP-003, STEP-004 | REQ-001, REQ-002, REQ-003, REQ-039 |
| STEP-009 | Provider: метаданные, runtime-схемы и provider health | implementation | critical | completed | STEP-008, STEP-007, STEP-006, STEP-039 | REQ-006, REQ-007, REQ-005 |
| STEP-010 | Provider: audio variants и поток | implementation | critical | completed | STEP-009, STEP-005 | REQ-010, REQ-038, REQ-015 |
| STEP-011 | Provider contract tests на реальном API | implementation | high | completed | STEP-010 | REQ-008 |
| STEP-012 | Filename sanitizer и генерация путей | implementation | critical | completed | STEP-003 | REQ-022, REQ-023 |
| STEP-013 | Download Planner и quality resolver | implementation | critical | completed | STEP-003, STEP-005 | REQ-011, REQ-010 |
| STEP-014 | State machine задания и retry policy | implementation | critical | completed | STEP-003, STEP-005 | REQ-013, REQ-014 |
| STEP-015 | Запись .part и атомарная финализация | implementation | critical | completed | STEP-012, STEP-003, STEP-002 | REQ-012, REQ-024 |
| STEP-016 | Manifest store и восстановление | implementation | critical | completed | STEP-014, STEP-013, STEP-015, STEP-005 | REQ-020, REQ-021, REQ-032, REQ-011 |
| STEP-017 | Download Manager: очередь, concurrency и управление | implementation | critical | completed | STEP-016, STEP-010, STEP-004, STEP-014, STEP-013, STEP-015 | REQ-017, REQ-018, REQ-019, REQ-015, REQ-036, REQ-020, REQ-024, REQ-026, REQ-014, REQ-003 |
| STEP-018 | Application layer API и composition root | implementation | high | completed | STEP-017, STEP-009, STEP-042, STEP-043 | REQ-002, REQ-044, REQ-032 |
| STEP-019 | CLI: команды, опции и режим --json | implementation | critical | completed | STEP-018, STEP-004, STEP-045, STEP-046, STEP-047, STEP-048 | REQ-029, REQ-030, REQ-031, REQ-013, REQ-001, REQ-002, REQ-003, REQ-009, REQ-017, REQ-037 |
| STEP-020 | ADR: библиотека метаданных и использование FFmpeg | adr | high | completed | STEP-005 | REQ-025, REQ-016 |
| STEP-021 | Теги, встроенная обложка и cover.jpg | implementation | high | completed | STEP-020, STEP-017 | REQ-025, REQ-026, REQ-036 |
| STEP-022 | Каталог playlist и .m3u8 | implementation | high | completed | STEP-017, STEP-012 | REQ-028 |
| STEP-023 | Валидация файлов и опциональный FFmpeg | implementation | high | completed | STEP-020, STEP-015, STEP-017 | REQ-016, REQ-036 |
| STEP-024 | Локальный cache метаданных и обложек с TTL | implementation | medium | completed | STEP-009, STEP-018 | REQ-027 |
| STEP-025 | Doctor и provider health | hardening | high | completed | STEP-019, STEP-009, STEP-023, STEP-006 | REQ-034, REQ-007, REQ-002, REQ-016, REQ-029, REQ-031 |
| STEP-026 | Интеграционный набор headless-сценариев | hardening | high | completed | STEP-019, STEP-022, STEP-021, STEP-023, STEP-025 | REQ-042, REQ-005, REQ-020 |
| STEP-027 | Приёмка headless MVP и gate перехода к UI | audit | critical | completed | STEP-026, STEP-011 | REQ-043 |
| STEP-028 | ADR: SQLite, модель безопасности Electron и IPC | adr | medium | planned | STEP-027 | REQ-033, REQ-046, REQ-047 |
| STEP-029 | SQLite persistence и миграции | implementation | medium | planned | STEP-028, STEP-018 | REQ-033 |
| STEP-030 | Desktop shell: Electron, React, MUI, typed IPC, secure storage | implementation | medium | planned | STEP-028, STEP-018, STEP-029 | REQ-045, REQ-046, REQ-047, REQ-048 |
| STEP-031 | UX: предпросмотр URL, загрузки, прогресс и уведомления | implementation | medium | planned | STEP-030 | REQ-049, REQ-050 |
| STEP-032 | UX: History, Settings, Account и Diagnostics | implementation | medium | planned | STEP-031, STEP-025 | REQ-051, REQ-052 |
| STEP-033 | E2E-тест desktop | hardening | medium | planned | STEP-031, STEP-032 | REQ-053 |
| STEP-034 | ADR: кроссплатформенная упаковка | adr | low | planned | STEP-033 | REQ-054, REQ-055 |
| STEP-035 | Дистрибутивы и release CI | implementation | low | planned | STEP-034 | REQ-054, REQ-045, REQ-041 |
| STEP-036 | Подписание, notarization и автообновление | implementation | low | planned | STEP-035 | REQ-055 |
| STEP-037 | ADR: Yarn workspaces вместо npm workspaces | adr | critical | completed | — | REQ-040 |
| STEP-038 | ADR: жанр и доступность в shared metadata contract | adr | critical | completed | STEP-003, STEP-006 | REQ-006 |
| STEP-039 | Shared metadata: жанр, доступность и контрактные тесты | implementation | critical | completed | STEP-003, STEP-038 | REQ-006 |
| STEP-040 | Синхронизировать описание реализованной foundation и provider | documentation | medium | completed | STEP-004, STEP-007, STEP-008, STEP-009, STEP-010, STEP-011, STEP-039 | — |
| STEP-041 | Оформить приватную страницу авторизации по макету | implementation | medium | completed | STEP-008 | REQ-001, REQ-002, REQ-056 |
| STEP-042 | Перечисление сохранённых заданий через ManifestStore | implementation | high | completed | STEP-016 | REQ-032, REQ-044 |
| STEP-043 | Чтение состояния аренды через ManifestStore | implementation | high | completed | STEP-016, STEP-042 | REQ-020, REQ-032, REQ-044 |
| STEP-044 | Временные Windows-блокировки записи состояния и CI | bugfix | high | completed | STEP-016, STEP-018, STEP-002 | REQ-032, REQ-044, REQ-041, REQ-042 |
| STEP-045 | Application: признак отказа из-за чужой живой аренды | implementation | high | completed | STEP-018, STEP-043 | REQ-030, REQ-032, REQ-044 |
| STEP-046 | Application: уровень логирования, файловый sink и debug-диагностика | implementation | high | completed | STEP-018, STEP-004 | REQ-035, REQ-037, REQ-029 |
| STEP-047 | ESLint: публичный application/contracts без ослабления границ | bugfix | critical | completed | STEP-001, STEP-018 | REQ-005, REQ-029, REQ-044 |
| STEP-048 | Поддерживаемый размер обложки при загрузке | bugfix | critical | completed | STEP-009, STEP-017, STEP-018, STEP-023 | REQ-004, REQ-026 |
| STEP-049 | Закрытие manager и подтверждённые сбои CI PR #17 | bugfix | critical | completed | STEP-019, STEP-045 | REQ-018, REQ-030, REQ-042 |
| STEP-050 | Диагностика PERMISSION_DENIED в Windows CI PR #17 | bugfix | critical | completed | STEP-044, STEP-045, STEP-049 | REQ-012, REQ-032, REQ-041, REQ-042 |
| STEP-051 | Загрузка коллекции «Мне нравится» по ссылке lk.UUID | bugfix | critical | completed | STEP-007, STEP-009, STEP-019 | REQ-006, REQ-007, REQ-009 |
| STEP-052 | Платформа M3U8 writer по умолчанию и переносимость тестов | bugfix | critical | completed | STEP-022 | REQ-028, REQ-043, REQ-044 |
