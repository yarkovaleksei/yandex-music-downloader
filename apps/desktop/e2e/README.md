# Electron E2E

Настоящий desktop проходит ссылку `mock://track/e2e-track` → предпросмотр → явный старт → пауза → продолжение → завершение → история. Проверяются непустой итоговый файл в выбранном каталоге, тот же job в истории и сохранение истории после штатного закрытия и нового запуска Electron.

Сборка и подготовка E2E выполняются только на Linux. Из корня репозитория на Linux с установленными workspace dependencies:

```sh
npm --prefix apps/desktop/e2e ci --ignore-scripts --workspaces=false
node packages/testing/scripts/run-yarn.mjs run build
node apps/desktop/e2e/run.mjs
```

Playwright закреплён отдельными `package.json` и `package-lock.json`; runner не скачивает зависимости. Используется установленный workspace Electron, отдельный браузер Playwright устанавливать не нужно. Для воспроизводимого прогона используйте Node.js 22.14.0. В среде с read-only npm cache укажите доступный `--cache` при `npm ci`.

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

В `finally` закрывается Electron и удаляется только созданный этим запуском временный каталог. По умолчанию диагностика пишется в `.cache/e2e-artifacts`; путь можно задать через `MUSIC_E2E_ARTIFACTS`. При ошибке сохраняются снимок тестового окна и контекст Playwright, при успехе — JSON с платформой, job, относительным output path, размером файла и историей после перезапуска. Все данные синтетические. При локальном запуске диагностика остаётся в указанном каталоге.

## Границы проверки

E2E проверяет офлайновый сценарий на синтетических данных. Он не подтверждает работу live provider, авторизацию, подпись дистрибутива или обновление приложения.

Linux-прогон не заменяет запуск готовых артефактов на Windows и macOS. Для платформенных проверок сохраняйте платформу, архитектуру, revision, результат сценария, итоговый файл и запись истории. Подготовка автономных наборов описана в [руководстве разработчика](../../../docs/development.md).

GitHub Actions выполняет дополнительные Linux-проверки кода и unit tests. Electron E2E выполняется локально.
