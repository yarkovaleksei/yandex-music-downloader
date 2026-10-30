# Архитектурные решения

ADR фиксирует **устойчивое архитектурное решение**, его контекст и последствия. ADR не создаётся для каждой задачи.

## Статусы

- `Proposed`
- `Accepted`
- `Rejected`
- `Superseded`
- `Deprecated`

## Правила

1. Accepted ADR считается immutable historical decision record.
2. Если контракт меняется, создай новый ADR и укажи `Supersedes`.
3. Не переписывай прошлую мотивацию задним числом.
4. Если решение ещё не принято, используй `Proposed` или [оглавление открытых вопросов](../open-questions/README.md), а не выдумывай Accepted ADR.
5. ID не переиспользуется: `ADR-001`, `ADR-002`, ...

## Оглавление

> Раздел собран автоматически командой `node scripts/docs/generate-adr.mjs`. Названия, статусы и связи замещения изменяются в документах ADR.

- [ADR-001](ADR-001-layered-architecture-monorepo.md) — Слоистая архитектура и структура monorepo (accepted)
- [ADR-002](ADR-002-music-provider-abstraction.md) — Абстракция MusicProvider и изоляция Yandex adapter (accepted)
- [ADR-003](ADR-003-download-state-machine.md) — State machine задания загрузки (superseded; заменён [ADR-006](ADR-006-download-lifecycle-and-recovery.md))
- [ADR-004](ADR-004-atomic-finalization-and-manifest.md) — Атомарная финализация файлов, manifest и владение job (accepted)
- [ADR-005](ADR-005-application-api-and-events-contract.md) — Контракт application API и событий (superseded; заменён [ADR-007](ADR-007-application-api-events-and-command-results.md))
- [ADR-006](ADR-006-download-lifecycle-and-recovery.md) — Жизненный цикл загрузки, восстановление и artwork (accepted; заменяет [ADR-003](ADR-003-download-state-machine.md))
- [ADR-007](ADR-007-application-api-events-and-command-results.md) — Application API, события и результаты команд (accepted; заменяет [ADR-005](ADR-005-application-api-and-events-contract.md))
- [ADR-008](ADR-008-yarn-workspaces.md) — Yarn workspaces для monorepo (accepted)
- [ADR-009](ADR-009-yandex-adapter-strategy.md) — Стратегия Yandex adapter и runtime-валидации (accepted)
- [ADR-010](ADR-010-cli-auth-and-secure-storage.md) — Авторизация CLI и системное хранилище credentials (accepted)
- [ADR-011](ADR-011-shared-metadata-contract.md) — Жанр и доступность в shared metadata contract (accepted)
- [ADR-012](ADR-012-audio-metadata-library.md) — Библиотека записи аудиометаданных (accepted)
- [ADR-013](ADR-013-optional-ffmpeg.md) — Опциональный FFmpeg без обязательного bundling (accepted)
- [ADR-014](ADR-014-sqlite-persistence.md) — SQLite persistence, общий каталог состояния и миграции (accepted)
- [ADR-015](ADR-015-electron-security-model.md) — Модель безопасности Electron, топология процессов и desktop secure storage (accepted)
- [ADR-016](ADR-016-desktop-ipc-contract.md) — Typed IPC contract `DesktopApi` (accepted)
- [ADR-017](ADR-017-node-api-10-runtime-floor.md) — Нижняя граница Node.js 22.14.0 (Node-API 10) (accepted)
- [ADR-018](ADR-018-linux-packaging-and-updates.md) — Упаковка на Linux, подписание и доверенные обновления (superseded; заменён [ADR-019](ADR-019-portable-distribution-and-updates.md))
- [ADR-019](ADR-019-portable-distribution-and-updates.md) — Portable-дистрибутивы и проверенные обновления без платных сертификатов (accepted; заменяет [ADR-018](ADR-018-linux-packaging-and-updates.md))
