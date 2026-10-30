# STEP-054 — финальные Mac отчёты 2026-10-30

Функциональная нативная приёмка macOS arm64/x64 — **PASS** для набора `20261030T081544687Z-5cb41f17` и точных hashes в [acceptance.json](acceptance.json). Это не утверждение о завершённом STEP до независимого review, не приёмка новой UI-сборки и не отдельный Intel Mac прогон.

## Сохранённые источники

[Provenance](provenance.json) связывает 119 raw файлов с архивами `arm64-reports (1).zip` (60 файлов) и `x64-reports (1).zip` (59 файлов), их исходными именами и SHA-256. `.log` сохранены как `.log.txt`; содержимое raw не исправлялось. Вложенные portable ZIP не дублируются: их размеры и SHA-256 записаны в `excludedPayloads` и совпадают с принятыми N+1 hashes. Binary и проверочные архивы не изменялись; новые Mac-наборы для этой сверки не собирались, новые Mac-прогоны не выполнялись.

| Цель | Финальный run ID | Результат |
| --- | --- | --- |
| `darwin-arm64` | `20261030T101530Z-00006634` | Shipping N/N+1 PASS, прежний diagnostic E2E `REUSED` |
| `darwin-x64` | `20261030T101708Z-000067a7` | Новый offline E2E и shipping N+1 PASS, прежний shipping N `REUSED` |

[arm64 before](darwin-arm64/20261030T101530Z-00006634/before.json) и [after](darwin-arm64/20261030T101530Z-00006634/after.json), [x64 before](darwin-x64/20261030T101708Z-000067a7/before.json) и [after](darwin-x64/20261030T101708Z-000067a7/after.json) подтверждают integrity до/после и `fileAndHistoryPreserved=true` после ручной замены. Корректный descriptor/download даёт `ready`, неверные подпись, размер и SHA-256 — `error`. Это собственная Ed25519 fixture, production feed/trust остаются отключены.

arm64 запущен на M2 без Rosetta. Его baseline — синтетический файл 49 572 байта и запись истории с пометкой `PREPARATION`, только для update; новый E2E этим не заявляется. Прежний E2E относится к исходным automation Electron/host/closure. x64 на том же M2 через Rosetta прошёл новый E2E: completed MP3 50 785 байт и тот же job в History после restart. Прежний shipping N UI переиспользован только для исходного portable hash. Успех Rosetta не переносится на отдельный Intel Mac.

## Ранние отказы и успешное продолжение

- Ранний [arm64 before](darwin-arm64/20261030T101206Z-00006311/before.json) содержит блокировку `better-sqlite3` системной политикой при подготовке baseline; последующий финальный run прошёл. Причина изменения решения системной политики не устанавливается предположением.
- Ранний [x64 E2E](darwin-x64/20261030T101324Z-0000645b/e2e-stdio.json) содержит `SIGKILL` при первом старте. Он сохранён как FAIL; последующий E2E финального run прошёл.
- Первая фаза `after` обоих финальных run остановилась на корневом `.DS_Store`, созданном Finder. Её raw сохранены в `after-attempt-1-DS_Store/`. В текущем runner сравнение допускает только отсутствующий в эталоне корневой обычный неисполняемый `.DS_Store`; symlink, вложенные файлы и payload сверяются точно. Это не исключение из проверки хеша ZIP или содержимого `.app`.
- `launcher-summary.txt` с exit 1 и `terminal.log.txt` в корне этих run относятся к первой попытке `after`, а не к финалу. Успешное продолжение подтверждают [arm64 continuation](darwin-arm64/20261030T101530Z-00006634/run-after-continuation.log.txt), [x64 continuation](darwin-x64/20261030T101708Z-000067a7/run-after-continuation.log.txt), финальные `after.json` и завершающие PASS в `phases.jsonl`. Старые summary не переписывались.

## Что проверено в подписи

[Codesign analysis](codesign-analysis.json) сохраняет нативный `codesign --verify --strict` exit 1 и его raw stderr. Linux helper восстановил code pages отдельного Framework Mach-O; у точного принятого файла SHA-256 `6af12ccba083f34661f4f5487d8dd4ef461ddd21bf8b1513668f86d267948a89` наша побайтовая проверка code-page hashes — PASS. CodeDirectory slot 3 и `_CodeSignature/CodeResources` отсутствуют. Поэтому `codePages=PASS`, `bundleResourceSeal=ABSENT`, `verificationScope=CODE_PAGES_ONLY` не означают успешную строгую bundle-проверку macOS. Отдельный `rcodesign verify` также завершился FAIL; он не используется как PASS-доказательство.

Полный resource seal, Developer ID и notarization не заявляются. [ADR-019](../../../../../../../docs/adr/ADR-019-portable-distribution-and-updates.md) их не требует. Функциональный PASS shipping и update не переименовывает signature diagnostics FAIL в PASS и не доказывает причину каждого раннего `SIGKILL`.
