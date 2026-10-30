# STEP-060 — Рабочий канал GitHub Releases и реальное Linux-обновление

## Фактический результат

Опубликованы [v0.1.0](https://github.com/yarkovaleksei/yandex-music-downloader/releases/tag/v0.1.0) и [v0.1.1](https://github.com/yarkovaleksei/yandex-music-downloader/releases/tag/v0.1.1), оба на revision `e29369a4e49b815da1be730abbf0bf3da3c908ad`. Это настоящие stable-теги и release-пакеты; исходный код один, версии готовых приложений разные. У каждого релиза ровно 12 assets: четыре пакета, четыре описания и четыре Ed25519-подписи. Черновики проверены по именам/размерам/server SHA-256 до публикации. Все 24 файла после публикации скачаны анонимно и совпали с локальными проверенными bytes; signed CDN redirect URLs не сохранены. [Сводка](public-release.json), manifests/receipts/descriptors — в каталогах [v0.1.0](v0.1.0) и [v0.1.1](v0.1.1).

Приватный ключ остаётся в Secret Service Linux. Проверка соответствия publicKey/system key описана в [preparation.json](preparation.json); временные ключи tests не подменяют production trust. Ранее зафиксированные отсутствие тегов/канала и FAIL были промежуточным состоянием, а не доказательством текущего отказа.

## Реальное пользовательское обновление

[linux-update.json](linux-update.json) связывает точные package hashes, baseline, UI-действия и ограничения. Неизменённый shipping AppImage0.1.0 запущен в изолированном Ubuntu24.04 runtime, без установленного Node.js/FFmpeg, DevTools и подмены ASAR. Baseline содержит синтетическую завершённую историю и tone.mp3; пользовательские токены/данные не используются. Через настоящие поля UI сохранены quality=normal и concurrency=3, запись видна в History.

Через обычные кнопки shipping UI выполнены check production GitHub → available0.1.1 → download → verified → open folder. Реально скачанный файл 151948194 bytes совпал с опубликованным SHA-256. После закрытия приложения SIGTERM скачанный AppImage извлечён, mount `/app` вручную заменён между запусками при прежнем `/report`; это не автоматическая установка внутри программы. UI0.1.1 показывает новую версию, прежнюю историю и настройки, повторная проверка сообщает current. [before-state.json](before-state.json) и [after-state.json](after-state.json) совпали по всем сохранённым settings/job manifest/schema и контрольному MP3:49572bytes, SHA-256 `ad000a6d13917c2cfdd6b84996d8fbb506b325dae065a2b0e00ae701fcb6f37f`.

Снимки: [N About](ui/11-n-about.png), [available](ui/24-n-fresh-result.png), [verified](ui/26-n-download-result.png), [папка](ui/28-n-folder-visible.png), [файл](ui/30-n-package-in-folder.png), [History после](ui/32-next-history.png), [настройки после](ui/33-next-settings.png), [версия после](ui/34-next-about.png), [current](ui/36-next-current.png). [ui-actions.json](ui-actions.json) — фактические X11-действия; [runtime](runtime) содержит использованные Dockerfiles/launcher/driver. Исходный Dockerfile runtime наследует локальный smoke image из `apps/desktop/packaging/Dockerfile.smoke`; второй добавляет файловый менеджер. Настоящий GUI управлялся xdotool/scrot, не прямыми вызовами IPC или service вместо пользовательского потока.

## Наблюдения и границы

Первые запросы в уже открытой N-сессии после публикации ещё показывали current; конкретная причина не установлена. После обычного перезапуска N свежая проверка увидела0.1.1 без подмены клиента/feed/ключа. Предыдущий [снимок](ui/19-n-update-result.png) сохранён. Из этого не выводится ни доказанный code defect, ни обещание мгновенного распространения latest.

В минимальном runtime без активной desktop D-Bus session Electron fallback открыл PCManFM в родительском userData. В portable-updates выполнен обычный переход; проверенный пакет показан. Это не доказательство нативной FileManager1-интеграции всех Linux desktops. Авторизация/credential backend, FUSE/desktop integration и новый Windows/macOS запуск не проверялись. Применён контейнерный --no-sandbox; ship fuses/preferences сохранены. Исторические native STEP054 отчёты остаются привязанными к своим старым hashes.

## Проверки

`prepare-release v0.1.0` и `prepare-release v0.1.1` завершились exit0: четыре shipping targets каждого релиза, ASAR/version/trust/native closure/fuses и подписи проверены. `verify-release` вызывает существующий package verifier по exact indexed directories пары, исключая stale local defaults. Снимки build inputs связаны с exact manifest hash для исторических revisions. Публикация и сборочный manifest разделены: published:false/signed:false в manifest описывают сборщик и отсутствие системной подписи; фактическая публикация и собственные Ed25519-подписи подтверждены отдельными receipts.

Первый локальный review нашёл и подтвердил ошибочное сравнение inputs исторического N с текущим checkout. Исправление и regression двух разных snapshots прошли; повторный local review PASS. По отдельному разрешению владельца исправлен прежний относительный импорт Mac-скрипта, блокировавший общий lint. Последующие canonical Verification и независимый schema-valid REVIEW фиксируются в текущем STEP и его immutable review report; этот документ не заменяет их completion gate.
