---
schema: 1
id: ADR-016
status: accepted
date: 2026-10-16
deciders:
  - Claude Code (STEP RUN STEP-028)
supersedes: []
superseded_by: []
requirements:
  - REQ-058
  - REQ-046
steps:
  - STEP-059
  - STEP-058
  - STEP-028
  - STEP-030
  - STEP-031
  - STEP-032
---

# ADR-016 — Typed IPC contract `DesktopApi`

## Context

[REQ-046](../requirements/REQ-046-desk-security.md) требует:

- связь renderer только через строго типизированный preload API без произвольных строковых каналов;
- lint-запрет channel strings;
- тесты валидации входа каждого метода.

[ADR-007](ADR-007-application-api-events-and-command-results.md) определяет транспорт-независимый application API, versioned `JobEvent` и `CommandResult`; desktop IPC передаёт эти же DTO. [ADR-015](ADR-015-electron-security-model.md) размещает application в `utilityProcess` (application host), а main — как IPC broker. У application API нет отмены запросов.

## Problem

Нужен единый контракт, из которого выводятся preload API, обработчики main и маршрутизация к application host. Произвольные каналы и непроверенные данные из renderer не должны доходить до application.

## Decision

### Единый contract module

- Desktop определяет один contract module: таблицу методов `DesktopApi`. Для каждого метода заданы:
  - имя;
  - runtime-схема входа;
  - тип результата (`CommandResult` или snapshot DTO);
  - исполнитель: application host или main-only.
- Тип `DesktopApi` выводится из этой таблицы. Каналы генерируются из неё в namespace `desktop-api:v1:<method>`; других каналов нет.
- Методы application host — проекция application API: auth/account/logout, preview, создание и управление job, история, настройки, диагностика. Их DTO берутся из `packages/shared`.
- Main-only методы: выбор каталога системным диалогом (возвращает непрозрачный `directoryRef` и путь только для отображения), «показать в папке» по `jobId`/`trackKey` (ADR-015), открытие разрешённой внешней ссылки. Методы host, которым нужен каталог (создание загрузки, сохранение output directory), принимают от renderer `directoryRef`; main подставляет путь до передачи в host. Их DTO живут в contract module desktop и не требуют изменения shared.
- Новый метод добавляется только в contract module.
- Contract module импортирует только типы `packages/shared` и библиотеку runtime-схем (Zod 4, уже используемая в provider по ADR-009), без Node built-ins, чтобы preload и тесты могли его использовать.

### Transport

1. **renderer → preload.** `contextBridge.exposeInMainWorld('desktopApi', …)` публикует объект функций по contract module. `ipcRenderer`, `invoke(channel, …)`, Electron event objects и любые generic-методы renderer не получает.
2. **preload → main.** `ipcRenderer.invoke` на сгенерированный канал; main регистрирует `ipcMain.handle` только по contract module. Для каждого вызова:
   - main проверяет отправителя: `senderFrame` — top-level frame главного окна с app-origin;
   - вход валидируется runtime-схемой;
   - при неизвестном отправителе или невалидном входе main возвращает безопасный `CommandResult` с ошибкой `PERMISSION_DENIED`/`VALIDATION_ERROR` и не передаёт запрос в host.
3. **main → application host.** Один `MessagePort` (`MessageChannelMain`) с versioned envelope `{ v: 1, id, method, payload }`; ответ — `{ v: 1, id, result }`, где `result` — `CommandResult` или snapshot DTO. Потеря host даёт безопасную ошибку. Таймаут ответа в main означает неизвестный исход операции, а не её отмену: renderer перечитывает состояние snapshot-запросами. Auth отменяется приватной страницей provider или перезапуском host (ADR-010).
4. **События.** Host публикует `JobEvent` schema 1 и безопасные auth-уведомления. Main ретранслирует их renderer на единственный сгенерированный канал событий. Preload даёт `subscribe(listener): unsubscribe`, передавая только payload DTO.

Все сообщения — structured-clone сериализуемые DTO. В них нет:

- функций и Node-объектов;
- путей файловой системы во входе от renderer: каталоги передаются только как `directoryRef` из allowlist main (ADR-015); main не выполняет fs-операций по строкам renderer;
- stack trace;
- raw native/SQLite/provider messages.

### Ошибки и секреты

Ошибки — error DTO `CommandResult` ADR-007 (`code`, `message`, `retryable`, `details?`). Токены, cookies, Authorization, credentials, device challenge и signed URL не входят ни в один вход, результат или событие `DesktopApi` (PRN-002). Тест contract module проверяет, что fixture-секреты не проходят через сериализованные сообщения.

### Принудительное соблюдение

- ESLint-правило для `apps/desktop` запрещает вызовы `ipcMain.*`, `ipcRenderer.*` и `webContents.send` со строковыми литералами или вычисляемыми именами каналов вне transport-адаптеров, использующих contract module. Прямой импорт `electron` в renderer запрещён.
- Тест на каждый метод: валидный вход проходит, невалидный отклоняется до host. Для методов с каталогом — negative-кейсы: неизвестный `directoryRef`, локальный путь, UNC (`\\host\share`, `//host/share`), WebDAV и device namespace (`\\?\`, `\\.\`) вместо ссылки отклоняются без fs-вызова.
- Тест preload: `contextBridge` публикует только `desktopApi`; `require`, `process` и `ipcRenderer` в renderer недоступны.
- Версия контракта `v1`. Main, preload и renderer поставляются одной сборкой, поэтому совместимость между версиями не поддерживается; ломающее изменение повышает версию и меняет namespace каналов.

## Alternatives considered

### Generic `invoke(channel, payload)` в preload

Проще в реализации, но позволяет renderer вызывать произвольный канал и противоречит REQ-046. Отвергнуто.

### tRPC / electron-trpc и аналогичные RPC-библиотеки

Дают типизацию, но добавляют зависимость и собственный протокол поверх IPC при небольшом числе методов. Проверка отправителя и схем всё равно нужна. Не принято; может быть пересмотрено новым ADR.

### Прямой `MessagePort` между renderer и application host

Убирает переход через main, но лишает main возможности проверять отправителя и валидировать вход до host и открывает host недоверенной среде. Отвергнуто.

## Consequences

Один источник типов и каналов для preload, main и тестов. Небольшие накладные расходы на двойной переход renderer → main → host. Валидация в main дублирует проверки application: это намеренная граница доверия.

## Security implications

- Renderer ограничен методами контракта с проверенным входом.
- Main отвергает чужие frame и origin.
- Renderer не передаёт путей: каталоги — только `directoryRef` из диалога main (ADR-015).
- Секреты не проходят через IPC.

Компрометация renderer не даёт доступа к произвольным каналам, fs, provider и credentials.

## Data / migration implications

Не применимо: контракт не хранит данных. Persisted settings и история — ADR-014.

## Compatibility / operational implications

Основания: [Electron IPC](https://www.electronjs.org/docs/latest/tutorial/ipc), [contextBridge](https://www.electronjs.org/docs/latest/api/context-bridge), [проверка отправителя IPC](https://www.electronjs.org/docs/latest/tutorial/security#17-validate-the-sender-of-all-ipc-messages), [MessagePorts в Electron](https://www.electronjs.org/docs/latest/tutorial/message-ports). Реализация — STEP-030; экраны STEP-031/032 расширяют контракт только через contract module.
