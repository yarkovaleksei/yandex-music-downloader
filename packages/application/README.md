# Application API

`createApplication(runtimeAdapters)` создаёт единственную application boundary для
CLI и будущего desktop main process. Публичные DTO и `ApplicationApi` доступны из
`@music-downloader/application/contracts`; этот entrypoint не импортирует Node
composition root.

`runtimeAdapters` позволяет передать `manifestStore`, `credentialStore`, каталог
состояния, logger, diagnostics, processing hooks и concurrency. Без override root
создаёт `FileManifestStore`, определяет каталог через `resolveStateDirectory`,
использует `CliCredentialStore`, structured logger и Yandex provider. При
`providerOverride` default provider, native keyring и browser/device-auth не
создаются: это путь mock provider для тестов и E2E.

`concurrency` принадлежит экземпляру application и ограничена диапазоном 1–8;
все его job используют один scheduler. Разные экземпляры не делят подписки,
provider или последовательности событий.

Каждая команда возвращает versioned `ApplicationResult`. Исключения нормализуются
в JSON DTO `code/message/retryable`; credentials, signed URL, stack и runtime
objects в DTO не попадают. `logout` завершается успехом только после provider
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

Default download adapter использует текущую filesystem-классификацию:
отсутствующий путь — `absent`, обычный файл — `valid`, другая запись — `invalid`.
Запись проверяет EOF и ожидаемый размер, finalization сохраняет атомарный rename.
Полная проверка контейнера/длительности остаётся в STEP-023, а metadata tagging —
в STEP-021. Пока hooks не переданы host, `validation.completed` и
`metadata.written` не публикуются.
