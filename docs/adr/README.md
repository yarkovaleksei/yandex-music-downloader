# Architecture Decision Records

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
4. Если решение ещё не принято, используй `Proposed` или `OPEN_QUESTIONS`, а не выдумывай Accepted ADR.
5. ID не переиспользуется: `ADR-001`, `ADR-002`, ...

## Index

- [ADR-001](ADR-001-layered-architecture-monorepo.md) — Слоистая архитектура и структура monorepo (accepted)
- [ADR-002](ADR-002-music-provider-abstraction.md) — Абстракция MusicProvider и изоляция Yandex adapter (accepted)
- [ADR-003](ADR-003-download-state-machine.md) — State machine задания загрузки (superseded by ADR-006)
- [ADR-004](ADR-004-atomic-finalization-and-manifest.md) — Атомарная финализация файлов, manifest и владение job (accepted)
- [ADR-005](ADR-005-application-api-and-events-contract.md) — Контракт application API и событий (superseded by ADR-007)
- [ADR-006](ADR-006-download-lifecycle-and-recovery.md) — Жизненный цикл загрузки, восстановление и artwork (accepted; supersedes ADR-003)
- [ADR-007](ADR-007-application-api-events-and-command-results.md) — Application API, события и результаты команд (accepted; supersedes ADR-005)
- [ADR-008](ADR-008-yarn-workspaces.md) — Yarn workspaces для monorepo (accepted; заменяет package-manager положение ADR-001)

- [ADR-009](ADR-009-yandex-adapter-strategy.md) — Стратегия Yandex adapter и runtime-валидации (accepted)
- [ADR-010](ADR-010-cli-auth-and-secure-storage.md) — Device Authorization и защищённое CLI credential storage (accepted)
- [ADR-011](ADR-011-shared-metadata-contract.md) — Жанр и доступность в shared metadata contract (accepted; owning STEP-038/039)
- [ADR-012](ADR-012-audio-metadata-library.md) — Библиотека записи аудиометаданных (accepted; owning STEP-020/021)
- [ADR-013](ADR-013-optional-ffmpeg.md) — Опциональный FFmpeg без обязательного bundling (accepted; owning STEP-020)
- [ADR-014](ADR-014-sqlite-persistence.md) — SQLite persistence, общий каталог состояния и миграции (accepted; owning STEP-028/029)
- [ADR-015](ADR-015-electron-security-model.md) — Модель безопасности Electron, топология процессов и desktop secure storage (accepted; owning STEP-028/030; решает OQ-010)
- [ADR-016](ADR-016-desktop-ipc-contract.md) — Typed IPC contract `DesktopApi` (accepted; owning STEP-028/030)
- [ADR-017](ADR-017-node-api-10-runtime-floor.md) — Нижняя граница Node.js 22.14.0 для Node-API 10 (accepted; уточняет диапазон ADR-008/014; owning STEP-055)
