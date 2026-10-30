---
schema: 1
id: ADR-018
status: superseded
date: 2026-10-29
deciders:
  - Владелец проекта — ограничения сборки и порядок приёмки
  - Архитектурное решение с независимым ревью
supersedes: []
superseded_by:
  - ADR-019
requirements: []
---

# ADR-018 — Упаковка на Linux, подписание и доверенные обновления

## Context

Desktop использует Electron main, sandboxed renderer/preload и application host (`utilityProcess`). Application владеет provider, SQLite и credentials; main их не получает (ADR-014/015/016). Рабочее состояние общее с CLI и находится вне установки приложения.

Владелец требует собирать все артефакты только на Linux. Новые проверки Windows/macOS выполняются в рамках финальной платформенной приёмки после разработки и упаковки; промежуточные шаги проверяются на Linux, успешный CI не требуется. Прежние проверочные ZIP не являются релизными дистрибутивами. Сертификаты и аккаунты для реального подписания рассматриваются отдельно в OQ-013 при проектировании обновлений.

## Problem

Нужны воспроизводимые дистрибутивы четырёх целей и обновление без доверия к изменяемому серверному checksum. Упаковка не должна изолировать общую SQLite, приносить Linux native binding на Mac/Windows или требовать сборки на компьютере пользователя. Стандартная интеграция Apple `codesign` требует macOS и не подходит принятому ограничению.

## Decision

### Сборка и форматы

Выбран один `electron-builder` стабильной ветки 26: исходная версия для реализации — **26.18.1**, `electron-updater` — **6.8.12**. Точные версии и integrity закрепляет сборщик дистрибутивов и portable-обновлений в lockfile; этот ADR зависимости не устанавливает. Документация v27 относится к предварительной версии и не является обещанием возможностей v26.

| Цель | Дистрибутив | Установка |
| --- | --- | --- |
| Windows x64 | NSIS `.exe` | На пользователя, без MSIX и виртуализации AppData |
| macOS arm64 | ZIP с обычным `.app` | Копирование приложения в Applications, без Mac App Sandbox |
| macOS x64 | Отдельный ZIP с `.app` | Intel либо Rosetta; тип CPU/перевода отмечается в финальном отчёте |
| Linux x64 | AppImage | Запуск пользователем, без Snap/Flatpak confinement |

Все компиляция, staging, упаковка и подписание выполняются на Linux. Wine/NSIS допустимы как инструменты Linux-сборщика, но сборка на Windows/Mac не вводится. Для macOS используется явно выбранный ZIP target; DMG/PKG и universal binary не требуются. Неподписанные промежуточные артефакты допустимы для локальной проверки состава; они не выдаются за подписанный релиз или готовый auto-update.

В staging попадают production `dist`, metadata нужных workspace-пакетов и полная транзитивная production dependency closure, Electron целевой ОС, утверждённая жёлтая иконка и лицензии. Корневое `node_modules` разработчика целиком не копируется. Runtime workspace-ссылки должны разрешаться внутри артефакта. Компиляторы, E2E mock/bootstrap, fixtures, credentials и личное состояние в shipping bundle не входят. Отдельные установленные Node.js и FFmpeg для базового desktop не нужны; существующая необязательная диагностика FFmpeg сохраняется.

Native prebuilds `better-sqlite3` и keyring выбираются для конкретной ОС/архитектуры; отсутствие подходящего binary останавливает сборку без JSON/WASM fallback или гостевого rebuild. Native `.node` и необходимые библиотеки распаковываются из ASAR с сохранением путей загрузчика; macOS ZIP сохраняет executable bits и framework symlinks. Сборка дистрибутивов проверяет их состав и архитектуры на Linux, а работоспособность на целевой ОС — финальная платформенная приёмка.

До подписания применяются shipping fuses ADR-015, включая ограничения запуска внешнего кода; адаптация debugging switches для Playwright остаётся только в проверочном наборе. App/bundle ID и имя приложения стабильны между версиями и архитектурами. Ни установка, ни удаление, ни updater не меняют `resolveStateDirectory()`, базу, аудио и credential namespace.

### Подписание на Linux

macOS `.app` подписывается **`rcodesign`** со стабильной Developer ID identity. Инструмент поддерживает подпись вложенных Mach-O/frameworks, обращение к notarization и stapling с Linux. Сначала окончательно формируется bundle и fuses, затем подпись с Hardened Runtime и необходимыми Electron entitlements, notarization, stapling и только после них финальный ZIP и его хеш. Это документированная возможность инструмента, а не уже пройденная проверка данного приложения. Неудачная подпись или notarization не превращается в молчаливый выпуск unsigned артефакта.

Windows PE и окончательный NSIS installer подписываются **`osslsigncode`** с Authenticode и timestamp на Linux. Способ подключения реально предоставленного сертификата/токена определяется при реализации обновлений по решению OQ-013. Отдельная Ed25519-подпись описания релиза применяется ко всем платформам и не заменяет системную подпись Windows/macOS.

Private keys, пароли сертификатов и Apple API credentials берутся из защищённого хранилища Linux-сборщика; инструменты получают временный доступ с ограниченными правами. Секреты не попадают в Git, bundle, manifest, аргументы с паролями или журналы. В приложение встраиваются только открытые ключи и ожидаемая идентичность издателя. Новые ключи доверия вводятся релизом, проверенным уже доверенным ключом; автоматическое доверие ключу из сети запрещено. Необходимость recovery при утрате ключа решается явной процедурой владельца, без отключения проверки.

### Обновления и граница доверия

Updater — отдельная ответственность main, без импорта provider/persistence и без музыкальных токенов. Renderer получает только безопасные состояния и фиксированные действия; не задаёт URL, путь installer, ключ или произвольные команды. Исходный канал `stable` использует настроенный HTTPS feed; получение статических файлов и дальнейшая публикация не требуют CI и не означают автоматическую публикацию в рамках этого ADR.

Поверх `electron-updater` используется небольшая проверка **подписанного описания релиза**: detached Ed25519 signature проверяется встроенным открытым ключом над точными байтами descriptor до доверия его полям. Descriptor содержит версию, канал, ОС, архитектуру, URL, размер и SHA-256 окончательного installer/ZIP/AppImage. Поля валидируются; разрешается только более новая версия текущего канала и целевой архитектуры, HTTPS и настроенные release origins. Неподписанный `latest*.yml` самостоятельно установку не разрешает.

`autoDownload=false` и `autoInstallOnAppQuit=false`. После проверки descriptor main разрешает скачивание, а затем проверяет фактический файл по размеру и SHA-256 **того же неизменного проверенного descriptor**, сопоставляет updater version/target и отдельно проверяет системную подпись/издателя там, где они применимы. Единственный путь к `quitAndInstall()` проходит все эти проверки; отсутствие, несовпадение и ошибки ведут к отказу, без установки при обычном закрытии и без обходного auto-install. Подмена feed между запросами поэтому не даёт разрешения установить другой payload. Проверки скачанного payload и подписи descriptor требуются и для Linux AppImage.

Перед установкой пользователь подтверждает действие; application host штатно завершает/сохраняет задания через существующий shutdown-контракт. При неуспехе shutdown установка не начинается. Обновление заменяет приложение, не очищая общий stateDir, аудио, историю и credentials. SQLite-миграции выполняет новая application по ADR-014, а не installer/main.

### Отказ и восстановление

Сбой скачивания, подписи или проверки до установки оставляет работающую текущую версию. После начала установки восстановление допускается только средствами выбранного installer и при доказанной совместимости. Автоматический запуск старого клиента после forward-only миграции SQLite не обещается: более старый клиент безопасно отказывает; downgrade БД, её удаление или автоматическое восстановление backup запрещены. После неудачной миграции действует сохранённая копия и явный порядок восстановления ADR-014.

### Реализация и доказательства

- **сборка дистрибутивов:** реальные Linux-команды, staging, четыре артефакта, версии/хеши/native состав, Linux installation smoke. Если закреплённая версия инструмента не создаёт требуемый формат, фиксируется конкретное несоответствие и пересматривается решение; скрытого переноса сборки на Mac нет.
- **portable-обновления:** signing/updater, безопасный доступ к ключам, Linux-проверки в том числе отказа на неверной подписи/хеше и отсутствие обходного installer; реальная подпись зависит от OQ-013.
- **финальная платформенная приёмка:** единственная новая native приёмка Windows x64/macOS arm64/x64, установка, offline E2E, файл/History после restart, подпись/notarization и N→N+1. До неё нельзя объявлять native readiness; исходный x64/Rosetta FAIL не считается исправленным этим ADR.

## Alternatives considered

### Сборка на каждой целевой ОС и штатные Apple signing tools

Обычный путь с меньшей интеграцией, но противоречит решению владельца о единственной Linux-машине сборки; не выбран.

### Electron Forge/Packager плюс отдельные упаковщики

Поддерживает платформенные bundles, но добавляет второй слой orchestration для NSIS/AppImage/feed. Выбран единый builder и два явных Linux signing adapters.

### electron-builder v27 и встроенные подписанные манифесты

На дату решения ветка предварительная. Не приписываем её возможности стабильной v26; подпись descriptor реализуется явно. Переход на новую схему требует отдельной проверки совместимости, а не тихого обновления major.

### Только HTTPS/checksum из update feed

Не защищает от подмены самого feed. Отвергнуто: разрешение на установку связано с доверенным ключом и хешем окончательного payload.

## Consequences

Добавляются Linux build-time инструменты packaging/signing и ограниченная интеграция доверия updater. Их версии закрепляются при реализации. macOS ZIP вместо DMG упрощает Linux-only путь. Доступность certificates/Apple account не предполагается: OQ-013 остаётся открытым. Принятие ADR завершает выбор направления, но не создаёт дистрибутивы, подписанный релиз или native PASS.

## Security implications

Сохраняются REQ-005, REQ-039, REQ-038, sandbox/CSP/IPC и границы ADR-015/016. Shipping и offline E2E артефакты различаются явно. Подписи code, descriptor и хеш payload выполняют разные проверки; ни одна не отключается ради успешного обновления. Не вводятся live provider, передача пользовательских credentials updater или ключи в репозитории.

## Data / migration implications

Схема данных не меняется. Общий stateDir, SQLite WAL/backup/forward-only migrations и credential namespaces ADR-014/015 сохраняются. Installer не удаляет пользовательские данные; обновление не открывает persistence из main. Автоматический rollback данных отсутствует.

## Compatibility / operational implications

Основания выбора, проверенные 2026-10-29:

- [electron-builder: платформенная сборка и native prebuilds](https://www.electron.build/v26/docs/features/multi-platform-build/), [исходник выбора платформы](https://github.com/electron-userland/electron-builder/blob/master/packages/app-builder-lib/src/packager.ts): стандартная подпись Apple требует Mac; выбран отдельный Linux путь и macOS ZIP.
- [rcodesign: поддерживаемые возможности](https://gregoryszorc.com/docs/apple-codesign/0.29.0/), [notarization/stapling](https://gregoryszorc.com/docs/apple-codesign/0.29.0/apple_codesign_rcodesign_notarizing.html); [osslsigncode](https://github.com/mtrojnar/osslsigncode) — подпись и timestamp PE на Linux.
- [Electron updater: macOS требует подписи](https://github.com/electron/electron/blob/main/docs/api/auto-updater.md), [MacUpdater 6.8.12](https://raw.githubusercontent.com/electron-userland/electron-builder/electron-updater@6.8.12/packages/electron-updater/src/MacUpdater.ts): при отключённом auto-install передача обновления Squirrel начинается по явному install; guard обязан стоять до него.
- [Подписанные manifests в документации v27](https://www.electron.build/docs/features/signed-update-manifests/) не считаются функцией v26. Версии подтверждены npm registry tags `v26`: electron-builder 26.18.1, electron-updater 6.8.12; неизменяемые pins и tool integrity фиксируются сборщиком дистрибутивов и portable-обновлений.

Эти источники подтверждают возможности инструментов и ограничения API. Они не заменяют Linux сборки/тесты реализации и финальную native приёмку приложения.
