---
schema: 1
id: ADR-015
status: accepted
date: 2026-10-16
deciders:
  - Claude Code (STEP RUN STEP-028)
supersedes: []
superseded_by: []
requirements:
  - REQ-046
  - REQ-047
steps:
  - STEP-028
  - STEP-030
  - STEP-031
  - STEP-034
  - STEP-035
  - STEP-036
---

# ADR-015 — Модель безопасности Electron, топология процессов и desktop secure storage

## Context

[REQ-046](../requirements/REQ-046-desk-security.md) требует для BrowserWindow `contextIsolation`, `nodeIntegration = false` и `sandbox`; renderer не имеет доступа к fs, child_process, токенам, базе и provider. [REQ-047](../requirements/REQ-047-desk-secure-storage.md) требует хранить токен в системном secure storage без plaintext fallback; механизм выбирается по [OQ-010](../open-questions/OQ-010-secure-storage.md).

ADR-001 оставляет `apps/desktop` клиентом `packages/application`. Composition root application сам создаёт stores из `packages/persistence`, а ESLint boundaries запрещают apps импортировать persistence. [ADR-010](ADR-010-cli-auth-and-secure-storage.md) выбрал для CLI Device Authorization с приватной loopback-страницей provider и `@napi-rs/keyring` (service `music-downloader.cli.yandex-music`, сейчас константа в `CliCredentialStore`). ADR-010 явно не переносит этот выбор на desktop. Native canary [STEP-008](../planning/tasks/STEP-008.md) подтвердил write/read/persistence/delete на Linux (GNOME Secret Service), Windows x64 и macOS arm64.

Provider открывает системный браузер через `node:child_process` (`AuthBrowser`). [ADR-014](ADR-014-sqlite-persistence.md) использует синхронный SQLite API. `PreviewDto.artwork` передаётся как base64.

## Problem

Нужно определить:

- в каком процессе Electron выполняется application layer с provider, SQLite и credentials, и как desktop получает свои stores в границах ADR-001;
- обязательную конфигурацию окна, загрузку контента и навигацию;
- где и чем хранятся desktop credentials и что делать при недоступном хранилище.

## Decision

### Топология процессов

| Процесс | Ответственность | Доверие |
| --- | --- | --- |
| **main** | Жизненный цикл приложения и окон, IPC broker с валидацией (ADR-016), системные диалоги, уведомления, показ каталогов, открытие разрешённых внешних ссылок, запуск application host | доверенный, без provider, SQLite и credentials |
| **application host** (`utilityProcess`) | `createApplication(runtimeAdapters)`: provider, core, SQLite store (ADR-014), credential store, файловая запись, Device Authorization | доверенный, Node-capable, без окон |
| **preload** | Только `contextBridge` с typed `DesktopApi` (ADR-016) | граница |
| **renderer** | React + MUI UI | недоверенный |

Application не выполняется в main process: синхронный SQLite, запись файлов и provider I/O не должны блокировать UI и обработку окон, а падение host не должно ронять main. Main перезапускает упавший host ограниченное число раз и сообщает renderer безопасную ошибку; recovery job выполняют ADR-004/006 при новом захвате аренды. Main и host обмениваются только сериализуемыми DTO ADR-007 через `MessagePort`. Токены, credentials, challenge и signed URL не передаются ни в main, ни в renderer.

### Создание stores для desktop

- Desktop credential store и SQLite store реализуются в `packages/persistence` и создаются application composition root по умолчанию, как сейчас CLI stores. Credential store использует тот же keyring-код с параметризуемым namespace.
- `apps/desktop` передаёт в `createApplication` только нейтральный профиль клиента (`cli | desktop`) в `RuntimeAdapters`; по нему application выбирает namespace. Сами stores desktop не передаёт.
- `apps/desktop` не импортирует persistence/provider и не содержит имя service namespace (PRN-001, ADR-001 п.1).
- Node-API bindings — один binary для Node.js и Electron, поэтому не считаются runtime-специфичными реализациями в смысле ADR-001 п.2. Их работоспособность доказывают STEP-029/030.

### Конфигурация BrowserWindow и сессии

- **`webPreferences`:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`, `allowRunningInsecureContent: false`, `webviewTag: false`, `nodeIntegrationInWorker: false`, `nodeIntegrationInSubFrames: false`, `experimentalFeatures: false`, единственный preload. Конфигурация создаётся одной функцией и проверяется тестом.
- **Загрузка контента:** в production — только из упакованных ресурсов через собственную привилегированную схему (`protocol.handle`) с ограничением путей каталогом бандла, без `file://` с произвольными путями. Dev server на `localhost` разрешён только в dev-сборке.
- **CSP** отдаётся заголовком protocol handler. Фиксируются инварианты, а не полный текст политики:
  - `default-src 'none'`: всё, что не разрешено явно перечисленными ниже директивами, запрещено;
  - `frame-src 'none'` и `frame-ancestors 'none'`;
  - `script-src 'self'` без `unsafe-eval` и `unsafe-inline`;
  - никаких внешних origin ни в одной `*-src` и `connect-src`;
  - `object-src`, `base-uri`, `form-action` — `'none'`;
  - для MUI/Emotion разрешены nonce для `style-src-elem` и `style-src-attr 'unsafe-inline'`;
  - для обложек из DTO — `img-src 'self' data: blob:`;
  - ослабленная политика для dev server — только в dev-сборке.

  Тест политики проверяет effective-значение каждой fetch-директивы, а не только перечисленные.

  Обложки и медиаданные приходят из application через `DesktopApi`, а не прямыми запросами renderer к CDN.
- **Навигация:** `will-navigate`, `will-frame-navigate` и `will-redirect` за пределы app-origin запрещены; `setWindowOpenHandler` всегда возвращает `deny`. Внешние ссылки открываются в системном браузере только через метод `DesktopApi` с проверкой: `https` и host из allowlist приложения.
- **Файловые действия renderer** не принимают путь. Renderer может получать пути для отображения, но никогда не передаёт путь обратно.
  - «Показать в папке» принимает `jobId` (и при необходимости `trackKey`); путь резолвит application host из manifest. Main только показывает существующий каталог или файл в файловом менеджере (`showItemInFolder`) и никогда не открывает файл обработчиком ОС.
  - Каталог назначения загрузки и output directory по умолчанию выбираются только системным диалогом main. Main хранит выбранные пользователем каталоги в allowlist текущей сессии и отдаёт renderer непрозрачную ссылку `directoryRef`. При передаче запроса в host main подставляет путь по ссылке. Сохранённый output directory по умолчанию хранит host в настройках, и renderer ссылается на него зарезервированной ссылкой без пути.
  - Main не выполняет fs- и shell-операций по строкам из renderer. Неизвестная ссылка или путь вместо ссылки отклоняются до host. Сетевой каталог допустим только как явный выбор пользователя в системном диалоге.
- **Permissions:** `setPermissionRequestHandler` и `setPermissionCheckHandler` отклоняют все запросы (камера, микрофон, геолокация, уведомления renderer и т. д.). Системные уведомления показывает main.
- Remote debugging и DevTools отключены в production-сборке.

### Electron runtime и fuses

Используется поддерживаемая стабильная мажорная версия Electron на момент STEP-030, с exact pin; обновления безопасности — по политике поддержки Electron.

Требования к packaging (STEP-034/035):

- fuses: `RunAsNode` off, `EnableNodeOptionsEnvironmentVariable` off, `EnableNodeCliInspectArguments` off, `OnlyLoadAppFromAsar` on, `EnableEmbeddedAsarIntegrityValidation` on там, где платформа поддерживает;
- без OS app sandbox/виртуализации (Mac App Sandbox, MSIX, Flatpak/Snap), которые ломают доступ к Secret Service, Keychain или общему `stateDir` (ADR-014).

### Desktop secure storage (решение OQ-010)

Credential store desktop работает в application host и использует тот же механизм, что ADR-010: `@napi-rs/keyring` (Node-API) с нативными хранилищами ОС.

| ОС | Backend |
| --- | --- |
| Windows | Windows Credential Manager, generic credential текущего пользователя (поведение persistence — как в ADR-010) |
| macOS | Login Keychain текущего пользователя |
| Linux | Secret Service в пользовательской D-Bus session с явным `{ linux: { store: 'secret-service' } }`; поддерживается только защищённая непустым паролем default-коллекция, как в ADR-010 |

- **Namespace** — `music-downloader.desktop.yandex-music`, отдельно от CLI (`music-downloader.cli.yandex-music`). Logout в одном клиенте не разлогинивает другой. Общая авторизация CLI и desktop потребует отдельного решения владельца продукта.
- **Формат и поведение:** provider-private envelope, обработка ошибок, logout и запрет refresh/replay — как в ADR-010.
- **Device Authorization** выполняется provider в application host: приватная loopback-страница и `AuthBrowser` открывают системный браузер. Renderer получает только безопасное уведомление `AuthInteraction.notify` через события.
- **Недоступное хранилище.** При недоступном, заблокированном или повреждённом хранилище, отказе в доступе или неизвестном backend авторизация завершается безопасной ошибкой с инструкцией для пользователя (разблокировать или настроить keyring, Credential Manager, Keychain). Запрещены:
  - plaintext;
  - `settings`/SQLite;
  - файл с соседним ключом;
  - Electron `safeStorage` с backend `basic_text`;
  - kernel keyutils;
  - хранение в памяти между запусками.
- **macOS.** Доступ к Keychain-элементу связан с идентичностью подписи приложения. Неподписанные или переподписанные сборки и смена подписи после обновления могут вызвать системный запрос подтверждения или отказ доступа. Отказ ведёт к явной повторной авторизации, а не к fallback. Стабильный доступ без запросов зависит от подписи: [STEP-034](../planning/tasks/STEP-034.md), [STEP-036](../planning/tasks/STEP-036.md), [OQ-013](../open-questions/OQ-013-signing-prereq.md).
- **Доказательство.** STEP-030 доказывает на Windows x64, macOS arm64/x64 и Linux x64 загрузку binding в Electron `utilityProcess`, а также write/read, persistence после перезапуска и delete. Несовместимость блокирует backend и требует нового ADR, а не fallback.

## Alternatives considered

### Application в main process

Меньше межпроцессного обмена, но синхронный SQLite и I/O блокируют event loop main, а сбой provider или native-модуля роняет всё приложение. Отвергнуто.

### Electron `safeStorage` + зашифрованный файл

`safeStorage` доступен только в main process: credentials пришлось бы передавать между main и host. На Linux при нераспознанном окружении он шифрует фиксированным паролем (`basic_text`), а backend зависит от окружения рабочего стола. Это вводит второй механизм рядом с доказанным ADR-010 и собственный файл с ciphertext. Отвергнуто; может быть пересмотрено новым ADR, если keyring не пройдёт проверку в Electron.

### Передача stores из `apps/desktop` через `runtimeAdapters`

Требует, чтобы desktop импортировал persistence, что нарушает ADR-001 п.1 и boundary rules. Отвергнуто в пользу профиля клиента.

### Общий с CLI namespace credentials

Удобно (одна авторизация), но связывает жизненный цикл сессий двух клиентов и меняет решение ADR-010 о namespace. Не принято без решения владельца продукта.

## Consequences

- Нужен дополнительный процесс и канал main ↔ host. Зато UI не блокируется, а secrets и provider изолированы от main и renderer.
- `RuntimeAdapters` получает нейтральный профиль клиента, а `packages/persistence` — параметризуемый namespace keyring store. Эти изменения должен разрешить контракт реализующего STEP.
- Один native credential binding на CLI и desktop: платформенные условия ADR-010 (D-Bus session, защищённый keyring на Linux) распространяются на desktop.
- Desktop без подписи на macOS может требовать подтверждения доступа к Keychain.

## Security implications

Renderer — недоверенная среда: без Node, без произвольного IPC (ADR-016), без внешнего контента и навигации, без permissions и без путей во входе: каталоги выбираются только диалогом main и передаются непрозрачными ссылками. Поэтому renderer не может заставить main или host обратиться к произвольному локальному или сетевому пути (UNC, WebDAV, device namespace). Main не видит секретов. Компрометация renderer даёт только доступ к методам `DesktopApi` с валидацией входа. Защита от процесса с правами пользователя, администратора и чтения памяти host не заявляется (как в ADR-010). PRN-002: секреты не попадают в IPC, events, logs, SQLite и settings. PRN-003 не меняется.

## Data / migration implications

Новая запись desktop credentials в системном хранилище; миграции CLI-записи нет. Settings desktop хранятся в SQLite (ADR-014), не в `settings.json`.

## Compatibility / operational implications

Основания: [Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security), [utilityProcess](https://www.electronjs.org/docs/latest/api/utility-process), [safeStorage: только main process, `basic_text` на Linux](https://www.electronjs.org/docs/latest/api/safe-storage), [Electron fuses](https://www.electronjs.org/docs/latest/tutorial/fuses), [MUI и CSP](https://mui.com/material-ui/guides/content-security-policy/), основания `@napi-rs/keyring` в ADR-010. Это основания выбора, не платформенный тест. Реализация и доказательства — STEP-030; упаковка, fuses, подпись — STEP-034/035/036.
