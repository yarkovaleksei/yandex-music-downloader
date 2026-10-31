# Разработка

Документ описывает настройку рабочего окружения, устройство модулей, проверки и выпуск приложения. Границы слоёв определяет ADR-001, Yarn workspaces — ADR-008. Desktop workspace собирает main/application host через TypeScript, renderer через Vite, а sandbox preload — в один CommonJS bundle через esbuild.

## Быстрый запуск

Требования к Node.js и Yarn приведены ниже. Команды выполняются из корня репозитория:

```sh
node packages/testing/scripts/run-yarn.mjs install --immutable
node packages/testing/scripts/run-yarn.mjs run build
node packages/testing/scripts/run-yarn.mjs run desktop
```

CLI после сборки: `node apps/cli/dist/index.js --help`. Команды и параметры CLI описаны в [руководстве CLI](../apps/cli/README.md).

## Prerequisites

- Node.js `>=24.0.0 <25`: поддерживается только Node.js 24 LTS (`.nvmrc`), ADR-020. CLI не выпускается отдельно и запускается из исходников; desktop использует Node.js, встроенный в Electron.
- Corepack из состава Node.js и сетевой доступ к npm registry при первом скачивании Yarn.
- Yarn фиксируется в корневом `package.json`: `packageManager` = `yarn@4.18.1+sha512.<hash>`. Менять версию вручную не нужно: используйте Corepack.

Corepack при запуске сверяет версию и sha512-хеш архива из `packageManager`. Он не проверяет подписи Yarn (для Yarn 2 и новее подписи не проверяются), поэтому этот документ не заявляет такой защиты: гарантия ограничена хешем в `packageManager`.

## Local setup

```bash
corepack enable
yarn install --immutable
```

Если установка Node.js доступна только для чтения, глобальные shims не создаются, а используется временный каталог только для текущей сессии:

```bash
mkdir -p "$HOME/.local/corepack-bin"
corepack enable --install-directory "$HOME/.local/corepack-bin"
export PATH="$HOME/.local/corepack-bin:$PATH"
yarn install --immutable
```

Тот же Yarn без записи global shims и пользовательского кеша запускает обёртка:

```bash
node packages/testing/scripts/run-yarn.mjs install --immutable
```

`yarn.lock` — отслеживаемый generated-файл: вручную его не форматируют и не правят. При изменении зависимостей запустите `yarn install` (без `--immutable`) в корне, проверьте diff `yarn.lock` и закоммитьте его вместе с `package.json`. Внутренние зависимости всегда объявляются как `workspace:*`. Другие lockfile (`package-lock.json`) и `.npmrc` не используются.

## Development commands

Команды выполняются из корня репозитория:

```bash
yarn run lint
yarn run typecheck
yarn run format:check
yarn test
yarn run build
yarn run format
yarn run desktop
```

- `yarn run desktop` — запускает Electron-приложение; перед первым запуском выполните `yarn run build`. Desktop использует application API через typed IPC; токен хранится в отдельном системном keyring namespace.
- `yarn run lint` — два независимых прохода ESLint с `--max-warnings 0`: основной (`eslint.config.mjs`, качество кода) и архитектурный (`eslint.boundaries.config.mjs`, границы ADR-001) с `--no-inline-config`, поэтому директива в коде не снимает запрет границ.
- `yarn run typecheck` — `tsc -b` по root solution (`tsconfig.json`, project references всех пакетов) и отдельная non-composite программа `tsconfig.tests.json`, которая включает все тесты, конфигурации и tooling-файлы TypeScript.
- `yarn test` — Vitest, отдельный project на каждый workspace и project `tooling` для `eslint/**/*.test.ts`.
- `yarn run build` — `tsc -b`, затем сборка desktop preload через esbuild и renderer через Vite; результат в `dist/` каждого пакета и приложения (игнорируется Git).
- `yarn run format` / `yarn run format:check` — Prettier для `apps`, `packages`, `eslint`, корневых конфигураций, `.yarnrc.yml` и этого файла. Остальные документы не форматируются автоматически.

### Функции интерфейса

Главная показывает примеры ссылок и очистку URL; предпросмотр — доступные описание, автора, изображения и длительность коллекции. Отсутствующие сведения и изображения имеют заглушки; неполная длительность не выдаётся за полную. Предпросмотр не запускает загрузку автоматически. В «Загрузках» доступны вкладки состояний со счётчиками, названия, обложки и меню действий; очистка завершённых скрывает задания без удаления истории и аудио.

Настройки сгруппированы во вкладки «Загрузка» (папка, качество, параллельность), «Файлы», «Дополнительно» (необязательный FFmpeg и подробность журнала) и «О программе»; тема переключается в боковой панели. Журнал desktop пишется в `logs/desktop.log` внутри каталога данных Electron (`userData`); при запуске файл больше 5 МБ переименовывается в архив `desktop-<время UTC>.log`, хранятся три последних архива. В журнал попадают ошибки команд и события загрузок: «Ошибки» — треки, которые не скачались, с кодом ошибки; «Предупреждения» — треки, скачанные после повторов; «Обычный» — создание и итог задания; «Подробный» — этапы каждого трека; «Трассировка» — ход загрузки. Кнопка «Открыть папку журнала» показывает `desktop.log` в файловом менеджере, путь в renderer не передаётся. FFmpeg проверяется автоматически при открытии настроек и смене пути; предупреждение со ссылкой на установку показывается, только если он не найден. Параметры обработки и темы:

| Параметр        | По умолчанию | Действие                                                                              |
| --------------- | ------------ | ------------------------------------------------------------------------------------- |
| `writeTags`     | `true`       | Записывает текстовые теги; выключение не отключает встроенную обложку.                |
| `saveCoverFile` | `true`       | Сохраняет отдельный `cover.jpg`, когда имеется обложка.                               |
| `writeM3u8`     | `true`       | Создаёт существующий playlist `.m3u8` для коллекции.                                  |
| `theme`         | `light`      | Сохраняет светлую или тёмную тему (`light` / `dark`); переключается в боковой панели. |

Поля сохраняются в JSON настроек SQLite. Отсутствующие поля настроек и снимков заданий при чтении получают значения по умолчанию без перезаписи данных. Эффективные параметры обработки и выбранный вариант фиксируются до запуска задания; resume/retry/replay используют исходный снимок даже после изменения текущих настроек. Для старых записей без снимка replay остаётся недоступен. Встроенная обложка включена независимо от текстовых тегов и отдельного `cover.jpg`.

Диалог качества хранит черновик: «Применить» подтверждает выбор, «Отмена», Escape и щелчок вне диалога его отбрасывают. Доступны presets `best/lossless/high/normal`; точный вариант задаётся `codec/container/lossless/bitrate` и имеет приоритет над preset. Отсутствующий bitrate означает вариант без сообщённого bitrate, а не любой bitrate. Покрытие учитывает позиции коллекции и общий с resolver фильтр: MP3 в `mp3`, AAC в `m4a`, FLAC в `m4a`. Raw FLAC и aliases контейнеров не считаются поддержанными; перекодирования нет. Если точного варианта у трека нет, он получает `QUALITY_UNAVAILABLE` без тихого снижения качества; другие треки продолжают обрабатываться.

Сведения аккаунта выводятся только из безопасной provider-проекции; недостающие поля имеют явное состояние отсутствия. Форматы не выводятся из названия подписки. Уведомления различают полный успех, частичную ошибку, ошибку и отмену; системные уведомления и открытие папки остаются в main. Ручные portable-обновления находятся в «О программе»; формат и проверка обновлений описаны ниже.

Срок ожидания входа через браузер и отмену контролирует provider. После проверки аккаунта и сохранения credentials приватная loopback-страница показывает «Вход выполнен» и предлагает закрыть её и вернуться в приложение.

Для Device Authorization provider передаёт `scope=music:content music:read login:avatar`: каталог Музыки, чтение плейлистов и портрет. Логин берётся из базового ответа Яндекс ID, подписка — из музыкального account API. Документация Яндекса: [Device Authorization](https://yandex.ru/dev/id/doc/ru/codes/screen-code-oauth), [поля профиля](https://yandex.ru/dev/id/doc/ru/user-information).

### История, настройки и аккаунт

Папка открывается только по явному действию пользователя. Старое `openFolderOnComplete`, включая `true` в settings/snapshot, игнорируется; чтение не переписывает сохранённый JSON и не требует изменения DDL. Остальные параметры задания, точный вариант и replay сохраняются.

В истории строки и фильтры доступны сразу; доступность папки и обложки запрашиваются независимо. Пока идёт локальная проверка, кнопка папки недоступна с объяснением; отсутствующий или недоступный результат нельзя открыть. Main разрешает путь только по сохранённому заданию и повторно проверяет файл и каталог непосредственно перед shell. Renderer передаёт `jobId` и при необходимости `trackKey`, а не путь. Открытие папки отмечается только на своей строке и не перечитывает историю/обложки. Ошибка показывается в Snackbar внутри viewport без скачка прокрутки; replay и удаление записи перечитывают состояние.

Кнопка выбора папки имеет однострочную подпись. Параллельность вводится компактным числовым полем: допустимы целые от 1 до 8; пустое, дробное или выходящее за диапазон значение блокирует сохранение с объяснением. Выбранные каталоги/FFmpeg, черновики и подтверждённая тема сохраняются; новая параллельность применяется после перезапуска. «О программе» читает локальные `app.getVersion()` и признак `!app.isPackaged` через main: dev-сборка помечается `(dev)`, сетевой `checkUpdate` для просмотра версии не нужен. Явная проверка обновлений остаётся отдельным действием. Стандартное меню Electron скрыто в клиентском окне Linux/Windows.

Подтверждённый `hasPlus=true` отображается как активный Яндекс Плюс и без названия продукта. Другие поддержанные сведения подписки показываются только по данным provider; для неизвестного состояния выводится причина. Отсутствие общего списка форматов объясняется тем, что варианты доступны при анализе конкретного трека; Plus не обещает FLAC или иной codec.

Аватар запрашивается отдельно через необязательный `accountAvatar()`, без задержки показа аккаунта. Provider обращается к фиксированному официальному profile endpoint и avatar CDN; OAuth передаётся только profile endpoint, CDN не получает credentials, redirects отклоняются. Renderer получает только допустимые image bytes в `ArtworkDto` (JPEG/PNG/WebP, до 2 МиБ), без URL/профиля/токена. Отсутствие фото, отказ и ошибка оставляют заглушку; результаты предыдущего аккаунта после выхода/смены аккаунта отбрасываются.

Аватар использует существующий файловый cache `<stateDir>/cache`, разделённый по provider/account/schema/method: payload содержит только MIME и image bytes. В пределах configured TTL (по умолчанию 5 минут) фото можно получить после повторного открытия и нового запуска без запроса profile/CDN. После истечения TTL или очистки кеша следующий запрос обновляет фото; `runtimeAdapters.cache.ttlMs = 0` отключает cache. Загрузка аватара выполняется вне общей serial очереди metadata/auth/logout. Выход блокирует публикацию позднего изображения, но не означает обещание немедленного удаления всех прежних cache-файлов; обычная очистка cache сохраняет доменные задания и аудио.

### Локальная упаковка desktop

Упаковка выполняется только на Linux по [ADR-019](architecture-decisions/ADR-019-portable-distribution-and-updates.md). Нужны Node.js/Yarn из Prerequisites и установленные зависимости (`yarn install --immutable`). Если Wine отсутствует, скрипт автоматически собирает закреплённый Linux build image и запускает упаковку через Docker; в этом случае нужен доступный Docker daemon. Docker нужен и для чистого Linux smoke. Для извлечения и проверки дистрибутивов установите `7z`, `unzip` и `unsquashfs`. ImageMagick не требуется. При первой сборке нужен сетевой доступ для загрузки сборочных инструментов и Electron.

Из корня репозитория выполните:

```sh
node packages/testing/scripts/run-yarn.mjs run package:local
node packages/testing/scripts/run-yarn.mjs run package:verify
node packages/testing/scripts/run-yarn.mjs run package:smoke --check
```

`package:local` использует electron-builder 26.18.1 и собирает сразу четыре дистрибутива с локальной версией `0.0.0`: AppImage Linux x64, portable exe Windows x64 и отдельные `.app.zip` macOS arm64/x64. Они сохраняются в `.cache/desktop-packaging/local-0.0.0/` в каталогах `linux-x64`, `win32-x64`, `darwin-arm64`, `darwin-x64`. Сборка не подписывает и не публикует артефакты; manifest содержит `signed: false`, `published: false`, `tag: null`.

Отдельный режим `node apps/desktop/scripts/package.mjs --tag v1.2.3` берёт версию из существующего Git-тега, требует его соответствия `HEAD` и чистого рабочего дерева. Команда сама не создаёт тег, не подписывает и не публикует сборку. Локальный запуск `package:local` не требует релизного тега.

`package:verify` извлекает содержимое всех четырёх артефактов и проверяет полноту production-зависимостей, целевые архитектуры native-модулей, версию, shipping fuses, ASAR integrity и актуальность хешей исходных файлов.

`package:smoke -- --check` запускает извлечённый AppImage в новом контейнере Ubuntu 24.04 без установленных Node.js/FFmpeg, с сетью `none` и отдельными HOME/state/userData. Проверка пишет только в игнорируемый кеш. `node packages/testing/scripts/run-yarn.mjs run package:smoke` дополнительно сохраняет PNG/JSON в игнорируемом `.cache/checks/package-smoke/`.

Ограничения: извлечённый запуск не проверяет FUSE и desktop integration; Docker smoke использует `--no-sandbox`. В контейнере нет Secret Service, поэтому вход в аккаунт в этом сценарии не проверяется. Успешная Linux-проверка не заменяет нативный запуск Windows/macOS.

Для ручной проверки только Windows можно собрать отдельный локальный exe без Git-тега и публикации:

```sh
node apps/desktop/scripts/package.mjs --local-version 0.2.1 --windows-only
node apps/desktop/scripts/verify-package.mjs .cache/desktop-packaging/local-0.2.1 --windows-only
```

Результат находится в `.cache/desktop-packaging/local-0.2.1/win32-x64/`.

### Проверенные portable-обновления

В «О программе» доступны «Проверить обновления», затем «Скачать обновление» и «Открыть папку с обновлением». Проверка и скачивание выполняются только по явному действию пользователя. Main проверяет detached Ed25519-подпись точных байтов описания релиза до разбора JSON, более новую SemVer-версию без build metadata, канал, ОС/архитектуру, HTTPS и доверенные origins, включая перенаправления. При скачивании проверяются фактические размер и SHA-256; неполный `.part` удаляется, готовым становится только проверенный файл. Перед открытием папки размер и хеш проверяются повторно. Renderer не задаёт URL, путь или ключ.

Публичная конфигурация находится в `apps/desktop/packaging/update-trust.json` и при сборке включается в production ASAR; её хеш входит в manifest inputs. Конфигурация задаёт GitHub Releases текущего публичного репозитория, открытый Ed25519-ключ в PEM/SPKI, канал `stable` и точные origins `https://github.com` / `https://release-assets.githubusercontent.com`. Пакет с отключённым trust не получает конфигурацию автоматически: сборку с рабочим каналом устанавливают вручную. Это доверие задаётся сборкой, а не renderer, переменными окружения или сетевым ответом. Ключ из feed не принимается автоматически.

Ключ подписи создаётся один раз на Linux после сборки проекта, при доступном разблокированном системном Secret Service:

```sh
node packages/testing/scripts/run-yarn.mjs run build
node apps/desktop/scripts/release-update.mjs init-key
```

Команда печатает только открытый ключ для `publicKey`; повторный вызов использует существующий ключ. Закрытый Ed25519-ключ хранится через native credential store в namespace `music-downloader.release.update-signing`. Команда не принимает его файлом или аргументом и при недоступности хранилища завершается ошибкой без plaintext fallback. Закрытый ключ не копируют в репозиторий, пакет, журналы или Evidence.

Для каждой цели готовится отдельный `latest.json`. Для обычного HTTPS feed адрес проверки: `<feedBaseUrl>/<channel>/<target>/latest.json`; рядом ожидается `latest.json.sig` с 64 байтами бинарной detached-подписи. Для GitHub Releases используются плоские имена `update-stable-<target>.json` и `update-stable-<target>.json.sig` по базовому адресу `https://github.com/yarkovaleksei/yandex-music-downloader/releases/latest/download/`. Допустимые `target`: `linux-x64`, `win32-x64`, `darwin-arm64`, `darwin-x64`. Описание содержит ровно следующие поля (пример требует замены URL, размера и хеша на данные окончательного пакета):

```json
{
  "schemaVersion": 1,
  "version": "1.2.3",
  "channel": "stable",
  "target": "linux-x64",
  "url": "https://downloads.example.org/music-downloader-1.2.3.AppImage",
  "size": 123456789,
  "sha256": "0000000000000000000000000000000000000000000000000000000000000000"
}
```

`size` — целое положительное число байт до 2 147 483 648; `sha256` — 64 строчных шестнадцатеричных символа. Канал и цель должны совпадать со встроенной конфигурацией и текущим приложением; URL пакета и feed, а также каждый redirect должны оставаться на разрешённых HTTPS origins. Подписывается готовый файл, после подписи его байты не меняют:

```sh
node apps/desktop/scripts/release-update.mjs sign /путь/к/latest.json
```

Результат — `/путь/к/latest.json.sig`. HTTPS-размещение пакета, описания и подписи выполняется отдельно: команды подписи не публикуют релиз и не создают Git-теги. Подготовка рабочего комплекта GitHub Releases описана ниже. `signed: false` в packaging manifest означает отсутствие системной подписи приложения; собственная подпись descriptor создаётся отдельной командой.

После получения проверенного пакета:

1. Нажмите «Открыть папку с обновлением» и полностью закройте приложение.
2. На Windows замените exe приложения скачанным файлом; на macOS распакуйте ZIP подходящей архитектуры и замените `.app`; на Linux замените AppImage и разрешите исполнение нового файла (`chmod +x /путь/к/приложению.AppImage`): скачанный файл создаётся с приватными правами `0600`.
3. Запустите новую версию. Сохраняйте общий каталог состояния, папку аудио и системное хранилище credentials: portable означает отсутствие установщика, а не хранение SQLite или секретов рядом с executable.

Автоматическая установка, замена или запуск скачанного пакета, фоновое скачивание, electron-updater/Squirrel отсутствуют. Платные сертификаты и Apple notarization не требуются постоянно, по ADR-019. Собственная Ed25519-подпись подтверждает соответствие ключу автора, но не доверие Apple/Microsoft к издателю. Предупреждения ОС допустимы; отказ доступа к macOS Keychain может потребовать повторной авторизации без plaintext fallback. После forward-only миграции SQLite старый клиент безопасно отказывает; ручная замена не является откатом базы.

Для локальной Linux-проверки двух явно проверочных версий после сборки и проверки `0.0.0` выполните:

```sh
node apps/desktop/scripts/package.mjs --local-version 0.0.1 --linux-only
node apps/desktop/scripts/verify-package.mjs .cache/desktop-packaging/local-0.0.1 --linux-only
node apps/desktop/scripts/package-update-smoke.mjs --check
```

Обычный `package:verify` требует все четыре цели; явный каталог с `--linux-only` проверяет manifest только с Linux. Режим `--local-version` пишет в `.cache/desktop-packaging/local-0.0.1/`, не создаёт тег и не публикует пакет. Update smoke использует готовые приложения `0.0.0` и `0.0.1`, временный тестовый Ed25519-ключ и отдельный HTTPS fixture CA; production trust он не настраивает. Скачанный проверенный AppImage извлекается для ручной замены между запусками в контейнере с общим SQLite state; проверяются версии и сохранение настроек. `--check` оставляет результат в игнорируемом кеше; запуск без него сохраняет локальные отчёт и снимки в игнорируемом `.cache/checks/package-update-smoke/`. Ограничения: `--no-sandbox`, без FUSE/desktop integration, авторизации и нативного запуска Windows/macOS.

### Публикация portable-релиза через GitHub Releases

Выпуск готовят локально на Linux; CI проверяет код, но не публикует приложение. Версия берётся из аннотированного Git-тега `v<SemVer>`, а не из `0.0.0` в private workspace-пакетах. Поддержан канал stable без prerelease. Первый продуктовый выпуск — `0.2.0`.

Команда `yarn release` запускает `apps/desktop/scripts/release.mjs`. Нужны Git, авторизованный GitHub CLI `gh`, зависимости проекта, окружение существующего Linux-сборщика и доступ к Secret Service с настроенным ключом. Скрипт проверяет, что `origin` указывает на этот репозиторий; токен использует сам `gh`.

```sh
yarn release plan
yarn release plan --version 0.2.0
```

`plan` только читает Git и GitHub. Результат — JSON с выбранной версией, SHA HEAD, предыдущим опубликованным stable-релизом, коммитами и сводкой изменений. Незакоммиченное дерево допустимо для просмотра, но не входит в описываемый HEAD. Без `--version` предлагается `0.2.0` для первого выпуска, затем следующий patch; решение о minor/major принимает владелец или скилл по смыслу изменений. Учитываются опубликованные stable-релизы по SemVer, а не случайный локальный тег, draft или дата GitHub latest. У предыдущего релиза должен существовать удалённый тег, а его commit должен быть локально доступным предком HEAD; при неполной истории сначала получите историю и теги origin.

Описание готовит человек или скилл `ymd-release` в `.agents/skills/ymd-release/SKILL.md`. Сохраните текст по-русски в `.cache/releases/notes-0.2.0.md`: для первого выпуска опишите возможности продукта и установку, для следующих — изменения от предыдущего опубликованного релиза. Пользовательские изменения проверяются по коду, а не только по заголовкам коммитов. Имена пакетов в таблице установки оформляются прямыми ссылками `/releases/download/<tag>/<имя-файла>`; другие пути и документы также становятся ссылками, если есть доступный адрес. Кеш игнорируется Git, поэтому описание не мешает проверке чистого дерева.

После проверки исходников и отдельного коммита владельца:

```sh
yarn release prepare --version 0.2.0 --notes .cache/releases/notes-0.2.0.md
```

`prepare` требует чистого дерева и версии выше последнего опубликованного stable-релиза. Создаёт локальный аннотированный тег точного HEAD; существующий тег принимается только для того же commit. Затем вызывает существующие сборщик и verifier всех четырёх целей, проверяет shipping trust и создаёт подписанные описания обновлений. Коммиты, отправка ветки, удалённый тег и GitHub Release этой командой не создаются.

Комплект `.cache/desktop-packaging/<tag>/` содержит четыре portable-пакета из `manifest.json → targets`, четыре `update-stable-<target>.json` и четыре `.sig`: всего 12 публичных вложений для `linux-x64`, `win32-x64`, `darwin-arm64`, `darwin-x64`. URL пакетов привязаны к `/releases/download/<tag>/<artifact>`; latest используется приложением только для выбора описания. Подписываются точные байты описания с версией, целью, размером и SHA-256 пакета. Приватный ключ остаётся в системном хранилище.

Каждый комплект независим: его `release-candidate.json` связывает tag/revision с SHA-256 manifest, `build-inputs` сохраняет исходные входы проверенной сборки, `release.json` фиксирует описание и исходный commit, `notes.md` содержит текст выпуска. Ограничения двумя версиями N/N+1 больше нет. Служебные файлы и snapshots не публикуются. Повторный `prepare` с тем же описанием использует готовый проверенный комплект без пересборки. Если сборка оборвалась до завершения комплекта, сохраните нужные результаты и удалите только незавершённый каталог этой версии перед повтором; скрипт сам файлы не затирает.

Когда согласована публикация, исходный commit должен быть отдельно отправлен в `main` на GitHub:

```sh
yarn release publish --version 0.2.0
```

`publish` требует чистого дерева и совпадения HEAD с удалённой main. Исходный commit готового комплекта закреплён локальным тегом и должен находиться в истории main. Команда проверяет manifest, локальные подписи и байты комплекта, затем отправляет только его тег. Создаёт draft через `gh release create --verify-tag --draft --notes-file`, загружает недостающие вложения без `--clobber` и сверяет размеры и SHA-256 всех 12 файлов с полями `size` и `digest` из GitHub API. Только полный совпадающий комплект публикуется как latest. Чужое описание, другой commit, лишние или повреждённые вложения останавливают выпуск. Более новый stable-релиз не понижается до старого.

После публикации скрипт повторно получает метаданные всех 12 вложений через GitHub API: проверяет состав, состояние `uploaded`, версионные URL, размер и `digest` вида `sha256:<хэш>`. Вложения обратно не скачиваются. Отсутствующий или несовпадающий хэш останавливает проверку. Результат сохраняется в `public-release.json`: `schema:1`, tag/revision, `verification:"github-api-sha256"` и список `{name,url,size,sha256}`. Сборочный manifest остаётся неизменным с `signed:false` (нет системной подписи приложения) и `published:false` (сборщик ничего не публикует).

После сетевого сбоя повторите `publish` для той же версии: совпадающие загруженные файлы сохраняются, недостающие догружаются. Пустое вложение draft со статусом `starter` удаляется и загружается заново; готовые файлы автоматически не заменяются. Для опубликованного релиза команда повторяет проверку метаданных без изменения вложений. Изменение описания после `prepare` отклоняется — согласуйте текст до подготовки.

Низкоуровневые команды сохраняются для отдельной диагностики:

```sh
node apps/desktop/scripts/release-update.mjs prepare-release v0.2.0
node apps/desktop/scripts/release-update.mjs verify-release v0.2.0
```

Низкоуровневый `prepare-release` требует уже существующего точного тега и сам его не создаёт. `verify-release <tag>` проверяет конкретный комплект; без тега — все завершённые каталоги версий. Исторические комплекты проверяются по своим сохранённым `build-inputs`, а текущий HEAD — по актуальным исходникам. Старый общий `.cache/desktop-packaging/release-candidate.json` не используется.

Проверки релизной механики запускаются после `yarn build` командой `yarn test:release`. Они используют временный Git origin, тестовый Ed25519-ключ, небольшие пакеты и подменённый GitHub: настоящий релиз не создаётся. Проверяются первый выпуск, локальная подготовка, три последовательные версии, продолжение прерванной загрузки, несовпадение байтов и повторная проверка опубликованного релиза. Эти проверки не заменяют ручной сценарий обновления через UI и нативную проверку запуска Windows/macOS.

### Проверка provider на реальном API

Отдельный ручной suite проверяет публичный контракт Yandex provider. После `yarn install --immutable` и `yarn run build` задайте `PROVIDER_TEST_TOKEN` только в окружении текущего процесса и выполните `yarn run test:provider`. Имя script `test:provider` совместимо с npm; отдельная npm-установка для этого не требуется. Значение токена не записывайте в команды, файлы, fixtures или evidence.

Без токена или с пустым токеном команда печатает `PROVIDER_TEST: SKIP TOKEN_MISSING`, завершается с кодом 0 и не загружает provider и не обращается к сети. С токеном она проверяет account, track, album, собственный playlist и audio variants; любая ошибка конфигурации или контракта завершается с ненулевым кодом и безопасными `stage` и `code`. По завершении provider очищает только test-only credentials в памяти.

По умолчанию используются track `2224197`, album `221173` и playlist `users/<account>/playlists/1000`. Для разрешённых аккаунту ресурсов можно задать не секретные `PROVIDER_TEST_TRACK_ID`, `PROVIDER_TEST_ALBUM_ID` и `PROVIDER_TEST_PLAYLIST_ID`; допустимы числовые ID track/album и UUID или `users/<encoded-owner>/playlists/<number>` для playlist. `yarn test` остаётся offline, не требует токена и не запускает этот suite; PR CI также его не запускает.

## Workspace

Workspace-пакеты (все `private`, ESM): `@music-downloader/shared`, `@music-downloader/core-downloader`, `@music-downloader/core-planner`, `@music-downloader/core-queue`, `@music-downloader/core-retry`, `@music-downloader/core-manifest`, `@music-downloader/core-filesystem`, `@music-downloader/core-validation`, `@music-downloader/provider-yandex-music`, `@music-downloader/metadata`, `@music-downloader/persistence`, `@music-downloader/application`, `@music-downloader/logging`, `@music-downloader/testing`, `@music-downloader/cli`, `@music-downloader/desktop`. Всего 16; каталоги — `packages/shared`, `packages/core/*`, `packages/providers/yandex-music`, `packages/metadata`, `packages/persistence`, `packages/application`, `packages/logging`, `packages/testing`, `apps/cli`, `apps/desktop`.

### Foundation и provider

`shared` экспортирует metadata union `Track` (`available`/`unavailable`/`unknown`), обязательные `title`/`artists` для доступного трека, необязательный `genre` и сохранение позиции/повторов в коллекциях, а также schema `1` для `JobEvent` и `CommandResult` ([контракт metadata](../packages/shared/src/domain.ts), [события](../packages/shared/src/events.ts)).

`@music-downloader/logging` выводит JSON в stderr на уровне `info` по умолчанию; дочерний logger переносит `jobId` и `correlationId`. Redactor очищает известные или зарегистрированные поля и значения, включая query URL, но не ищет неизвестные секреты ([logger](../packages/logging/src/logger.ts), [redactor](../packages/logging/src/redactor.ts)).

`CliCredentialStore` хранит единственную CLI credential текущего пользователя через `@napi-rs/keyring`; Linux принудительно выбирает Secret Service, а plaintext fallback отсутствует ([реализация](../packages/persistence/src/cli-credential-store.ts)).

`@music-downloader/provider-yandex-music` реализует URL resolution, Device Authorization, metadata track/album/playlist, artwork, variants и открытие audio stream; текущий `PROVIDER_SCHEMA_VERSION` — `1.1.0` ([экспорт](../packages/providers/yandex-music/src/index.ts)). Вариант допускается только при явном `preview=false`; preview/unknown исключаются. Универсальные TTL signed URL и Range support не гарантируются.

### Headless-компоненты

`@music-downloader/metadata` экспортирует `createMetadataWriter()` с явным container `mp3 | mp4`; buffer API `taglib-wasm` сверяет формат bytes до изменения `.part`, пишет теги и полученную от provider обложку без сети и subprocess ([writer](../packages/metadata/src/index.ts), [ADR-012](architecture-decisions/ADR-012-audio-metadata-library.md)). Album берётся из исходного album трека, артисты соединяются в исходном порядке через `; `, отсутствующие optional теги не заменяются пустыми строками. Writer допускает `albumArtist`, но штатный mapping application не выдумывает его из отсутствующих shared-данных ([composition root](../packages/application/src/composition-root.ts)).

`@music-downloader/core-validation` экспортирует `createAudioValidator()` / `validateLocalAudio()`: непустой файл, завершение и размер потока при переданных stream-признаках, container/codec и длительность через `music-metadata`; допуск — большее из 1000 мс и 1% ожидаемой длительности ([validator](../packages/core/validation/src/index.ts)). Базовая validation не запускает внешний decoder. `validateWithFfmpeg()` — отдельная opt-in проверка с явным executable. Baseline без обязательного FFmpeg/ffprobe, автоматического скачивания и bundling принят [ADR-013](architecture-decisions/ADR-013-optional-ffmpeg.md).

Application composition root создаёт default SQLite stores и `CliCredentialStore`, provider, metadata writer и файловый TTL cache ([реализация](../packages/application/src/composition-root.ts)). `CachedProvider` кэширует track/album/playlist metadata и artwork с ключом по provider, текущему account, schema version, методу и аргументам; без account cache не используется. Audio variants и stream всегда запрашиваются у provider. TTL по умолчанию 5 минут, `runtimeAdapters.cache.ttlMs = 0` отключает cache; для `providerOverride` cache требует явного provider/schema namespace. `clearApplicationCache()` удаляет только `<stateDir>/cache`, не manifest и аудиофайлы ([decorator](../packages/application/src/cached-provider.ts), [очистка](../packages/application/src/cache.ts)). CLI entrypoint передаёт выполнение в `runCli`, который использует application API ([entrypoint](../apps/cli/src/index.ts), [runner](../apps/cli/src/runner.ts)); Yandex API остаётся внутри provider.

Каждый пакет экспортирует `src/index.ts` под условием `@music-downloader/source` и `dist/index.js` по умолчанию. TypeScript (`customConditions`) и Vitest (`resolve`/`ssr` conditions) используют условие `source`, поэтому тесты и typecheck не зависят от предварительной сборки `dist`.

## Границы зависимостей

Единый источник таблицы — `eslint/boundaries.config.mjs`; исполняет её локальный плагин `eslint/boundaries-plugin.mjs` (правила `boundaries/dependency`, `boundaries/external`, `boundaries/bypass`). Проверяются все `ts/tsx/mts/cts/js/mjs/cjs`: статические и динамические импорты, `require`, `import x = require()`, `import('x').T`, re-export, относительные и deep-импорты в другие пакеты. Вычисляемые specifier-ы и `createRequire` запрещены целиком (fail-closed), будущие пакеты закрыты по умолчанию.

Разбор specifier-ов fail-closed: относительный путь, ведущий в `node_modules`, отображается на имя пакета (сегмент после последнего `node_modules/`) и проходит те же проверки workspace/external (Yandex SDK, запрещённые модули, чистота `shared`); относительный путь за пределы корня репозитория или всех workspace-пакетов, абсолютные пути, URL-схемы (`file:`, `data:`, `http:`, `https:` и любые другие, кроме `node:`), `#`-imports, относительные specifier-ы с `?`, `#` или `%` (Node отбрасывает query/fragment и декодирует `%2e`, поэтому их нельзя классифицировать как обычный путь), обратные слеши и `..` внутри «голого» specifier запрещены правилом `boundaries/bypass`. Также запрещены `require` не в форме прямого вызова (`const r = require`), `module.require`, любые `createRequire` (включая деструктурирование и `m['createRequire']`). В `packages/shared` запрещены и ambient-объявления I/O-имён (`declare const|let|var`, `declare function|class|enum|namespace|module`, в том числе внутри `declare global`), поэтому `declare const process` обход не даёт.

Обязательства ADR/PRN:

| Источник                                             | Разрешено                                                                                                                                                                                                                                     |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/*` (ADR-001 п.1)                               | `application`; `shared` только type-only (`import type`/`export type`)                                                                                                                                                                        |
| `application` (п.2)                                  | `shared`, `core/*`, provider, `metadata`, `persistence`, `logging`; без `electron` и прямого импорта native bindings; default SQLite/secure stores создаёт application через `persistence` (ADR-014/015), `runtimeAdapters` допускают подмену |
| `core/*` (п.3)                                       | `shared`; `filesystem`, `retry`, `manifest`, `validation` не зависят от `downloader` и `queue`; без `electron` и `react`                                                                                                                      |
| provider, `metadata`, `persistence`, `logging` (п.4) | только `shared`, без `core/*` и друг друга                                                                                                                                                                                                    |
| `shared` (п.5)                                       | ничего: без Node built-ins (с `node:` и без), сторонних зависимостей и I/O-глобалов (`process`, `fetch`, `window`, `indexedDB`, `globalThis`/`self` и т. п.)                                                                                  |
| `testing` (п.6)                                      | только `shared`                                                                                                                                                                                                                               |
| `@dvxch/yandex-music` (REQ-005)                      | только `packages/providers/yandex-music`, любые src/test-файлы и subpaths                                                                                                                                                                     |

Дополнительные ограничения конфигурации: `core/planner` не зависит от `downloader` и `queue`; в `core` запрещены также `react-dom`, `@mui/*` и native-модули (`better-sqlite3`, `sqlite3`, `keytar`, `@napi-rs/keyring`, `electron-store`); в `application` запрещены `react`, `react-dom`, `@mui/*`; `testing` доступен только тестовым файлам `packages/**` кроме `shared`, а `apps/**` (включая их тесты) его не получают. Неизвестный native-модуль в `core`/`application` остаётся документированным остаточным риском: список запрещённых модулей — явный.

Тестовыми считаются файлы `*.test.*`, `*.spec.*` и каталоги `test`, `tests`, `__tests__`, `e2e`, `fixtures` — определение одно (`eslint/boundaries.config.mjs`), из него развёрнуты tsconfig-списки, а `eslint/consistency.test.ts` проверяет их согласованность.

`packages/shared` собирается с `lib: ES2023` без DOM и `types: []`. Нужные чистые web-API (`AbortController`/`AbortSignal`, `URL`/`URLSearchParams`, `TextEncoder`/`TextDecoder`, `ReadableStream`) описаны точечными ambient-типами в `packages/shared/src/web-platform.d.ts`; новые I/O-глобалы туда не добавляются.

## Качество кода

Основной проход ESLint: `typescript-eslint` recommended, `no-explicit-any`, `ban-ts-comment` (с описанием), `consistent-type-imports`, `no-import-type-side-effects`, `reportUnusedDisableDirectives`; директивы допускаются только как `eslint-disable-next-line` с описанием после `--`. Для production-файлов `packages/**/src` и `apps/*/src` (кроме тестовых globs) включены type-aware `no-unsafe-*` правила. Обоснованный `any`:

```ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- причина
```

Boundary-проход директивы не принимает вообще. ESLint и Prettier игнорируют `.cache/**`, `.yarn/**`, `dist`, `coverage`, `node_modules`.

## Testing

Тесты лежат рядом с кодом (`src/*.test.ts`): smoke-тесты проверяют каркасы пакетов, а тесты `shared` и `testing` — доменные ошибки, контракт `MusicProvider` и mock provider. Реализованные logger, native store и provider покрыты offline-тестами ([logger](../packages/logging/src/logger.test.ts), [store](../packages/persistence/src/cli-credential-store.test.ts), [provider](../packages/providers/yandex-music/src/yandex-music-auth.test.ts)). `eslint/*.test.ts` проверяют toolchain: границы (`boundaries.test.ts`, независимый oracle по ADR-001), strict-контракт (`strict.test.ts`), качество (`quality.test.ts`), согласованность конфигураций (`consistency.test.ts`).

Текущие offline-тесты проверяют readback Unicode-тегов и artwork на синтетических MP3, MP4/AAC и MP4/FLAC ([metadata](../packages/metadata/src/index.test.ts)), TTL, смену account/schema, чтение cache после restart и прямое делегирование variants/stream ([cache integration](../packages/application/src/cache.integration.test.ts)). [Baseline integration](../packages/application/src/baseline-no-subprocess.integration.test.ts) завершает загрузку с default production validator при запрете внешнего decoder; тест разрешает только отдельные process-identity probes и не доказывает отсутствие любых subprocess во всём приложении. [CLI crash/resume integration](../apps/cli/src/headless.integration.test.ts) использует новый процесс и реальный SQLite store с offline provider. Эти проверки не заменяют real API и native platform evidence.

Electron E2E запускается отдельно от unit/integration-тестов. Из корня репозитория на Linux с установленными workspace dependencies:

```sh
npm --prefix apps/desktop/e2e ci --ignore-scripts --workspaces=false
node packages/testing/scripts/run-yarn.mjs run build
node apps/desktop/e2e/run.mjs
```

Изолированный package закрепляет Playwright и использует workspace Electron; runner зависимости не скачивает. Linux требует графического дисплея и системных библиотек Electron; команды подготовки headless Linux и нативного запуска Windows/macOS приведены в [инструкции E2E](../apps/desktop/e2e/README.md). Сценарий проходит предпросмотр URL → явный старт → пауза → продолжение → завершение, проверяет непустой файл, тот же job в History и сохранение результата после штатного закрытия и нового запуска Electron с реальным SQLite. Renderer, IPC, utilityProcess, application, stores и обработка аудио настоящие; provider, каталоги состояния и ответ диалога выбора папки тестовые. Bootstrap сохраняет два automation switches для Playwright; это ограничивает доказательство и не проверяет удаление debugging endpoint в shipping entrypoint. Пользовательские данные, credentials и live provider не используются.

## Проверка Windows и macOS

На Windows x64 и macOS arm64/x64 проверяются готовые Linux-сборки: portable-запуск без установщика, офлайновый E2E с файлом и историей после restart, собственная подпись descriptor и ручное обновление N → N+1. В отчётах фиксируются build ID, revision, хеши, ОС/CPU/runtime/Rosetta. Результат относится только к проверенным артефактам.

### Подготовка и запуск финальных наборов

Наборы готовит Linux-команда:

```sh
node apps/desktop/scripts/final-kit.mjs
```

Она сверяет inputs и portable-пакеты локальных версий `0.0.0` и `0.0.1`; отсутствующая или устаревшая версия пересобирается существующим Linux packaging. Результат находится в `.cache/desktop-final-check/`: три `music-downloader-final-<target>-<buildId>.zip` и общий `manifest.json` с SHA-256. `revision` относится к подготовке набора; `packagingGitHeads` сохраняет исходные revision переиспользованных portable-сборок, соответствие текущему коду проверяется по inputs. Команды `node apps/desktop/scripts/final-kit.mjs --check` и `--verify` проверяют fixture production PortableUpdates и готовые архивы соответственно. Они не подтверждают работу Windows/macOS.

Каждый ZIP содержит portable N/N+1, отдельный stock Electron и Node нужной архитектуры, production dependencies и Linux-built E2E host. TypeScript/Vite/esbuild на целевой ОС не запускаются и в набор не включаются. Подпись fixture создаётся временным отдельным Ed25519-ключом на Linux; в набор попадают только public key и подпись. Offline transport передаёт локальные байты production PortableUpdates с отдельным HTTPS origin `https://final-kit.invalid`. Это проверка service и подписи, а не production feed, доверие Apple/Microsoft или реальная сеть.

1. Сверьте SHA-256 полученного ZIP с общим manifest, распакуйте на локальный диск в новую папку. Node.js/FFmpeg, компилятор, сеть и авторизация не требуются. При блокировке macOS неизвестного издателя явно разрешите запуск в настройках безопасности. Для x64 на Apple Silicon нужна Rosetta; отказ запуска встроенного Node сохраните из терминала.
2. Запустите `run-before.cmd` на Windows или `run-before.command` на Mac. Скрипт отдельно запускает настоящее shipping N, затем полный offline UI E2E с настоящими IPC/host/SQLite, итоговым MP3 и History после restart. Проверяются production download и отказ повреждённых подписи/размера/хеша. Успешный первый этап заканчивается `AWAITING_MANUAL_REPLACEMENT`, native приёмка пока `PENDING`.
3. Закройте приложение. **Вручную** удалите каталог `current`, создайте его заново и распакуйте в него ZIP из `reports/download/valid/`. На Windows вместо распаковки exe скопируйте в `current` содержимое `shipping-n-plus-1`: это приложение из того же проверенного пакета. Не удаляйте `isolated-home`, `reports` и временный E2E output: это общий stateDir и проверочный аудиофайл. Скрипт не заменяет и не запускает скачанный пакет автоматически.
4. Только после замены запустите `run-after.cmd` или `run-after.command`. Он сверяет `current` с эталонными N+1 байтами, запускает shipping N+1 и проверяет версию, UI, настройки, точные сохранённые строки jobs/history_hidden/job_settings и SHA-256 аудиофайла. Не запускайте старый клиент после forward-only миграции.
5. Сохраните весь каталог `reports`, включая `before.json`, `after.json`, E2E result, Electron main/renderer/preload/load/crash журналы, stderr и screenshot. При ошибке сохраняется FAIL; если shipping N отказал до первого E2E, runner выполняет один отдельный diagnostic E2E и сохраняет его raw результат, не снимая исходный FAIL. Для повтора распакуйте ZIP в другую папку, сохранив старые результаты.

Скрипты запускают только встроенные runtimes по абсолютным путям. Raw `externalTools` сохраняет поиск внешних Node.js/FFmpeg в PATH; `externalTools` и `cleanEnvironment` — справочные метаданные. Приёмка Windows и macOS требует работы без необходимости устанавливать системные Node.js/FFmpeg, с использованием встроенных runtime по абсолютным путям. Наличие системных инструментов не блокирует PASS. Каталог `isolated-home` отделяет проверочные данные от обычного профиля; shipping N/N+1 и E2E используют один stateDir. Stock Electron с Playwright сохраняет automation switches только в тестовом bootstrap; его успех не подменяет отдельный запуск shipping entrypoint.

## Оглавления требований, архитектурных решений и открытых вопросов

Источники данных — отдельные документы в `docs/requirements/`, `docs/architecture-decisions/` и `docs/open-questions/`: название берётся из заголовка, приоритет REQ, статусы ADR/OQ и связи замещения ADR `supersedes`/`superseded_by` — из frontmatter. Проекции не содержат самостоятельных требований или решений.

После изменения документов выполните из корня репозитория:

```sh
node scripts/docs/generate-req.mjs
node scripts/docs/generate-adr.mjs
node scripts/docs/generate-oq.mjs
```

Те же команды доступны как `yarn run docs:req`, `yarn run docs:adr`, `yarn run docs:oq` и общая `yarn run docs:generate`. Скрипты используют только встроенные модули Node.js, не требуют установки зависимостей и не запускают тесты или сборку. Пути определяются относительно самих скриптов, поэтому прямой запуск по абсолютному пути работает из любого каталога.

REQ-скрипт обновляет `docs/requirements/README.md` целиком, OQ-скрипт — `docs/open-questions/README.md` целиком. ADR-скрипт обновляет только раздел оглавления в `docs/architecture-decisions/README.md`, сохраняя правила и остальные разделы. Порядок определяется ID; названия в оглавлении совпадают с заголовками документов. Несовпадающий ID, повторный номер, отсутствующее обязательное поле или отсутствующий ADR замещения останавливают генерацию соответствующей проекции до записи файла.

## Проверка toolchain

Скрипты в `packages/testing/scripts/` проверяют окружение разработки без сторонних зависимостей:

- `run-yarn.mjs` — запуск `corepack yarn` с проверкой диапазона Node.js и Corepack-кешем в `.cache/corepack` рабочей копии;
- `verify-toolchain.mjs` — Node, `packageManager` (sha512), `.yarnrc.yml`, отсутствие npm-артефактов, фактический Yarn;
- `verify-workspace.mjs` — чистая копия для Node.js 24: `corepack enable --install-directory <tmp-bin>`, immutable install, lint/test/typecheck/format:check/build, негативные boundary-проверки, mismatch `yarn.lock` и недоступный workspace;
- `verify-workspace-manual.sh` — обёртка для ручного запуска.

Требования и ограничения: нужен `nvm` с уже установленным Node.js 24 (`nvm install` скрипты не вызывают; при отсутствии версии результат FAIL с причиной) и доступ к npm registry.

## Environment / configuration

`.yarnrc.yml`: `nodeLinker: node-modules`; `enableGlobalCache`, `enableMirror`, `enableTelemetry` выключены; `cacheFolder: .yarn/cache`, `globalFolder: .cache/yarn/global` — всё состояние Yarn внутри рабочей копии и в `.gitignore`. Пакеты scope `@music-downloader` привязаны к `https://registry.invalid/`: отсутствующий workspace не резолвится через публичный registry (обязательство ADR-008). `supportedArchitectures` перечисляет Linux/macOS/Windows, x64/arm64, glibc/musl, чтобы `yarn.lock` содержал platform-specific optional dependencies.

## Database / migrations

Application composition root по умолчанию создаёт `SqliteManifestStore` для CLI и desktop в общей базе `<stateDir>/state.sqlite3` ([composition root](../packages/application/src/composition-root.ts), [store](../packages/persistence/src/sqlite-manifest-store.ts), [ADR-014](architecture-decisions/ADR-014-sqlite-persistence.md)). Реализованы forward-only миграции N → N+1 с резервной копией и идемпотентный импорт файловых manifest без удаления исходников; база новее поддерживаемой отклоняется с `STATE_SCHEMA_UNSUPPORTED` и не изменяется. `FileManifestStore` остаётся источником импорта и contract-тестов. Native `CliCredentialStore` хранит секреты в системном keyring, а не в SQLite; собственных миграций базы данных ему не требуется.

## CI/CD

CI приложения используется для дополнительных проверок только на Linux: lint, typecheck, format:check, unit tests на Node.js 24. Windows/macOS runners, интеграционные сценарии, Electron E2E и build в CI приложения не запускаются. CI не запускается, если изменились только файлы вне проверок: документация в `docs` и корневые `.md`, изображения, лицензия, инструкции агентов и лендинг `www`; `docs/development.md`, `docs/architecture.md`, REQ-040 и `docs/brand/icon.png` читают тесты, поэтому их изменение запускает CI. Ожидание или отказ CI не блокирует локальную приёмку.

Лендинг `www` — статическая страница без сборки. Workflow `Pages` публикует каталог как есть на GitHub Pages (`https://yarkovaleksei.github.io/yandex-music-downloader/`) при push в main с изменениями в `www`; его можно запустить и вручную. Номер версии страница не хранит: ссылки на пакеты, размер и дату выпуска она берёт из GitHub API последнего релиза, а без ответа API ведёт на страницу релизов.

Перед слиянием выполняются локально:

```sh
node packages/testing/scripts/run-yarn.mjs install --immutable
node packages/testing/scripts/run-yarn.mjs run lint
node packages/testing/scripts/run-yarn.mjs run typecheck
node packages/testing/scripts/run-yarn.mjs run format:check
node packages/testing/scripts/run-yarn.mjs test
node packages/testing/scripts/run-yarn.mjs run build
```

Desktop дополнительно проходит Electron E2E по инструкции Testing. Сборка приложения и всех артефактов выполняется только на Linux. На Windows x64 и macOS arm64/x64 запускаются готовые собранные на Linux приложения и заранее собранный E2E host, без TypeScript/Vite/esbuild и пересборки. Платформенные проверки фиксируют revision, ОС, архитектуру, команды и результаты. Локальный Linux результат не заменяет Windows/macOS. Промежуточные проверки разработки выполняются на Linux. Поддерживаемый Node.js 24, Yarn и архитектурные границы сохраняются.

Сборка portable-дистрибутивов и проверки собственной подписи descriptor/ручного обновления выполняются локально. Платная системная подпись и notarization не требуются по ADR-019; собственный приватный ключ остаётся в защищённом хранилище ОС Linux-сборщика. Live-тесты provider запускаются только вручную с явной настройкой, отдельно от offline suite; токены не попадают в репозиторий и Evidence.

## Git и CI

Перед слиянием выполните применимые локальные проверки, перечисленные выше, и проверьте состав изменений. Linux CI используется как дополнительная обратная связь.
