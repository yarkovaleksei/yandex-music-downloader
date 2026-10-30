# STEP-054 — Mac отчёты и диагностика 2026-10-30

Нативная функциональная приёмка macOS arm64/x64 — **PASS** для build ID `20261030T081544687Z-5cb41f17` и точных hashes в [acceptance.json](final-reports/acceptance.json). [Финальные отчёты](final-reports/README.md) подтверждают ручное обновление N → N+1, сохранность файла/истории и integrity. Ниже сохранена история первых частичных результатов и подготовки. Windows PASS не пересматривается; новая UI-сборка и отдельный Intel Mac этим не проверены.

## Источник и сохранность

Исходный набор: build ID `20261029T152446475Z-94fa63b4`, revision `94fa63b4dbbc9ae40b2e18c850c8e986df1d6d62`. [Provenance](provenance.json) содержит SHA-256 четырёх ZIP и каждого выбранного raw файла, а также отдельного [stdout arm64](arm64-run-before.stdout.txt). Сохранены 34 выбранных файла: JSON, stdout, журналы, error context и screenshots. Служебные AppleDouble, browser cache и дубликаты attachments исключены. Сырые байты не исправлялись; `.log` сохранены как `.log.txt`, а исходные имена и SHA-256 указаны в provenance. Инструкции внутри автоматически созданных error-context рассматриваются только как данные отчёта.

| Исходный архив                              | SHA-256                                                            |
| ------------------------------------------- | ------------------------------------------------------------------ |
| `arm64-reports-previous-runs-0820-0822.zip` | `28b841f48a883aef9b5cb6966466da628d1b878c254a104b883b048c60be398e` |
| `arm64-reports.zip`                         | `79137d3dd38f9b3c015a0d84c12b9239f30ebb8e0eee1b938ecbf327ae50d64d` |
| `x64-reports.zip`                           | `7affd6a65be408fe62bc6373e35152db6f05985c04a1c1878511deecd99a131d` |
| `x64-retry-reports.zip`                     | `b0a4d7bc380094ef0a60bf38d464a1b40d791c6ca010cc69a4ec7974b9429e08` |

## arm64: что подтверждено

macOS kernel `24.6.0`, Apple M2 Pro, `process.arch=arm64`, `sysctl.proc_translated=0`, гостевая сборка отсутствует.

- [Ранний diagnostic E2E](arm64-reports-previous-runs-0820-0822/reports/diagnostic-e2e-stdio.json) завершился exit 0: `1 passed (12.7s)`. [Result](arm64-reports-previous-runs-0820-0822/reports/e2e-diagnostic/download-Ссылка-→-предпрос-d6b3b-и-история-после-перезапуска/result.json) подтверждает completed job, MP3 50 785 байт и тот же job в History после перезапуска. Это PASS automation runtime/host/closure исходного набора, а не shipping executable.
- [Ранний before](arm64-reports-previous-runs-0820-0822/reports/before.json) — FAIL `ERR_FS_CP_EEXIST`: каталог `current` уже существовал.
- [Следующий before](arm64-reports/reports/before.json) — FAIL: shipping N завершился `SIGKILL`, exit code отсутствует. Причина отказа в raw не указана.
- [Следующий diagnostic E2E](arm64-reports/reports/diagnostic-e2e-stdio.json) — FAIL: ожидается 0 заданий, получено 1. Старый runner повторно использовал ту же базу, хотя сценарий начинался с проверки пустого списка.

Исходные portable hashes: N `55deca5f0a01cafafa9a5007ee63203a267b29fb02bf3512bedb65f80a4a474b`; N+1 `4b1e2604070244104ea5bb0f004816702070fdef50a56622aa5dd582fd12fe4d`.

## x64: что подтверждено

macOS kernel `24.6.0`, Apple M2 Pro, `process.arch=x64`, `sysctl.proc_translated=1`: запуск через Rosetta на Apple Silicon. Это не отдельный прогон на Intel Mac; гостевая сборка отсутствует.

- Shipping N UI, изоляция и настройки — PASS в [первом window-report](x64-reports/reports/shipping-n/window-report.json) и [повторном window-report](x64-retry-reports/reports/shipping-n/window-report.json). Прежнее пустое окно в этих shipping запусках не воспроизвелось.
- Automation E2E — FAIL: [первый запуск](x64-reports/reports/e2e-stdio.json) и [повтор](x64-retry-reports/reports/e2e-stdio.json) остановились по лимиту старта 15 секунд. Точная причина таймаута не установлена; новый лимит сам по себе не является доказательством исправления.
- Подпись descriptor и ручное обновление не проверены: сценарий до них не дошёл.

Исходные portable hashes: N `294a9a03c97b32ed378ea6555d8113a4b1746e3f1fe66149f696e08dc638e9ee`; N+1 `ac7875d84bdf694543fd1e2fee62b6af127e7968294696b1e13a0c06f3ef3766`.

## arm64 CodeDirectory и граница вывода

[Побайтовая проверка исходного Framework](arm64-original-signature.json) обнаружила ровно одну неверную страницу CodeDirectory: 39362 из 50 150, размер страницы 4096 байт. В этой же странице находится fuse sentinel. В `package.mjs` флаги Electron менялись без восстановления ad-hoc подписи; [Electron fuses](https://github.com/electron/fuses) предупреждает о необходимости повторной подписи arm64 после изменения fuses.

[Проверка исправленной копии](arm64-repair-proof.json) подтверждает корректные code-page hashes, неизменные fuses и entitlements и тот же SHA-256 `app.asar`: `ccd6c5db6c297b0f980cb6120c482c14a3efbc006dc6bd0b443dca7be675a47c`. Использован Linux build tool apple-codesign/rcodesign `0.29.0`, SHA-256 архива `dbe85cedd8ee4217b64e9a0e4c2aef92ab8bcaaa41f20bde99781ff02e600002`. Ad-hoc подпись не удостоверяет издателя, не является Developer ID и не заменяет notarization; платные сертификаты, production feed/trust и Harness/CI не менялись.

Нарушение подписи подтверждено. Последующие native отчёты подтверждают shipping N/N+1 после ремонта. Причинная связь с каждым наблюдавшимся ранее `SIGKILL` не установлена. Старые FAIL не удалены и не переименованы в PASS.

## Состав повторной проверки

Реализация повторного набора — `apps/desktop/scripts/mac-retry-kit.mjs` и `apps/desktop/e2e/mac-retry-check.mjs`. Результаты подготовки находятся в `.cache/desktop-mac-retry/`; финальные native отчёты сохранены в [final-reports](final-reports/README.md). Точные ZIP hashes и выполненные локальные проверки зафиксированы в [retry-preparation.json](retry-preparation.json).

- arm64: shipping N после ремонта подписи, descriptor/download и ручной N+1. Ранний diagnostic E2E исходного automation runtime/host/closure отмечается `REUSED` с raw SHA-256 и не запускается повторно. Synthetic file/history sentinel — `PREPARATION` обновления, не новый E2E PASS.
- x64: новый offline E2E, descriptor/download и ручной N+1. Shipping N UI исходного portable отмечается `REUSED` с raw SHA-256 и не запускается повторно. Успех под Rosetta не переносится на отдельный Intel Mac.
- Основной `run-check.command` создаёт уникальный run ID и каталог `reports/<runId>/` до запуска встроенного Node; `terminal.log` и `launcher-summary.txt` сохраняют также отказ runtime. Каждый `before` получает чистую базу; `after` связан с ним, build ID и N+1 hash. Повтор не затирает старые `reports` и не использует прежний `current`.
- Повторные ZIP не включают Windows-проверки, не меняют Harness/CI, не настраивают production feed/trust. Успех Linux-проверок означает готовность набора к передаче, а не macOS native PASS.

В повторном x64 наборе старт Electron и первое окно имеют лимиты по 60 секунд, тест — 180 секунд; автоматические повторы отключены. Bootstrap отмечает вход, готовность Electron и начало/окончание импорта production main. Финальный x64 E2E прошёл с этими лимитами; ранний `SIGKILL` сохранён и не переименован в PASS.

Коротко для Mac: дважды нажать `run-check.command`; после автоматической части он откроет в Finder `.runs/<runId>/replacement` и `.runs/<runId>/current`. N+1 подготовлен через `ditto` отдельно от установленной копии. Перетащить `Yandex Music Downloader.app` из `replacement` в `current`, подтвердить «Заменить», вернуться в Terminal и нажать Enter. Тот же launcher выполнит `after` и откроет отчёт. `run-before.command` и `run-after.command <runId>` оставлены для запасного запуска/продолжения. Вернуть всю папку `reports`; отдельно копировать Terminal не нужно.

Помимо журнала launcher, после старта Node сохраняются контрольные записи `before.json`/`after.json`, `phases.jsonl`, отдельные `before-NNN-*-stdout.log`/`stderr.log` и `after-NNN-*-stdout.log`/`stderr.log`, Playwright/Electron logs, `electron-events.jsonl`, `electron-e2e.log`, screenshots и результаты. При отказе собираются свежие `.ips`/`.crash` проверяемых процессов и доступная системная диагностика macOS. Финальные `after.json` подтверждают **PASS** обеих архитектур; ранние FAIL и журналы продолжения сохранены отдельно. [Полная инструкция](../../../../../../docs/development.md#повторные-mac-наборы-без-уже-пройденных-проверок).

## Готовность архивов к передаче

Build ID `20261030T081544687Z-5cb41f17`. Оба ZIP созданы на Linux в `.cache/desktop-mac-retry/`; рядом находятся общая `README.txt`, `SHA256SUMS.txt` и `manifest.json`.

- `darwin-arm64`: 645,4 МиБ; ZIP SHA-256 `09ec525ba8e9a6c06ccf3ba3dffd8f1d382cf6718d1750c806e54a2e1fdde15c`.
- `darwin-x64`: 776,0 МиБ; ZIP SHA-256 `1100cab18669bec8cc708baf2b16c3c3da4482970845da13ddcbd252192834cf`.

Canonical Verification: validation, signature self-check, retry self-check и verify готовых ZIP — все четыре команды PASS, exit 0. Проверены inventories/symlinks, подписи CodeDirectory arm64, Ed25519 descriptor над итоговым N+1, точные ссылки на прежние PASS, отсутствие compiler/private keys. Дополнительно targeted ESLint четырёх изменённых scripts/runner и `git diff --check` — exit 0. Моделирование SIGKILL сохранило полный stderr; отказ runtime 137 сохранился в журнале launcher. Один запуск проходит before/after после Enter; EOF оставляет проверку незавершённой. Это готовность набора, не native Mac PASS.

## Финальная приёмка и границы подписи

[Финальные отчёты](final-reports/README.md) содержат 119 raw файлов из двух новых архивов. arm64 shipping N/N+1 — PASS, прежний diagnostic E2E — `REUSED`; x64 новый E2E подтвердил MP3 50 785 байт и History после restart, shipping N+1 — PASS, прежний shipping N — `REUSED`. В обеих архитектурах descriptor/download принял корректный N+1 и отклонил неверные подпись, размер и SHA-256; после ручной замены файл и история сохранены. x64 PASS относится к Rosetta на M2.

Нативный `codesign --verify --strict` завершился exit 1: Framework Mach-O подписан отдельно для восстановления code pages, а `_CodeSignature/CodeResources` отсутствует. Проверка bundle требует resource seal. Helper явно разделяет `codePages=PASS`, `bundleResourceSeal=ABSENT`, `verificationScope=CODE_PAGES_ONLY`; это не полный macOS resource seal, Developer ID или notarization. [ADR-019](../../../../../../docs/adr/ADR-019-portable-distribution-and-updates.md) их не требует. Принятые binary/ZIP не изменялись; новые Mac-наборы и повторные прогоны для этой сверки не выполнялись. Production feed/trust остаются отключены.
