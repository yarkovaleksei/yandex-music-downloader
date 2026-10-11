---
schema: 1
id: STEP-041
status: completed
type: implementation
priority: medium
phase: provider
depends_on:
  - STEP-008
requirements:
  - REQ-001
  - REQ-002
  - REQ-056
adrs:
  - ADR-010
architecture_refs:
  - docs/architecture.md#external-dependencies-integrations
  - docs/architecture.md#security-boundaries
risk_flags:
  - security-sensitive
plan:
  status: ready
  revision: 1
  context_basis: sha256:feafd7a1f56e575b5bc049a1b134fe354ae0da7414540a33338af085b9e470eb
  content_hash: sha256:015541341e718a3ba84d62acc1c824e577b2f37d411d955712141f66d55426c9
  reviewed_report: planning/plan-reviews/STEP-041/PLAN-REVIEW-20261011T050742Z.md
  planned_at: 2026-10-11T05:07:42+00:00
  execution_groups:
  context_components:
    - "ADR@ADR-010=sha256:1b537392c517e85d1b83cd757d0c2b26e88587c82e3e48c42c2802be5e33a75a"
    - "ARCH@docs/architecture.md#external-dependencies-integrations=sha256:745b40d80b739a59467e156c30b839f7fb6c0cca9f347619f6856d1757324b1c"
    - "ARCH@docs/architecture.md#security-boundaries=sha256:1fb8b1276fc829d50a70930422b9207f8e907ad24da1447e1d32ddb08a4adcbe"
    - "PRN@PRN-001=sha256:3b3801f207fafc3f77272f0e93570258a6d006964839d93a276accd814d548af"
    - "PRN@PRN-002=sha256:f29ee3fbdb9cf65cf9739d0907768bbf192ad88b8e443110d4d82f81c6b79ecb"
    - "PRN@PRN-003=sha256:16516d7d302fecda5f7615f9d55e29e04b588d671f8660640e1f61d1619e4ef8"
    - "REQ@REQ-001=sha256:bc1700aedb2e43628cae048a8e61f544c0e0d7093b399cf2729420aaab626d85"
    - "REQ@REQ-002=sha256:57b2efdb8feefc31d5701a6d4be255b8905908c1704d2b7f171a1022fe6e0629"
    - "REQ@REQ-056=sha256:d98bd562a3f242bf10d95f9025fca7ec3d7eedad7e79712045181b383633ce25"
    - "STEP@STEP-008=sha256:300f5231a103d2e7aa34493459f2b13455ba14dc7ef5a18460ce37dd6c6c3c37"
    - "STEP@STEP-041=sha256:0760237861a8a480be70787da2f6894d654d0259ed393edba3a42f88455d353a"
---

# STEP-041 — Оформить приватную страницу авторизации по макету

## Goal

Оформить существующую временную browser-страницу Device Authorization по [макету 10-auth.png](../../docs/brand/mockups/10-auth.png), используя [готовую иконку](../../docs/brand/icon.png), и обеспечить работу копирования, перехода, обратного отсчёта и отмены с реальным challenge provider.

## Context

Основание — пользовательский `STEP ADD` с подробным описанием оформления страницы. Реализация `packages/providers/yandex-music/src/auth-browser.ts` уже открывает приватную HTML-страницу в системном браузере; `yandex-music-auth.ts` владеет Device Authorization, отменой и cleanup. STEP-008 завершён и является прямой зависимостью.

Этот STEP продолжает provider-owned browser challenge по ADR-010: HTML/CSS и небольшой browser JavaScript остаются внутри provider. Он не создаёт desktop renderer и не начинает фазу desktop до STEP-027. React/MUI/Vite/Electron, REQ-048 и STEP-030 сохраняют отдельное ownership будущего desktop UI.

Источники: `docs/brand/brandbook.md`, `docs/brand/mockups/10-auth.png` (1448 × 1086), `docs/brand/icon.png`; `auth-browser.ts`, `auth-browser.test.ts`, `yandex-music-auth.ts`, `yandex-music-auth.test.ts`; REQ-001/002/056, ADR-010 и PRN-001/002. Макет нормативен для оформления и компоновки; `ABCD–EFGH`, `ya.ru` и `04:32` — примеры, а не runtime-значения.

Overlap search: STEP-008 владеет реализованным auth lifecycle, STEP-030 — будущей desktop-оболочкой, STEP-032 — будущим Account screen; отдельного STEP для оформления приватной страницы не найдено. Новое REQ-056 фиксирует её визуальные и пользовательские обязательства без изменения REQ-048.

## Scope

### Компоновка и оформление

- Светлый фон, белая шапка, ограниченная ширина контента, свободные отступы и footer по макету. На широком окне карточка слева и инструкция справа; на узком — одна колонка без горизонтальной прокрутки, обрезанного текста или действий.
- Шапка: готовая PNG-иконка с сохранением пропорций и свободного пространства; название «Yandex Music Downloader» и подпись «Музыка с вами, даже офлайн»; справа «Авторизация через Яндекс» и компактный индикатор `127.0.0.1`. Эта же иконка используется в favicon.
- Вступление: плашка «Быстро и без пароля в приложении», заголовок «Вход в Яндекс Музыку» и краткое объяснение подтверждения доступа на официальном сайте.
- Основная карточка: «Ваш одноразовый код», статус ожидания, пояснение, подпись «Код для входа», крупный выделяемый код и «Скопировать», текст об ограниченном сроке; outlined-кнопка «Открыть страницу Яндекса» с обозначением внешнего перехода и фактический hostname под ней.
- После разделителя: индикатор ожидания, «Ожидаем подтверждения», пояснение об автоматическом продолжении, оставшееся время и полоска срока действия. Внизу — пояснение о завершении входа и «Отменить вход».
- Правая колонка: «Как подключить аккаунт», три шага «Скопируйте код», «Перейдите на сайт Яндекса», «Подтвердите вход»; информационная карточка «Ваш пароль остаётся у Яндекса». Footer обозначает временную локальную страницу и содержит «Неофициальное приложение, не связанное с Яндексом».
- Токены брендбука: primary `#5B5FEF`, фон `#F7F8FC`, поверхности `#FFFFFF`, текст `#0F172A`/`#64748B`, разделители `#E2E8F0`; Inter с системными fallback, spacing 8 px, аккуратные скругления и умеренные тени. Жёлтый цвет готовой иконки не становится основным CTA-цветом.

### Данные, взаимодействия и доставка

- Использовать настоящий user code и проверенный verification URL текущего challenge; показать hostname фактического URL, открыть HTTPS-адрес без Referer.
- Копировать актуальный код с коротким подтверждением; при отказе clipboard дать понятное сообщение и сохранить ручное выделение.
- Рассчитывать countdown и полоску по тому же реальному deadline, который ограничивает текущую авторизацию. Открытие/перезагрузка страницы не начинает новый срок; deadline можно передать только через приватный browser-helper provider. Публичные MusicProvider/AuthInteraction/application API не расширяются.
- Сохранить существующую отмену и success/error/timeout/cancel cleanup. Не объявлять разрыв связи успешным входом и не задерживать закрытие server/challenge ради интерфейса. Отдельный экран успешного входа или новый публичный status API не требуются.
- Поставлять иконку и остальные необходимые ресурсы локально вместе с собранным provider package; не зависеть от cwd или исходного каталога `docs`. Способ поставки определяется STEP PLAN.
- Сохранить loopback bind, непредсказуемый путь, no-store/no-referrer, экранирование HTML/атрибутов/JavaScript и отсутствие раскрытия challenge по неизвестным путям. Страница показывает только допустимый user code; секреты и приватный URL не выводятся в logs/CLI output/DTO/events.
- Обеспечить клавиатурную навигацию, видимый focus, доступные подписи, читаемость и текстовые статусы/ошибки.

## Mutation policy

### Allowed

- `packages/providers/yandex-music/**` — страница, её локальные ресурсы, приватная передача deadline, существующий HTTP/browser helper, provider build/package scripts и необходимые тесты/fixtures. OAuth polling, порядок проверки аккаунта и credential storage не меняются.
- Evidence текущего STEP и детерминированные projections.

### Conditional

- `docs/brand/brandbook.md` — только точное уточнение описания предоставленного знака и области применения страницы после сверки при STEP PLAN; не менять другие визуальные правила.
- Корневой `package.json` — только необходимая ссылка в существующем build wiring на локальную подготовку provider assets, если STEP PLAN докажет необходимость для работы собранного пакета. Provider-specific код остаётся внутри provider.

### Forbidden

- Перерисовка/замена `docs/brand/icon.png` и `docs/brand/mockups/10-auth.png`; замена знака библиотечной музыкальной нотой.
- Изменение OAuth polling, refresh-политики, проверки аккаунта, credential storage, публичных MusicProvider/AuthInteraction/application контрактов и решений Accepted ADR.
- Передача пароля или секретов странице; раскрытие challenge за приватными границами ADR-010; продление auth lifetime ради интерфейса.
- React/MUI/Vite/Electron, новый UI kit, внешние ресурсы/CDN/шрифты/аналитика и framework dependencies ради этой страницы.
- Изменения core/shared/application/CLI/desktop, других экранов, готового плана STEP-008 и исторических review-отчётов; исправление future/unrelated work.

## Out of scope

- Desktop UI, sidebar, навигация, Account/Settings/Diagnostics и обход gate STEP-027.
- Новые OAuth flows, автоматический refresh/replay, изменения native secure storage и публичный API статусов авторизации.
- Полный frontend/E2E framework, дополнительный live OAuth для каждой визуальной проверки и расширение auth hardening сверх подтверждённых изменений этого STEP.

## Acceptance criteria

- Страница визуально сверена с макетом при viewport 1448 × 1086; сохранены screenshots и объяснение видимых отличий. При viewport 640 × 900 блоки идут в одну колонку без горизонтальной прокрутки и обрезанных действий.
- Предоставленная PNG-иконка используется в шапке и favicon без искажения; палитра, типографика, spacing и основные CTA следуют брендбуку.
- Актуальный user code копируется с подтверждением; отказ clipboard даёт сообщение и допускает ручное выделение. Внешний переход и показанный hostname соответствуют проверенному verification URL, Referer не передаётся.
- Countdown и полоска отражают фактический deadline challenge; открытие/перезагрузка не продлевают срок. Отмена реально прекращает auth, а разрыв связи не объявляется успешным входом.
- Страница и favicon работают из собранного provider package вне корня репозитория без обращения к исходному `docs` и без внешних ресурсов.
- Действия доступны с клавиатуры, focus видим, подписи и состояния имеют текстовое представление; страница не запрашивает пароль Яндекса.
- Loopback/path/header/escaping/privacy границы ADR-010 сохранены; новые регрессии проверяют динамические данные и отсутствие секретов на запрещённых surfaces. Существующие success/error/timeout/cancel тесты и cleanup продолжают проходить.
- Релевантные lint, typecheck, tests, build, format и Harness gates проходят; изменения ограничены объявленным Scope, публичные auth-контракты и завершённые артефакты STEP-008 сохранены.

## Verification

- command: `node packages/testing/scripts/run-yarn.mjs lint`
- command: `node packages/testing/scripts/run-yarn.mjs typecheck`
- command: `node packages/testing/scripts/run-yarn.mjs test`
- command: `node packages/testing/scripts/run-yarn.mjs build`
- command: `node packages/testing/scripts/run-yarn.mjs format:check`
- command: `python3 .harness/tools/validate.py --mode manual`
- manual: Открыть приватную страницу собранного provider с синтетическим challenge вне корня репозитория при viewport 1448 × 1086 и 640 × 900; сохранить screenshots и сверку с макетом/иконкой/брендбуком. Проверить одну колонку без горизонтального overflow, клавиатурную навигацию и focus, clipboard success/denial/ручное выделение, фактический HTTPS hostname и переход без Referer, отсутствие внешних ресурсов.
- manual: Проверить countdown/progress по фактическому hard deadline и неизменность после reload, POST cancel/cleanup и отсутствие ложного успеха при разрыве связи, страницу/favicon из dist без docs/cwd. Сохранить наблюдения с синтетическими данными без реальных challenge/credentials/private URL; live OAuth не требуется.

## Deliverables

- Оформленная provider-owned страница и локальная иконка/favicon, доступные из собранного пакета.
- Необходимая приватная передача deadline и сохранённая интеграция с существующим auth lifecycle.
- Узкие регрессии разметки/динамических данных/HTTP/privacy и сохранённые auth lifecycle tests.
- Browser screenshot evidence и наблюдения по макету, адаптивности, взаимодействиям и доставке assets; независимый PASS review.

## Implementation plan

### 1. Приватные deadline и локальная поставка иконки

- Зафиксировать wall-clock deadline рядом с существующим hard timeout authenticate, передать deadline и duration только в openPrivateChallenge; не менять poll, account/store и публичные порты.
- Встроить неизменённый docs/brand/icon.png как base64 в provider src/auth-icon.ts, compiled tsc; отдавать PNG на private path/icon.png с no-store/no-referrer, без cwd/docs/runtime копирования. Проверять identity исходного PNG тестом.
- Уточнить только описание готового знака (жёлтый фон, тёмная нота, белый круг со стрелкой загрузки) и область применения визуальных токенов в docs/brand/brandbook.md.

**Files:**
- packages/providers/yandex-music/src/auth-browser.ts
- packages/providers/yandex-music/src/auth-icon.ts
- packages/providers/yandex-music/src/yandex-music-auth.ts
- docs/brand/brandbook.md

### 2. Оформление и действия приватной browser-страницы

- Выделить внутренний auth-page.ts с HTML/CSS и минимальным JS: шапка, вступление, карточка кода/ожидание/таймер/отмена, инструкция, информационная карточка/footer по макету; responsive grid и токены брендбука, local system fallback Inter, видимый focus/text statuses.
- Экранировать dynamic text/attributes; читать code из textContent без интерполяции в JS; deadline/duration передать безопасными numeric data-атрибутами. Копирование с подтверждением и понятным fallback, выделяемый код, href verified HTTPS + noreferrer/no-referrer + actual hostname.
- Countdown и progress вычислять по абсолютному deadline/original duration; reload не продлевает. Cancel вызывает прежний POST и сообщает отмену/ошибку связи; disconnect не является success. No new status API/публичные контракты/внешние ресурсы.

**Files:**
- packages/providers/yandex-music/src/auth-page.ts
- packages/providers/yandex-music/src/auth-browser.ts

### 3. Узкие регрессии, browser evidence и полный Verification

- Закрыть H-001 через HTTP tests: headers/private unknown paths, icon byte identity, dynamic escaping/hostname и отсутствие device/access/refresh tokens; сохранить existing notify/privacy tests.
- Закрыть H-002 через неизменный deadline при GET/reload и auth hard timeout после задержки browser открытия; existing success/error/cancel/timeout/account/store cleanup tests продолжают проходить. OAuth mock fixtures без реальных credentials.
- Запустить build и реальную dist страницу с synthetic challenge вне cwd; через доступный browser/Playwright CLI выполнить оба manual checks, сохранить screenshots в provider evidence STEP-041 и observations, обосновать только реальные визуальные отличия. Не добавлять frontend framework/package dependency.
- Выполнить все Verification commands, зафиксировать evidence на текущей ревизии и передать независимому review.

**Files:**
- packages/providers/yandex-music/src/auth-browser.test.ts
- packages/providers/yandex-music/src/yandex-music-auth.test.ts
- packages/providers/yandex-music/evidence/STEP-041/

**Tests:**
- node packages/testing/scripts/run-yarn.mjs test

**Risks:**
- H-001/H-002 planned executable proof = полный test command; browser-only поведение дополнительно manual evidence.

## Evidence

<!-- VERIFICATION-EVIDENCE:START -->
- Verification run: 2026-10-11T05:16:15Z
- Status: PASS
- Automated resumed: false
- Git head: c9a548a9a32b95aa929340b2a448f825e7f485fc
- Worktree hash: sha256:fe661eaa416bd85c01436fc5a70beab148b95f51e6d7bc4b2b58cdbb27f1fcb7
- Verification contract basis: sha256:1732a86ffbb5aaaf8eb6f01c54a5a06fa5a2dc737da1363a929d2c34dca188c8
- Subject git head: c9a548a9a32b95aa929340b2a448f825e7f485fc
- Subject worktree hash: sha256:71e032ed2c87ec5d4cf2dbb92bf2dde323d90e370edf92a255e64ee338271290

### Automated verification
- Command: node packages/testing/scripts/run-yarn.mjs lint
  - Status: PASS
  - Exit code: 0
  - Duration ms: 6275
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: 20bd7fd9207bfc4c0d60b1a8788978a9aa579fe55a8b0343cc8412f7563f1258
  - stdout bytes: 0
  - stderr bytes: 21
- Command: node packages/testing/scripts/run-yarn.mjs typecheck
  - Status: PASS
  - Exit code: 0
  - Duration ms: 2668
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: 85f09b8e5470c77109300fadf9946b344fe0c4156aaaea36df55d027341ee708
  - stdout bytes: 0
  - stderr bytes: 26
- Command: node packages/testing/scripts/run-yarn.mjs test
  - Status: PASS
  - Exit code: 0
  - Duration ms: 5238
  - stdout sha256: 08df395e0860ca63e5f8a659cf16a054ce1d25b386df0c086d2e64fae0d8187e
  - stderr sha256: f969fafb7bc32ecc492c8343f56269c9c47161d893e83a0d8b9b27fcf57b9aee
  - stdout bytes: 6652
  - stderr bytes: 21
- Command: node packages/testing/scripts/run-yarn.mjs build
  - Status: PASS
  - Exit code: 0
  - Duration ms: 414
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: 0157d8afc3a7265ca4e7c585e12c0dad6c6e3b575b60dd6b58851567da7c61d3
  - stdout bytes: 0
  - stderr bytes: 22
- Command: node packages/testing/scripts/run-yarn.mjs format:check
  - Status: PASS
  - Exit code: 0
  - Duration ms: 2167
  - stdout sha256: 17aa973d3f004560237d9a95171210b0671deff23d61628eecf7322ff5938f20
  - stderr sha256: bc7ff43979f728ea1bb7df02172de0e3cf57fcedb8eda66fe9d54d5198d0fa84
  - stdout bytes: 66
  - stderr bytes: 29
- Command: python3 .harness/tools/validate.py --mode manual
  - Status: PASS
  - Exit code: 0
  - Duration ms: 3068
  - stdout sha256: c49223d9f13b2381c4cde088cd4c0398def5d1b60091b904591c4a06a98fe05e
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 366
  - stderr bytes: 0

### Product verification
- none

### Manual verification
- Check: Открыть приватную страницу собранного provider с синтетическим challenge вне корня репозитория при viewport 1448 × 1086 и 640 × 900; сохранить screenshots и сверку с макетом/иконкой/брендбуком. Проверить одну колонку без горизонтального overflow, клавиатурную навигацию и focus, clipboard success/denial/ручное выделение, фактический HTTPS hostname и переход без Referer, отсутствие внешних ресурсов.
  - Status: PASS
  - Observed: "Chrome / Playwright CLI: screenshots desktop.png 1448x1086, mobile.png 640x900 и mobile-full.png визуально сверены. PNG 1254x1254 без искажений; system fallback вместо внешнего Inter, умеренные тени/плоский фон брендбука. Tab copy/link/cancel и solid focus, реальный clipboard code/confirmation, simulated NotAllowedError + ручное double-click выделение, HTTPS URL/hostname и отсутствие Referer через intercepted popup, только loopback resources — PASS. См. packages/providers/yandex-music/evidence/STEP-041/README.md и browser-observations.json."
- Check: Проверить countdown/progress по фактическому hard deadline и неизменность после reload, POST cancel/cleanup и отсутствие ложного успеха при разрыве связи, страницу/favicon из dist без docs/cwd. Сохранить наблюдения с синтетическими данными без реальных challenge/credentials/private URL; live OAuth не требуется.
  - Status: PASS
  - Observed: "Compiled provider dist скопирован в /tmp, fixture cwd=/tmp без runtime docs. Countdown 04:32/progress272000/300000, сдвиг browser clock на10s + reload даёт04:22 с тем же deadline; за deadline00:00/expired. POST cancel закрывает helper; закрытый helper сообщает разрыв связи и не объявляет успех/подтверждённую отмену. Page/favicon HTTP200 image/png 1348273 bytes, внешних ресурсов нет. Уточнения метода: synthetic challenge без liveOAuth, clock фиксирован для screenshots; real auth hard timeout и lifecycle подтверждаются auth tests."
<!-- VERIFICATION-EVIDENCE:END -->

Пользовательский запрос `STEP ADD` принят 2026-10-11. Созданы task contract и REQ-056; исходные макет и иконка предоставлены пользователем. Текущая production-страница и владелец lifecycle сверены по `auth-browser.ts`/`yandex-music-auth.ts`; реализация этого STEP ещё не выполнена.

2026-10-11: реализация по Ready plan revision 1 выполнена внутри provider. Страница выделена в `auth-page.ts`; неизменённый PNG включён в compiled `auth-icon.ts`, отдаётся по приватному пути вместе с favicon. `authenticate` передаёт browser helper deadline существующего hard timeout; OAuth polling, публичные API и credential lifecycle сохранены. Брендбук уточнён только по готовому знаку и области применения визуальных токенов.

Узкий запуск `node packages/testing/scripts/run-yarn.mjs exec vitest run packages/providers/yandex-music/src/auth-browser.test.ts packages/providers/yandex-music/src/yandex-music-auth.test.ts`: exit code 0, 2 файла / 23 теста. Build: exit code 0. Реальная browser-проверка копии `dist` вне репозитория: screenshots 1448 × 1086 и 640 × 900, clipboard/fallback/выделение, клавиатура/focus, countdown/reload/expiry, URL/no-Referer, cancel/cleanup/disconnect и локальные assets — PASS. Метод, ограничения и отличия от макета: [browser evidence](../../packages/providers/yandex-music/evidence/STEP-041/README.md). Реальные credentials и private URL в evidence не сохранены.

## Blocker / Failure reason

—
