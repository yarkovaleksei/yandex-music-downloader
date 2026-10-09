---
schema: 1
id: STEP-005
status: completed
type: research
priority: critical
phase: provider-spike
depends_on:
  - STEP-001
requirements:
  - REQ-001
  - REQ-038
adrs: []
architecture_refs:
  - docs/architecture.md#external-dependencies-integrations
  - docs/architecture.md#security-boundaries
risk_flags:
  - external-integration
  - security-sensitive
plan:
  status: ready
  revision: 1
  context_basis: sha256:03cc13241b7caf28b2a4375678ca727c317c4a7c0a438c97ab330bb51cc6c434
  content_hash: sha256:4dfeaf28d6071c056763c7a8e1261de661bba98819ef383b4857512a3684c8b1
  reviewed_report: planning/plan-reviews/STEP-005/PLAN-REVIEW-20261008T185041Z.md
  planned_at: 2026-10-08T18:50:42+00:00
  execution_groups:
  context_components:
    - "ARCH@docs/architecture.md#external-dependencies-integrations=sha256:2a9340a0bf7a9df206adcb8bd32b0930f87ff85506f9244c1ca48bb6d3ef0604"
    - "ARCH@docs/architecture.md#security-boundaries=sha256:b9616e55167eb22bbc26bed02091ac38f0def02160abf9f6a7edab60c4d960ad"
    - "PRN@PRN-001=sha256:3b3801f207fafc3f77272f0e93570258a6d006964839d93a276accd814d548af"
    - "PRN@PRN-002=sha256:f29ee3fbdb9cf65cf9739d0907768bbf192ad88b8e443110d4d82f81c6b79ecb"
    - "PRN@PRN-003=sha256:16516d7d302fecda5f7615f9d55e29e04b588d671f8660640e1f61d1619e4ef8"
    - "REQ@REQ-001=sha256:bc1700aedb2e43628cae048a8e61f544c0e0d7093b399cf2729420aaab626d85"
    - "REQ@REQ-038=sha256:c3c9386d5726e32dd3eb46f00ea755a04f169db0a69c2c7b487c37a9601a507c"
    - "STEP@STEP-001=sha256:d106929a060d966df5a13bf5e4513b05be5a45f6895d37ef444ac3bb91349e25"
    - "STEP@STEP-005=sha256:4e8ea2967ceeeba96ab70e8c370c7ae53cfac3b80e50e871d49f68450abcc416"
---

# STEP-005 — Spike: проверка API Яндекс Музыки

## Goal

Получить воспроизводимое evidence о фактическом поведении API Яндекс Музыки через `@dvxch/yandex-music` и закрыть открытые вопросы OQ-001, OQ-002, OQ-003, OQ-008, OQ-009.

## Context

API неофициальный; auth flow, коды/контейнеры, поддержка Range, TTL signed URL и rate limits неизвестны и не могут быть приняты предположением (brief §52). Spike требует тестовый аккаунт/токен пользователя, который не попадает в репозиторий.

## Scope

- Проверить поддерживаемые auth flows (OAuth/Device Authorization) без передачи пароля через приложение.
- Получить track, album, playlist; получить доступные audio variants и зафиксировать реальные codec/container/bitrate/lossless для разных аккаунтов/треков, насколько доступно.
- Проверить поддержку HTTP Range и TTL signed URL, наблюдаемые rate limits API/CDN.
- Записать результаты (с редакцией секретов) в `docs/research/yandex-api-spike.md` и перевести OQ-001/002/003/008/009 в `resolved` либо `deferred` с объяснением.
- Проверить, отдаётся ли часть вариантов только в зашифрованном транспорте с ключом из API либо только как preview, и зафиксировать evidence для ADR STEP-006 (допустимость таких вариантов и констант provider-библиотеки уже решена владельцем продукта, OQ-012; preview не выбираются).
- На основании evidence о вариантах аудио дополнить OQ-011 вариантами правил ранжирования `high`/`normal` (политика недоступной настройки уже решена владельцем; решение о ранжировании остаётся за ним, OQ-011 не закрывается предположением).

## Mutation policy

### Allowed

- `docs/research/**`, одноразовые spike-скрипты только в `packages/providers/yandex-music/research/**` (не входят в production exports и сборку), `docs/open-questions/OQ-*.md` (Resolution).

### Conditional

- Добавление `@dvxch/yandex-music` допустимо только в workspace `packages/providers/yandex-music`; spike использует его исключительно из этого package boundary.

### Forbidden

- Production-код в `packages/**` и `apps/**`, сохранение токенов/cookies/signed URL в репозитории, обход ограничений аккаунта, работа с offline-cache официального клиента, самостоятельное извлечение ключей из официального клиента (константы provider-библиотеки и ключи, выданные API, допустимы по решению владельца, OQ-012).
- Реализация future/unrelated STEP «заодно».

## Out of scope

- Реализация provider adapter, скачивание аудио как продукт, UI.

## Acceptance criteria

- `docs/research/yandex-api-spike.md` содержит воспроизводимые шаги и фактический (отредактированный) вывод для каждого исследованного вопроса; где вывод не сохранён дословно — указаны команда, код завершения и наблюдаемые факты.
- OQ-001, OQ-002 и OQ-008 имеют Resolution на основе evidence (статус `deferred` недопустим, так как от них зависят STEP-008, STEP-010, STEP-017); OQ-003 и OQ-009 имеют Resolution либо `deferred` с обоснованием.
- Evidence о транспорте вариантов (зашифрованный/preview) и об используемых provider-библиотекой константах зафиксировано для ADR STEP-006 (решение о допустимости принято владельцем, OQ-012).
- OQ-011 содержит evidence-based варианты правил ранжирования `high`/`normal` для решения владельца продукта.
- В репозитории нет токенов, cookies и полных signed URL.
- Зафиксирован список неподдерживаемых/неподтверждённых сценариев для ADR STEP-006.

## Verification

- command: `corepack yarn install --immutable`
- command: `node packages/providers/yandex-music/research/check.mjs --self-check`
- command: `node packages/providers/yandex-music/research/check.mjs --check-artifacts`
- command: `corepack yarn run lint`
- command: `corepack yarn build`
- command: `python3 .harness/tools/validate.py --mode manual`
- manual: Live auth и catalog: пользователь подтвердил допустимый flow на странице Яндекса без пароля в research, account request идентифицировал его аккаунт, track/album/playlist получены read-only; lifetime/refresh доказательства и ограничения записаны, OQ-001 имеет evidence-based Resolution. Secrets/device codes не попали в captured stdout/stderr/отчёт.
- manual: Live variants: матрица доступных аккаунтов/треков, API codec/container/bitrate/lossless отдельно от подтверждённых bytes, preview/availability/encrypted transport, library constant provenance. Только доступные полные варианты исследованы; OQ-002 resolved с границами выборки, OQ-011 получил варианты high/normal и остаётся open.
- manual: Live Range, TTL и rate limits: Range подтверждён response/body evidence либо OQ-003 justified deferred; expiry/TTL и refresh имеют достаточно evidence для OQ-008 resolved (нижнюю границу не считать exact TTL; иначе completion BLOCKED); OQ-009 resolved либо justified deferred. Начальное TTL окно до 1 часа, ожидание и остановка заранее сообщаются при RUN.
- manual: Review report/OQ/final diff: обязательные OQ-001/002/008 resolved, OQ-003/009 resolved или justified deferred, OQ-011 open; у каждой записи command/exit code/literal safe output либо явно summary, ограничения и список неподтверждённых сценариев для STEP-006. Секретов и полных signed URLs нет; research исключён из production exports/build; нет forbidden mutations. Автоматический secret scan выводит только пути/число, не значения.

## Deliverables

- Отчёт spike, обновлённые OQ.

## Implementation plan

### 1. Подготовить воспроизводимый изолированный spike

- Проверить установленный Node в диапазоне STEP-001 и Yarn 4.18.1. Исходный provider — только маркер; production exports, src, build configuration, CLI и core не менять.
- Начальная проверяемая версия @dvxch/yandex-music — 0.3.0. Перед установкой сверить опубликованные metadata/исходники именно этой версии с README и API-reference https://github.com/thedvxch/yandex-music и https://gh.dvxch.link/yandex-music/; зафиксировать version, integrity/точный ref, дату и проверенные методы. Заявления документации не считать live evidence.
- Если dependency отсутствует, выполнить corepack yarn workspace @music-downloader/provider-yandex-music add --exact @dvxch/yandex-music@0.3.0; разрешённое conditional добавление включает согласованное изменение yarn.lock. Не добавлять библиотеку в другие workspace и не менять root scripts. Выполнить corepack yarn install --immutable после согласования lockfile.
- Создать одноразовые research/spike.mjs и research/check.mjs внутри provider; ESM .mjs запускается Node напрямую и не требует нового transpiler. Код оставлять вне src, exports и production сборки; комментарии на русском кратко связывают ограничения с PRN/STEP.
- В docs/research/yandex-api-spike.md определить матрицу: доступные собственные аккаунты, признаки подписки без секретов, конкретные track/album/playlist IDs, дата, Node/Yarn/library версии, регион и ограничения выборки. Один доступный аккаунт достаточен для bounded наблюдений; не обобщать результаты на недоступные типы аккаунтов.
- До live-прогона проверить готовность тестового аккаунта пользователя: device confirmation выполняется самим пользователем на странице Яндекса, пароль research не запрашивает. Credentials только в памяти текущего процесса через device flow или скрытый интерактивный ввод собственного токена; не принимать secrets аргументами CLI, не записывать их в файлы/историю команд. Если доступ отсутствует, live completion BLOCKED с точной причиной, без фиктивного evidence.

**Files:**
- packages/providers/yandex-music/package.json
- yarn.lock
- packages/providers/yandex-music/research/spike.mjs
- packages/providers/yandex-music/research/check.mjs
- docs/research/yandex-api-spike.md

**Tests:**
- corepack yarn install --immutable

**Risks:**
- API и auth flow неофициальные; точные методы проверяются по pinned package, неизвестности исследуются без выбора product architecture.

### 2. Обеспечить безопасный вывод и границы экспериментов

- В research runner выводить только явную безопасную проекцию: account/track identifiers или псевдонимы, формат, признаки доступа/preview, HTTP status, разрешённые числовые заголовки и времена. Не сериализовать Client, модели, raw response, headers, Error/cause/stack целиком; stdout/stderr и caught errors проходят одну проекцию без token/cookies/Authorization/refresh token/keys/signed URL.
- Device/user codes и verification URI с кодами показываются только пользователю в приватном интерактивном сеансе и не включаются в captured evidence; постоянный отчёт содержит flow stages/status/durations без этих значений. Запрещены debug hooks, печатающие raw network data; TTL URL хранить только в памяти.
- Для чтения аудиоданных research проверять библиотечные/API признаки доступности текущему аккаунту и полного варианта; preview, unavailable и неоднозначный доступ пропускать с причиной. Не создавать production getAudioVariants, QualityUnavailableError или provider adapter.
- Ограничить запросы timeout и конечным числом попыток, в первичном наблюдении отключить скрытые retries/гонки CDN, если pinned library позволяет. Range/format probe читать только ограниченный префикс (до 1 MiB на вариант), закрывать response body после получения результата; ничего не скачивать как продукт и не сохранять аудиофайлы.
- H-001/H-002 из validated Semantic Blast Radius пока planned: check.mjs --self-check выполняет минимальные offline проверки research output с синтетическими secrets (включая ошибку с signed URL) и research guard на available/full, preview, unavailable и неоднозначном варианте. Проверять фактический общий код runner; fake input не является live proof. При отказе выводить только путь/тип проверки, без совпавших значений.
- check.mjs --check-artifacts проверяет safe evidence/OQ, отсутствие известных текущему процессу secrets и чувствительных шаблонов в tracked и новых файлах будущего diff (без обхода игнорируемых caches/.env и без печати найденных значений), наличие обязательных evidence-разделов и исключение research из production exports/build. В отчёте записывать границы проверки; автоматический scan дополняется ручным review diff.

**Files:**
- packages/providers/yandex-music/research/spike.mjs
- packages/providers/yandex-music/research/check.mjs

**Tests:**
- node packages/providers/yandex-music/research/check.mjs --self-check
- node packages/providers/yandex-music/research/check.mjs --check-artifacts

**Risks:**
- Никакая проверка шаблонов не даёт абсолютной гарантии отсутствия любого секрета; использовать безопасную проекцию, synthetic self-check и review final artifacts совместно.

### 3. Проверить auth и чтение каталога на текущем аккаунте

- Команда node packages/providers/yandex-music/research/spike.mjs auth исследует подтверждённые pinned библиотекой OAuth/device методы без парольного ввода; завершить пользовательское подтверждение и accountStatus/init, зафиксировать успешную идентификацию текущего аккаунта и отказ/неподдерживаемые flow. Это research entrypoint, не product CLI auth/account.
- Проверить срок действия/refresh по безопасным полям фактического OAuth response и, если выдаётся refresh token, одним реальным обновлением и повторным account request. Отсутствие metadata/refresh или невозможность дождаться expiry отметить как ограничение, не выдумывать срок и стабильность; lifetime claims ограничить наблюдением.
- Команда node packages/providers/yandex-music/research/spike.mjs catalog получает track, album и playlist read-only, включая user-owned playlist если доступен. Записать command/exit code/наблюдаемые факты с псевдонимом аккаунта и конкретными reproducible IDs; не выполнять likes/playlist/account mutations.
- Оформить evidence и Resolution OQ-001 для поддержанного live flow с ограничениями и ссылками на отчёт. Durable выбор product flow и secure storage остаётся ADR STEP-006/последующим STEP; Acceptance REQ-001 по product CLI доказывается его owning STEP.

**Files:**
- packages/providers/yandex-music/research/spike.mjs
- docs/research/yandex-api-spike.md
- docs/open-questions/OQ-001-auth.md

**Tests:**
- manual: live auth → account и catalog; offline вывод не подменяет live account.

**Risks:**
- Если ни один допустимый flow не подтверждён живым аккаунтом, OQ-001 не defer и STEP не завершать.

### 4. Собрать evidence о вариантах, формате и транспорте

- Команда node packages/providers/yandex-music/research/spike.mjs variants собирает реальные lossy/lossless варианты нескольких треков и доступных аккаунтов. Проверить отдельные library paths (например tracksDownloadInfo/tracksLosslessInfo) по pinned версии, не приписывать package готовый project getAudioVariants.
- Для каждой записи указать API codec/container/bitrate/lossless отдельно от подтверждённого сигнатурой ограниченного префикса формата; расхождение и недостаток данных оставить явно неподтверждёнными. Размеры/каналы/sample rate фиксировать только если доступны фактически.
- Явно отметить preview/availability/encrypted transport (включая encraw если наблюдается). Префикс разрешённого зашифрованного потока исследовать только штатным library/API ключом текущего аккаунта в памяти, без offline-cache, извлечения ключей из клиента или чужих credentials; полные ключи и URL не публиковать.
- На основании исходников exact library версии записать названия/назначение публичных OAuth client credentials и констант подписи и source ref без secret values. Решение допустимости OQ-012 уже принято; новый ADR в spike не создавать.
- Записать bounded Resolution OQ-002 с доказанными форматами, выборкой и неподтверждёнными сценариями (не deferred). Дополнить только Resolution OQ-011 evidence-based альтернативами high/normal, последствиями для известных вариантов и ссылками на evidence; сохранить уже принятое отсутствие тихого fallback, статус open и решение ранжирования за владельцем.

**Files:**
- docs/research/yandex-api-spike.md
- docs/open-questions/OQ-002-codecs.md
- docs/open-questions/OQ-011-quality-policy.md
- packages/providers/yandex-music/research/spike.mjs

**Tests:**
- manual: сопоставить sanitized API fields и bytes evidence для каждого исследованного полного варианта.

**Risks:**
- Подписка или README не являются доказательством FLAC/320 kbps. Непроверенный вариант не превращается в поддержанную product capability.

### 5. Исследовать Range, signed URL expiry/refresh и наблюдаемые ограничения

- Команда node packages/providers/yandex-music/research/spike.mjs range использует небольшой byte Range для разрешённого полного варианта; зафиксировать 206/200/416, Content-Range/Accept-Ranges/число фактически прочитанных bytes. Accept-Ranges сам по себе недостаточен; при игнорировании Range остановить body после лимита. Для encraw не выводить поддержку возобновления расшифровки из одного HTTP 206.
- Команда node packages/providers/yandex-music/research/spike.mjs ttl --window-seconds 3600 сохраняет URL только в памяти одного процесса и сравнивает t0, 1, 5, 15, 30 и 60 минут малыми пробами; проверить выдачу новой ссылки текущему аккаунту и её работоспособность, различая expiry, auth failure, network/CDN error и исчезновение доступа. Сравнение URLs в отчёте только changed/same без самих URLs.
- TTL — отдельное длительное manual live наблюдение, не 300-секундная automatic Verification. До его запуска сообщить ожидаемое окно (первоначально до 1 часа) и дать остановить наблюдение; не блокировать диалог длинным sleep. Остановленный/неполный прогон не считается expiry proof.
- Resolution OQ-008 требует evidence TTL/условий истечения и способа обновления. Отметить API expiry metadata, фактический интервал last-success/first-expired и успешный refresh насколько проверены. Если к концу окна URL ещё работает, зафиксировать только нижнюю границу; если этого недостаточно для Decision needed, оставить OQ-008 open и completion BLOCKED с точным следующим наблюдением, не deferred и не выдуманный TTL.
- Команда node packages/providers/yandex-music/research/spike.mjs limits наблюдает API/CDN при коротком конечном числе read-only запросов (до 20 API и 8 CDN prefix probes), сначала concurrency=1, максимум=4, без поиска предела нагрузкой. Записать request count, concurrency, duration, status и Retry-After без headers dump; на 429/повторяющемся 5xx/ограничении остановиться, не обходить блокировку. Если лимит не достигнут, указать 'не наблюдался в этой выборке', а не 'лимитов нет'.
- Обновить Resolution OQ-003 и OQ-009 проверенными условиями; допускается deferred с конкретной причиной, последствиями для будущего STEP и условием повторной проверки. Не реализовывать product retry/resume/concurrency/backoff.

**Files:**
- packages/providers/yandex-music/research/spike.mjs
- docs/research/yandex-api-spike.md
- docs/open-questions/OQ-003-range.md
- docs/open-questions/OQ-008-signed-url.md
- docs/open-questions/OQ-009-rate-limits.md

**Tests:**
- manual: live Range и TTL/обновление; ограниченное наблюдение API/CDN limits, без обязательного достижения 429.

**Risks:**
- Exact TTL может превышать начальное окно; это execution blocker обязательного OQ-008, а не planning prerequisite и не разрешение закрыть его догадкой.

### 6. Завершить evidence и проверить готовность handoff

- Отчёт для каждого вопроса содержит environment/версии, команды и exit codes, safe literal captured output либо явно помеченный summary с наблюдаемыми фактами, timestamps и длительности, sample coverage, ограничения и ссылки OQ ↔ соответствующий раздел. Не реконструировать несохранённые terminal quotes.
- Свести неподдерживаемые/неподтверждённые сценарии, encrypted/preview transport, library constants provenance и follow-up для ADR STEP-006; не изменять REQ, принятые ADR или будущие STEP. Для high/normal представить варианты владельцу без самостоятельного решения.
- Изменять у перечисленных OQ только Resolution и необходимые согласованные status/resolved_at: OQ-001/002/008 resolved при достаточном live evidence; OQ-003/009 resolved либо justified deferred; OQ-011 остаётся open; OQ-012 не переоткрывать. При незакрытых обязательных OQ completion BLOCKED.
- Выполнить self-check и check-artifacts; подтвердить immutable install, lint и build после conditional dependency/research changes, проверить отсутствие research в production output. Выполнить sync-projections.py перед validate.py и completion evidence; проекции вручную не редактировать.
- Ручным review всех новых/изменённых файлов проверить отсутствие token/cookies/Authorization/keys/full signed URLs и отсутствие production mutations кроме условной dependency/lockfile. Pattern scan/git grep использовать с выводом только filenames/числа, без печати secret match.
- Research completion имеет фактический live отчёт и OQ Resolution; выполненный план или offline PASS не означают завершение spike. Передать factual observations canonical runner/dispatcher без self-approval или git commit.

**Files:**
- docs/research/yandex-api-spike.md
- docs/open-questions/OQ-001-auth.md
- docs/open-questions/OQ-002-codecs.md
- docs/open-questions/OQ-003-range.md
- docs/open-questions/OQ-008-signed-url.md
- docs/open-questions/OQ-009-rate-limits.md
- docs/open-questions/OQ-011-quality-policy.md

**Tests:**
- node packages/providers/yandex-music/research/check.mjs --self-check
- node packages/providers/yandex-music/research/check.mjs --check-artifacts
- python3 .harness/tools/validate.py --mode manual

## Evidence



<!-- VERIFICATION-EVIDENCE:START -->
- Verification run: 2026-10-08T20:11:45Z
- Status: PASS
- Automated resumed: false
- Git head: 2a19e5a72693ae741adfab8bbd464e120eed7785
- Worktree hash: sha256:0776a0c377ef7ad9267502532b30574286eb4d9d07123840ddca3a4dcd313b4c
- Verification contract basis: sha256:8da9123c64ba5751a5347ad77e8f2266b5a9b32deb671e5a7bc4f1891dec0c98
- Subject git head: 2a19e5a72693ae741adfab8bbd464e120eed7785
- Subject worktree hash: sha256:df3c3c4720b03ec13d57d5bdc2bfa6ecf2a74305d26a719db0c454a1148ebbe6

### Automated verification
- Command: corepack yarn install --immutable
  - Status: PASS
  - Exit code: 0
  - Duration ms: 564
  - stdout sha256: ed76e9706518110604f24d981fd2df0fcb9acf4bcb7e3d22e0210e38551a0cc5
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 222
  - stderr bytes: 0
- Command: node packages/providers/yandex-music/research/check.mjs --self-check
  - Status: PASS
  - Exit code: 0
  - Duration ms: 114
  - stdout sha256: 3abed82b49a5c8c4177975c2beed852672f5ac589e9ff5dceb6f6cd1f8182860
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 104
  - stderr bytes: 0
- Command: node packages/providers/yandex-music/research/check.mjs --check-artifacts
  - Status: PASS
  - Exit code: 0
  - Duration ms: 214
  - stdout sha256: 93e1c3f515fd2d494fda6cd8dfc00411f94ddc539b4ae1f6e6dfc9cc7ed077b1
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 106
  - stderr bytes: 0
- Command: corepack yarn run lint
  - Status: PASS
  - Exit code: 0
  - Duration ms: 3770
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 0
  - stderr bytes: 0
- Command: corepack yarn build
  - Status: PASS
  - Exit code: 0
  - Duration ms: 414
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 0
  - stderr bytes: 0
- Command: python3 .harness/tools/validate.py --mode manual
  - Status: PASS
  - Exit code: 0
  - Duration ms: 2217
  - stdout sha256: 0b16d85a61526082dec53c2832bf42c4728da07059908735ed2340d85e7725a3
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 66
  - stderr bytes: 0

### Product verification
- none

### Manual verification
- Check: Live auth и catalog: пользователь подтвердил допустимый flow на странице Яндекса без пароля в research, account request идентифицировал его аккаунт, track/album/playlist получены read-only; lifetime/refresh доказательства и ограничения записаны, OQ-001 имеет evidence-based Resolution. Secrets/device codes не попали в captured stdout/stderr/отчёт.
  - Status: PASS
  - Observed: "Владелец подтвердил Device Authorization на сайте Яндекса. OAuth/token 200, account status 200 идентифицировал текущий аккаунт A, expiresIn=31536000 и refreshPresent=true. Попытка refresh вернула 401, затем исходным токеном получены track/album/playlist. Пароль и значения кодов/токенов не сохранены; команды и ограничения в docs/research/yandex-api-spike.md и выбранном safe stdout."
- Check: Live variants: матрица доступных аккаунтов/треков, API codec/container/bitrate/lossless отдельно от подтверждённых bytes, preview/availability/encrypted transport, library constant provenance. Только доступные полные варианты исследованы; OQ-002 resolved с границами выборки, OQ-011 получил варианты high/normal и остаётся open.
  - Status: PASS
  - Observed: "Аккаунт с подпиской A, треки 2224197/150217442/151910374: по два полных MP3 192/320 с 1 MiB префиксами. Get-file-info: AAC-MP4 256, два FLAC-MP4 encraw/keyPresent, preview неизвестен и bytes не запрошены. API-поля отделены от сигнатур, constants provenance указан без значений. OQ-002 resolved по bounded выборке; OQ-011 получил два варианта и остаётся open."
- Check: Live Range, TTL и rate limits: Range подтверждён response/body evidence либо OQ-003 justified deferred; expiry/TTL и refresh имеют достаточно evidence для OQ-008 resolved (нижнюю границу не считать exact TTL; иначе completion BLOCKED); OQ-009 resolved либо justified deferred. Начальное TTL окно до 1 часа, ожидание и остановка заранее сообщаются при RUN.
  - Status: PASS
  - Observed: "Range: шесть полных MP3-вариантов вернули 206/согласованный Content-Range и 1 MiB bytes; OQ-003 resolved с ограничением на проверенный префикс. Signed URL: старый legacy URL работал до elapsedSeconds=1801, при 3602 вернул 401/0 bytes; свежий URL отличался и работал после повторной проверки доступности и preview=false. OQ-008 resolved по интервалу наблюдения/повторной выдаче, без утверждения точного универсального TTL или причины любого 401. Rate limits: 10 API/6 CDN, concurrency1/4, 429 не наблюдался; OQ-009 deferred с обоснованием. Владелец заранее уведомлён о часовом окне, процесс завершился exit0."
- Check: Review report/OQ/final diff: обязательные OQ-001/002/008 resolved, OQ-003/009 resolved или justified deferred, OQ-011 open; у каждой записи command/exit code/literal safe output либо явно summary, ограничения и список неподтверждённых сценариев для STEP-006. Секретов и полных signed URLs нет; research исключён из production exports/build; нет forbidden mutations. Автоматический secret scan выводит только пути/число, не значения.
  - Status: PASS
  - Observed: "Итоговые отчёт/выбранный дословный JSONL/diff проверены: OQ-001/002/003/008 resolved, OQ-009 deferred с причиной и условием повторной проверки, OQ-011 open с двумя вариантами владельцу. Команды/exit codes/summary отделены от literal output, ограничения и список непроверенных сценариев STEP-006 записаны. Artifact scan PASS, значения token/cookies/Authorization/keys/полных signed URLs отсутствуют; в данных только safe projection. Research.mjs вне src/exports/build; production исходники не менялись, dependency только provider и соответствующая yarn.lock. Посторонние .codex/config и прежний planning-review сохранены."
<!-- VERIFICATION-EVIDENCE:END -->

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.

Исследование начато 2026-10-08. [Отчёт](../../docs/research/yandex-api-spike.md) и [отредактированный вывод](../../docs/research/yandex-api-spike-output.jsonl) содержат Device Authorization/account, track/album/playlist, варианты MP3/AAC/FLAC по API, MP3-префиксы и Range. OQ-001/002/003 получили Resolution, OQ-009 deferred с обоснованием, OQ-011 содержит варианты для владельца и остаётся open. Полный живой прогон all --window-seconds 3600 завершён с exit 0: старая URL работала на 1801-й секунде и вернула 401 на 3602-й, новая отличалась и работала. OQ-008 получил Resolution с интервалом отказа и способом обновления; точный универсальный TTL не утверждается. Все обязательные Resolution и ограничения записаны. Финальная каноническая Verification приведена ниже в generated block.



## Blocker / Failure reason

—
