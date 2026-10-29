# Electron E2E

STEP-033 / REQ-053: настоящий desktop проходит ссылку `mock://track/e2e-track` → предпросмотр → явный старт → пауза → продолжение → завершение → история. Проверяются непустой итоговый файл в выбранном каталоге, тот же job в истории и сохранение истории после штатного закрытия и нового запуска Electron.

Из корня репозитория с установленными workspace dependencies:

```sh
npm --prefix apps/desktop/e2e ci --ignore-scripts --workspaces=false
node packages/testing/scripts/run-yarn.mjs run build
node apps/desktop/e2e/run.mjs
```

Playwright закреплён отдельными `package.json` и `package-lock.json`; runner не скачивает зависимости. Используется установленный workspace Electron, отдельный браузер Playwright устанавливать не нужно. Для воспроизводимого прогона используйте Node.js 22.14.0; локально runner также проверен на 24.21.0. В среде с read-only npm cache укажите доступный `--cache` при `npm ci`.

Linux требует доступного графического дисплея и системных библиотек Electron. Для headless Ubuntu 24.04 в CI:

```sh
node apps/desktop/e2e/node_modules/@playwright/test/cli.js install-deps chromium
xvfb-run -a node apps/desktop/e2e/run.mjs
```

`install-deps` требует права установки системных пакетов. В Windows и macOS выполняются те же install/build/runner команды в нативной графической сессии, с Electron для текущей платформы.

## Границы изоляции

`prepare.mjs` создаёт собственный временный каталог и копирует production `dist`. Renderer, preload, main, broker, HostSupervisor, MessagePort, utilityProcess, executeApplication, SQLite, file adapters, metadata writer и validation остаются настоящими. Точный production `src/host/index.ts` пересобирается с заменой только его импорта application factory: wrapper вызывает настоящую `createApplication` с исходными опциями, временным `stateDir` и offline provider. Wrapper не заменяет stores или processing; `packages/testing` не импортируется.

Bootstrap задаёт временный `userData` до main и подставляет ответ native directory dialog. Только для Playwright он сохраняет `remote-debugging-port`/`remote-debugging-pipe`: production main обычно удаляет эти switches, что воспроизводимо блокирует `electron.launch`. Поэтому тест доказывает рабочий production pipeline с этой явной адаптацией автоматизации, а не отсутствие Chromium debugging endpoint в shipping entrypoint. Production source не меняется. `MUSIC_DOWNLOADER_SMOKE_DIR` принудительно исключается из дочернего запуска.

Offline provider читает только собственный [синтетический MP3](assets/README.md). Отменяемая задержка его потока позволяет наблюдать загрузку до pause; сценарий ждёт фактические состояния вместо произвольных sleeps. Аккаунт, keyring, credentials, пользовательская база и live provider не используются. Тест выполняется одним worker без retries.

В `finally` закрывается Electron и удаляется только созданный этим запуском временный каталог. По умолчанию диагностика пишется в `.harness/local/e2e-artifacts`; путь можно задать через `MUSIC_E2E_ARTIFACTS`. При ошибке сохраняются снимок тестового окна и контекст Playwright, при успехе — JSON с платформой, job, относительным output path, размером файла и историей после перезапуска. Все данные синтетические. CI сохраняет диагностику ошибки на 7 дней.

## Что считается доказательством

Локальный Linux PASS подтверждает только локальную среду. Linux CI требует фактический успешный output job `Desktop E2E (Linux)` для проверяемой revision. Windows и macOS требуют отдельный нативный прогон той же команды с платформой, revision, полным результатом сценария, итоговым файлом и записью истории в Evidence. Наличие job или этих инструкций не закрывает соответствующие Acceptance; до получения фактических отчётов CI/Windows/macOS остаются pending.
