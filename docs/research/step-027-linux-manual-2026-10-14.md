# STEP-027 — промежуточное evidence ручной проверки Linux

Дата наблюдения: 2026-10-14. Это дополнение к [предыдущему отчёту](../../planning/audits/AUDIT-20261013T213918Z.md), а не завершённая приёмка. Production и сохранённые задания не изменялись.

## Вывод, предоставленный пользователем

- Node.js: `v24.21.0`; штатный `node apps/cli/dist/index.js --help` выводит команды CLI.
- `account`: аккаунт авторизован, exit 0. Идентификатор и имя аккаунта в evidence не сохраняются.
- `doctor --output <VERIFY_ROOT>`: `Диагностика: OK`, exit 0, `PROVIDER_SCHEMA_VERSION: 1.1.0`. runtime, credentials, provider, auth, account, metadata, audioVariants, manifestStore, filesystem и FFmpeg — ok. Права token-файла — skipped/NOT_APPLICABLE.
- После прерывания пользователь сообщил exit 4; вызов download и его события в переданном фрагменте отсутствуют.
- `resume a0a4acc4-f1e6-41ea-9cf8-2a823130f162 --json`: пользователь сообщил exit 0 и воспроизведение конечного MP3. События resume в переданном фрагменте отсутствуют; отсутствие вывода самой команды не установлено.

## Независимое чтение локальных файлов

Прочитаны только безопасные поля manifest и итоговое аудио. Credentials, lease owner token и подписанные URL не выводились и не сохранялись.

- Задание `a0a4acc4-f1e6-41ea-9cf8-2a823130f162`: трек completed, requested quality best, выбран MP3 192 kbit/s. Собственный `.b275adb2-1.part` отсутствует.
- В history этого трека до resume записаны resolving и ready; downloading до паузы не записан. После resume записаны resolving, ready, downloading, processing. Прерывание фактически начавшегося download этим заданием пока не подтверждено.
- Оставшийся `Bad Meets Evil - Living Proof.mp3.1031c0cd-1.part` принадлежит другому заданию `5fceba3a-7dbd-4bdb-9909-84ec9f10e329`, его трек paused. Физический размер и manifest partial.bytes совпадают: 1 211 241 байт. Это сохранённая незавершённая загрузка, а не orphan завершённого задания.
- Оба задания используют одну папку track-1 и один resultPath. Для дальнейших квалифицированных циклов нужны независимые output/job, чтобы существующий результат не заменил download.

Итоговый файл прочитан через установленный `music-metadata`; выполнен существующий `createAudioValidator().validate({path, variant})` из built validation package, exit 0. Это read-only инспекция, не новый тест или изменение реализации.

| Поле | Наблюдение |
| --- | --- |
| Файл | Bad Meets Evil - Living Proof.mp3 |
| Размер | 5 701 954 байта |
| SHA-256 | 20b1633012c5c046bec8f723ca6ba42545bf864e7d49d2a827b89bee0ceead1c |
| Validation | PASS, durationMs 235416 |
| Аудио | MPEG 1 Layer 3, CBR 192000 bit/s, 44100 Hz, stereo |
| Теги | ID3v2.4 и ID3v1 |
| Название | Living Proof |
| Исполнитель | Bad Meets Evil |
| Альбом | Hell: The Sequel |
| Год / номер / жанр | 2011 / 10 / rap |
| Встроенная обложка | JPEG, 50 026 байт |

## Следующая проверка

Реальное скачивание, восстановление после ранней паузы, конечный файл, теги и обложка подтверждены. Первый полный цикл interruption/resume остаётся pending: начать новый job в пустой папке, дождаться фактического download/progress, нажать Ctrl+C, подтвердить paused/exit 4, затем resume и completed/exit 0. Состояния других jobs вручную не менять и `.part` не удалять. Полная матрица Linux/macOS/Windows и решение владельца go остаются pending.

## Первый полный цикл Linux / track

Последующее вложение пользователя от 2026-10-14 содержит stdout скачивания и resume, Ctrl+C и коды выхода. Ниже — сводка наблюдений; полный вывод и значения секретов в репозиторий не копировались.

- Задание: `a0b44df0-3488-47b4-ac75-7e038b33a135`, новая папка `track-2`.
- Команда: `node apps/cli/dist/index.js track <TRACK_URL> --json --quality best --output <VERIFY_ROOT>/track-2`.
- До прерывания: download.started, 226 событий track.progress; последний bytes — 3 701 609. Затем Ctrl+C, exit 4.
- Manifest history подтверждает downloading в 06:43:28.414Z и paused в 06:43:30.423Z.
- Новый процесс: `node apps/cli/dist/index.js resume a0b44df0-3488-47b4-ac75-7e038b33a135 --json`, exit 0.
- Первый progress после resume — 3 701 609 байт, последний — 5 650 599 байт. Зафиксированы download.completed, metadata.written, validation.completed, job.progress completed=1/total=1 и job.completed.
- Независимое чтение manifest подтверждает completed, requested quality best и выбранный MP3 192 kbit/s.
- В папке только итоговый MP3, собственный `.part` отсутствует. Размер 5 701 954 байта; SHA-256 совпадает с ранее проверенным и прослушанным файлом: `20b1633012c5c046bec8f723ca6ba42545bf864e7d49d2a827b89bee0ceead1c`.
- Повторная read-only validation существующим built validator: PASS, durationMs 235416. Независимое чтение подтверждает теги Living Proof / Bad Meets Evil / Hell: The Sequel / 2011 / track 10 / rap и JPEG-обложку 50 026 байт.

Итого подтверждён **1/3 цикл Linux / track**, всего **1/27**. Ранняя пауза предыдущего задания в эту серию не включается. Остальные ячейки и owner go pending; STEP-027 остаётся незавершённым.

## Второй и третий циклы Linux / track

Следующее вложение пользователя содержит два новых download/resume в независимых папках. Это фактические успешные циклы; ниже отдельно указан пробел записи exit code.

| Цикл | Папка / jobId | Байты перед паузой и первый progress resume | Пауза | Resume |
| --- | --- | --- | --- | --- |
| 2 | track-3 / 7f412610-908e-4635-997b-cc1f49e70f9c | 3 144 553 / 3 144 553 | Ctrl+C; paused в jobs и manifest; exit code не сохранён во вложении | job.completed; exit 0 |
| 3 | track-4 / a4ede831-acb5-4db0-9a5b-c26e84d1ba5e | 1 522 538 / 1 522 538 | Ctrl+C; paused в jobs и manifest; exit 4 | job.completed; exit 0 |

- В обоих manifest history подтверждены downloading → paused → downloading → processing; конечный статус трека completed.
- Оба resume завершились событиями download.completed, metadata.written, validation.completed, job.progress completed=1/total=1 и job.completed.
- Requested quality best; выбран MP3 192 kbit/s. Итоговые файлы в track-3 и track-4 имеют размер 5 701 954 байта и SHA-256 `20b1633012c5c046bec8f723ca6ba42545bf864e7d49d2a827b89bee0ceead1c`.
- Независимая read-only validation обоих файлов: PASS, durationMs 235416. Прочитаны корректные название, исполнитель, альбом, год, номер, жанр и JPEG-обложка 50 026 байт, как в первом цикле.
- Каждая папка содержит только свой итоговый MP3; собственных `.part` нет.

Подтверждено три последовательных успешных download/interruption/resume для Linux / track. Для полноты записи второго цикла код выхода download после Ctrl+C остаётся unknown: paused доказан независимо, но exit 4 не реконструируется. Это пробел evidence, не установленный дефект продукта; полного PASS по всем требованиям STEP-027 пока нет. Следующая ячейка — Linux / album, с сохранением completed трека при resume. Код выхода после каждой паузы нужно печатать сразу, до jobs и других команд.
