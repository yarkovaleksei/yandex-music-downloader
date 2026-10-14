# Приёмка headless MVP — STEP-027

Актуальный [отчёт приёмки](../../planning/audits/AUDIT-20261014T130622Z.md) фиксирует одну версию исходников `sha256:25a6a43bde2aa78ac3f5d74f533cec434ff0173d87859dbf0dfcaf78c0fdea07` и одинаковые CLI/provider builds на Linux и Windows. Сводка размещена в research: Harness допускает в каталоге audits только имена `AUDIT-<timestamp>.md`, поэтому указанное в плане нетиповое имя отчёта там не используется.

| ОС | track | album | playlist | Итог |
| --- | --- | --- | --- | --- |
| Linux | 3/3 PASS | 3/3 PASS | 3/3 PASS | 9/9 |
| Windows | 3/3 PASS | 3/3 PASS | 3/3 PASS | 9/9 |
| macOS | pending | pending | pending | 0/9 |

Подтверждены **18/27** реальных interruption/resume циклов и 60 аудиофайлов. Результаты: [Linux](step-027-linux-pass-2026-10-14.json), [Windows](step-052-windows-pass-2026-10-14.json). Прежние Linux-прогоны других digest остаются историческими; в этой таблице они не учитываются.

Исправление STEP-052 завершено с независимым review PASS. Неподтверждённая платформа macOS остаётся blocker STEP-027; owner decision PENDING. До macOS PASS и явного go STEP-027 не completed, desktop gate закрыт. Для продолжения после macOS report: `STEP RUN STEP-027`.

2026-10-14 (Europe/Moscow) владелец подтвердил решение отложить macOS-проверку; срок возвращения к ней не установлен. Результаты Linux и Windows на указанной версии сохраняются, повторные прогоны сейчас не требуются. Комплект `STEP-027-macos.zip` подготовлен для последующей проверки коллегой. Отсрочка не закрывает недостающие ячейки матрицы и не меняет условие перехода к desktop.
