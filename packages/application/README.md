# Application API

`createApplication(runtimeAdapters)` создаёт единственную application boundary для
CLI и будущего desktop main process. Публичные DTO и `ApplicationApi` доступны из
`@music-downloader/application/contracts`; этот entrypoint не импортирует Node
composition root.

`runtimeAdapters` позволяет передать `manifestStore`, `credentialStore`, каталог
состояния, logger, diagnostics, processing hooks и concurrency. Поле `logging`
принимает host-конфигурацию `level` (`error`…`trace`, по умолчанию `info`),
`filePath` и `debug`. При `filePath` уже отредактированная JSONL-запись синхронно
добавляется в stderr и указанный файл; stdout для logging не используется. Путь
проверяется при создании, parent-каталоги не создаются, а ротация, retention и
расположение по умолчанию не определяются application. Нельзя сочетать injected
`logger` с `logging.level` или `logging.filePath`; `logging.debug` с injected
logger допустим. Без override root
создаёт `FileManifestStore`, определяет каталог через `resolveStateDirectory`,
использует `CliCredentialStore`, structured logger и Yandex provider. При
`providerOverride` default provider, native keyring и browser/device-auth не
создаются: это путь mock provider для тестов и E2E.

`concurrency` принадлежит экземпляру application и ограничена диапазоном 1–8;
все его job используют один scheduler. Разные экземпляры не делят подписки,
provider или последовательности событий.

Каждая команда возвращает versioned `ApplicationResult`. Исключения нормализуются
в JSON DTO `code/message/retryable`; credentials, signed URL и runtime objects в
DTO не попадают. При `logging.debug: true` `error.details.debug.stack` содержит
только безопасный header нормализованной ошибки и её frames, прошедшие редакцию;
исходный stack и cause библиотек не переносятся. В обычном режиме этого поля и
stack в stderr нет. `logout` завершается успехом только после provider
logout. `preview` получает metadata и artwork через provider, возвращая artwork
как MIME и base64, и не открывает audio stream.

`createDownload` сначала создаёт manifest и публикует `job.created`,
`entity.resolved`, `plan.created`, затем ожидает `manager.run` и возвращает
конечный snapshot. `resume` и `retry` возвращают snapshot после применения
команды и запуска фоновой работы; дальнейшее наблюдение выполняется через
`getJob` и `subscribe`. `pause` использует shutdown собственного manager, а
`cancel` следует существующему control path core. Успешный `shutdown` ждёт
bounded release; terminal event сам по себе release не доказывает.

`listJobs` и `getJob` используют только `ManifestStore.list/read/readLeaseState`.
Это независимые snapshots без общей транзакции и без writer capability. Для
`active` lease snapshot содержит `leaseAlive=true`, для `inactive` — `false`.
Если `unknown` меняет агрегированный status, команда возвращает безопасный
`DOWNLOAD_ERROR`; отсутствующий job в `getJob` возвращается как `data: null`.

Ошибки команд управления могут дополнять `code` полем `error.details.reason`:

| `reason`                    | `code`             | Значение                                                                          |
| --------------------------- | ------------------ | --------------------------------------------------------------------------------- |
| `JOB_NOT_FOUND`             | `VALIDATION_ERROR` | Job для `pause/resume/retry/cancel` отсутствует; его каталог не создаётся.        |
| `LEASE_HELD_BY_OTHER_OWNER` | `VALIDATION_ERROR` | `resume` запущенного job отклонён при наблюдаемой живой аренде другого владельца. |
| `OWNER_ACK_TIMEOUT`         | `DOWNLOAD_ERROR`   | Запрос переслан при живой аренде, но подтверждение владельца не получено вовремя. |

Причины не меняют `schemaVersion: 1`, не содержат данные владельца и имеют
`retryable: false`. `details` расширяется независимыми необязательными ключами;
клиенты игнорируют неизвестные ключи и причины, сохраняя обработку по `code`.
`resume` paused job по-прежнему пересылается владельцу. Отказ в receipt сохраняет
исходный `code` без причины; неподтверждённая аренда также не получает lease-признак.
`OWNER_ACK_TIMEOUT` означает только отсутствие подтверждения: запрос остаётся
в inbox и может быть применён текущим или следующим владельцем. Проверяйте
состояние через `getJob`; отображение причины и exit code относятся к клиентам
(STEP-019). Соглашение о независимых ключах `details` применяется и к STEP-046.

Default download adapter использует текущую filesystem-классификацию:
отсутствующий путь — `absent`, обычный файл — `valid`, другая запись — `invalid`.
Запись проверяет EOF и ожидаемый размер, finalization сохраняет атомарный rename.
Полная проверка контейнера/длительности остаётся в STEP-023, а metadata tagging —
в STEP-021. Пока hooks не переданы host, `validation.completed` и
`metadata.written` не публикуются.
