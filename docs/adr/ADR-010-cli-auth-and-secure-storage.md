---
schema: 1
id: ADR-010
status: accepted
date: 2026-10-08
deciders:
  - Codex (STEP RUN STEP-006)
supersedes: []
superseded_by: []
requirements:
  - REQ-002
  - REQ-056
steps:
  - STEP-006
  - STEP-008
  - STEP-018
  - STEP-019
  - STEP-025
  - STEP-041
---

# ADR-010 — Авторизация CLI и системное хранилище credentials

## Context

[REQ-002](../requirements/REQ-002-auth-token-storage.md) запрещает plaintext credentials, а ADR-001/002 оставляют секреты внутри provider и доверенного store. [STEP-005: авторизация](../research/yandex-api-spike.md#авторизация) подтверждает Device Authorization и account на одном аккаунте. Refresh на авторизованном Client отказал с 401 при работавшем исходном токене; причина неизвестна. Наличие refreshToken и заявленный expiresIn не являются доказательством рабочего refresh или наблюдавшегося срока.

## Problem

Нужно выбрать CLI flow, конкретный защищённый backend и ownership без передачи токена через application API, расширения чужих STEP и plaintext fallback. Действующие порты — `authenticate(): Promise<Account>`, `AuthInteraction.notify(message)` и `CredentialStore.read/write(string)/clear`.

## Decision

### Flow и приватный challenge

CLI использует только Device Authorization. Provider получает device challenge, проверяет исходный ответ по ADR-009 и открывает временную приватную loopback-страницу в системном браузере с user code и официальной verification URI. Это выбранный CLI механизм, уже применённый в research; production-версия принадлежит STEP-008. На странице — только краткоживущий user code и ссылка, без access/refresh/device token. Пароль вводится только на сайте Яндекса, приложение его не запрашивает.

Browser launcher/временная страница находятся внутри provider; `AuthInteraction.notify` передаёт только безопасное сообщение «Подтвердите авторизацию в открывшемся браузере». Challenge, URI с user code и loopback URL не идут через `notify`, application DTO/events, stdout/NDJSON или логи. Проверяемый lifetime ограничивает жизнь страницы и polling; завершение/ошибка/отмена закрывают страницу/сервер и отбрасывают challenge. Выданная verification URI должна быть HTTPS официального OAuth flow (в исследовании hostname `ya.ru`); loopback слушает только `127.0.0.1`, страница выдаётся по непредсказуемому пути без внешних ресурсов, кеширования и передачи Referer. Это требования будущей реализации, а не доказательство безопасности research server.

Provider использует отдельный неавторизованный OAuth Client и авторизованный API Client; смена `client.token` не считается обновлением transport Authorization (ограничение `0.3.0`). Provider управляет polling с серверным interval/deadline, прекращает его при отказе/timeout; `authorization_pending` продолжает flow, slow_down увеличивает interval, другие auth отказы завершают flow. Отмена возможна через приватную страницу до завершения flow и прекращение процесса CLI; публичный `authenticate` не получает новый signal/параметры. Отмена не пишет credentials и не объявляет auth успешным.

После получения credentials provider проверяет account, сохраняет запись через store и возвращает только shared `Account`. Ошибка store не превращается в успешный auth с несохранённым токеном. До записи новая авторизация не уничтожает прежнюю сохранённую запись; после успешной записи она заменяется. Повреждённая запись не используется и не перезаписывается автоматически; восстановление — явные logout/auth.

### Backend CLI

Выбрано нативное системное хранилище через `@napi-rs/keyring` (API ветки 2.1 с явным выбором Linux backend; точная dependency закрепляется STEP-008). Credentials передаются через native binding в памяти, без командной строки внешних процессов и без собственного token-файла.

| ОС | Backend и граница |
| --- | --- |
| Windows | Windows Credential Manager, generic credential текущего пользователя, default `Enterprise` persistence выбранного binding. Доступ через token текущей logon session; это пользовательский store, не общее machine-хранилище |
| macOS | Login Keychain текущего пользователя через Security.framework; ключи и защита принадлежат ОС. Заблокированный Keychain требует системного подтверждения либо возвращает отказ |
| Linux | Secret Service в пользовательской D-Bus session, защищённая постоянная default-коллекция GNOME Keyring, в которую binding создаёт запись; явно `{ linux: { store: 'secret-service' } }`. Автоматический fallback binding на in-memory keyutils запрещён |

Service namespace — `music-downloader.cli.yandex-music`, единственная запись для текущего пользователя приложения. Идентификатор записи/label не содержит токенов. CLI не создаёт собственный шифровальный ключ: шифрование persistent data и защита master key принадлежат ОС/настроенному keyring. Наличие реализации Secret Service само по себе не доказывает шифрование/контроль доступа: спецификация этого не гарантирует. Поддержанная конфигурация Linux требует защитить именно используемую default-коллекцию GNOME Keyring непустым master password и проверить эту предпосылку при подготовке окружения; наличие другой защищённой коллекции недостаточно; произвольный D-Bus service/незащищённый keyring не объявляется поддержанным. Платформенные read/write/delete и persistence после перезапуска ещё проверяются STEP-008; обнаруженная несовместимость блокирует соответствующий backend, а не включает fallback.

Windows binding 2.1 не предоставляет настройки persistence: используемый windows-native-keyring-store 1.0.0 по умолчанию выбирает Enterprise. По политике Windows-профиля запись может переноситься между компьютерами того же пользователя; отсутствие такого OS-managed roaming не гарантируется. Приложение собственной облачной синхронизации не создаёт. Выбор secure OS store/current-user соответствует REQ-002, но не даёт отдельной защиты от резервного копирования/roaming профиля ОС; обещание LocalMachine-only этим ADR не принимается.

Интерактивный CLI допускает системное разблокирование store; неинтерактивный использует только уже доступный store в той же пользовательской session. Нет session/store, store locked, отказ доступа, неизвестный backend или повреждение — безопасная ошибка, без plaintext, kernel keyutils, encrypted-file fallback с соседним ключом и без временного сохранения credentials. Свежий auth требует браузера и store; headless auth без браузера не заявляется. Неинтерактивная загрузка возможна с ранее сохранённой действительной записью и доступным store, это ещё не runtime proof.

### Пакеты и injection

Реализация `CredentialStore` принадлежит `packages/persistence` (разрешено Scope STEP-008 через этот ADR) и зависит от shared и native keyring, без зависимости на provider/core. Этот store только хранит непрозрачную строку; Yandex credentials JSON разбирает и валидирует provider. Application composition root STEP-018 создаёт CLI store по умолчанию и передаёт его Yandex provider как constructor dependency вместе с `AuthInteraction`; provider не импортирует persistence. CLI STEP-019 вызывает application API и не импортирует concrete store/provider. Desktop runtimeAdapters/secure storage/IPC и OQ-010 остаются STEP-028/030; выбор этого CLI backend на них не переносится.

Shared-порты сохраняются без изменений: `read(): Promise<string|null>`, `write(string): Promise<void>`, `clear(): Promise<void>`, `notify(message)` и `authenticate(): Promise<Account>`. Расширение AuthInteraction или application DTO для challenge не требуется. Дополнительный host-only diagnostics hook composition root относится к STEP-018/025, а не к application auth API. STEP-008 может минимально дополнить только store-интерфейс при подтверждённой необходимости; этот ADR такой правки не требует.

### Формат, ошибки, logout и doctor

Provider-private строка содержит JSON envelope: `schemaVersion: 1`, `accessToken: string`, `refreshToken?: string`, `issuedAt: number` (Unix milliseconds), `expiresAt?: number` (только из подтверждённого положительного expiresIn), `accountId: string`. Это секрет целиком, включая metadata, и он хранится только как secret item. Обязательные поля проверяются до использования; неизвестная версия — повреждённая/неподдержанная запись, без миграции угадыванием. Store `read` возвращает null только при отсутствии записи, `clear` идемпотентен для отсутствующей записи; прочие ошибки не маскируются null. `write` заменяет одну запись только при успешном завершении native operation; новые версии формата требуют явной миграции в owning STEP.

Ошибки store преобразуются в безопасные existing domain codes: permission denial — `PERMISSION_DENIED`; прочая недоступность/locked/corrupt — неретрайная ошибка операции `DOWNLOAD_ERROR` с безопасной диагностикой store. Raw native exception не сериализуется. OAuth отказ/истечение/отмена/timeout — `AuthenticationError`/`AUTH_ERROR`, без автоматического retry. NETWORK_ERROR/SERVICE_UNAVAILABLE остаются transport ошибками, не превращаются в auth отказ.

`logout` сначала запрещает дальнейшее использование текущих in-memory credentials и очищает account/Authorization; затем вызывает `clear`. Успех возвращается только после удаления записи или подтверждённого отсутствия. При отказе удаления in-memory credentials всё равно сброшены, logout возвращает ошибку, doctor сообщает, что удаление не завершено; оставшаяся запись может существовать после перезапуска и не скрывается как успешное удаление. После успешного logout следующий `getAccount` возвращает null без auth запроса. При истёкшем сохранённом токене `getAccount` даёт AUTH_ERROR; null означает отсутствие авторизации, а не скрытый отказ сети/store.

`doctor` STEP-025 через application diagnostics показывает только backend/available/locked/access-denied/corrupt/absent и факт подтверждённой конфигурации, без credentials/accountId/native messages. Рутинная диагностика не печатает secret и не перезаписывает запись для проверки. Native store не является собственным файловым хранилищем приложения: POSIX `0600` и Windows ACL token-файла здесь неприменимы, doctor не объявляет этот файловый check PASS. Если позднее появится собственный файл credentials, потребуется новое решение: шифрование/защита ключа плюс `0600` POSIX или ACL только текущего пользователя Windows; одних permissions недостаточно для REQ-002/PRN-002.

### Refresh и совместимость

Автоматическое обновление access token и replay запроса **не разрешены**. Исключение ADR-002 п.6 остаётся неактивным; STEP-008 сохраняет `AUTH_ERROR` без retry. Refresh token можно хранить в секретной записи, но наличие его поля не включает refresh. Восстановление — явный новый Device Authorization. Изменение политики требует нового evidence и отдельно разрешённого изменения ADR/STEP-008; наблюдаемый 401 не доказывает глобальную неподдерживаемость refresh.

Этот ADR уточняет только разрешённые детали auth/storage ADR-002 и ownership ADR-001; старые Accepted ADR не переписываются и не supersede-ятся. REQ-002/PRN остаются прежними.

## Alternatives considered

### Encrypted token-файл с ключом рядом

Отвергнуто: permissions не заменяют защиту секрета, компрометация каталога даёт токен и ключ.

### Файл с master password пользователя

Может работать без keyring, но требует нового ввода пароля/управления ключом и recovery. Для текущего минимального CLI flow не принят; plaintext fallback также запрещён.

### keytar / shell-команды security, secret-tool, PowerShell

Нативный binding выбран для единого read/write/delete API и передачи секрета без argv. Дополнительные shell backends и их fallback увеличивают поверхность хранения и здесь не разрешены.

### Передача token/challenge через публичный application API

Отвергнуто: token нарушает ADR-001/PRN-002, а challenge потребовал бы расширения shared/AuthInteraction вне разрешённого Scope STEP-008. Приватный browser flow исполним с текущими портами.

## Consequences

Native dependency и системный keyring становятся условием постоянной CLI авторизации. Linux server без пользовательской D-Bus session потребует настройки защищённого store; автоматического обхода этого условия нет. Авторизация требует интерактивного браузера; unattended jobs используют ранее сохранённую запись. Это технический выбор внутри STEP-006, поддержка платформ ещё не проверена.

## Security implications

System store защищает persistent secret в рамках текущего пользователя, но не от администратора, вредоносного процесса с правами пользователя или чтения памяти работающего provider. Provider удаляет ссылки на credentials/Client при logout/ошибках; гарантия физического обнуления JS strings не заявляется. Cookies, токены и challenge не идут в logs/events/settings/manifest/SQLite; доступ к контенту остаётся по PRN-003.

## Data / migration implications

Новый private envelope v1 и native secret item вводит STEP-008. Существующего product token storage нет, импорт plaintext файлов не выполняется. Изменения shared/application/CLI и desktop не реализуются здесь.

## Compatibility / operational implications

Основания и первичные источники сверены при RUN: [@napi-rs/keyring: API и явный Linux backend](https://github.com/Brooooooklyn/keyring-node#linux-backend-selection), [нативные backend dependencies](https://github.com/Brooooooklyn/keyring-node/blob/main/Cargo.toml), [Windows CredWrite](https://learn.microsoft.com/en-us/windows/win32/api/wincred/nf-wincred-credwritew), [Windows persistence](https://learn.microsoft.com/en-us/windows/win32/api/wincred/ns-wincred-credentialw), [опубликованный keyring binding](https://github.com/Brooooooklyn/keyring-node/blob/1635ed458e8349ba28233728a8238ad99a5b2817/src/entry_builder.rs), [Windows store 1.0.0](https://docs.rs/crate/windows-native-keyring-store/1.0.0/source/src/lib.rs), [Apple Keychain services](https://developer.apple.com/documentation/security/keychain-services), [Secret Service locking](https://specifications.freedesktop.org/secret-service/latest/unlocking.html), [ограничения Secret Service](https://specifications.freedesktop.org/secret-service/latest/ch10.html), [GNOME Keyring: master password и plaintext при пустом пароле](https://wiki.gnome.org/Projects%282f%29GnomeKeyring%282f%29StoringSecrets.html). Это основания выбора, не платформенный тест. STEP-008 доказывает auth/store, STEP-018 — wiring, STEP-019 — CLI, STEP-025 — doctor; OQ-010/011 этим ADR не закрываются.
