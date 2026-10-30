# STEP-059 — исправления истории, настроек и аккаунта

[STEP-059](../../../../planning/tasks/STEP-059.md) корректирует поведение REQ-051/052/057/058 после пользовательской проверки; принятые ADR-015/016/019 сохраняются. Ниже описаны сохранённые целевые проверки и ручная сверка на Linux. Полные шесть canonical Verification commands и независимый REVIEW выполняются отдельно; завершение STEP этим документом не объявляется. Evidence и PASS STEP-058 не изменяются.

## Исполняемые доказательства

- [target-tests2.txt](target-tests2.txt): 12 файлов, 160 тестов PASS; [target-tests3.txt](target-tests3.txt): последующая целевая проверка двух файлов, 18 тестов PASS. Это отдельные прогоны с возможным пересечением, их числа не суммируются в размер общего suite.
- [target-lint-final.txt](target-lint-final.txt), [target-final-tsc.txt](target-final-tsc.txt) и [target-test-tsc2.txt](target-test-tsc2.txt) — журналы целевых lint/typecheck; они не подменяют полные команды STEP.
- H-001: [job-folders.test.ts](../../src/main/job-folders.test.ts) проверяет настоящий временный файл и его исчезновение после availability с shell spy. [History.test.tsx](../../src/renderer/History.test.tsx) проверяет локальное ожидание, доступные строки/фильтры и отсутствие новых `history/historyArtwork` запросов при открытии папки. Main принимает job-owned reference и повторяет проверку файла/каталога перед shell; renderer не передаёт произвольный путь.
- Legacy auto-open: [persistence tests](../../../../packages/persistence/src/desktop-state-store.test.ts), [desktop profile tests](../../../../packages/application/src/desktop-profile.test.ts) и [notification tests](../../src/main/job-notifications.test.ts) проверяют игнорирование старого `true`, сохранение прочих snapshot/replay параметров и уведомлений. Автоматическое открытие удалено без изменения DDL и перезаписи JSON при чтении.
- H-002: [account-profile.test.ts](../../../../packages/providers/yandex-music/src/account-profile.test.ts) проверяет фиксированный profile endpoint, составной avatar ID, отсутствие credentials на CDN, запрет redirect, MIME/размер и fallback. [application contract tests](../../../../packages/application/src/application.contract.test.ts) и [Account tests](../../src/renderer/Account.test.tsx) проверяют отдельное получение фото и отбрасывание устаревших результатов.
- [cache.integration.test.ts](../../../../packages/application/src/cache.integration.test.ts) использует настоящий файловый store: новый instance читает фото в пределах TTL без второго provider fetch; истечение TTL/clear вызывают обновление; другой аккаунт имеет отдельный ключ. Payload не содержит fixture profile/token/URL. Deferred avatar не задерживает account/metadata/auth/logout и не загрязняет cache другого аккаунта. Это доказательство persistent cache, а не browser fixture.
- [Settings.test.tsx](../../src/renderer/Settings.test.tsx) проверяет целые 1–8, invalid input, сохранение refs/темы/черновиков и локальную версию/dev без `checkUpdate`. Удаление системного меню проверяется отдельно от синтетического browser UI.

## Ручная browser-сверка

[visual-evidence.json](visual-evidence.json) фиксирует source inputs, SHA-256 десяти новых синтетических [screenshots](screenshots/), измерения и ограничения. [browser-commands.txt](browser-commands.txt) сохраняет фактические команды и наблюдения Linux Chrome 1440×1000. Таблица ниже — описание наблюдений, а не реконструкция literal output.

| Сценарий | Сохранённое наблюдение |
| --- | --- |
| Длинная история и отсутствие папки | Все 50 строк и фильтр доступны до завершения availability; «Архив 48» недоступен с объяснением. [history-missing.png](screenshots/history-missing.png). |
| Исчезновение после availability | Для «Архив 49» открытие вернуло понятный отказ, затем кнопка стала недоступной. `scrollY` остался 3524; Alert расположен на 928–976 px при viewport 1000 px. Счётчики `history=1`, `historyArtwork=50` до/после совпали, `folder` вырос с 0 до 1. [history-race-notice.png](screenshots/history-race-notice.png). Успешное открытие «Архив 50» также не перечитывало историю/обложки. |
| Настройки | Подпись кнопки папки однострочная (`whiteSpace: nowrap`, ширина 160 px), числовое поле шириной 220 px с min=1/max=8/step=1; `0` блокирует сохранение, `8` сохранено. [settings.png](screenshots/settings.png), [settings-invalid.png](screenshots/settings-invalid.png), [download-settings.png](screenshots/download-settings.png). Переключателя auto-open нет. |
| Локальная версия | Показано `0.0.0-synthetic (dev)`, счётчик `checkUpdate=0`. [about.png](screenshots/about.png). Это fixture-версия, а не версия установленного приложения. |
| Подписка и фото | Подтверждённый Plus/аватар и unknown/fallback с объяснением форматов по треку. [account-plus-avatar.png](screenshots/account-plus-avatar.png), [account-unknown.png](screenshots/account-unknown.png). |
| Позднее фото | Ожидание фото не задерживает аккаунт; выход перед завершением запроса не публикует старую фотографию. [account-avatar-pending.png](screenshots/account-avatar-pending.png), [account-logout-late.png](screenshots/account-logout-late.png). |

Ошибок консоли UI не наблюдалось. Один диагностический inspector eval завершился `SyntaxError` из-за экранирования; исправленный повтор сохранён в журнале и использован для `folderRace` в JSON. Browser-проверка не доказывает системное меню Electron, реальную файловую систему/main recheck или persistent cache: для них используются code/tests и отдельный Electron Verification.

## Воспроизведение

После установки зависимостей из корня репозитория:

```sh
node apps/desktop/e2e/STEP-059-visual-fixture.mjs
```

Fixture собирает настоящий renderer с синтетическим `DesktopApi`, пишет временные файлы в `.harness/local/tmp/` и слушает `127.0.0.1:4189`; порт меняется через `STEP059_PORT`. При отсутствии `theme` используются ранее сохранённые fixture settings из `localStorage` (`step059-settings`); `theme=light|dark` задаёт начальные defaults явно. Для сравнения:

- `http://127.0.0.1:4189/?scenario=normal&theme=light` — обычное заполненное состояние; откройте историю/настройки/аккаунт через навигацию.
- `http://127.0.0.1:4189/?scenario=availability-delayed&theme=light` — ожидание проверки папок; `window.step059Fixture.settleFolders()` завершает ожидающие ответы. «Архив 48» моделирует недоступный результат, «Архив 49» — отказ при открытии после доступной предварительной проверки, «Архив 50» — успех.
- `http://127.0.0.1:4189/?scenario=unknown` — неизвестная подписка и avatar fallback; `scenario=avatar-fallback` оставляет подтверждённую подписку без фото.
- `http://127.0.0.1:4189/?scenario=avatar-late` — откройте аккаунт, затем выйдите до `window.step059Fixture.settleAvatar()` для проверки позднего ответа.
- `http://127.0.0.1:4189/?scenario=loggedout` — состояние без входа; `scenario=empty` — пустая коллекция.

`window.step059Fixture.counters` показывает запросы `history/historyArtwork/availability/folder/account/avatar/checkUpdate`. Fixture не выполняет настоящие shell/host операции. По завершении остановите сервер Ctrl+C. Для реального Electron используется отдельная canonical команда `node apps/desktop/e2e/run.mjs` после сборки.

## Profile probe и границы

[profile-probe.json](profile-probe.json) — отдельное санитизированное read-only наблюдение по разрешённой пользователем проверке: `hasPlus=true` без активного именованного продукта, HTTP 200 profile/CDN, JPEG 9827 байт. Сохранены только признаки/HTTP-статусы и размер; credentials, ID, имя, profile payload и персональная фотография не сохранены. Screenshots используют исключительно синтетические данные. Наличие Plus не гарантирует codec у каждого трека.

Avatar cache использует существующий account-scoped файловый store, configured/default TTL 5 минут и прежнюю очистку. Хранится только image/MIME; поздний ответ после выхода/смены аккаунта не публикуется. Это не обещает вечного кеширования или удаления всех старых cache-файлов при выходе.

Новые native Windows/macOS и packaging прогоны не выполнялись. Меню Linux/Windows убрано в коде; browser снимок не является нативной Windows-приёмкой. Auth flow/scopes, credential store, core lifecycle и manual updates ADR-019 сохраняются; production feed не настраивался. STEP-054 остаётся независимым, его прежние revision/build ID не доказывают эту новую UI-сборку. Исторические proof STEP-058 не переснимались и не переписывались.

## Исправления выхода из аккаунта после REVIEW

Первый [независимый REVIEW](../../../../planning/reviews/STEP-059/REVIEW-20261029T204931Z.md) выявил F-001 (выход через sidebar оставлял данные и аватар открытой страницы аккаунта) и F-002 (поздний account lookup аватара мог восстановить активную сессию предыдущего аккаунта). Исправлены сброс страницы при смене аккаунта в App и проверка поколения сессии перед изменением active credentials в provider. Проверки кода и новые regression tests ограничены этими двумя дефектами.

- [fix-original-f001.txt](fix-original-f001.txt): исходное воспроизведение sidebar logout — 1/1 PASS. [fix-f001-regression-final.txt](fix-f001-regression-final.txt): оба сценария с уже показанным и ожидающим аватаром — 2 PASS (21 прочий тест отфильтрован).
- [fix-original-f002.txt](fix-original-f002.txt): исходное воспроизведение через настоящую application/cache/provider composition — 1/1 PASS; после позднего ответа A значения `authenticatedId`, `observedId`, `persistedId` остаются `B`, `avatar=null`.
- [fix-affected-tests.txt](fix-affected-tests.txt): 7 файлов, 101 тест PASS. [fix-lint-final.txt](fix-lint-final.txt) и [fix-tsc-final.txt](fix-tsc-final.txt) сохраняют целевые lint/typecheck. Эти результаты не объявляют пройденными новый полный canonical Verification или независимый REVIEW после FIX.

[fix-browser-commands.txt](fix-browser-commands.txt) и [fix-visual-evidence.json](fix-visual-evidence.json) фиксируют реальный UI-путь выхода через sidebar на синтетическом `DesktopApi`: открытая страница показывает «Аккаунт не подключён», прежнее имя и изображение исчезают как после обычного выхода, так и после завершения ожидающего аватара. Дополнительные снимки: [fix-sidebar-logout-normal.png](screenshots/fix-sidebar-logout-normal.png), [fix-sidebar-logout-avatar-late.png](screenshots/fix-sidebar-logout-avatar-late.png). Provider race подтверждает отдельное composition-воспроизведение выше; browser fixture не является его заменой.

Исходные десять screenshot и hashes в `visual-evidence.json` сохранены как capture до FIX. Новые два снимка и source hashes дополняют их доказательством исправленного auth-пути; остальные экраны не переснимались. Новых native/packaging утверждений эти проверки не добавляют.
