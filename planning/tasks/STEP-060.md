---
schema: 1
id: STEP-060
status: in_progress
type: implementation
priority: high
phase: packaging
depends_on:
  - STEP-036
  - STEP-054
  - STEP-059
requirements:
  - REQ-055
adrs:
  - ADR-014
  - ADR-015
  - ADR-019
architecture_refs:
  - docs/architecture.md#deployment-runtime-assumptions
  - docs/architecture.md#security-boundaries
architecture_outputs:
  - docs/architecture.md#deployment-runtime-assumptions
risk_flags:
  - security-sensitive
  - release-critical
plan:
  status: ready
  revision: 1
  context_basis: sha256:b13d5863c7c40f9b85ef5902cc03ce086ffd2f21d8f929bc67d45e8042605d9a
  content_hash: sha256:e8de6564ef7d5c5c77998cdf92c0379e89e43530d43f098e47078fa0c72c9d3d
  reviewed_report: planning/plan-reviews/STEP-060/PLAN-REVIEW-20261030T111807Z.md
  planned_at: 2026-10-30T11:18:07+00:00
  execution_groups:
  context_components:
    - "ADR@ADR-014=sha256:d21dd58fd7f4167a6b4820ba1f26624fcf440fb7a3f9fdc926e1ec517a969f39"
    - "ADR@ADR-015=sha256:0fd7f2940c2f6ac5a15eda9b9c9ad7c6a961062d03a4eedd4e3dd03eb8750d53"
    - "ADR@ADR-019=sha256:661497200e97275c9243a5f4b2594b02b1d04a026a4c6c9a65f4dc6f95dc3a7b"
    - "ARCH@docs/architecture.md#deployment-runtime-assumptions=sha256:fc520397c4d2e3737c000cc225b7b76b4ec3aef0d626169e608e2954cab41cf9"
    - "ARCH@docs/architecture.md#security-boundaries=sha256:f213ddc0354e3d3e9f61f234de7da6f7042599f8ec5b729713bdf760b82904ab"
    - "PRN@PRN-001=sha256:3b3801f207fafc3f77272f0e93570258a6d006964839d93a276accd814d548af"
    - "PRN@PRN-002=sha256:f29ee3fbdb9cf65cf9739d0907768bbf192ad88b8e443110d4d82f81c6b79ecb"
    - "PRN@PRN-003=sha256:16516d7d302fecda5f7615f9d55e29e04b588d671f8660640e1f61d1619e4ef8"
    - "REQ@REQ-055=sha256:e4731b7b3358ed18f86243667a9869ea67b35d2d9358bd4fbdbbb66b5bf9015e"
    - "STEP@STEP-036=sha256:9ce7a5f5a64a3109c8857f00d1c362f0af392516eafd394cc54af0c2093b8087"
    - "STEP@STEP-054=sha256:2163f5a4545a13408b90f389a083adaf0e9fa473d5869191a4f6fe1a7658662c"
    - "STEP@STEP-059=sha256:e69e0f8f7a2a4fa107c669d971f96dfc78ce958951513a6cafca5eddb9f05cf4"
    - "STEP@STEP-060=sha256:91f7b892528a9ef9d7858936d1048b3171f59db393995788b0b2087dda278937"
---

# STEP-060 — Рабочий канал обновлений через GitHub Releases

## Goal

Пользователь готовой сборки получает и скачивает проверенное обновление через публичный GitHub Releases без GitHub-аккаунта или токена, затем вручную заменяет portable-приложение с сохранением данных.

## Context

STEP-036 реализовал portable-обновления, но `apps/desktop/packaging/update-trust.json` содержит пустые feed/publicKey/origins. STEP-054 завершил нативную приёмку конкретных проверочных сборок; публикация и рабочий канал в прежние STEP не входили. STEP-058/059 изменили приложение после проверочных сборок, поэтому старые отчёты не подтверждают новые артефакты автоматически. Поиск пересечений не выявил существующего STEP, который владеет подключением production-канала.

Решение владельца от 2026-10-30: сделать текущий репозиторий `yarkovaleksei/yandex-music-downloader` публичным и распространять сборки через прикреплённые к GitHub Releases файлы. Альтернатива с отдельным публичным репозиторием только для сборок рассмотрена и не выбрана. Смена видимости и публикация выполняются при реализации отдельными явными действиями; STEP ADD их не выполняет.

GitHub Releases является размещением HTTPS-файлов внутри модели ADR-019, без изменения границ доверия или ручного процесса замены. GitHub документирует `/releases/latest/download/<asset-name>`; текущий service строит `<channel>/<target>/latest.json`, поэтому требуется ограниченная адаптация адресации. Приватный ключ уже обслуживается Linux credential store командой `release-update.mjs`; готовность production-ключа проверяется, не предполагается.

Источники: [ссылки GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/linking-to-releases), [модель релизов и вложений](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases). Реализация: `apps/desktop/src/main/update/service.ts`, `apps/desktop/scripts/release-update.mjs`, `apps/desktop/packaging/release-key.mjs`.

## Scope

- Подготовить текущий репозиторий к публичной раздаче и зафиксировать смену видимости явным действием владельца/авторизованного workflow. До открытия выполнить целевую проверку публикуемого содержимого и истории на секреты; обнаруженная утечка блокирует публикацию до отдельного решения, история автоматически не переписывается.
- Подготовить повторяемую локальную Linux-процедуру сборки, подписи и публикации GitHub Release из точного revision/тега. Для Windows x64, macOS arm64/x64 и Linux x64 публикуются окончательные portable-пакеты и соответствующие Ed25519 descriptor/signature.
- Настроить production publicKey/feed/origins в поставляемом ASAR и входных хешах сборки; сохранить приватный ключ в системном защищённом хранилище Linux. Адаптировать только адресацию описаний/подписей под реальные Release assets и необходимые HTTPS-перенаправления.
- Определить имена вложений и правила выбора stable-релиза: черновик, prerelease, неполный или несовместимый релиз не предлагается как готовое обновление. Описание и подпись при конкурентной публикации не должны приводить к принятию непроверенных байтов; безопасный отказ допускает повторную проверку.
- Подготовить релиз как черновик с полным набором проверенных вложений, затем опубликовать. Не заменять уже опубликованные пакеты другой сборкой с той же версией; исправление выпускается новой версией.
- Проверить реальное анонимное получение описания/подписи/пакета и Linux N → N+1 через опубликованный канал. Первичная установка сборки с настроенным trust выполняется вручную: ранее выпущенная disabled-сборка сама канал не получит.

## Mutation policy

### Allowed

- `apps/desktop/packaging/**`, `apps/desktop/scripts/**`, `apps/desktop/src/main/update/**` и узкие связанные тесты/сборочные входы для рабочего канала и публикации.
- `docs/development.md`, `docs/architecture.md#deployment-runtime-assumptions`, Evidence в `apps/desktop/evidence/STEP-060/**`, traceability REQ-055/ADR-019.
- Публичная конфигурация доверия в сборке; публичные пакеты, описания релизов, подписи и инструкции по ручному обновлению.

### Conditional

- Минимальная правка DTO/renderer только если необходима для честного отображения состояния рабочего канала; без нового UX-процесса обновления.
- Git/provider mutations, создание тегов и релизов — только через разрешённые canonical Git commands, configured gitPolicy и exact разрешённый план. Если публикация Release/смена видимости не поддержана текущим workflow, выполнить её как явное действие владельца и сохранить factual evidence; не расширять Harness ради этого STEP.
- Дополнительные платформенные проверки — только для затронутого поведения и точных новых артефактов по установленным release gates. Исторический STEP-054 и его immutable отчёты сохраняются; будущая готовность релиза оценивается отдельно от подключения канала.

### Forbidden

- Приватные ключи, GitHub-токены, cookies, signed URLs и credentials в репозитории, пакетах, arguments/logs/Evidence; GitHub credentials внутри клиентского приложения.
- Отключение проверки подписи/hash/size, wildcard origins, доверие ключу из сети, исполнение скачанного пакета.
- Автоматическая установка, фоновое скачивание, новый installer, платные сертификаты/notarization, изменение provider API, SQLite/migrations/credential ownership.
- Переписывание Accepted ADR и исторических PASS/FAIL, автоматическая очистка Git-истории, изменения Harness/CI.

## Out of scope

- Собственный сервер обновлений/CDN, отдельный репозиторий раздачи, обязательный GitHub Actions pipeline.
- Beta/dev-каналы, ротация ключей и автоматическое восстановление/откат базы.
- Полная повторная разработка упаковки или повтор всей платформенной матрицы без относящихся к изменению причин.

## Acceptance criteria

- Текущий репозиторий публичен; выбранный стабильный релиз и его четыре portable-пакета, целевые описания и подписи доступны по HTTPS без авторизации. Для каждого пакета записаны version/tag/revision/target/size/SHA-256; клиент получает правильную ОС/архитектуру.
- Поставляемая сборка содержит рабочие адреса, production Ed25519 publicKey и конкретные разрешённые origins. Публичный ключ соответствует ключу подписания в системном хранилище Linux; private key и GitHub credentials отсутствуют в распространяемых данных.
- В реальном Linux-приложении N явная проверка через публичный канал показывает N+1; скачивание проверяет подпись описания и реальные size/SHA-256. Открытие папки работает; после ручной замены N+1 запускается с прежними SQLite/настройками и контрольным аудиофайлом. Реальный аккаунт/токен для этой проверки не требуется.
- Повторная проверка в N+1 сообщает об актуальной версии. Повреждённые/неполные подписи и пакеты, неверная цель/версия/origin и сетевой отказ не приводят к готовому пакету; эти негативные сценарии проверяются изолированно, без подмены опубликованного production-канала.
- Подготовка следующего релиза воспроизводима по инструкции с Linux; публикация происходит после проверки полного набора assets. Пользователю объяснены ручная первичная установка и ручная замена; бесшовное обновление и системная подпись не обещаются.
- Evidence связывает действительные публичные адреса, revision/build ID, версии, целевые хеши, результаты анонимной загрузки и Linux N → N+1. Оно отличает новый прогон от старых платформенных отчётов STEP-054.

## Verification

- command: `python3 .harness/tools/validate.py --mode manual`
- command: `npm run lint`
- command: `npm run typecheck`
- command: `npm test`
- command: `npm run build`
- command: `node --test apps/desktop/packaging/update-contract.test.mjs`
- command: `node --test apps/desktop/packaging/release-contract.test.mjs`
- command: `node apps/desktop/scripts/release-update.mjs verify-release`
- manual: Проверить публичную видимость текущего репозитория и анонимную HTTPS-загрузку 12 обязательных Release assets для четырёх целей; сверить descriptor/signature/version/tag/revision/size/SHA-256 с окончательными пакетами и trust в собранном ASAR. Подтвердить прохождение применимых release gates до публикации.
- manual: Выполнить реальный Linux N → N+1 через пользовательский UI и production-канал: проверить, скачать, открыть папку, вручную заменить, запустить и подтвердить сохранение SQLite/настроек/истории/контрольного аудиофайла; в N+1 подтвердить актуальную версию. Записать exact versions/build IDs/hashes и фактические действия.
- manual: Сверить runbook публикации, ручную первичную установку, docs/development.md и docs/architecture.md#deployment-runtime-assumptions с code/Evidence; подтвердить отсутствие секретов в публикуемом содержимом/истории/пакетах/отчётах. Проверить сохранность старых платформенных отчётов и отсутствие переноса PASS на новые хеши; внешние visibility/tag/Release действия подтверждены владельцем.

## Deliverables

- Рабочая публичная конфигурация `apps/desktop/packaging/update-trust.json`, ограниченная адаптация `apps/desktop/src/main/update/**` и регрессионные тесты.
- Linux-процедура подготовки/подписи/публикации в `apps/desktop/scripts/**`, публичный GitHub Release с четырьмя portable-пакетами и целевыми описаниями/подписями.
- Инструкция `docs/development.md`, обновлённый `docs/architecture.md#deployment-runtime-assumptions` и фактические доказательства `apps/desktop/evidence/STEP-060/**`.

## Implementation plan

### 1. Подготовить безопасное открытие репозитория и production trust без публикации

- Проверить текущее содержимое и публикуемую Git-историю на секреты в пределах contract STEP-060; записать только безопасный перечень проверенных refs/paths и итог. При реальном секрете остановить открытие до отдельного решения; не выводить значения и не переписывать историю.
- Проверить доступ к Secret Service существующим release-update init-key: переиспользовать имеющийся Ed25519-ключ, получить только PEM/SPKI public key. Новый ключ создать лишь при его отсутствии; потеря/несоответствие ключа существующему trust требует остановки, автоматической ротации нет.
- Выполнить ограниченный анонимный probe GitHub release asset на descriptor/signature/package-пути, проверить необходимые HTTPS origins. В записи оставить исходные публичные URL, origins/status, без Location/query подписанных CDN URL. Если в текущем private-репозитории путь ещё недоступен, окончательный probe выполнить после явного открытия владельцем и до сборки с production trust.
- Подготовить update-trust.json с feedBaseUrl=https://github.com/yarkovaleksei/yandex-music-downloader/releases/latest/download/, channel=stable, реальным publicKey и только фактически необходимыми точными origins. Без сети/ключа не подставлять фиктивные значения; production сборка ждёт завершения этой подготовки.

**Files:**
- apps/desktop/packaging/update-trust.json
- apps/desktop/scripts/release-update.mjs
- apps/desktop/evidence/STEP-060/README.md

**Tests:**
- Проверка public key существующей detached-подписью без экспорта private key; сверка redacted probe.

**Risks:**
- Открытие репозитория публикует историю. Сейчас только подготовка; видимость меняет владелец явным действием после просмотра результата проверки.

### 2. Согласовать адресацию GitHub Release assets с существующим main updater

- Для production GitHub feed вычислять плоские имена update-stable-<target>.json и update-stable-<target>.json.sig для четырёх уже поддержанных targets. Для прежних HTTPS fixture/generic feed сохранить совместимую вложенную адресацию либо явно обновить узкие fixtures; не менять DTO/IPC/renderer без необходимости.
- Не менять schemaVersion1 и crypto boundary: exact descriptor bytes проверяются Ed25519 до JSON, затем version/channel/target/URL; стабильный канал не принимает prerelease-версию. Подписанный URL пакета указывает на конкретный /releases/download/<tag>/<artifact>, а не latest.
- Сохранить ограниченные redirects с проверкой каждого точного origin, таймаут, serial queue, size/hash, cleanup .part и перепроверку reveal. Ошибки не включают нативные исключения, signed CDN URLs и publisher credentials.
- В существующем update-contract test подтвердить GitHub-подобную цепочку flat assets/redirects и H-001: mismatch descriptor/signature при смене latest безопасно отказывает, согласованная следующая проверка проходит; target/channel/prerelease/signature/hash/size/origin/HTTP/partial/network отказ не создаёт готовый пакет. Использовать отдельные временные ключи/CA, не production-канал.

**Files:**
- apps/desktop/src/main/update/service.ts
- apps/desktop/packaging/update-contract.test.mjs
- apps/desktop/packaging/update-fixture.mjs

**Tests:**
- npm run build
- node --test apps/desktop/packaging/update-contract.test.mjs

**Risks:**
- Раздельные запросы к latest могут увидеть разные релизы; подпись обеспечивает отказ, допустимый contract, без новой транзакционной инфраструктуры.

### 3. Подготовить проверяемый release-комплект из окончательных tagged-пакетов

- Расширить локальный release-update tooling командами prepare-release <tag> и verify-release. prepare-release принимает только production stable SemVer tag, уже созданный владельцем, требует tag -> exact HEAD и clean tree для сборки; вызывает существующий package.mjs --tag, без --local-version и без внешних mutations.
- До production сборки изменения реализации проходят required STEP checks/review; владелец отдельно разрешает canonical GIT COMMIT/PUSH/PR. В PLAN/IMPLEMENT не создавать коммиты, теги и публикации автоматически. После фиксации владелец явно создаёт/публикует exact tag; при отсутствии такого tag готовый локальный комплект остаётся pending.
- Для каждого из четырёх target использовать окончательный package manifest после упаковки/mac transforms; вызвать verify-package.mjs с явным .cache/desktop-packaging/<tag>, исключив случайную проверку local-0.0.0. Сверить извлечённый trust из ASAR, исходный публичный config, встроенную версию, inputs, tag/revision и действительные size/SHA-256.
- Сгенерировать update-stable-<target>.json с immutable tag asset URLs; подписать exact bytes через существующий системный ключ и проверить подпись именно встроенным publicKey. Production signer не принимает private key файлом/env/аргументом; fixtures продолжают использовать отдельный ключ.
- prepare-release сохраняет локальный индекс кандидата .cache/desktop-packaging/release-candidate.json с exact tag/revision и каталогом/хешем manifest. verify-release без аргументов читает этот индекс, отказывает при отсутствии/неполноте/несоответствии, запускает existing package verifier по явному каталогу и проверяет все 12 обязательных assets (4 пакета + 4 descriptor + 4 sig). Сборочный manifest не переписывается в published=true: факт внешней публикации хранится отдельным receipt.
- Для проверки N -> N+1 подготовить две реальные stable версии из clean tagged input с одинаковым production trust; версии назначить после чтения существующих tags/releases и согласовать в release-комплекте. Не выдавать проверочные local 0.0.0/0.0.1 за production release. Индекс хранит N/N+1 и позволяет verify-release проверить оба комплекта; окончательный N+1 содержит все четыре цели.
- Добавить ограниченные release-contract тесты проверки полного комплекта, key/trust/target/version/tag/hash соответствия и отказа при missing/mismatched assets, на временных fixtures без системного ключа и сетевых mutations.

**Files:**
- apps/desktop/scripts/release-update.mjs
- apps/desktop/packaging/release-key.mjs
- apps/desktop/packaging/release-contract.test.mjs

**Tests:**
- node --test apps/desktop/packaging/release-contract.test.mjs
- node apps/desktop/scripts/release-update.mjs verify-release

**Risks:**
- Нативные отчёты STEP-054 подтверждают прежние хеши. До публикации применяется реальный release gate; при требовании новых платформенных свидетельств дождаться их, не повторять матрицу без причины и не переносить старый PASS на новые пакеты.

### 4. Сверить локальную реализацию и передать владельцу конкретные внешние действия

- Выполнить полный lint/typecheck/test/build и узкие update/release contract проверки; после изменений повторить только затронутые проверки по существующим freshness gates. Приватные ключи, signed redirects и GitHub credentials не записывать в Evidence.
- Подготовить краткий точный runbook для владельца: открыть текущий репозиторий после redacted проверки, разрешить canonical Git фиксацию кода, создать/опубликовать точные теги, подготовить draft Release и загрузить только перечисленные assets. Git workflow имеет push_tags=false и не поддерживает Release/visibility; эти provider mutations не выполнять обходными командами агента.
- Черновики и публикация используют exact существующий tag, без неявного создания тега GitHub UI/CLI; на стороне владельца при CLI использовать --verify-tag и явно заданный repo. Перед снятием draft сверить remote asset names/count/size/hash/signature с локальным комплектом и соблюдение применимых release readiness gates.
- Если внешний шаг, доступ к keyring, exact tag или необходимая платформенная evidence ещё не выполнены, оставить STEP pending/manual-required с локальным проверенным результатом. Не объявлять задачу completed по одной готовности кода.

**Files:**
- docs/development.md
- apps/desktop/evidence/STEP-060/README.md

**Tests:**
- npm run lint
- npm run typecheck
- npm test
- npm run build
- node --test apps/desktop/packaging/update-contract.test.mjs
- node --test apps/desktop/packaging/release-contract.test.mjs

**Risks:**
- Публикация — внешний acceptance, а не следствие PASS unit-тестов.

### 5. Подтвердить публичную раздачу и реальное обновление N → N+1

- После явных действий владельца подтвердить публичную видимость без авторизации. Опубликовать полный N, вручную установить Linux N с настроенным trust; затем после проверок владелец публикует полный N+1 stable release как latest. Draft/prerelease не являются рабочим stable latest.
- Из анонимного клиента проверить полный опубликованный комплект N+1: четыре packages/descriptor/signature и соответствие exact tag/revision/size/SHA-256. verify-release повторно сверяет локальный комплект с сохранёнными фактическими анонимными download results; remote verification читает только production endpoints без publisher token. Полные signed redirect URLs нигде не сохраняются.
- В реальном готовом Linux N через пользовательский UI выполнить check -> available N+1 -> download -> ready -> открыть папку, вручную закрыть и заменить portable-файлы. Запустить N+1, подтвердить прежние SQLite/settings/history и контрольный аудиофайл, затем check -> current. Использовать синтетический baseline без аккаунта/реальных credentials.
- Сохранить build IDs/revisions/tag/versions, публичные исходные URL, безопасные origin/status, точные package hashes, результаты наблюдаемых UI-действий и before/after состояния. Не заменять пользовательский прогон вызовом service напрямую или offline fixture.

**Files:**
- apps/desktop/evidence/STEP-060/README.md
- apps/desktop/evidence/STEP-060/public-release.json
- apps/desktop/evidence/STEP-060/linux-update.json

**Tests:**
- node apps/desktop/scripts/release-update.mjs verify-release
- Ручная анонимная проверка 12 assets и реальный UI-прогон Linux N → N+1.

**Risks:**
- Если канал/CDN недоступен, безопасно отказать и оставить ручной gate pending; фиктивный PASS запрещён.

### 6. Синхронизировать описание рабочего канала с доказанным результатом

- После подтверждения поставки обновить docs/development.md в разделах portable updates/release build: имена assets, production адреса без секретов, команды подготовки/verify, exact tag/clean tree, действия владельца, первичная ручная установка, ручная замена и публикация новой версии вместо замены уже выпущенных байтов.
- В docs/architecture.md#deployment-runtime-assumptions заменить только material current-state claims о disabled production feed/trust на подтверждённое состояние и ссылки на новую Evidence. Исторические описания STEP-036/054 оставить историческими, не переносить PASS на другие хеши; security-boundaries остаётся входом, SQLite/credentials/provider и требования ОС не менять.
- Проверить связность REQ-055/STEP-060 и применимость PRN-001/002/003: нет Yandex-кода в UI/main, секреты не распространяются, API/доступность контента не меняются. REQ/Accepted ADR по смыслу не переписывать; синхронизировать projections, выполнить validator.
- Зафиксировать ограниченный architecture pass PASS; validated grounding PASS, blast-radius INCONCLUSIVE на PLAN с двумя явными proof obligations: H-001 доказывается update-contract.test.mjs, H-002 — release-update.mjs verify-release. На REVIEW нужны свежие результаты exact Verification commands; ручной реальный канал не заменяется этими checks.

**Files:**
- docs/development.md
- docs/architecture.md#deployment-runtime-assumptions
- apps/desktop/evidence/STEP-060/README.md

**Tests:**
- python3 .harness/tools/validate.py --mode manual
- Ручная сверка обновлённого current-state текста, runbook и фактических отчётов.

## Evidence


<!-- VERIFICATION-EVIDENCE:START -->
- Verification run: 2026-10-30T11:37:01Z
- Status: FAIL
- Automated resumed: false
- Verification mode: full
- Incremental executed checks: 8
- Incremental reused checks: 0
- Targeted feedback reused: 0
- Incremental fallback reason: RISK_REQUIRES_FULL
- Git head: 7e7535909a05f939e4eb7716a52a2a450673dd69
- Worktree hash: sha256:7af78de7808df346af7599d8dc04ae070fd480d3d2706d0da1fb0173dd2ec0d9
- Verification contract basis: sha256:02e0f4eed768e18af1696e6e40512e44fb184912269abe0f6a8b3218df21fa40
- Verification context basis: sha256:50373430d7cd183be9917ecedb3e89cc7eb771d39ebcd9f8ceb9526400a1bf50
- Subject git head: 7e7535909a05f939e4eb7716a52a2a450673dd69
- Subject worktree hash: sha256:d475d11817999cf65facc20484507f8405f72a55aca93f497f8b943e03e0147e
- Subject content hash: sha256:f8dbce29b385329395eddde5272d80e8775b62dc246b3f0743d995dc590d60cd

### Automated verification
- Command: python3 .harness/tools/validate.py --mode manual
  - Status: PASS
  - Exit code: 0
  - Duration ms: 6926
  - stdout sha256: 52aaa2779d558ff4fc7fb7ac95767413236c9c5e13b123932a5064d7d9a2b211
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 67
  - stderr bytes: 0
  - Provenance: executed
- Command: npm run lint
  - Status: PASS
  - Exit code: 0
  - Duration ms: 19054
  - stdout sha256: a9abc4bc51d6729860fb000bf87c02e5a80cc830999d05e640c5651c7e3daa6a
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 147
  - stderr bytes: 0
  - Provenance: executed
- Command: npm run typecheck
  - Status: PASS
  - Exit code: 0
  - Duration ms: 8427
  - stdout sha256: 73ad7967b0b62b903e0e14e90a6a3971d720cb1ab6b744714e6d2ef05dd89743
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 83
  - stderr bytes: 0
  - Provenance: executed
- Command: npm test
  - Status: PASS
  - Exit code: 0
  - Duration ms: 35441
  - stdout sha256: cfa13ef8ecb0774811f2d008a244a5dc68ee74aeaae721fc12f2dca1ec01e6ae
  - stderr sha256: 20248282fca23aafd2dc8578f495951503f9a42afdc7f693a19076b259649b37
  - stdout bytes: 15342
  - stderr bytes: 4700
  - Provenance: executed
- Command: npm run build
  - Status: PASS
  - Exit code: 0
  - Duration ms: 765
  - stdout sha256: 4a84685762211c33a9f2ac6336f7b1d29d9e1f9d26373ef0b9a167bf0a587116
  - stderr sha256: 351b524197fb492920789369e7f1a271420c757633fbb553b280a181ac4c31a4
  - stdout bytes: 88
  - stderr bytes: 360
  - Provenance: executed
- Command: node --test apps/desktop/packaging/update-contract.test.mjs
  - Status: PASS
  - Exit code: 0
  - Duration ms: 364
  - stdout sha256: 8e657f2d301b09fd5c3b6a96cb046ca9243e053c0b7e6346407999b591c4b56b
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 2269
  - stderr bytes: 0
  - Provenance: executed
- Command: node --test apps/desktop/packaging/release-contract.test.mjs
  - Status: PASS
  - Exit code: 0
  - Duration ms: 364
  - stdout sha256: a90b48403b2853917f521f5ea09890d9ee60793e079c47683fcff5d2890e8284
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 1254
  - stderr bytes: 0
  - Provenance: executed
- Command: node apps/desktop/scripts/release-update.mjs verify-release
  - Status: FAIL
  - Exit code: 1
  - Duration ms: 63
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: a066eeb8d9883e1892b3a72a38bde72e13e9657f6249b81e652eeb5d708bb3f3
  - stdout bytes: 0
  - stderr bytes: 175
  - Provenance: executed

### Product verification
- none

### Manual verification
- Check: Проверить публичную видимость текущего репозитория и анонимную HTTPS-загрузку 12 обязательных Release assets для четырёх целей; сверить descriptor/signature/version/tag/revision/size/SHA-256 с окончательными пакетами и trust в собранном ASAR. Подтвердить прохождение применимых release gates до публикации.
  - Status: PENDING
- Check: Выполнить реальный Linux N → N+1 через пользовательский UI и production-канал: проверить, скачать, открыть папку, вручную заменить, запустить и подтвердить сохранение SQLite/настроек/истории/контрольного аудиофайла; в N+1 подтвердить актуальную версию. Записать exact versions/build IDs/hashes и фактические действия.
  - Status: PENDING
- Check: Сверить runbook публикации, ручную первичную установку, docs/development.md и docs/architecture.md#deployment-runtime-assumptions с code/Evidence; подтвердить отсутствие секретов в публикуемом содержимом/истории/пакетах/отчётах. Проверить сохранность старых платформенных отчётов и отсутствие переноса PASS на новые хеши; внешние visibility/tag/Release действия подтверждены владельцем.
  - Status: PENDING
<!-- VERIFICATION-EVIDENCE:END -->

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.


## Blocker / Failure reason

—
