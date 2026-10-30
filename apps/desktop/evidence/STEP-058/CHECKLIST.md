# STEP-058 — сверка макетов и пользовательских сценариев

Результат визуальной и функциональной сверки: **PASS**. Linux Chrome, 1440×1000; отдельное широкое окно 1920×1080. Данные музыкальной коллекции и аккаунта синтетические; исходная страница авторизации от provider показана с кодом `TEST-0058`. Это не новая нативная приёмка Windows/macOS.

В [visual-evidence.json](visual-evidence.json) сохранены хеши исходных 31 screenshot, source inputs и десяти исходных PNG до FIX. Дополнение после исправлений F-001/F-002 находится в [fix-visual-evidence.json](fix-visual-evidence.json); прежние hashes и снимки не изменены. [browser-commands.txt](browser-commands.txt) содержит фактические команды и наблюдения Playwright CLI. Сопоставление сделано по структуре, визуальной иерархии, доступности функций и токенам брендбука; изображённые в макетах музыкальные данные не подменяют реальные сведения provider.

| Макет | Проверено | Результат и допустимое отличие |
| --- | --- | --- |
| 01 | URL, очистка, примеры, отсутствие автоматического старта, empty state | PASS; `01-home-empty.png`. Сохранены закреплённая навигация и доступная ширина REQ-057; screenshot показывает клиентскую область без системного title bar. |
| 02 | Обложка, описание, автор/аватар, общая длительность, таблица и миниатюры, выбор папки | PASS; `02-playlist-preview.png`, `02-preview-fallback.png`, `02-preview-dark.png`. Четыре synthetic трека дают 12:54; отсутствующие metadata/artwork имеют fallback. Миниатюры находятся у соответствующих строк. |
| 03 | Очередь/активные/завершённые/ошибки, счётчики, названия, обложки, меню действий и progress | PASS; `03-downloads*.png`. Смешанный набор даёт 3/1/2/2, подробности свёрнуты по REQ-057, массовые действия сохранены. Метрики показаны только после реального synthetic события progress. |
| 04 | Сортировка, поиск/тип, календарный диапазон, локальная дата и время, действия/legacy fallback | PASS; `04-history*.png`. Диапазон 25–27 октября включительно оставил три записи, сортировка имени дала «Лучшее», «Пламя», «Сияй». Native date controls используют локаль браузера; действия остаются компактными по REQ-057. |
| 05 | Пять вкладок, все прежние поля и переключатели тегов/cover.jpg/m3u8/открытия папки/темы | PASS; `05-settings*.png`, `05-about.png`. Параметры сгруппированы по назначению: файловые switches во «Файлы», открытие папки в «Загрузка», тема во «Внешний вид». Updates находятся в «О программе». |
| 06 | Подтверждённые email/регион/подписка/форматы, отсутствие данных, вход/выход | PASS; `06-account*.png`. Используются synthetic сведения и отдельный fallback; формат не выводится из названия подписки. React DOM nesting исправлен, актуальная консоль без ошибок. |
| 07 | Тёмная тема, сохранение выбора и читаемость | PASS; `07-home-dark.png` и тёмные состояния других экранов. Live computed contrast активного sidebar не ниже 4,5:1 в обеих темах; значения записаны в visual-evidence.json. Сохранение после restart проверено настоящим Electron E2E; сохранение темы sidebar из уже открытой формы дополнительно проверено после F-001 (см. ниже). |
| 08 | Прежние presets, реальные codec/container/bitrate, покрытие, Apply/Cancel/Escape/backdrop | PASS; `08-quality-dialog.png`, component tests и Electron E2E. Перечень строится по доступным поддерживаемым вариантам, а не фиксированным значениям картинки; неподдерживаемый raw FLAC недоступен. Отмена не применяет черновик. |
| 09 | Успех/частичная ошибка/ошибка/отмена и явная проверка обновлений | PASS оформления; `09-*.png`. Исходный снимок отмены использовал искусственное событие и не доказывал путь команды; актуальное подтверждение отмены — `fix-cancel-confirmed.png` и проверки F-002 ниже. Показано одно актуальное in-app уведомление; системные уведомления сохраняют прежнюю реализацию. Обновления остаются ручным portable flow ADR-019; production feed не настраивался. |
| 10 | Копирование кода, ссылка, таймер/ожидание и отмена, оформление страницы входа | PASS; `10-auth.png`. Использован actual provider-owned HTML с synthetic кодом; существующий auth flow не переписан. Отдельная browser-страница сверена со светлым макетом10, тема desktop ей не навязывается. |

## Дополнение после FIX F-001/F-002

После первого [независимого FAIL](../../../../planning/reviews/STEP-058/REVIEW-20261029T193045Z.md) исправлены два поведенческих дефекта. [Исходные воспроизведения](fix-reproducer.txt) — 2/2 PASS, [renderer tests](fix-renderer-tests.txt) — 28/28 PASS; это целевые проверки, не новый итоговый REVIEW.

| Проверка | Наблюдение после исправления |
| --- | --- |
| F-001, макеты 05/07 | Настройки открыты при светлой теме → sidebar dark → «Сохранить настройки»: подтверждённое `theme=dark` сохраняется, sidebar включён. [fix-theme-saved.png](screenshots/fix-theme-saved.png). |
| F-002, макеты 03/09 | «Загрузки» → меню активного задания → «Отменить»: ответ `cancelled` без `job.completed` показывает «Отменено: Вечерний вайб»; счётчики активных/завершённых 0/3. [fix-cancel-confirmed.png](screenshots/fix-cancel-confirmed.png). |

[fix-browser-commands.txt](fix-browser-commands.txt) фиксирует фактический UI command path и отсутствие ошибок консоли; [fix-visual-evidence.json](fix-visual-evidence.json) — source/screenshot hashes и ограничения. Для отмены в актуальной browser fixture используйте меню «Отменить»: `step058Fixture.notice('cancelled')` теперь отклоняет искусственное terminal-событие. Старый screenshot отмены остаётся только визуальным примером. Новые проверки выполнены с синтетическим `DesktopApi`; исходные 31 screenshot не переснимались, их статическая компоновка сохранена.

## Исполняемые доказательства

- [contracts-integration-tests.txt](contracts-integration-tests.txt): 36 affected файлов, 598 tests PASS; H-001 проверяет реальные tags/embedded cover/cover.jpg/m3u8, старые settings/snapshots и исходные параметры restart/replay/resume/retry; H-002 — exact supported selection и synthetic MP3/AAC-M4A/FLAC-M4A pipeline, прежние четыре presets и отсутствие fallback.
- [renderer-tests.txt](renderer-tests.txt): 46 renderer tests PASS до последних точечных visual исправлений; [visual-fixes.txt](visual-fixes.txt) и [theme-contrast.txt](theme-contrast.txt) сохраняют целевые повторные проверки исправленных Account/Settings/theme.
- [electron-run.txt](electron-run.txt) и [electron](electron/): настоящий Linux Electron прошёл preview → точный MP3 вариант → download/pause/resume → completed/history → restart settings/theme/history → replay с исходными flags. Тест одного трека не выдаётся за отдельное доказательство playlist m3u8/cover.jpg: это подтверждено core integration выше.
- Полный canonical Verification и независимый REVIEW фиксирует dispatcher в STEP-058; отдельные целевые прогоны не подменяют его completion proof.

STEP-054 независим от STEP-058. Исторические native отчёты относятся к прежним revision/build ID, а не к этой UI-сборке.
