# STEP-031 — визуальная проверка и пользовательский путь

Проверено 2026-10-28 на Linux x64 в headless Google Chrome через Playwright CLI, viewport 1440×1000. Использованы фактические renderer-компоненты, тема и локальные Inter 400/600/700; DesktopApi заменён синтетической fixture. Аккаунт, названия, обложка и пути тестовые. Реальных скачиваний и чтения credentials в fixture нет.

## Сверка с макетами

| Макет | Скриншот | Наблюдение |
|---|---|---|
| `docs/brand/mockups/01-home-empty.png` | [01-home-empty.png](01-home-empty.png) | PASS: Главная: sidebar 224 px, поле ссылки, отдельное действие анализа, пустое состояние, локальный Inter и палитра. |
| `docs/brand/mockups/02-playlist-preview.png` | [02-playlist-preview.png](02-playlist-preview.png) | PASS: Предпросмотр: синтетическая обложка, тип, автор, четыре позиции и длительности; честное отсутствие размера, выбор качества и папки, запуск отключён до выбора папки. |
| `docs/brand/mockups/03-downloads.png` | [03-downloads.png](03-downloads.png) | PASS: Загрузки: 1/4, 28%, трек 2 — 54%, скорость 1.0 МБ/с и 12 с только из переданных данных, кнопки по состоянию. |
| `docs/brand/mockups/07-home-dark.png` | [07-home-dark.png](07-home-dark.png) | PASS: Тёмная тема: читаемый основной текст, sidebar, поля и пустое состояние; выбор локальный, без settings persistence. |
| `docs/brand/mockups/08-quality-dialog.png` | [08-quality-dialog.png](08-quality-dialog.png) | PASS: Качество: реальные категории preference с покрытием 4/4 и 2/4, без неподтверждённых обещаний codec/bitrate. |
| `docs/brand/mockups/09-notifications.png` | [09-notification-success.png](09-notification-success.png) | PASS: Успех: зелёное сообщение, 4/4 и 100%, control actions отключены, reveal остаётся доступен. |
| `docs/brand/mockups/09-notifications.png` | [09-notification-error.png](09-notification-error.png) | PASS: Ошибка: красное сообщение, 3/4 и 75%, failed track и доступный Retry; частичная ошибка не выдаётся за успех. |

## Поведение

- Через браузер пройден путь: заполнение ссылки → «Анализировать» → выбор частично доступного lossless 2/4 → выбор папки mock DesktopApi → явный запуск → экран Downloads. Отдельно повторён полный путь со стандартным качеством; результат — [created-snapshot.yml](created-snapshot.yml) и [03-downloads-created.png](03-downloads-created.png). Сам анализ не вызывает создание задания.
- На Downloads в браузере проверены Pause → Resume и «Показать в папке» через mock API. Снимок паузы сохранён в [paused-snapshot.yml](paused-snapshot.yml). Нативный системный диалог/файловый менеджер этим mock-прогоном не подтверждаются; действующая main boundary сохранена, renderer передаёт только directoryRef/jobId.
- После явного запуска без progress payload видны 1/4 и 25% по snapshot; скорость и ETA отсутствуют. Для отдельного payload показаны 54%, 1.0 МБ/с, 12 с, без собственных прогнозов.
- Синтетические completed и completed_with_errors вызывают разные сообщения; error snapshot сохранён. Компонентные тесты дополнительно проверяют OUTCOME_UNKNOWN без повтора команды, события до окончания createDownload Promise, поздний initial list и все control actions.
- После визуальной сверки подпись доступности кнопки закрытия уведомления локализована как «Закрыть»; визуальные пиксели не менялись.

## Границы и отличия от макетов

- Отсутствуют элементы будущих History/Settings и массовые действия, которых нет в STEP-031. Навигация ограничена Главной и Загрузками.
- Вместо нарисованных в макетах MP3/FLAC bitrate показаны только подтверждённые публичным preview предпочтения и их покрытие. При отсутствии artwork используется placeholder; при отсутствии размера — «Объём не определён».
- Основной layout, Inter, палитра, шаг 8 px и радиусы сохранены. Сверены структура, читаемость и состояния; попиксельное совпадение с иллюстративными макетами не заявляется.
- Доступность системных уведомлений и другие ОС не выводятся из browser screenshots; main-only notification boundary проверяется целевым тестом. Packaging и cross-platform qualification не входят в текущую проверку.
- В browser fixture единственная ошибка сети — отсутствующий favicon HTTP 404; ошибок приложения после корректной сборки с JSX automatic не наблюдалось.

## Документация

Описание `yarn run desktop` в `docs/development.md` сверено с кодом: Главная, Downloads, preview, явный старт, управление и уведомления. Описание сборки/keyring и ограничения History/Settings/Account/Diagnostics, packaging и платформенной квалификации сохранены; соседние исторические утверждения не исправлялись.

## Воспроизведение fixture

Исходники fixture сохранены как текст, чтобы не включать её в production bundle и тестовый graph. Скопировать `visual-fixture.txt` в `.harness/local/tmp/<execution>/visual.tsx`, а `visual-index.txt` в соседний каталог `visual/index.html`. Из корня проекта собрать:

```bash
node_modules/.bin/esbuild .harness/local/tmp/<execution>/visual.tsx --bundle --format=esm --platform=browser --jsx=automatic --loader:.woff2=file --loader:.woff=file --asset-names=assets/[name]-[hash] --outfile=.harness/local/tmp/<execution>/visual/app.js
python3 -m http.server 8768 --bind 127.0.0.1 --directory .harness/local/tmp/<execution>/visual
```

Сценарии: `/?scenario=empty`, `downloads`, `success`, `error`. Управление выполнялось Playwright CLI через официальный wrapper skill; временный cache был перенесён в разрешённый каталог. Подробности среды и SHA-256 файлов — в `visual-evidence.json`.


## Исправление F-001 — ошибочная пауза без события завершения

- Finding из `planning/reviews/STEP-031/REVIEW-20261028T191441Z.md` воспроизвёл штатную остановку core в `paused/AUTH_REQUIRED` без `job.completed`.
- `useDownloads` теперь распознаёт ошибочную паузу в свежих `listJobs/getJob`; main notifier наблюдает уже возвращаемые результаты существующих команд и snapshots. Дополнительные IPC-запросы не введены, прежняя event→snapshot семантика сохранена.
- Дедупликация исключает повторное сообщение одного состояния; явный resume начинает новый самостоятельный инцидент. Пользовательская пауза без причины и cancellation не считаются ошибками. Сообщения AUTH_REQUIRED и DISK_FULL фиксированы и не содержат секретов.
- После FIX в Chrome проверен новый mock-сценарий `/?scenario=auth`: fixture сразу возвращает свежий paused snapshot, не публикует `job.completed`, интерфейс показывает «Загрузка приостановлена: требуется повторный вход в аккаунт». Результат сохранён в [09-notification-auth-pause.png](09-notification-auth-pause.png) и [auth-pause-snapshot.yml](auth-pause-snapshot.yml). Это синтетическая проверка, реальная авторизация владельца не изменялась.
- Целевые тесты `App.test.tsx` и `job-notifications.test.ts` — 15/15 PASS, exit code 0; targeted lint и typecheck — PASS. Полный fresh Verification выполняет dispatcher после записи этого Evidence.
- Исходные восемь screenshots остаются свидетельством ранее проверенных неизменённых экранов; новый скриншот прямо подтверждает исправленную ветку. Всего сохранено девять PNG.
