---
schema: 1
id: STEP-059
status: completed
type: bugfix
priority: high
phase: desktop
depends_on:
  - STEP-058
requirements:
  - REQ-051
  - REQ-052
  - REQ-057
  - REQ-058
adrs:
  - ADR-015
  - ADR-016
  - ADR-019
architecture_refs:
  - "docs/architecture.md#основные-компоненты-границы"
  - docs/architecture.md#data-state-model
architecture_outputs:
  - "docs/architecture.md#основные-компоненты-границы"
  - docs/architecture.md#data-state-model
risk_flags:
  - security-sensitive
plan:
  status: ready
  revision: 2
  context_basis: sha256:2c18a93ebbaece515727a118fd869b21bdc38a0325ecae0287f78bdfc7bd1780
  content_hash: sha256:c573c987f3722b6d2847b7466e06c2facb2a5d67adf284fecadcb862f08a59fd
  reviewed_report: planning/plan-reviews/STEP-059/PLAN-REVIEW-20261029T203511Z.md
  planned_at: 2026-10-29T20:35:11+00:00
  execution_groups:
  context_components:
    - "ADR@ADR-015=sha256:0fd7f2940c2f6ac5a15eda9b9c9ad7c6a961062d03a4eedd4e3dd03eb8750d53"
    - "ADR@ADR-016=sha256:5f6730e0a0beed792f678c7872463edce8645c0d2642f3c1303ba5c1fbe923c7"
    - "ADR@ADR-019=sha256:661497200e97275c9243a5f4b2594b02b1d04a026a4c6c9a65f4dc6f95dc3a7b"
    - "ARCH@docs/architecture.md#data-state-model=sha256:bac0a42e654feadbc18804cc8ef84f4ad2f2f5608fff6342592e6b9997098827"
    - "ARCH@docs/architecture.md#основные-компоненты-границы=sha256:8949a520f1887d212f3b1aa7fd830fb69a1c7e2415238032e7ee14eb7498d0a6"
    - "PRN@PRN-001=sha256:3b3801f207fafc3f77272f0e93570258a6d006964839d93a276accd814d548af"
    - "PRN@PRN-002=sha256:f29ee3fbdb9cf65cf9739d0907768bbf192ad88b8e443110d4d82f81c6b79ecb"
    - "PRN@PRN-003=sha256:16516d7d302fecda5f7615f9d55e29e04b588d671f8660640e1f61d1619e4ef8"
    - "REQ@REQ-051=sha256:9bf8e5cf1b6b78501971ec70fc7f3cc11cde36dff40d4e0405349d4ff8942806"
    - "REQ@REQ-052=sha256:f2d77d544637c1837394e2e9f72852ecda38b10b37d8953cdc24d6701d87892b"
    - "REQ@REQ-057=sha256:27aab3692da8cd65a23bc8fbc9e933cd83460bcea535f2561fbf28e3bdb9d1af"
    - "REQ@REQ-058=sha256:329ee36dfdf8f5bea60b56c235d5026a029f6d66cc8d162a2a3963744a8e686c"
    - "STEP@STEP-058=sha256:48f19e848270e6f65f68e06b3771cce3a976d317cbd41d089d4ff8eba22a18ae"
    - "STEP@STEP-059=sha256:2fd73570dd521ef4da24536ad9cd057e9ca5f1ea2a05cddc797da6714cde17d2"
---

# STEP-059 — Исправления истории, настроек и аккаунта после пользовательской проверки

## Goal

Устранить подтверждённые неудобства пользовательской проверки dev-сборки: недоступные папки, невидимые ошибки, лишние перезагрузки истории, элементы настроек, неполные данные аккаунта и служебное меню.

## Context

- Источник — immutable [observation](../reviews/STEP-058/OBSERVATION-20261029T203125Z-03a50b0a5b03.json) и последующие пользовательские screenshots в apps/desktop/evidence/STEP-059/reported-*.png.
- STEP-058 и его PASS не переоткрываются. Его незакоммиченная реализация сохраняется. Данная работа проверяется только по corrective scope, а не повторным аудитом всей предыдущей поставки.
- History.act всегда вызывает refresh, заново запрашивая все обложки; notice находится перед таблицей; showJobItem stat failure превращается в общий VALIDATION_ERROR. Preliminary availability отсутствует.
- Текущая проекция подписки смотрит только autoRenewable с finished=false/product.title; formats provider не заполняет. Read-only probe текущим desktop-токеном подтвердил hasPlus=true и доступность пользовательского JPEG через официальный Яндекс ID (HTTP200, 9827 байт). Санитизированное evidence: apps/desktop/evidence/STEP-059/profile-probe.json; документация https://yandex.ru/dev/id/doc/ru/user-information . Credentials, profile payload и фотография не сохранялись.
- Принятые границы ADR-015/016 сохраняются: provider владеет Yandex-запросами, renderer получает безопасные DTO и не выбирает пути. Обновления остаются ручными ADR-019. Платформенная квалификация STEP-054 независима.

## Scope

- Доступность действия папки для истории через trusted main/host и job-owned path; понятное отсутствие/исчезновение результата, без передачи произвольного пути из renderer.
- Полностью удалить настройку и автоматическое открытие папок после завершения; старые сохранённые флаги не создают side effect. Ручное открытие сохранено.
- Неблокирующий показ истории, отсутствие перечитывания записей/обложек при read-only открытии папки; ожидающее действие обозначается локально, ошибки доступны при прокрутке без прыжка вверх.
- Однострочная кнопка выбора папки; компактный числовой ввод concurrency 1–8 с сохранением прежних границ и restart-семантики; фактическая версия и dev-пометка в About без сетевого checkUpdate; убрать служебное меню Electron из клиентского окна.
- Честная проекция подтверждённого Plus и поддержанных SDK данных подписки; объяснение unknown и отсутствия глобального списка форматов без вывода codec из подписки.
- Необязательная загрузка аватара текущим токеном через фиксированный официальный profile endpoint и существующие ограничения artwork (CDN, MIME/размер, отсутствие credentials/redirect); отдельное safe bytes DTO и fallback без задержки account/истории.
- Целевые regression tests, Linux Electron и browser screenshots для воспроизведённых сценариев, краткое обновление docs/development.md и только объявленных architecture outputs.

## Mutation policy

### Allowed

- apps/desktop/src/renderer; apps/desktop/src/contract; apps/desktop/src/main; apps/desktop/src/host; apps/desktop/src/preload.
- packages/shared/src и packages/application/src — безопасные account/artwork DTO/port, wiring availability/avatar и удаление auto-open.
- packages/persistence/src — только совместимое игнорирование устаревшего auto-open поля и относящиеся tests, без DDL.
- packages/providers/yandex-music/src — только account metadata/avatar, фиксированные trusted endpoints, валидация и относящиеся tests.
- apps/desktop/e2e, apps/desktop/evidence/STEP-059, docs/development.md; docs/architecture.md только #основные-компоненты-границы и #data-state-model.

### Conditional

- Existing tests/fixtures этих методов обновляются при изменении безопасного typed API; прежние contract invariants сохраняются.
- Малый main helper и относящиеся tests для stat/directory/open/version/menu без изменения packaging или автообновлений.

### Forbidden

- Изменение ранее завершённого STEP-058, его review/evidence, Accepted ADR, production feed, упаковки/подписей/установщиков.
- Изменение core download/replay/leases, SQLite DDL, auth flow/scopes, токенов/credential store; новые provider permissions и новая авторизация ради аватара.
- Выдуманные account возможности, codec по наличию Plus; raw paths/profile/секреты в renderer или журнале.

## Out of scope

- Переработка всей UI и lifecycle очереди; auto-open удаляется без замены новым автоматическим режимом.
- Новые native Windows/macOS или packaging прогоны, повторная приёмка STEP-058 и глобальные performance benchmarks.

## Acceptance criteria

- Настройка автоматического открытия отсутствует; завершение старого или нового задания никогда не открывает папку автоматически, независимо от прежнего сохранённого флага. Старые settings/snapshots читаются без изменения прочих параметров и заданий.
- Отсутствующая/недоступная папка в истории не предлагается к открытию; доступность проверяется асинхронно, без provider/CDN-зависимости и без блокирования строк/фильтров. Для существующего результата действие работает; при исчезновении после проверки показывается понятный отказ без вызова shell для отсутствующего пути.
- На длинной прокрученной истории сообщение ошибки видно в viewport без скачка к началу; открытие папки не вызывает history/historyArtwork refresh и не блокирует остальные строки длительной общей операцией.
- Кнопка выбора папки не переносит подпись на desktop; concurrency — компактное числовое поле без меню, допускает только целые 1–8, сохраняет исходную restart-семантику и черновики/refs/theme. About показывает фактическую установленную версию и dev-пометку без сетевой проверки; File/Edit/View/Window отсутствуют в клиентском окне Linux.
- При подтверждённом Plus UI показывает активный Plus даже без product title в autoRenewable; другие поддержанные формы обрабатываются по реально полученным полям. Неизвестное состояние имеет честную причину; доступные codecs не выводятся из подписки, отсутствие глобального перечня форматов объясняется.
- Аватар текущего аккаунта отображается из безопасных ограниченных image bytes; no-photo/отказ/ошибка дают fallback без задержки account. Токен отправляется только fixed profile origin, не на CDN; произвольный URL или данные прошлого аккаунта не попадают в renderer.
- Regression tests и Linux lint/typecheck/test/build/Electron проходят; screenshots/evidence покрывают длинную историю и все пользовательские замечания. Прежние replay/hide/source/settings semantics сохранены, docs отражают результат без новых native/packaging claims.

## Verification

- command: `npm run lint`
- command: `npm run typecheck`
- command: `npm test`
- command: `npm run build`
- command: `node apps/desktop/e2e/run.mjs`
- command: `python3 .harness/tools/validate.py --mode manual`
- manual: На Linux проверить длинную историю при прокрутке: missing folder disabled с причиной, исчезновение после availability показывает ошибку в viewport без scroll jump; существующая папка открывается, history/historyArtwork counters не увеличиваются, другие строки и фильтры доступны. Проверить Settings однострочную кнопку, compact integer1–8/invalid, сохранение refs/theme/restart, About current version/dev без checkUpdate, отсутствие меню и auto-open UI/side effect для старых true flags. Synthetic account: Plus без title, unknown/formats explanation, avatar/fallback и late avatar после logout/change account. Сохранить только synthetic screenshots/санитизированный proof STEP-059. Сверить docs/development.md и два объявленных architecture anchors с code/tests/evidence; новые native/packaging claims и повторная приёмка STEP-058 не требуются.

## Deliverables

- Исправленные history/settings/account/main UI и safe typed availability/avatar/version API в перечисленных Allowed paths.
- Целевые tests и apps/desktop/evidence/STEP-059 со screenshots и журналами.
- docs/development.md; docs/architecture.md#основные-компоненты-границы и docs/architecture.md#data-state-model — подтверждённое поведение после удаления auto-open, без изменения Accepted ADR.

## Implementation plan

### 1. Полностью удалить auto-open с совместимостью старых данных

- По REQ-052/058 удалить переключатель из Settings, формирование/публикацию openFolderOnComplete в settings, EffectiveDownload и JobSnapshot, передачу callback и terminal shell side effect из jobNotifications. Системные уведомления об исходах и ручное открытие остаются.
- В shared desktopSettings и persistence effectiveDownload игнорировать legacy поле старых JSON, не читать его в Jobs.get/list и не переносить в новые snapshots. Не переписывать сохранённые задания/настройки при чтении; сохранить source, destination, quality/variantSelection, overwrite/naming, tags/cover/m3u8/theme и replay.
- Согласовать typed/runtime API: старый optional boolean input saveSettings можно оставить принимаемым и полностью игнорируемым для совместимости v1; новые DTO и renderer его не отправляют и не используют. Не менять core download/replay/leases, DDL и auth.

**Files:**
- apps/desktop/src/renderer/Settings.tsx
- apps/desktop/src/contract/desktop-api.ts
- apps/desktop/src/main/broker.ts
- apps/desktop/src/main/index.ts
- apps/desktop/src/main/job-notifications.ts
- packages/shared/src/application.ts
- packages/shared/src/desktop-state.ts
- packages/shared/src/desktop-settings.ts
- packages/application/src/application.ts
- packages/application/src/jobs.ts
- packages/persistence/src/desktop-state-store.ts

**Tests:**
- Расширить существующие shared/persistence/application/main tests: старые settings и snapshot с true читаются, остальные параметры/replay совпадают; новые снимки не включают флаг; ни старое, ни новое completed задание не вызывает shell автоматически. Подтвердить сохранение уведомлений и ручного действия.

### 2. Добавить локальную доступность папки без повторной загрузки истории

- По REQ-051 добавить additive main-only метод jobFolderAvailability с закрытым jobId/optional trackKey input и безопасным available/reason DTO без пути. Вынести небольшой main helper job-folders.ts с общим разрешением сохранённого результата через trusted getJob и асинхронной проверкой существования/доступности результата и его каталога.
- Проверка обращается только к локальному host/state/fs и не вызывает provider/CDN/artwork. Открытие использует тот же resolver, повторяет проверку непосредственно перед shell; отсутствие/исчезновение/отказ дают понятный безопасный ответ без raw fs сообщения/пути и без shell для отсутствующего результата.
- В History показывать строки сразу; availability и artwork загружать независимо. До результата folder action disabled с причиной проверки, после unavailable — disabled с объяснением и доступным tooltip. Сохранять результаты и актуальность относительно текущих строк.
- Отделить read-only folder action от replay/hideHistory reconciliation: не вызывать history/historyArtwork refresh при открытии/ошибке папки. Ожидание folder показывать на его строке, не блокировать остальные строки/поиск/фильтры. Ошибку показать закреплённым в viewport Alert/Snackbar без прокрутки или перевода фокуса к началу; replay/hide и OUTCOME_UNKNOWN сохраняют прежнюю reconciliation семантику.

**Files:**
- apps/desktop/src/contract/desktop-api.ts
- apps/desktop/src/main/broker.ts
- apps/desktop/src/main/index.ts
- apps/desktop/src/main/job-folders.ts
- apps/desktop/src/renderer/History.tsx

**Tests:**
- H-001 / npm test: main helper с настоящим временным каталогом и shell spy — существующий/отсутствующий/удалённый после availability результат; input произвольного пути отклоняется до fs/host. Deferred availability не блокирует строки/фильтр, folder action не увеличивает счётчики history/historyArtwork, другие строки остаются доступны. Это проверки explicit REQ-051/STEP-059, а не новые failure scenarios.

### 3. Исправить настройки, фактическую версию и меню окна

- Сделать подпись кнопки выбора папки однострочной на desktop (no-wrap и достаточная минимальная ширина). Заменить concurrency select компактным числовым полем с отдельным черновиком: сохраняются только целые 1–8, пустое/дробное/вне диапазона имеют понятную ошибку и не отправляются.
- Сохранить исходную restart-семантику concurrency и механизм confirmedTheme; изменение поля не сбрасывает выбранные directoryRef/ffmpegRef, остальные черновики и тему.
- Добавить main-only local appInfo DTO с app.getVersion() и dev = !app.isPackaged; About получает установленную версию без checkUpdate/сетевого запроса. Явные ручные update действия ADR-019 сохраняются.
- Удалить стандартное Electron menu из клиентского BrowserWindow Linux/Windows; не менять packaging, fuses или production trust.

**Files:**
- apps/desktop/src/renderer/Settings.tsx
- apps/desktop/src/contract/desktop-api.ts
- apps/desktop/src/main/broker.ts
- apps/desktop/src/main/index.ts

**Tests:**
- Settings tests: 1/8 и некорректный ввод, отсутствие combobox, сохранение refs/черновиков/theme и текста restart; About отображает appInfo без вызова checkUpdate. Linux Electron проверяет фактическую версию/dev и отсутствие File/Edit/View/Window.

### 4. Исправить подтверждённую подписку и объяснения account

- В provider yandex-music-auth.ts account mapping учесть подтверждённый hasPlus=true независимо от наличия active autoRenewable.product.title. Поддержанные SDK формы подписки проецировать только из их действительно предоставленных признаков/названий; перед реализацией сверить точные поля с установленным SDK и текущим sanitized probe, не выдумывать тарифы.
- Сохранить минимальный portable Account: существующее subscription использовать для подтверждённого названия/Plus; при отсутствии данных показывать понятную причину неизвестности. Если потребуются дополнительные reason-поля, объявить только optional безопасные поля, обновить accountSchema и явный ApplicationFacade accountDto.
- В Account объяснить отсутствие общего перечня форматов: сервис сообщает варианты при анализе конкретного трека; Plus не означает FLAC/другой codec. Не добавлять сеть в history/локальные экраны и не выводить raw profile.

**Files:**
- packages/providers/yandex-music/src/yandex-music-auth.ts
- packages/providers/yandex-music/src/auth-schemas.ts
- packages/shared/src/provider.ts
- packages/application/src/application.ts
- apps/desktop/src/renderer/Account.tsx

**Tests:**
- Provider synthetic fixtures для hasPlus=true без title, существующего active named продукта и отсутствующих/неполных данных; component test различает подтверждённый Plus и unknown, formats explanation не обещает codec. Сохранить существующие auth tests.

### 5. Добавить отдельный необязательный аватар с safe bytes

- Добавить optional provider port fetchAccountAvatar и отдельный desktop/application метод accountAvatar без URL/path/ID во входе renderer. В CachedProvider использовать существующий persistent CacheStore и encodeArtwork/decodeArtwork: ключ providerId/accountId/schemaVersion/метод avatar, только ограниченные image bytes и MIME. Сохранять полезный cache между открытиями экрана и перезапусками; TTL — существующий configured/default (5 минут), после истечения повторно получать фото. Отсутствие optional port даёт null fallback.
- Avatar cache работает отдельно от общей serial очереди metadata/artwork/auth/logout; account и локальные экраны не ждут его. Перед cache hit/после network request проверить актуальность account и текущего auth поколения; logout/change account исключают публикацию late/чужого image. Использовать существующие файловый cache, очистку и TTL, без нового storage/DDL; profile payload, token, URL и avatar ID в payload не сохранять.
- Provider получает минимальный profile только из фиксированного https://login.yandex.ru/info текущим token; redirect запрещён. Извлечь только признаки наличия портрета и default_avatar_id, включая документированные составные ID со slash; сконструировать официальный HTTPS avatar CDN URL внутри provider, renderer его не получает. Profile payload не логировать и не сохранять.
- CDN запрос отдельный, без OAuth/Authorization/cookies; применить действующие trusted CDN/MIME/размерные ограничения safe artwork и bounded чтение нового avatar пути. Ошибка/no-photo/отказ прав возвращают безопасный fallback, не изменяют auth flow/scopes и не требуют новой авторизации; общий старый artwork pipeline не перерабатывать.
- Application создаёт только ограниченный ArtworkDto mimeType/base64. Provider/application проверяют актуальность account при завершении запроса, renderer загружает avatar независимо после account и отбрасывает late result после logout/change account/unmount. Не передавать данные предыдущего аккаунта; не ждать image для показа account/истории.

**Files:**
- packages/shared/src/provider.ts
- packages/shared/src/desktop-state.ts
- packages/providers/yandex-music/src/yandex-music-auth.ts
- packages/providers/yandex-music/src/account-profile.ts
- packages/application/src/application.ts
- packages/application/src/cached-provider.ts
- apps/desktop/src/contract/desktop-api.ts
- apps/desktop/src/host/application-handler.ts
- apps/desktop/src/renderer/Account.tsx
- packages/application/src/cache.integration.test.ts

**Tests:**
- H-002 / npm test: synthetic profile/default avatar/no-photo/отказ; Authorization только fixed profile origin, CDN без credentials/redirect; составной avatar ID и bytes/MIME/size bounds; сериализация DTO не содержит fixture secrets/URL/profile. Deferred avatar не задерживает account; logout/change account исключает публикацию старого image. Проверки следуют explicit STEP-059/PRN-002/ADR-015/016.
- Cache integration через существующий файловый store: повторное открытие и новый instance в пределах TTL используют bytes без повторного profile/CDN fetch; expiry/очистка приводят к обновлению; cache account-scoped, late result после logout/change account не публикуется и не загрязняет другой ключ. Deferred avatar не задерживает account/metadata/auth/logout. Проверить, что payload содержит только image/MIME, без fixture profile/token/URL.

### 6. Подтвердить corrective поведение на Linux и сохранить отдельное evidence

- Обновить затронутые typed API fixtures/tests минимально; прежние captures и evidence STEP-058 оставить immutable. Для STEP-059 создать отдельную synthetic browser fixture и Linux Electron checks в apps/desktop/e2e, используя реальные IPC/main/host там, где это нужно для folder/version/menu/settings.
- Сохранить в apps/desktop/evidence/STEP-059 screenshots длинной прокрученной истории с visible notice и disabled folder, Settings 1–8/однострочной кнопки/About без auto-open, account Plus/unknown/formats и avatar/fallback. Зафиксировать request counters для H-001 и optional-account proof H-002; screenshots только synthetic, без реальных account payload/images/credentials.
- Выполнить все шесть canonical Verification commands без сокращения: lint, typecheck, полные tests, build, Linux Electron E2E, Harness validation. Исправлять только относящиеся defects; сохранить команды, exit codes/санитизированные результаты и ограничения. Это corrective проверка, без переоценки PASS STEP-058, native Windows/macOS и packaging.

**Files:**
- apps/desktop/src/renderer/History.test.tsx
- apps/desktop/src/renderer/Settings.test.tsx
- apps/desktop/src/renderer/Account.test.tsx
- apps/desktop/src/main/job-folders.test.ts
- apps/desktop/src/main/job-notifications.test.ts
- apps/desktop/src/contract/desktop-api.test.ts
- packages/persistence/src/desktop-state-store.test.ts
- packages/application/src/desktop-profile.test.ts
- packages/application/src/cache.integration.test.ts
- packages/application/src/application.contract.test.ts
- packages/providers/yandex-music/src/yandex-music-auth.test.ts
- packages/providers/yandex-music/src/account-profile.test.ts
- apps/desktop/e2e
- apps/desktop/evidence/STEP-059
- packages/providers/yandex-music/src/metadata/metadata.test.ts

**Tests:**
- Полный npm test доказывает H-001/H-002 и legacy auto-open compatibility; node apps/desktop/e2e/run.mjs доказывает реальную Electron поверхность. Browser screenshots отдельно доказывают viewport/layout на synthetic данных.

### 7. Синхронизировать только объявленные current-state outputs

- После подтверждения реализации обновить docs/development.md: ручное открытие, отсутствие auto-open и игнорирование legacy флага, неблокирующая история, ввод 1–8, local version/dev, подписка/formats explanation и optional avatar/fallback. Описать account-scoped persistent avatar cache с существующим TTL/очисткой и обновлением после истечения, без хранения profile/token/URL и без задержки account.
- В docs/architecture.md изменить только #основные-компоненты-границы и #data-state-model: убрать утверждение о terminal auto-open/его действующем snapshot поле; отразить совместимое чтение старых JSON без DDL и сохранение прочих snapshot/replay параметров, safe optional image и прежний ownership.
- Проверить описания по code/tests/Evidence: не менять Accepted ADR и архитектурные решения, исторические proof STEP-058, неизменённые core/DDL/auth/update ограничения и claims о native/packaging.

**Files:**
- docs/development.md
- docs/architecture.md#основные-компоненты-границы
- docs/architecture.md#data-state-model

**Tests:**
- Semantic сверка объявленных двух anchors и development с фактическим результатом; python3 .harness/tools/validate.py --mode manual.

## Evidence






<!-- VERIFICATION-EVIDENCE:START -->
- Verification run: 2026-10-29T21:02:44Z
- Status: PASS
- Automated resumed: false
- Verification mode: full
- Incremental executed checks: 6
- Incremental reused checks: 0
- Targeted feedback reused: 0
- Incremental fallback reason: RISK_REQUIRES_FULL
- Git head: c9bb8326e85d7c5ffa15573603b62beab4667a9e
- Worktree hash: sha256:736e3d76589c56318d7c63151005ace3e9658b6296d66d5c2cbe0f01acf76925
- Verification contract basis: sha256:b316041ace74124e50d45e498c2564a6882dfc585a0a53e326074cca2efe88fd
- Verification context basis: sha256:74c4bf32ff43dc21d21f09139df533667b532da83f75ab7e44881d066d1d59d7
- Subject git head: c9bb8326e85d7c5ffa15573603b62beab4667a9e
- Subject worktree hash: sha256:74aadd8118a56d54366e008ca301109d26cc8ed9cb44b166131c6504b7a91713
- Subject content hash: sha256:f4fffbb844ad0151befd1c2c317643551008d5857b798a583672934b09feea92

### Automated verification
- Command: npm run lint
  - Status: PASS
  - Exit code: 0
  - Duration ms: 15790
  - stdout sha256: a9abc4bc51d6729860fb000bf87c02e5a80cc830999d05e640c5651c7e3daa6a
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 147
  - stderr bytes: 0
  - Provenance: executed
- Command: npm run typecheck
  - Status: PASS
  - Exit code: 0
  - Duration ms: 8026
  - stdout sha256: 73ad7967b0b62b903e0e14e90a6a3971d720cb1ab6b744714e6d2ef05dd89743
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 83
  - stderr bytes: 0
  - Provenance: executed
- Command: npm test
  - Status: PASS
  - Exit code: 0
  - Duration ms: 118073
  - stdout sha256: bd700da6cbd40438cabf5fde7ac43efa09f77bebcaf3eb1284a46de6046ecd4a
  - stderr sha256: 28e38b953b586e8b662b77b9777a85b6682f807a7eea5e22d68a34e7726ab158
  - stdout bytes: 15166
  - stderr bytes: 4700
  - Provenance: executed
- Command: npm run build
  - Status: PASS
  - Exit code: 0
  - Duration ms: 666
  - stdout sha256: 4a84685762211c33a9f2ac6336f7b1d29d9e1f9d26373ef0b9a167bf0a587116
  - stderr sha256: 351b524197fb492920789369e7f1a271420c757633fbb553b280a181ac4c31a4
  - stdout bytes: 88
  - stderr bytes: 360
  - Provenance: executed
- Command: node apps/desktop/e2e/run.mjs
  - Status: PASS
  - Exit code: 0
  - Duration ms: 11682
  - stdout sha256: 13c5d92d7aea23109c255205c3b6da9f312087fac0ed2a8a88c9e265bfae0c3b
  - stderr sha256: 872fab14e9c15dd649711b639cb1227382ca8d5a464dbc752c1b6d0f16bcacb2
  - stdout bytes: 283
  - stderr bytes: 163
  - Provenance: executed
- Command: python3 .harness/tools/validate.py --mode manual
  - Status: PASS
  - Exit code: 0
  - Duration ms: 5922
  - stdout sha256: f3c3153f26dc99c9cd0b924437ab6d607ee8bf2e9cbfd3fa9333a89fda6b4c8b
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 135
  - stderr bytes: 0
  - Provenance: executed

### Product verification
- none

### Manual verification
- Check: На Linux проверить длинную историю при прокрутке: missing folder disabled с причиной, исчезновение после availability показывает ошибку в viewport без scroll jump; существующая папка открывается, history/historyArtwork counters не увеличиваются, другие строки и фильтры доступны. Проверить Settings однострочную кнопку, compact integer1–8/invalid, сохранение refs/theme/restart, About current version/dev без checkUpdate, отсутствие меню и auto-open UI/side effect для старых true flags. Synthetic account: Plus без title, unknown/formats explanation, avatar/fallback и late avatar после logout/change account. Сохранить только synthetic screenshots/санитизированный proof STEP-059. Сверить docs/development.md и два объявленных architecture anchors с code/tests/evidence; новые native/packaging claims и повторная приёмка STEP-058 не требуются.
  - Status: PASS
  - Observed: "Linux synthetic browser 1440x1000: 50 строк доступны при deferred availability; фильтр работает до settle. Missing folder disabled с причиной; race deletion показывает сообщение на y928..976 при viewport1000/scrollY3524, scroll не меняется; history1/historyArtwork50 не перечитываются, обычная папка открывается. Settings button whiteSpace nowrap160x37px, number220px integer1..8; 0 invalid Save disabled, 8 сохраняется. About local synthetic version/dev, checkUpdate0; auto-open отсутствует. Plus/unknown/formats reason и avatar/fallback показаны, delayed avatar не блокирует account, late result после logout не публикуется. 10 screenshots, hashes и exact browser log в apps/desktop/evidence/STEP-059. Targeted tests160/12 и18/2 подтверждают filesystem recheck, old settings/snapshots и удаление auto-open, persistent TTL cache/account isolation; native menu/version/restart подтверждает свежий canonical Linux Electron E2E. Docs сверены с code/Evidence; реальные profile/token/photo не сохранены. Native Windows/macOS и упаковка не выполнялись. После F001/F002: real sidebar logout очищает loaded/pending avatar; late account-status A после logout/loginB не меняет active/store/accountB, оба originalrepro1PASS и affected101PASS, UI2PASS. FIX proof и отдельные2shots в fix-visual-evidence.json, READMEFIX сверён. Все manual surfaces сохранены. Пользователь запретил dev, dev не запускается."
<!-- VERIFICATION-EVIDENCE:END -->

Исходный STEP-058 имеет неизменённый trusted PASS; corrective observation и sanitised live probe перечислены в Context. Generated verification block записывает deterministic runner.






## Blocker / Failure reason

—
