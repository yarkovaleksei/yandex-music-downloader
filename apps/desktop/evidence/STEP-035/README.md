# STEP-035 — локальные дистрибутивы 0.0.0

Все четыре дистрибутива собраны на Linux командой `npm run package:local`. Версия `0.0.0` оставлена по явному решению пользователя. Сборки локальные, без подписи и публикации; Git-тег не создавался. Это не заявление о готовности релиза.

## Артефакты

Пути ниже относительно `.cache/desktop-packaging/local-0.0.0/`.

| Цель | Файл | Размер, байт | SHA-256 |
| --- | --- | ---: | --- |
| `linux-x64` | `linux-x64/music-downloader-0.0.0-linux-x64.AppImage` | 151927990 | `83eaa355f0bab13f01161d6c6cdccc970bea4124e73eef61bf613d7724d15ea0` |
| `win32-x64` | `win32-x64/music-downloader-0.0.0-win32-x64.exe` | 138857945 | `952ce18ab8f48396a0cdc86ba7318ac9312d34ba89b07eb9ef15672c8ee24bae` |
| `darwin-arm64` | `darwin-arm64/music-downloader-0.0.0-darwin-arm64.zip` | 139737698 | `bbcdec47be266039fb0d1a6229f4f0c6119a62e37970870d6585240c8444b140` |
| `darwin-x64` | `darwin-x64/music-downloader-0.0.0-darwin-x64.zip` | 144061548 | `ac1762b99bc6f40c8513090d4e56372a827d3763993c52ec2e03b2ddd78c11ea` |

`build-summary.json` фиксирует входные хеши, build image, Node.js сборщика и размеры/хеши результатов. Сборщик: electron-builder 26.18.1 в закреплённом Linux-образе с Wine; Wine используется только для создания NSIS, не для приёмки Windows. Производственный код собран в Electron 45.0.0. Упаковка выполнена из отдельного staging с production-зависимостями и целевыми native bindings, без исходников workspace, E2E fixtures и средств разработки.

## Проверка содержимого

`npm run package:verify` завершилась с кодом 0 для всех четырёх целей. Проверены фактические извлечённые AppImage/NSIS/ZIP, SHA-256, актуальность входных файлов, версия, production dependency closure, наличие main/host/preload/renderer, отсутствие тестовых fixtures, архитектуры исполняемых файлов и native bindings, распаковка native-библиотек, fuses и embedded ASAR integrity Windows/macOS. Результат: `artifact-verification.json`.

## Запуск на чистом Linux

`npm run package:smoke` завершилась с кодом 0. Извлечённое содержимое проверенного AppImage запущено в свежем Ubuntu 24.04 с отключённой сетью, без установленных Node.js и FFmpeg. Отчёт `linux-smoke.json` подтверждает UI readiness, четыре свойства изоляции renderer и создание SQLite. Встроенный Node.js Electron не является установленным системным Node.js.

`linux-window.png` просмотрен: видны главная страница, поле ссылки и исходная жёлтая иконка. В контейнере нет Secret Service: приложение показывает сообщение о недоступном хранилище. Авторизация и доступ к реальному provider этим smoke не проверялись.

Ограничения: проверено извлечённое содержимое AppImage, без FUSE и регистрации в desktop; контейнер запускается с `--no-sandbox`. Это не проверка установки/запуска Windows/macOS, подписания или updater. Подписи/updater относятся к STEP-036; вся новая нативная приёмка Windows/macOS — только к финальному STEP-054. Исторический сбой macOS x64/Rosetta остаётся неподтверждённо исправленным; Linux-анализ архива его не закрывает.

## Ранее обнаруженный ложный PASS

`initial-blank-window.png` и `initial-blank-smoke-report.json` сохранены как НЕУСПЕШНОЕ визуальное наблюдение: старый helper сообщал PASS после проверки API, хотя снимок был пустым. Этот результат не принят. В рамках утверждённого плана исправлен только smoke-helper: он ждёт видимый контрол интерфейса и кадр. Финальный AppImage пересобран с этим исправлением; текущий отчёт содержит `uiReady: true` и связан с текущим SHA-256 артефакта.

Обычный smoke записывает эти durable доказательства до canonical Verification. Режим `npm run package:smoke -- --check` повторяет проверку только в ignored cache, не изменяя durable Evidence.
