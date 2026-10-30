# STEP-058 — доказательства переносимых функций desktop

[STEP-058](../../../../planning/tasks/STEP-058.md) реализует [REQ-058](../../../../docs/requirements/REQ-058-ui-mockup-parity.md) при сохранении REQ-057 и границ ADR-014/015/016/019. В этом каталоге находятся результаты Linux-проверок реализации и отдельной визуальной сверки. Статус завершения STEP и независимый REVIEW определяет Harness; локальные PASS сами по себе не являются completion proof.

## Сохранённые проверки

[integration-verification.json](integration-verification.json) связывает команды, exit code `0` и полные журналы локального прогона до исправлений F-001/F-002:

| Команда из корня репозитория | Результат |
| --- | --- |
| `npm run lint` | PASS: [lint.txt](lint.txt). |
| `npm run typecheck` | PASS: [typecheck.txt](typecheck.txt). |
| `npm test` | PASS: 125 файлов, 1429 тестов — [test.txt](test.txt). |
| `npm run build` | PASS: [build.txt](build.txt). |
| `node apps/desktop/e2e/run.mjs` | PASS: один Linux Electron E2E — [electron-final.txt](electron-final.txt), подробности в [electron](electron/). |

Это сохранённый literal output; описание ниже — краткие наблюдения, а не реконструкция терминала. Отдельные ранние целевые прогоны сохранены в `contracts-integration-tests.txt`, `contracts-integration-checks.txt`, `renderer-tests.txt`, `renderer-checks.txt`, `visual-fixes.txt` и `theme-contrast.txt`; они не заменяют полный canonical Verification после исправлений.

- H-001: реальные синтетические файлы подтверждают переключение текстовых тегов, отдельной обложки и `.m3u8`; встроенная обложка сохраняется при выключенных текстовых тегах. Persistence/application tests проверяют defaults старых настроек и полных snapshots, недоступность replay без snapshot и исходные параметры при restart/replay/resume/retry. Код и тесты: [desktop-state.integration.test.ts](../../../../packages/application/src/desktop-state.integration.test.ts), [desktop-state-store.test.ts](../../../../packages/persistence/src/desktop-state-store.test.ts), [metadata tests](../../../../packages/metadata/src/index.test.ts).
- H-002: preview и resolver используют один support-фильтр MP3/mp3, AAC/m4a, FLAC/m4a. Тесты проходят существующий pipeline на синтетических файлах без перекодирования; raw FLAC и aliases не объявлены поддержанными. Exact selector сравнивает codec, container, lossless и bitrate, включая отсутствие bitrate; отсутствие совпадения не включает fallback. Проверены прежние четыре presets и покрытие по позициям коллекции: [quality.test.ts](../../../../packages/core/planner/src/quality.test.ts), [preview.test.ts](../../../../packages/application/src/preview.test.ts).
- Настоящий Electron проверяет renderer → preload/IPC → host/application → SQLite: URL/preview, выбор точного MP3, запуск/паузу/продолжение, итоговый файл и историю после нового запуска, сохранение настроек/темы и replay с исходными flags. Этот сценарий одного трека не доказывает запись playlist `.m3u8` или `cover.jpg`; их проверяют интеграционные тесты выше.
- Component/contract/main tests подтверждают отмену черновика качества, вкладки/фильтры/сортировку, безопасные optional account поля и auto-open только для полного успеха с сохранённым флагом задания. Проверка shell callback не является новой платформенной квалификацией ОС.

## Визуальная сверка и воспроизведение

[CHECKLIST.md](CHECKLIST.md) содержит сопоставление всех макетов 01–10, наблюдения и допустимые отличия REQ-057. [visual-evidence.json](visual-evidence.json) фиксирует SHA-256 31 screenshot в [screenshots](screenshots/), исходных renderer/fixture/brand inputs и десяти макетов, исходный `gitHead` и ручной результат сверки до FIX. Эти 31 screenshot и их hashes сохранены без изменений; два дополнительных снимка после FIX перечислены ниже. При незакоммиченных изменениях одного `gitHead` недостаточно для идентификации проверенного UI: учитываются сохранённые input hashes. [browser-commands.txt](browser-commands.txt) сохраняет команды и наблюдения браузерной проверки. Размер обычного окна — 1440×1000, широкого — 1920×1080; проверены светлая и тёмная темы, отсутствие горизонтального overflow в широком окне и контраст активной навигации (5,99:1 / 4,8:1).

После установки зависимостей из корня репозитория запустите:

```sh
node apps/desktop/e2e/STEP-058-visual-fixture.mjs
```

Fixture собирает настоящий renderer с синтетическим `DesktopApi`, записывает временные файлы в `.harness/local/tmp/` и слушает только `127.0.0.1`. По умолчанию используется порт `4188`, его можно изменить переменной `STEP058_PORT`. Основные адреса:

- `http://127.0.0.1:4188/?scenario=normal&theme=light` — заполненный интерфейс; переходы по экранам выполняются навигацией.
- `http://127.0.0.1:4188/?scenario=empty&theme=light` — пустая Главная.
- `http://127.0.0.1:4188/?scenario=normal&theme=dark` — тёмная тема.
- `http://127.0.0.1:4188/?scenario=account-fallback` — аккаунт без необязательных сведений.
- `http://127.0.0.1:4188/?scenario=preview-fallback` — предпросмотр без необязательных metadata/изображений.
- `http://127.0.0.1:4188/?scenario=loggedout` — состояние без входа.
- `http://127.0.0.1:4188/auth` — настоящий provider-owned HTML авторизации с синтетическим кодом `TEST-0058`; отдельная светлая страница макета 10.

Fixture использует синтетическую обложку из сохранённого `STEP-056/visual-fixture.txt`; прошлое Evidence не изменяется. После сверки остановите сервер через Ctrl+C. Для реального Electron повторите `npm run build` и `node apps/desktop/e2e/run.mjs`; browser fixture не проверяет IPC, keyring, запись audio или сохранение состояния между процессами.

## Исправления после независимого REVIEW

Первый [REVIEW](../../../../planning/reviews/STEP-058/REVIEW-20261029T193045Z.md) выявил F-001 (открытые настройки сохраняли устаревшую тему после переключения sidebar) и F-002 (подтверждённая отмена не показывала in-app уведомление без `job.completed`). Код исправлен; [fix-reproducer.txt](fix-reproducer.txt) сохраняет PASS обоих исходных воспроизведений (2/2), [fix-renderer-tests.txt](fix-renderer-tests.txt) — 28/28 PASS в трёх файлах. Это целевые проверки исправлений; новый полный canonical Verification и независимый REVIEW выполняются отдельно.

[fix-visual-evidence.json](fix-visual-evidence.json) связывает hashes исправленных source inputs с двумя новыми screenshot. [fix-browser-commands.txt](fix-browser-commands.txt) сохраняет фактические команды и наблюдения Linux Chrome 1440×1000:

- F-001: открыть настройки при `light`, переключить sidebar на тёмную тему и нажать «Сохранить настройки» в уже открытой форме. Сохранённая тема осталась `dark`, переключатель sidebar включён: [fix-theme-saved.png](screenshots/fix-theme-saved.png). Синхронизация подтверждённой темы сохраняет остальные несохранённые поля и opaque refs формы.
- F-002: открыть «Загрузки» → меню «Действия Вечерний вайб» → «Отменить». Fixture `api.cancel` возвращает `cancelled` без события `job.completed`; интерфейс показал «Отменено: Вечерний вайб», счётчики активных/завершённых — 0/3: [fix-cancel-confirmed.png](screenshots/fix-cancel-confirmed.png). Ошибок в консоли браузера — 0.

Исходный `09-notification-cancelled.png` показывал оформление на искусственном событии и не доказывал реальный путь команды отмены. Его заменяет как поведенческое доказательство описанный UI-сценарий после FIX; исторический файл не переписан. В актуальной fixture `step058Fixture.notice('cancelled')` выбрасывает инструкцию использовать меню «Отменить», чтобы не воспроизводить неподтверждённый путь. Остальная статическая компоновка прежних 31 снимка не переснималась. Browser proof проверяет реальную команду renderer через синтетический `DesktopApi`, а не native Electron/IPC.

## Границы доказательств

Музыкальные и account данные синтетические; наличие email, региона, подписки или формата в fixture не доказывает их наличие у реального аккаунта. Provider-проекция оставляет отсутствующие поля отсутствующими и не выводит форматы из подписки. Сетевая доступность всех вариантов provider, live авторизация и текущий production аккаунт этими проверками не подтверждаются.

Новые native Windows/macOS проверки, упаковка и изменение production feed не выполнялись. Ручной portable updater сохраняет ADR-019; production feed/trust остаётся ненастроенным. STEP-054 и STEP-058 не зависят друг от друга. Исторические native отчёты STEP-054 относятся к собственным revision/build ID и не доказывают эту новую UI-сборку; результаты STEP-058 не закрывают его оставшиеся платформенные ограничения.
