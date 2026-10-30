# STEP-054 — готовые финальные наборы и локальные проверки

Нативная приёмка Windows x64 — **PASS** по текущим отчётам и [решению о приёмке](native-win32-x64-20261029/acceptance.json), без повторного прогона. Новых отчётов macOS arm64 и macOS x64 нет. Исторический [macOS x64 FAIL](../native-20261029/darwin-x64/report.json) сохранён; диагностическая подготовка не объявлена его исправлением.

## Нативный Windows x64 прогон 2026-10-29

Raw отчёты: [before.json](native-win32-x64-20261029/before.json), [after.json](native-win32-x64-20261029/after.json), [provenance.json](native-win32-x64-20261029/provenance.json). Build ID `20261029T152446475Z-94fa63b4`, revision `94fa63b4dbbc9ae40b2e18c850c8e986df1d6d62`; Windows `10.0.26200`, `process.arch=x64`. Гостевая сборка не выполнялась.

- Shipping `0.0.0` и `0.0.1`: PASS, UI готов; полный офлайновый E2E — `1 passed (15.7s)`, MP3 50 785 байт и тот же job в History после перезапуска.
- Ручная замена подтверждена: `manualReplacement=CONFIRMED_BY_USER`, `fileAndHistoryPreserved=true`; проверки integrity до и после — PASS.
- Production PortableUpdates с отдельной подписанной fixture принял корректный пакет и отклонил неверные подпись, размер и SHA-256. SHA-256 скачанного N+1 `04403b2a578626154a061cb39e28e97967c56076c61c62eaf432a83df35083e5` совпал с финальным manifest.

Нативная приёмка — **PASS**: [acceptance.json](native-win32-x64-20261029/acceptance.json) фиксирует решение владельца и SHA-256 исходных отчётов. Повторный Windows прогон не выполнялся. В исторических raw сохранены `nativeAcceptance=PENDING` из-за ошибочного прежнего критерия наличия системного Node.js и `cleanEnvironment=false`: в PATH найден `C:\Program Files\nodejs\node.exe`, FFmpeg не найден. Эти сведения справочные; все команды используют встроенные Node/Electron по абсолютным путям, отсутствие системных Node.js/FFmpeg не требуется. Новых macOS результатов нет, исторический x64 FAIL сохраняется; production trust/feed не настроены.

## Проверки Linux

- `node apps/desktop/scripts/final-kit.mjs --check`: PASS; [raw output](linux-fixture-check.txt). Проверены production PortableUpdates, временная Ed25519 fixture подпись, отклонение неверной подписи, размера, SHA-256, отсутствие автоматического открытия/запуска и обнаружение изменения файла по manifest. Это не native запуск.
- `MUSIC_FINAL_DIAGNOSTICS=/tmp/step054-events-final.jsonl MUSIC_E2E_ARTIFACTS=/tmp/step054-e2e-diagnostics-final ELECTRON_ENABLE_LOGGING=1 node apps/desktop/e2e/run.mjs`: exit 0, 1 passed (17.5s), [raw output](linux-e2e.txt), [result](linux-e2e-result.json). Файл и History сохранены после restart. Запуск выполнен в текущем Linux DISPLAY без изменения GPU/security flags и таймаутов. Предварительный вызов через `xvfb-run` завершился exit 127: утилита отсутствует; результат этого вызова не принят за проверку приложения.
- [Raw Electron JSONL](linux-electron-events.jsonl): реальные `did-finish-load` и `console-message` обоих запусков. Main bootstrap регистрирует также preload/load/render crash и child-process ошибки; искусственные аварии не воспроизводились.
- `node /tmp/step054-diagnostic-probe.mjs`: exit 0, [raw output](linux-diagnostic-fallback.txt), [raw report](linux-diagnostic-fallback.json). Временный Linux kit с production closure, Playwright и Linux-built host намеренно не содержал shipping executable. Исходный shipping FAIL сохранён; ровно один диагностический E2E прошёл через `MUSIC_FINAL_KIT=1` без компилятора на runtime пути, зарегистрировал load/renderer events. Это проверка fallback и готового host, а не native приёмка: report помечен `synthetic-fallback-probe`, `appArtifactHash: null`.
- `git diff --check`: exit 0; синтаксис изменённых `.mjs` проверен Node, форматирование Prettier выполнено.

## Исправленная локальная проверка

Первый `--verify` завершился exit 1: [raw output](linux-verify-initial-fail.txt). Предикат ошибочно запрещал любой каталог `typescript`, включая `@babel/types/lib/builders/typescript`, который содержит AST builders production-зависимости, а не TypeScript compiler. Проверка ограничена границами npm-пакетов `node_modules/{typescript,esbuild,vite,@esbuild}`; на списках всех трёх ZIP исправленный предикат прошёл, известные compiler package paths отклоняются. Production closure не урезалась. После изменения tooling выполнена штатная пересборка, прежние manifests вручную не менялись.

## Артефакты

Окончательные архивы и общий manifest находятся в `.cache/desktop-final-check/`. Builder сверяет current packaging inputs, переиспользует валидную N `0.0.0` и готовит N+1 `0.0.1` для всех целей. Исходные packaging revision сохранены отдельно от revision финального набора. В каждом архиве `kit-manifest.json` содержит `builtOn`, `guestBuildAllowed=false`, target, revision/build ID, хеши portable N/N+1, список файлов и публичную update fixture.

Набор содержит отдельные stock Electron/Node, production closure и Linux-built E2E host; компилятора и приватного ключа нет. Raw environmental probe сохраняет поиск внешних Node.js/FFmpeg в PATH; `externalTools` и `cleanEnvironment` — справочные метаданные. Для Windows и macOS требуется запуск встроенных runtime по абсолютным путям без необходимости устанавливать системные Node.js/FFmpeg; уже установленные инструменты не блокируют приёмку. Production trust/feed не менялись и остаются не настроены. Offline fixture transport не доказывает реальную сеть или доверие Apple/Microsoft. Два launcher разделяют автоматические проверки и **реальную ручную замену** пользователем; первый этап остаётся `AWAITING_MANUAL_REPLACEMENT`, итоговый native PASS возможен только после N+1 shipping smoke и проверки общего SQLite/истории/аудиофайла.

Инструкция: [подготовка и запуск финальных наборов](../../../../../docs/development.md#подготовка-и-запуск-финальных-наборов). Готовность релиза до новых native результатов macOS arm64/x64 не заявляется; Windows x64 принят по текущим отчётам.

## Финальные архивы Linux

Build ID: `20261029T152446475Z-94fa63b4`. Revision набора: `94fa63b4dbbc9ae40b2e18c850c8e986df1d6d62`. [Сохранённый manifest](final-kit-manifest.json), SHA-256 `04dd90b2fda2e3dd761129e155e1ed6089f48b35daa812085c00661a9c504802`.

Packaging `0.0.0`: исходный revision `32fb8e1aef7d7b78cb90b8ffce508da55f98aa52`; соответствие текущим production inputs проверено builder.

Packaging `0.0.1`: исходный revision `94fa63b4dbbc9ae40b2e18c850c8e986df1d6d62`; соответствие текущим production inputs проверено builder.

Путь всех ZIP: `.cache/desktop-final-check/`.

| Target         | Архив                                                                  |     Байты | SHA-256 ZIP                                                        |
| -------------- | ---------------------------------------------------------------------- | --------: | ------------------------------------------------------------------ |
| `win32-x64`    | `music-downloader-final-win32-x64-20261029T152446475Z-94fa63b4.zip`    | 972712749 | `5901ef089550c88fc59c7425f780cd05065e03ad4cfbc6eb874bbc4a9cecb635` |
| `darwin-arm64` | `music-downloader-final-darwin-arm64-20261029T152446475Z-94fa63b4.zip` | 787169973 | `ebdf20d5ee273c066fc044d7ddc96523ea7ad7521064a981d5a2d9825714cc6f` |
| `darwin-x64`   | `music-downloader-final-darwin-x64-20261029T152446475Z-94fa63b4.zip`   | 811954744 | `53ff281df2c68afcfe808928ba3eba2c10819c1f564985b95ca02134ab653afc` |

| Target         | appArtifactHash N                                                  | nextArtifactHash N+1                                               |
| -------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `win32-x64`    | `8e33becb043c2c32fa9b590cb87938d2fc149e79f82e54345bbc4578a461b6c0` | `04403b2a578626154a061cb39e28e97967c56076c61c62eaf432a83df35083e5` |
| `darwin-arm64` | `55deca5f0a01cafafa9a5007ee63203a267b29fb02bf3512bedb65f80a4a474b` | `4b1e2604070244104ea5bb0f004816702070fdef50a56622aa5dd582fd12fe4d` |
| `darwin-x64`   | `294a9a03c97b32ed378ea6555d8113a4b1746e3f1fe66149f696e08dc638e9ee` | `ac7875d84bdf694543fd1e2fee62b6af127e7968294696b1e13a0c06f3ef3766` |

После исправления предиката повторный `--verify` выполняет canonical dispatcher; его окончательный результат записывается в generated Evidence STEP-054. Локальный initial FAIL и targeted проверка исправленного предиката сохранены выше; полный PASS здесь заранее не заявляется.

Raw журналы сохранены побайтно как `.txt` по политике репозитория; [карта исходных имён и SHA-256](raw-log-files.json) связывает их с неизменённым provenance.
