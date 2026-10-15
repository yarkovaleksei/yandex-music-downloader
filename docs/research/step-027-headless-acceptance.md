# Приёмка headless MVP — STEP-027

Актуальный [итоговый отчёт приёмки и go владельца](../../planning/audits/AUDIT-20261015T172147Z.md) фиксирует одну версию исходников `sha256:25a6a43bde2aa78ac3f5d74f533cec434ff0173d87859dbf0dfcaf78c0fdea07` и одинаковые CLI/provider builds на Linux, Windows и macOS. [Полный технический checklist](../../planning/audits/AUDIT-20261015T171627Z.md) сохраняет покрытие всех критериев и границы supporting evidence. Сводка размещена в research: Harness допускает в каталоге audits только имена `AUDIT-<timestamp>.md`, поэтому указанное в плане нетиповое имя отчёта там не используется.

| ОС | track | album | playlist | Итог |
| --- | --- | --- | --- | --- |
| Linux | 3/3 PASS | 3/3 PASS | 3/3 PASS | 9/9 |
| Windows | 3/3 PASS | 3/3 PASS | 3/3 PASS | 9/9 |
| macOS | 3/3 PASS | 3/3 PASS | 3/3 PASS | 9/9 |

Подтверждены **27/27** реальных interruption/resume циклов и **96** аудиофайлов. Результаты: [Linux](step-027-linux-pass-2026-10-14.json), [Windows](step-052-windows-pass-2026-10-14.json), [macOS — полная серия PASS](step-027-macos-pass-2026-10-15.json). Предыдущие три macOS track-цикла заменены финальной полной серией; прежние Linux-прогоны других digest остаются историческими и в этой таблице не учитываются.

Исправление STEP-052 завершено с независимым review PASS. Техническая матрица трёх ОС закрыта. 2026-10-15 (Europe/Moscow) владелец явно подтвердил: «Go — принять и разрешить переход к desktop». Owner decision GO; разрешено завершение STEP-027 и переход к зависимым desktop STEP.

2026-10-14 (Europe/Moscow) владелец подтвердил решение отложить macOS-проверку; срок возвращения к ней не установлен. Результаты Linux и Windows на указанной версии сохраняются, повторные прогоны сейчас не требуются. Комплект `STEP-027-macos.zip` подготовлен для последующей проверки коллегой. Отсрочка не закрывает недостающие ячейки матрицы и не меняет условие перехода к desktop.

2026-10-15 получен [первый macOS-отчёт](step-027-macos-tests-attempt-2026-10-15.json): darwin/arm64, Node v24.21.0; install/lint/typecheck PASS, test exit 1 без timeout. Source/tool digests совпали с указанным комплектом; реальные загрузки ещё не начинались, macOS остаётся 0/9. [Audit](../../planning/audits/AUDIT-20261015T045449Z.md) фиксирует ожидание Failed Tests/Failed Suites для классификации и две неверные ссылки проверяющего: artist вместо track, album вместо playlist. Неверные ссылки потребуется заменить перед загрузками; они не являются причиной падения offline-тестов. Матрица сохраняется 18/27, owner decision PENDING.

Отдельно исправлен подтверждённый дефект инструмента: прежний runner отклонял `.com` и другие региональные домены, хотя provider их поддерживает. [Audit исправления](../../planning/audits/AUDIT-20261015T163634Z.md): общая проверка двух стадий, 34/34 helper/launcher tests PASS, проверка двух ссылок владельца PASS; product source прежний, новый tool digest `sha256:48f7e52314d79ecc0e3b3a7af5374be01c46c68c78a9b4db7e5e7432a7cb35b8`. В существующем macOS-комплекте достаточно заменить `docs/research/step-027-acceptance/run.mjs`; полный ZIP также обновлён. Это не подтверждает исправление предыдущего test exit 1 и не добавляет real cycles к матрице.

В последующем macOS-прогоне все семь preparation checks, account, doctor и три реальных track-цикла прошли. Album дал задание из одного трека и успешно завершился exit 0; сценарий ожидает прерывание во время следующего трека после completed первого, поэтому выдал DOWNLOAD_DID_NOT_PAUSE. Для продолжения нужен альбом минимум с двумя доступными треками и такой же плейлист; после замены ссылок можно запустить существующий launcher с `--no-prepare`. Старый test failure не повторился, необходимость исправления тестов не установлена. Linux/Windows proof использует прежний tool digest, macOS — обновлённый allowlist-only tool; product source/build identities совпадают.

Финальный macOS-прогон 2026-10-15T17:13:13.616Z–17:14:17.904Z завершился PASS: track/album/playlist по 3/3, 36 проверенных файлов, album total 9, playlist total 2 и M3U8 entries 2. Источник не менялся до/после; CLI/provider builds совпали с Linux/Windows. Приёмка использует финальные 9/9 и предшествующие семь supporting preparation checks той же product/tool версии, явно различая два запуска. Технических blockers матрицы не осталось; явное решение владельца GO записано в итоговом отчёте.
