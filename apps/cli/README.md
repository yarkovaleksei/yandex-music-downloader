# music-downloader CLI

CLI обращается только к публичному Application API. После `yarn build` запуск из репозитория: `node apps/cli/dist/index.js --help`. Поле `bin` пакета регистрирует имя `music-downloader` для установленного пакета.

Команды: `auth`, `account`, `logout`, `jobs`, `doctor`, `download URL`, `track URL`, `album URL`, `playlist URL`, `resume JOB_ID`, `retry JOB_ID`, `cancel JOB_ID`. `download` определяет тип ссылки через application; остальные команды загрузки проверяют соответствие типа. `resume` и `retry` используют сохранённые параметры job и ждут конечного снимка.

Для коллекции «Мне нравится» используйте ссылку `https://music.yandex.ru/playlists/lk.<UUID>` с сохранённым префиксом `lk.`. Команды `playlist` и `download` принимают её так же, как обычные ссылки `/playlists/<UUID>` и `/users/<owner>/playlists/<kind>`; маркетинговые query-параметры и fragment не меняют идентичность коллекции.

`doctor` проверяет Node runtime, secure storage, provider/account, metadata и варианты аудио canary `2224197`, read-only manifest store, каталог вывода и optional FFmpeg. `music-downloader doctor --json` пишет один `CommandResult` в stdout; human-отчёт и статусы идут в stderr. Версия provider schema выводится в отчёте. Отсутствующий FFmpeg не меняет exit code, а обязательный failed/skipped check даёт код `3`. Doctor не подтверждает конфигурацию только успешным чтением keyring и не проверяет права token-файла: native storage не использует такой файл.

| Опции                                                                                       | Команды                                         |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `--json`, `--log-level error\|warn\|info\|debug\|trace`, `--log-file PATH`, `--debug`       | Все                                             |
| `--output PATH`, `--quality best\|lossless\|high\|normal`, `--overwrite`, `--skip-existing` | download, track, album, playlist                |
| `--concurrency 1..8`                                                                        | download, track, album, playlist, resume, retry |
| `--output PATH`                                                                             | doctor                                          |

Настройки выбираются в порядке **флаги → окружение → settings.json → defaults**. Файл необязателен: POSIX `$XDG_CONFIG_HOME/music-downloader/settings.json` или `~/.config/music-downloader/settings.json`; Windows `%APPDATA%/music-downloader/settings.json`, при отсутствии APPDATA — `~/AppData/Roaming/music-downloader/settings.json`. Некорректный JSON, значения и ошибки чтения дают безопасную ошибку использования без содержимого файла. Credentials в settings не сохраняются.

| Окружение                        | Поле settings.json | По умолчанию                                           |
| -------------------------------- | ------------------ | ------------------------------------------------------ |
| `MUSIC_DOWNLOADER_OUTPUT`        | `output`           | Linux XDG_MUSIC_DIR из user-dirs.dirs; иначе `~/Music` |
| `MUSIC_DOWNLOADER_QUALITY`       | `quality`          | `best`                                                 |
| `MUSIC_DOWNLOADER_CONCURRENCY`   | `concurrency`      | `4`                                                    |
| `MUSIC_DOWNLOADER_OVERWRITE`     | `overwrite`        | `false`                                                |
| `MUSIC_DOWNLOADER_SKIP_EXISTING` | `skipExisting`     | Без перезаписи                                         |
| `MUSIC_DOWNLOADER_JSON`          | `json`             | `false`                                                |
| `MUSIC_DOWNLOADER_LOG_LEVEL`     | `logLevel`         | `info`                                                 |
| `MUSIC_DOWNLOADER_LOG_FILE`      | `logFile`          | Файла нет                                              |
| `MUSIC_DOWNLOADER_DEBUG`         | `debug`            | `false`                                                |

Булевы значения окружения — `true`/`false`; в JSON — настоящие boolean. Для перезаписи используется первый явно заданный режим на самом высоком уровне приоритета. Одновременные `overwrite=true` и `skipExisting=true` на этом уровне дают ошибку; нижние уровни не заменяют выбранный режим. CLI читает Linux user-dirs как данные и не исполняет shell.

В режиме `--json` stdout содержит только исходные NDJSON DTO `CliRecord`: события целевого job и безопасные `CommandResult` команд/ошибок. Для удалённого resume/retry без локальных событий выводится исходный конечный результат снимка. Human output, уведомление авторизации и логи идут в stderr. `--debug` показывает только уже очищенный `error.details.debug.stack`, не меняет уровень логирования. В обычном режиме stack скрыт; NDJSON сохраняет все поля публичного DTO.

Logging настраивается через публичный `RuntimeAdapters.logging`. Application пишет очищенный JSONL в stderr и при `--log-file` добавляет записи в указанный файл. Родительские каталоги файла должны существовать; по умолчанию файл не создаётся. Отказ bootstrap или sink даёт безопасную ошибку без исходного исключения и пути.

| Результат                                                       | Exit code |
| --------------------------------------------------------------- | --------- |
| Успешная команда, completed (в том числе все skipped)           | 0         |
| completed_with_errors                                           | 1         |
| Ошибка использования/настроек                                   | 2         |
| Ошибка выполнения, failed, interrupted, account без авторизации | 3         |
| Подтверждённый paused, включая Ctrl+C и AUTH_REQUIRED           | 4         |
| cancelled                                                       | 5         |
| LEASE_HELD_BY_OTHER_OWNER или OWNER_ACK_TIMEOUT                 | 6         |

Ctrl+C до запуска не начинает работу; после запуска запрашивает одну паузу, когда публичный API подтверждает активное выполнение. `job.created` ещё не подтверждает аренду. CLI дожидается результата запуска, паузы, shutdown и flush; отказ cleanup влияет на exit code. При гонке с завершением возвращается фактический итог job. OWNER_ACK_TIMEOUT означает отсутствие подтверждения: команда может примениться позже, CLI не повторяет её автоматически.

Для `auth` необходимы браузер и доступный системный secure storage; пройдите подтверждение в открытой странице. Сохранённая сессия позволяет выполнить `account` и загрузку в следующем процессе. CLI не принимает token, пароль или challenge. После `logout` application удаляет запись системного store.
