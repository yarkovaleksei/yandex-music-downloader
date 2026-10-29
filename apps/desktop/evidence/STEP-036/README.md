# STEP-036 — portable-пакеты и проверенные обновления

Решение владельца: платные сертификаты не покупаются вообще. OQ-013 закрыт; REQ-054/055 и ADR-019 закрепляют portable-распространение без системной подписи и notarization. Старое решение ADR-018 и результаты STEP-035 сохранены как история; Windows NSIS заменён ZIP в текущей реализации.

## Фактические пакеты

Все четыре артефакта созданы командой `npm run package:local` только на Linux. Версия 0.0.0 локальная, tag=null, signed=false, published=false. Пути относительно `.cache/desktop-packaging/local-0.0.0/`.

| Цель | Пакет | Байты | SHA-256 |
| --- | --- | ---: | --- |
| `linux-x64` | `linux-x64/music-downloader-0.0.0-linux-x64.AppImage` | 151927688 | `a6ecfe79da61df595ab69deae103661c8f6ec772822edb278b159603324ee2f0` |
| `win32-x64` | `win32-x64/music-downloader-0.0.0-win32-x64.zip` | 175079666 | `8e33becb043c2c32fa9b590cb87938d2fc149e79f82e54345bbc4578a461b6c0` |
| `darwin-arm64` | `darwin-arm64/music-downloader-0.0.0-darwin-arm64.zip` | 139741416 | `55deca5f0a01cafafa9a5007ee63203a267b29fb02bf3512bedb65f80a4a474b` |
| `darwin-x64` | `darwin-x64/music-downloader-0.0.0-darwin-x64.zip` | 144065228 | `294a9a03c97b32ed378ea6555d8113a4b1746e3f1fe66149f696e08dc638e9ee` |

`build-summary.json` содержит входные хеши и build image. `artifact-verification.json`: `npm run package:verify` exit0, все4 PASS. Извлечены фактические ZIP/AppImage; проверены production dependency closure, native target headers, версия, main/host/preload/renderer, публичная конфигурация доверия, fuses/integrity и входные хеши. Windows ZIP проверен без запуска Windows. `.app` ZIP macOS не подтверждает запуск на Mac.

## Проверка и скачивание

Main проверяет detached Ed25519-подпись над точными bytes descriptor до JSON parse, затем канал/цель/более новую версию/HTTPS origins, включая redirects. Streaming download сверяет размер и SHA-256 того же immutable descriptor; неполный файл удаляется. Папка открывается только после повторной проверки сохранённого файла. Renderer передаёт только закрытые команды без URL/пути/ключа; автоматического запуска или установки нет.

В интерфейсе настроек доступны отдельные явные действия проверки, скачивания и открытия папки. 87 desktop-тестов прошли, в том числе новый RTL-сценарий трёх отдельных действий и disabled feed. 14 executable update-contract тестов прошли: реальный HTTPS и production service, неверные подпись/ключ/version/target/channel/HTTP/origin/redirect/hash/size/неполный payload, подмена перед открытием и отсутствие сети без trust. Временные тестовые ключи не являются production trust.

Release CLI создаёт собственный ключ Ed25519 в отдельной записи системного Secret Service Linux, повторный init не заменяет ключ; подпись читает его оттуда. Приватный ключ не передаётся файлом, env или аргументом, не выводится. Отказ хранилища завершает команду без plaintext fallback. Настоящий ключ владельца этим прогоном не создавался; контракт работы entry проверен отдельной тестовой реализацией.

Production feed и открытый ключ в `packaging/update-trust.json` не настроены. Поставляемое приложение явно сообщает, что обновления недоступны, пока владелец не включит доверенную конфигурацию при сборке; автоматически доверять URL/ключу из сети оно не будет. Системная подпись/доверие Apple/Microsoft не заявляются.

## Реальное Linux N → N+1

`node apps/desktop/scripts/package.mjs --local-version 0.0.1 --linux-only` exit0 создала настоящий второй AppImage. `npm run package:update-smoke` exit0:

1. Проверила свежесть обоих build manifests и фактический второй AppImage (`next-artifact-verification.json`).
2. Production `PortableUpdates` получила подписанный descriptor и скачала полный AppImage 0.0.1 по реальному HTTPS с отдельным временным fixture CA; подпись/размер/хеш подтверждены.
3. Готовое приложение 0.0.0 запущено в чистом Ubuntu24.04. Через публичный desktop IPC сохранены quality=normal, logging=debug, concurrency=3; приложение закрыто.
4. Скачанный и проверенный AppImage получил executable bit и был извлечён. Ручная замена смоделирована сменой /app на этот пакет между запусками с тем же общим stateDir.
5. Запущенное готовое приложение сообщило appVersion=0.0.1, UI-ready и четыре isolation=true; SQLite и все три сохранённые настройки сохранились. Системные Node.js/FFmpeg отсутствуют, runtime сеть отключена.

`linux-update.json` связывает оба пакета хешами и фиксирует реальные версии/состояние. `n.png` и `n-plus-1.png` сохраняют окна; снимок новой версии просмотрен: полный интерфейс, поле URL и исходная жёлтая иконка. Это запуск готовых приложений, а не сборка на гостевой системе. Режим `--check` повторяет проверку только в ignored cache и не обновляет durable Evidence.

## Границы доказательств

Контейнер использует извлечённый AppImage и `--no-sandbox`; FUSE/desktop integration, авторизация и реальный credential store не проверялись. Проверены сохранённые настройки и SQLite, полный музыкальный E2E/история остаётся отдельной финальной проверкой. Windows/macOS native запуск, ручное N→N+1 и неизвестный исторический macOS x64/Rosetta FAIL принадлежат только финальному STEP-054. Новых наборов другу не отправляли. Релиз/теги/публикация отсутствуют; CI не требуется, Harness CI не менялся.

Полная локальная Verification выполняется с ограничением Vitest до четырёх workers (`verification-environment.json`): при автоматическом выборе 32 CPU наблюдались таймауты прежних интеграционных сценариев. Набор тестов и их таймауты не менялись; внутри тестов проверки конкурентности сохраняются.
