# STEP-060 — Подготовка рабочего канала GitHub Releases

## Подтверждённые факты

Владелец открыл текущий репозиторий. Анонимный GitHub API подтвердил `private=false`, `visibility=public`; на момент проверки релизов и тегов нет. Это подтверждает доступность исходников, но не работоспособность канала обновлений.

Публичный Ed25519-ключ получен существующей командой `release-update.mjs init-key` из системного Secret Service Linux. Проверочная подпись и её проверка подтвердили соответствие открытого ключа существующему закрытому ключу. Закрытый ключ не экспортировался и не выводился. Публичный trust настроен на текущий GitHub Releases и точные origins `https://github.com` / `https://release-assets.githubusercontent.com`.

Ограниченный анонимный HEAD стороннего публичного GitHub Release asset подтвердил цепочку `github.com 302 → github.com 302 → release-assets.githubusercontent.com 200`. Исходный публичный URL и безопасные origins сохранены; подписанные redirect URL не записывались. Это не проверка ещё отсутствующего релиза текущего проекта.

Целевой поиск узнаваемых закрытых PEM/OpenSSH ключей, GitHub tokens и AWS access keys не дал совпадений в истории `git log --all -G` и 1741 текущем tracked/untracked файле вне ignored. Проверка не является универсальным обнаружителем секретов; значений секретов в журнале нет. Подробности и границы — [preparation.json](preparation.json).

## Ещё не подтверждено

Рабочий опубликованный канал, production-пакеты N/N+1, реальная анонимная загрузка 12 assets и пользовательское Linux-обновление с сохранением состояния пока отсутствуют. Старые local 0.0.0/0.0.1 и Evidence STEP-036/054 не подменяют эти доказательства.

Для release-сборки требуется чистое дерево с точным тегом текущего HEAD. Реализация и план сейчас не закоммичены; commit выполняется только по отдельной canonical-команде владельца. Владелец создаёт/публикует теги и Releases явными действиями согласно runbook. STEP не завершён до реальных внешних и ручных проверок.

## Локальная реализация и review

Main поддерживает плоские GitHub assets, запрещает prerelease в stable и привязывает подписанный URL пакета к конкретному тегу версии. `release-update.mjs prepare-release/verify-release` подготавливает полный комплект четырёх целей, сверяет shipping trust и detached-подписи. Индекс не принимает локальные проверочные сборки вместо production-кандидатов.

Независимый локальный code review обнаружил один воспроизводимый дефект: verifier сравнивал inputs старого N с текущими исходниками N+1. Исправление сохраняет фактические build-input bytes после первичной проверки чистой tagged-сборки, связывает snapshot с точным manifest и использует его для исторического кандидата. Проверки окончательных пакетов не отключены. Regression двух разных snapshots, их подмены и current-source проверки вошёл в release-contract.test.mjs; обе узкие suites после исправления — 30 тестов PASS. Повторный независимый fix-delta review подтвердил закрытие finding без новых material defects; focused regression выполнен reviewer. Это локальное review не заменяет будущий canonical REVIEW и его security/tests gates.

Первый полный deterministic Verification дал PASS для typecheck, npm test, build и обеих contract suites. Общий lint выявил прежний относительный workspace import в mac-retry-kit.mjs:341; пользователь отдельно разрешил механическую замену на `@music-downloader/application`. Разрешение сохранено этой записью; импорт проверен и экспортирует createApplication. Прочий Mac-код не менялся.

`verify-release` без настоящего индекса кандидатов корректно завершился exit 1 с указанием сначала зафиксировать код и предоставить stable-тег. Этот отказ не считается PASS и не скрывается fixtures. Окончательные результаты команд находятся в generated Verification Evidence текущего STEP.

## Итог повторной проверки

После исправления reviewer finding и разрешённого импорта deterministic `verify-step.py STEP-060` повторно выполнил весь контракт. PASS: Harness validation, общий lint, typecheck, полный npm test, build, update-contract suite и release-contract suite. FAIL только у `release-update.mjs verify-release`: настоящие release-кандидаты ещё не созданы. Три ручные проверки публичного комплекта/UI N → N+1/runbook остаются pending.

Локальная реализация проверена; полный STEP не завершён. Следующее действие владельца — `GIT COMMIT` для подготовленного изменения, затем разрешённая публикация кода и явные stable-теги/релизы согласно инструкции. Никаких коммитов, тегов или Releases агент не создавал.
