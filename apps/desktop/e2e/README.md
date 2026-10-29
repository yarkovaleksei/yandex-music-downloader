# Electron E2E

STEP-033 / REQ-053: настоящий desktop проходит ссылку `mock://track/e2e-track` → предпросмотр → явный старт → пауза → продолжение → завершение → история. Проверяются непустой итоговый файл в выбранном каталоге, тот же job в истории и сохранение истории после штатного закрытия и нового запуска Electron.

Сборка и подготовка E2E выполняются только на Linux. Из корня репозитория на Linux с установленными workspace dependencies:

```sh
npm --prefix apps/desktop/e2e ci --ignore-scripts --workspaces=false
node packages/testing/scripts/run-yarn.mjs run build
node apps/desktop/e2e/run.mjs
```

Playwright закреплён отдельными `package.json` и `package-lock.json`; runner не скачивает зависимости. Используется установленный workspace Electron, отдельный браузер Playwright устанавливать не нужно. Для воспроизводимого прогона используйте Node.js 22.14.0; локально runner также проверен на 24.21.0. В среде с read-only npm cache укажите доступный `--cache` при `npm ci`.

Linux требует доступного графического дисплея и системных библиотек Electron. Для локального headless Ubuntu 24.04:

```sh
node apps/desktop/e2e/node_modules/@playwright/test/cli.js install-deps chromium
xvfb-run -a node apps/desktop/e2e/run.mjs
```

`install-deps` требует права установки системных пакетов. На Windows/macOS запускаются готовое приложение и заранее собранный на Linux E2E host из автономного набора с Electron нужной платформы. В гостевой ОС нет install/build команд, компиляции TypeScript, renderer или host; сеть и установленные Node.js/FFmpeg не нужны. Распакуйте архив на локальный диск и используйте launcher набора в обычной графической сессии.

## Границы изоляции

`prepare.mjs` создаёт собственный временный каталог и копирует production `dist`. Renderer, preload, main, broker, HostSupervisor, MessagePort, utilityProcess, executeApplication, SQLite, file adapters, metadata writer и validation остаются настоящими. Точный production `src/host/index.ts` пересобирается с заменой только его импорта application factory: wrapper вызывает настоящую `createApplication` с исходными опциями, временным `stateDir` и offline provider. Wrapper не заменяет stores или processing; `packages/testing` не импортируется.

Bootstrap задаёт временный `userData` до main и подставляет ответ native directory dialog. Только для Playwright он сохраняет `remote-debugging-port`/`remote-debugging-pipe`: production main обычно удаляет эти switches, что воспроизводимо блокирует `electron.launch`. Поэтому тест доказывает рабочий production pipeline с этой явной адаптацией автоматизации, а не отсутствие Chromium debugging endpoint в shipping entrypoint. Production source не меняется. `MUSIC_DOWNLOADER_SMOKE_DIR` принудительно исключается из дочернего запуска.

Offline provider читает только собственный [синтетический MP3](assets/README.md). Отменяемая задержка его потока позволяет наблюдать загрузку до pause; сценарий ждёт фактические состояния вместо произвольных sleeps. Аккаунт, keyring, credentials, пользовательская база и live provider не используются. Тест выполняется одним worker без retries.

В `finally` закрывается Electron и удаляется только созданный этим запуском временный каталог. По умолчанию диагностика пишется в `.harness/local/e2e-artifacts`; путь можно задать через `MUSIC_E2E_ARTIFACTS`. При ошибке сохраняются снимок тестового окна и контекст Playwright, при успехе — JSON с платформой, job, относительным output path, размером файла и историей после перезапуска. Все данные синтетические. При локальном запуске диагностика остаётся в указанном каталоге.

## Что считается доказательством

Решением владельца от 2026-10-29 CI-приёмка отменена; GitHub Actions выполняет только дополнительные Linux-проверки кода и unit tests, без Electron E2E. Требуется успешный локальный Linux прогон для проверяемой revision. Все новые Windows/macOS прогоны перенесены решением владельца от 2026-10-29 в единый финальный STEP-054 после разработки и упаковки. До него промежуточные STEP не ждут Windows/Mac и проверяются на Linux. В финальном шаге нужны платформа, архитектура, revision, полный результат сценария, итоговый файл и запись истории в Evidence. Linux PASS не заменяет Windows/macOS. Предыдущие CI-отчёты сохраняются как история.

## Полученные нативные подтверждения

[Исходные отчёты](evidence/native-20261029/README.md) от 2026-10-29 подтверждают готовое приложение на Windows x64 и macOS arm64: integrity PASS, E2E exit 0, MP3 50 785 байт, тот же job в History после restart и prebuiltFilesUnchanged PASS. Сборка приложения и host выполнена на Linux; performedOnGuest=false. [Manifest привязки](evidence/native-20261029/ready-artifact-binding.json) фиксирует 342 текущих dist/package файла, сценарий и побайтно совпавший prebuilt host; historical sourceHash сохраняет происхождение сборки, а не хеш позднейших изменений документации.

[Последний ARM64 отчёт](evidence/native-20261029/mac-arm64-offline-103807/README.md) нового офлайнового набора — PASS на Apple M2 Pro/macOS 15.7.7, sysctl.proc_translated=0. Первый ранний отказ запуска Electron также сохранён; причина не установлена. macOS x64/Rosetta остаётся неподтверждённой, её предыдущий FAIL не объявлен исправленным; повторная проверка входит в финальный общий STEP-054 для Windows/macOS. Packaging, подпись, live provider и shipping bootstrap этим сценарием не квалифицированы.
