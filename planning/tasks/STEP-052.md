---
schema: 1
id: STEP-052
status: completed
type: bugfix
priority: critical
phase: hardening
depends_on:
  - STEP-022
requirements:
  - REQ-028
  - REQ-043
  - REQ-044
adrs:
  - ADR-001
architecture_refs:
  - "docs/architecture.md#основные-потоки"
risk_flags:
  - release-critical
plan:
  status: ready
  revision: 2
  context_basis: sha256:13f7fa3ed860767e3a513d31b4b502d6ea4840a65e3e84969ece0d620b3d4786
  content_hash: sha256:0aae1bd458be0e2bb96a4ca29f3a4977b011f01e920379c0489a0976fe92eafc
  reviewed_report: planning/plan-reviews/STEP-052/PLAN-REVIEW-20261014T112403Z.md
  planned_at: 2026-10-14T11:24:03+00:00
  execution_groups:
  context_components:
    - "ADR@ADR-001=sha256:0c9975737760fdee3b16ec2c99c8412cd98e81af5a0ce123cf70600a4a3200bc"
    - "ARCH@docs/architecture.md#основные-потоки=sha256:e7842c107b39127d5776d5575d975efcf69df8d05024b630a938e1dc510e7575"
    - "PRN@PRN-001=sha256:3b3801f207fafc3f77272f0e93570258a6d006964839d93a276accd814d548af"
    - "PRN@PRN-002=sha256:f29ee3fbdb9cf65cf9739d0907768bbf192ad88b8e443110d4d82f81c6b79ecb"
    - "PRN@PRN-003=sha256:16516d7d302fecda5f7615f9d55e29e04b588d671f8660640e1f61d1619e4ef8"
    - "REQ@REQ-028=sha256:d2f11db64579c4de7438433afffb48b689f2b72ed6b44027b77589c06dc47301"
    - "REQ@REQ-043=sha256:25b24d5d4547a9aa170d94bf0046a74a82ad5a817296f8d9f168295399286484"
    - "REQ@REQ-044=sha256:54427009756971c5fd75791bae02f1df9fb15781afc1501f3e9f4bb88c879749"
    - "STEP@STEP-022=sha256:ab0ef2b154065f298594564cb243a4e108290ad215b4bf750dda44155434f496"
    - "STEP@STEP-052=sha256:9080a6c15d970b561413aea67678c5faec1a4c7a50b6c00be06a618c2d890614"
---

# STEP-052 — Платформа M3U8 writer по умолчанию и переносимость тестов

## Goal

Исправить подтверждённые M3U8 failures на Windows и сделать текущую кроссплатформенную проверку пригодной для Windows VM: разумные bounded test timeouts, ранняя безопасная диагностика отказа owner startup и рабочие файлы в текущей папке.

## Context

STEP-027 выявил ошибки default path API и смешивания Windows root с Linux fixture; initial implementation STEP-052 исправила их. Последующий serial Windows run подтвердил EPERM на concurrent M3U8 rename и owner readiness timeout с queued/inactive/running; исходная причина owner startup неизвестна. Исходные snapshots/counts и неизменённые historical reports сохранены в Evidence.

Владелец 2026-10-14 явно поручил «сделай нормальные таймауты и пиши в текущую папку, не надо в temp писать» и уточнил: «Архив и рабочие каталоги проверок». Это разрешает описанное ниже расширение task-local scope; принятые REQ/ADR и production lifecycle/identity contracts не меняются. Windows rename retries имеют существующий bounded precedent в filesystem finalize.ts; новый механизм ограничивается подтверждённой M3U8 публикацией. Нет основания объявлять antivirus или недостаточные права пользователя причиной.

## Scope

- Native default/explicit platform M3U8 writer, переносимые long-name и parallel publication regressions.
- Только на Windows: bounded EPERM/EBUSY rename recovery после flush/close единожды записанного temporary файла.
- Test-only tooling timeout и application owner readiness/test budgets; capture безопасного terminal createDownload результата вместо бесполезного ожидания после раннего отказа.
- Все Vitest temporary directories через TMP/TEMP/TMPDIR внутри `.cache/checks` текущего checkout; отчёты/media runner под текущей рабочей папкой; ZIP в корне проекта с постоянным именем.
- Обновлённый комплект/короткое обновление existing Windows-копии с сохранением sources проверяющего и новой source identity; native Windows proof остаётся обязательным до completion.

## Mutation policy

### Allowed

- `packages/core/filesystem/src/m3u8.ts`, `packages/core/filesystem/src/m3u8.test.ts`.
- `eslint/boundaries.test.ts`, `eslint/consistency.test.ts` — только test timeout существующих ESLint probes; assertions/матрица не ослабляются.
- `packages/application/src/application.integration.test.ts` — только STEP-045 readiness helper/его три test timeouts и безопасная диагностика раннего createDownload результата; реальные provider/store/lease/control assertions сохраняются.
- `vitest.config.ts` — только placement TMP/TEMP/TMPDIR текущего test checkout и создание `.cache/checks`; не уменьшать набор тестов/изоляцию/concurrency.
- `docs/research/step-027-acceptance/**` — runner output placement, preparation budgets, identity/config-preserving update, packaging/README/tests. Credentials/CLI/source access policy сохраняется.
- Evidence STEP-052 и canonical plan/review artifacts; projections только tools.

### Conditional

- `.gitignore` — только игнорирование фиксированного generated ZIP/check directories в workspace; `.cache/` уже игнорируется.
- `packages/core/filesystem/src/layout.test.ts` и `packages/application/src/playlist.integration.test.ts` — только необходимое подтверждение совместимости writer.

### Forbidden

- Production layout/sanitizer, downloader, application commands, persistence/identity/lifecycle, provider/auth/credentials, schema/dependencies и desktop.
- Общий filesystem retry layer, retries non-Windows/non-transient errors, delete-before-rename, повторная запись temporary между attempts, непроверенные обходы прав/antivirus.
- Skip тестов, снижение assertions/покрытия/реальной внутритестовой concurrency, бесконечные timeout, raw cause/message/stack/paths/credentials в диагностику.
- Объявление Linux/injected PASS Windows proof, переписывание исторического evidence и Git commit/push.

## Out of scope

Исправление неизвестной production-причины owner startup без capture/trace. Новое Windows kernel locking/identity решение, общая оптимизация, новые форматы playlist и завершение desktop gate. Если capture подтвердит production defect, он получает отдельный corrective STEP с реальной причиной.

## Acceptance criteria

- M3U8 без platform использует host OS, явные win32/linux/darwin сохраняют приоритет; UTF-8 строки относительные, source order не меняется.
- Parallel writer публикует два разных коротких temporary после flush/close и без остаточных файлов. На Windows EPERM/EBUSY rename имеет максимум пять attempts с delays 50/100/200/400 ms, без unlink destination или переписывания temporary; после exhaustion прежняя классификация ошибки/cleanup сохраняются. POSIX/non-transient errors повторов не получают.
- Сохранена unconditional Linux255UTF8 boundary и native permissible long-file публикация; native root/platform согласованы.
- Существующие два ESLint timing cases имеют конечный timeout 30000 ms. STEP-045 readiness имеет конечный budget 90000 ms, три использующих его теста — 180000 ms. Если createDownload уже завершён или отклонён, readiness немедленно сообщает только безопасные enum-коды, не ждёт остаток 90 s; active lease + downloading остаются условиями успеха.
- Vitest os.tmpdir и дочерние test processes используют workspace `.cache/checks`, без записи scratch в OS Temp; runner report/media создаются в текущей рабочей папке. Default sources пусты в полном архиве; настройки sources existing Windows-копии обновлением не стираются.
- В корне проекта подготовлен обновляемый ZIP с фиксированным именем; record его SHA-256/source digest. Старое Linux9/9 остаётся историческим evidence предыдущего subject.
- Получен full offline Windows PASS исправленного digest и runtime/command/exit evidence, затем независимый review/completion. До него задача не completed. Full music matrix/owner go принадлежит STEP-027.

## Verification

- command: `node packages/testing/scripts/run-yarn.mjs exec vitest run packages/core/filesystem/src/m3u8.test.ts eslint/boundaries.test.ts eslint/consistency.test.ts packages/application/src/application.integration.test.ts packages/application/src/playlist.integration.test.ts`
- command: `node packages/testing/scripts/run-yarn.mjs run lint`
- command: `node packages/testing/scripts/run-yarn.mjs run typecheck`
- command: `node packages/testing/scripts/run-yarn.mjs test`
- command: `node packages/testing/scripts/run-yarn.mjs build`
- command: `node packages/testing/scripts/run-yarn.mjs run format:check`
- command: `node --test docs/research/step-027-acceptance/run.test.mjs`
- command: `python3 .harness/tools/validate.py --mode manual`
- manual: На реальной Windows получить full offline suite PASS нового source digest безskip; проверить paths/report/media в текущем checkout и ownURLsources сохранены послеupdate. Сохранитьruntime/source/command/exit proof; rawerrors/secretsневыводить. Музыкальныереальныe циклы остаются STEP027; безWindowsproof completionBLOCKED.

## Deliverables

Исправленный writer и regression tests, конечные budgets и безопасная readiness-диагностика, workspace output/test placement, обновляемый комплект без потери sources, canonical Verification и независимый review. Windows qualification и завершение после real proof.

## Implementation plan

### 1. Восстановить только подтверждённый Windows M3U8 rename

- Сохранить revision1 native default/explicit platform и relative UTF8/source order. В private helper m3u8.ts добавить максимум5renameattempts только Windows EPERM/EBUSY, delays50/100/200/400ms по существующему finalize precedent. effective platform explicitoverride иначеhost; никакой публичной API смены.
- Писать/flush/close temporary ровно один раз; retry только rename одного и того же пути. Не unlink destination, не переписыватьtemporary, послеexhaustion выполнять existing cleanup/mapFileError. POSIX/другие ошибки — одна попытка.
- Сохранить native parallel barrier/unique paths/final content/cleanup и255UTF8regression. Добавить минимальные deterministic FsOps tests transient-to-success, exhaustion cleanup and unchanged error code, nonWindows/nontransient no retry; real Windows repeat послекомплекта. H001 plannedproof focusedcommand.

**Files:**
- packages/core/filesystem/src/m3u8.ts
- packages/core/filesystem/src/m3u8.test.ts

**Tests:**
- node packages/testing/scripts/run-yarn.mjs exec vitest run packages/core/filesystem/src/m3u8.test.ts eslint/boundaries.test.ts eslint/consistency.test.ts packages/application/src/application.integration.test.ts packages/application/src/playlist.integration.test.ts

### 2. Сделать конечные test budgets и early startup diagnostic

- По прямому указанию владельца увеличить только два подтверждённых ESLint timing cases до30000ms, без изменения матрицы/ignore assertions. Не менять всех тестов globaltimeout.
- STEP045 readiness helper: deadline90000ms, три its использующиеhelper180000ms. Сохранить настоящие store/provider/lease/control и success downloading+activelease. Заменить неотменяемый expect.poll на scoped конечный loop, проверяющий early createDownload settlement до/после store reads, с короткой паузой; если outcome terminal илиrejected — сразуfail безопасным enum snapshot. Cleanup/lifecycle production не менять.
- Capture только fixed outcome state/resultKind/error code и allowlisted failure reason; неизвестное unknown. Запрет raw message/stack/cause/PID/hostname/paths/secret. Добавить минимальную проверкуformatter/capture на безопасныйвывод, не новый неизвестный productionfailure. Последний nativeTrace allowlist сохранить. Если capture подтвердит cause внеscope — отдельнаяcorrectiveработа.

**Files:**
- eslint/boundaries.test.ts
- eslint/consistency.test.ts
- packages/application/src/application.integration.test.ts

**Tests:**
- Exactexisting matrix/ignore and STEP045 cancel/pause/resume assertions pass, earlysafe diagnostic excludes raw fields.
- node packages/testing/scripts/run-yarn.mjs exec vitest run packages/core/filesystem/src/m3u8.test.ts eslint/boundaries.test.ts eslint/consistency.test.ts packages/application/src/application.integration.test.ts packages/application/src/playlist.integration.test.ts

### 3. Перенести temporary и отчёты в workspace

- В vitest.config.ts создать checkout .cache/checks и передать TMP/TEMP/TMPDIR через test.env каждому workspace иtoolingproject. Не mutateparentglobalenvironment и невыключатьfileparallelism/изоляцию. Child test processes наследуютenv. Нормализованныйroot отconfigfilepath, все fixturesсохраняютmkdtemp+cleanup.
- Runner default reportBase=process.cwd(), perrun folder music-downloader-check-XXXX под ним; applicationstate/nativecredentials не перемещать. Передpreparation runner child env TMP/TEMP/TMPDIR указывает .cache/checks в root; создатькаталог. Сохранитьexisting reportBase injection tests. Preparation test process имеетfinite1800s budget, прочиеbounded prechecksкакбыли; не менятьrealdownload/nativeCtrlCbehavior.
- Проверитьdefaultworkspaceplacement и source helper tests, явно distinguishtestcache/report/nativecredentials. .cache ужеignored; добавитьonlyfixedgeneratedZIPnames в.gitignore.

**Files:**
- vitest.config.ts
- docs/research/step-027-acceptance/run.mjs
- docs/research/step-027-acceptance/run.test.mjs
- .gitignore

**Tests:**
- node packages/testing/scripts/run-yarn.mjs exec vitest run packages/core/filesystem/src/m3u8.test.ts eslint/boundaries.test.ts eslint/consistency.test.ts packages/application/src/application.integration.test.ts packages/application/src/playlist.integration.test.ts
- node --test docs/research/step-027-acceptance/run.test.mjs

### 4. Подготовить обновление existing Windows copy без потери настроек

- Existing package.py создаёт fixedroot STEP-052-acceptance.zip и небольшой STEP-052-update.zip. Replacing onlyown generated filenames поexplicit --replace; arbitrary prior files не удалять. Fullbundledefaultsources empty; update omits config.json.
- Небольшой apply-update.mjs читает packaged subject.json с known sourceFile list/gitHead/digest, проверяет actual workspace byte digest и согласованность allowlist, затем обновляет только configgitHead/sourceFiles/expectedSourceDigest, сохраняяexisting sources и иныепараметры. Не выполнятьinstall/network/auth внутриupdate. Уникальный temporary config и rename, безопасные ошибкиenum без содержимогоconfig.
- Update ZIP содержит только modified allowed sources/tooling configs/.gitignore иhelperfiles/subject/apply-update. ExistingWindows copy: распаковатьповерх и однакоманда node docs/research/step-027-acceptance/apply-update.mjs; затемштатныйrunner. Проверки source mismatch/refusal и сохранения ownURLs добавить вexistingrun.test.mjs.
- Пересчитатьfinalsource digestпослеформатирования; full/update ZIPпроверитьпоsourcebytes иsha. README указываетcwdoutput/testcache, explicitfinite budgets, fixedrootarchives, сохранение ownURLsources и староеLinuxproofhistorical. НовыйWindowsreport обязательнодоcompleted.

**Files:**
- docs/research/step-027-acceptance/package.py
- docs/research/step-027-acceptance/apply-update.mjs
- docs/research/step-027-acceptance/subject.json
- docs/research/step-027-acceptance/config.json
- docs/research/step-027-acceptance/README.md
- docs/research/step-027-acceptance/run.test.mjs

**Tests:**
- node --test docs/research/step-027-acceptance/run.test.mjs
- Full/update ZIP source bytes match accepted digest; update keeps own sources and refuses mismatch before config mutation.

## Evidence





<!-- VERIFICATION-EVIDENCE:START -->
- Verification run: 2026-10-14T12:40:28Z
- Status: PASS
- Automated resumed: false
- Git head: b57db587ca4d70173fba6a495fb4c76337250227
- Worktree hash: sha256:923d13c6e8bbd2d61bbfd0e6db3f384a09fd20b307230e233f8221b547871b5e
- Verification contract basis: sha256:959bfa9bc8e1b8498d9fbdc5a5549bf4fd7906b396584ec7b3486be1696591bc
- Subject git head: b57db587ca4d70173fba6a495fb4c76337250227
- Subject worktree hash: sha256:0c0649dbaf5d66e9a2564fd6743eac2245a81de8c9dbed6c843fb05bae3adbcd

### Automated verification
- Command: node packages/testing/scripts/run-yarn.mjs exec vitest run packages/core/filesystem/src/m3u8.test.ts eslint/boundaries.test.ts eslint/consistency.test.ts packages/application/src/application.integration.test.ts packages/application/src/playlist.integration.test.ts
  - Status: PASS
  - Exit code: 0
  - Duration ms: 3519
  - stdout sha256: 3794dc533dd2a1e6f137b077eeeef4bb25301d51d8d796e2577bf7e9a02b3816
  - stderr sha256: 079fa6abecc9e4764636e1939497fb4cf5b5d7120523049ce116b98344bff500
  - stdout bytes: 875
  - stderr bytes: 1576
- Command: node packages/testing/scripts/run-yarn.mjs run lint
  - Status: PASS
  - Exit code: 0
  - Duration ms: 8276
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: f59ba696a15507a8febe0f9ea94ac75ccc5411952df61ee4cb3c971b47b6bc12
  - stdout bytes: 0
  - stderr bytes: 25
- Command: node packages/testing/scripts/run-yarn.mjs run typecheck
  - Status: PASS
  - Exit code: 0
  - Duration ms: 3668
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: ffbfd8ec2bfcf3e8f0e99a93f081f695da2de832eba56c5ae6943a4052680411
  - stdout bytes: 0
  - stderr bytes: 30
- Command: node packages/testing/scripts/run-yarn.mjs test
  - Status: PASS
  - Exit code: 0
  - Duration ms: 8148
  - stdout sha256: 331344014bac505b8cc4389ebfa31ac811bc5b7d02c292c0b14dc3ebd90d329d
  - stderr sha256: b192b43b46ccf21fb1a3065a66a52cdb4f4bd2031d293cacf2a076631e261a47
  - stdout bytes: 12041
  - stderr bytes: 2527
- Command: node packages/testing/scripts/run-yarn.mjs build
  - Status: PASS
  - Exit code: 0
  - Duration ms: 464
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: 0157d8afc3a7265ca4e7c585e12c0dad6c6e3b575b60dd6b58851567da7c61d3
  - stdout bytes: 0
  - stderr bytes: 22
- Command: node packages/testing/scripts/run-yarn.mjs run format:check
  - Status: PASS
  - Exit code: 0
  - Duration ms: 3367
  - stdout sha256: 17aa973d3f004560237d9a95171210b0671deff23d61628eecf7322ff5938f20
  - stderr sha256: 25e162fe1196016bd51a2c9644b6820f880082561abce757f808502fb7895ebb
  - stdout bytes: 66
  - stderr bytes: 33
- Command: node --test docs/research/step-027-acceptance/run.test.mjs
  - Status: PASS
  - Exit code: 0
  - Duration ms: 364
  - stdout sha256: b929f418d4d7e2c97f9c7a93392235909af73fe2ab7aa9a42510b5adfb4d037c
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 2210
  - stderr bytes: 0
- Command: python3 .harness/tools/validate.py --mode manual
  - Status: PASS
  - Exit code: 0
  - Duration ms: 4870
  - stdout sha256: 359c3612e5ba95ae1031ea2f5327f81fc413ab6eb60d7c651704b0b5ded7350d
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 2048
  - stderr bytes: 0

### Product verification
- none

### Manual verification
- Check: На реальной Windows получить full offline suite PASS нового source digest безskip; проверить paths/report/media в текущем checkout и ownURLsources сохранены послеupdate. Сохранитьruntime/source/command/exit proof; rawerrors/secretsневыводить. Музыкальныереальныe циклы остаются STEP027; безWindowsproof completionBLOCKED.
  - Status: PASS
  - Observed: "Windows report docs/research/step-052-windows-pass-2026-10-14.json: native win32/x64 Node24.21.0, 9/9 cycles PASS, source/tool digests matched, workspace output C:/Users/vboxuser/test2/music-downloader-check-w0kud8, same own sources. Supporting full offline checks 7/7 code0 at source25a6 from previous report, recorded in STEP052 Evidence. Current --no-prepare report confirms native Ctrl+C and resume; no repeated completed downloads or remaining parts."
<!-- VERIFICATION-EVIDENCE:END -->

- Реализация: default `writeM3u8` использует native path API; explicit platform сохраняет приоритет. Native long-name fixture использует host platform и её допустимый path budget; unconditional mocked Linux regression сохраняет точные 255 UTF-8 байт. Relative UTF-8/source order, publication sync/close/rename, unique temporary и cleanup проверяются без skip.
- Focused проверка после правок: `node packages/testing/scripts/run-yarn.mjs exec vitest run packages/core/filesystem/src/m3u8.test.ts packages/core/filesystem/src/layout.test.ts packages/application/src/playlist.integration.test.ts`, exit 0, 33 tests PASS (8 M3U8, 20 layout, 5 application). Это локальная Linux-проверка, не Windows proof.
- Первый canonical Verification выявил предсуществующий format:check FAIL в двух изменённых provider-файлах STEP-051 и projection drift после status in_progress. Projections пересобраны. Отдельный canonical PROJECT QUICK FIX execution exec-7970c87fdf524988a034983b8a4dfd7b применил только Prettier line wrapping в metadata.test.ts и resolve-yandex-music-url.ts; targeted format check PASS, поведение не менялось. Product baseline подтвердил 316 остальных product/config файлов без изменений; два writer/test файла относятся к STEP-052, два provider-файла — к отдельному механическому QUICK FIX.
- Новый архив: `/tmp/STEP-052-acceptance-eb00ae843b8c.zip`, 3406080 байт, 321 файлов. SHA-256 `7689684c8512a103f76f5ec7fa6997aeab574aeaab69692607e6934c90c55510`; source `sha256:eb00ae843b8c9f3cd29af63c6615f4fdec608bd5b6706c3c369b4358dbd9491b`, 306 исходников. Повторное чтение ZIP подтвердило каждый source byte текущего worktree, source digest, archive SHA-256 и пустые default sources. Ссылки задаёт проверяющий; Git/dist/credentials в комплект не включены. Старый Linux source sha256:5c90380eae10221e52a38e324dd55a1e4d1cce19fd0246c20bb616b2308a6ed2 и его 9/9 остаются историческим evidence.
- Windows runtime текущим Linux окружением не проверен. Приёмка реального полного Windows offline suite нового source digest предстоит; production/test subject не объявляется прошедшим STEP-027 на основании прежних циклов. Commit/push не выполнялись.

- Владелец передал JSON новой Windows-попытки: 2026-10-14T10:40:24.349Z–10:41:35.419Z (13:40:24–13:41:35 Europe/Moscow), Windows x64/release 10.0.26200, Node v24.21.0, runnerVersion 2, mode full. Source digest sha256:eb00ae843b8c9f3cd29af63c6615f4fdec608bd5b6706c3c369b4358dbd9491b и 306 files совпали с исправленным архивом и текущими source bytes. Install --immutable/lint/typecheck exit 0; test exit 1 без signal/timeout, около 50.933 s. test stdout SHA-256 5da7678df1b84e916c54fab9183224c76c9d6e1aef32f1eb443309fd8bc7c36b, stderr 7e5223daf6a864dc0b729a696594d861b50d08fa1799d31f9cdc331fed8c857d — поля предоставленного report, сами streams не captured. Full FAIL/AUTOMATED_CHECK_FAILED, cycles 0, validatedFiles 0. Имена/число failed tests, assertion/syscall/stack отсутствуют. Общие EBUSY/EPERM из collector не объявляются причиной и не доказывают повтор прежних M3U8 failures. Evidence является сводкой пользовательского JSON; original report bytes не captured. Следующий bounded diagnostic: на этой Windows-копии test --reporter=verbose, секция Failed Tests/Failed Suites и итоговые counts; runner/install/music cycles для диагностики не повторяются. Код по неизвестной причине не менялся.

- Новый пользовательский verbose Windows run уточнил failure surface: 3 failed / 1204 passed tests, 3 failed / 92 passed files, total 1207/95; displayed start 13:58:13, duration 118.68 s. В supplied Failed Tests только tooling boundaries.test.ts:184 (apps/cli src group matrix, 5000 ms timeout), tooling consistency.test.ts:215 (main ESLint ignores, 5000 ms timeout), application.integration.test.ts:264/353 (startOwner readiness poll 30000 ms). Последняя безопасная snapshot: resultKind=result, trackStatus=queued, leaseState=inactive, controlState=running, nativeTrace errno/syscall/targetRole=unknown. До cancel/inbox assertions этот case не дошёл; он не доказывает отказ cancel или native EPERM. M3U8 не входит в три failed files/cases полного набора; прежние четыре failures в этом reported run отсутствуют. Source linkage — предшествующий JSON исправленного digest и запрос запуска на той же Windows-копии; новый verbose output сам digest не содержит. Raw terminal bytes не captured; exact absolute timestamp/exit code нового verbose run отдельно не предоставлены.
- Bounded diagnostic hypothesis: concurrent Vitest file workers могут влиять на timing/owner startup на текущей Windows VM; это предположение, не установленная причина. Следующий full Windows comparison: test --no-file-parallelism --reporter=verbose при тех же исходниках и timeout. Vitest 3 документирует fileParallelism=false как один worker, сохраняя concurrency внутри файла: https://v3.vitest.dev/config/#fileparallelism. Production/fixtures/config/runner не меняются, глобальные timeout/skip/retries не вводятся. Эти три failing files не входят в разрешённую mutation surface STEP-052; после evidence потребуется решить ownership дальнейшего corrective work, а не исправлять их внутри M3U8 STEP.

- Локальный bounded comparison выполнен на Linux: `node packages/testing/scripts/run-yarn.mjs exec vitest run eslint/boundaries.test.ts eslint/consistency.test.ts packages/application/src/application.integration.test.ts --no-file-parallelism`, exit 0, 134/134 tests, 3/3 files PASS, duration 5.47 s. Это проверка допустимости диагностической команды и локального поведения, не evidence причины Windows failures и не Windows PASS. Product/test/config files в этом RUN не менялись.

- Владелец выполнил full Windows suite с --no-file-parallelism --reporter=verbose: 2 failed / 1205 passed tests, 2 failed / 93 passed files, 1207/95 total, displayed start 14:02:39, duration 253.83 s; отдельный exit code не передан. Tooling timeout cases предыдущего run отсутствуют. Подтверждён новый intermittent M3U8 failure: parallel writers, promise rejected PERMISSION_DENIED; native cause EPERM errno -4048, syscall rename, source role .m3u8-UUID.tmp, destination role Список.m3u8 в том же temporary directory (raw paths не сохраняются). Второй failure — другой case STEP-045 pause/resume — снова startOwner readiness 30000 ms со snapshot queued/inactive/running и unknown native trace, до pause/resume assertions. Serial comparison не устранил owner startup failure и не является полным Windows PASS; scheduling contention не доказан его единственной причиной. Утверждение об отсутствии M3U8 failures относится только к предшествующему run и не превращается в стабильный Windows PASS. Original terminal bytes не captured.
- Read-only inspection показал локальный precedent: finalize.ts применяет только на Windows EPERM/EBUSY пять rename attempts с delays 50/100/200/400 ms после завершённой записи, без удаления destination и переписывания temporary. Текущий M3U8 writer вызывает rename единожды. Revision 1 plan запрещает новые retries, поэтому обнаруженный confirmed rename defect требует нового STEP PLAN STEP-052 перед дальнейшей production mutation. Owner startup outside M3U8 scope направляется в отдельное corrective диагностическое work.




- По прямому решению владельца подготовлен Ready plan revision2, независимые architecture/planning-review PASS. Реализованы Windows-only M3U8 EPERM/EBUSY rename recovery (максимум5 попыток, delays50/100/200/400ms после одной закрытой записи), finite test budgets: confirmed tooling matrix/ignore cases30s, owner readiness90s/три owner tests180s, early OWNER_STARTUP_FAILED allowlisted code/reason. Production identity/lifecycle/provider/schema не изменялись.
- Все Vitest projects получают TMP/TEMP/TMPDIR в checkout .cache/checks; standalone Node helper test scratch и runner child env тоже в workspace. Runner default report/media root — process.cwd(), per-run music-downloader-check-XXXX. Условие credentials/stateDir не перемещается. Данные проверки лежат внутри текущей папки, ZIP — фиксированные generated файлы в корне, ignored .gitignore.
- Canonical automated Verification новой версии:8/8 PASS, overall MANUAL_REQUIRED. Полные tests/lint/typecheck/build/format/helper tests/Harness validation прошли; исправлены void-return типы FsOps mocks и явный return type safe diagnostic helper. Свежий generated block выше относится к этому subject; локальный PASS не подменяет Windows.
- Full ZIP `/home/user/github.com/yarkovaleksei/yandex-music-downloader/STEP-052-acceptance.zip`: 3413333 байт, 323 files, SHA256 175421672817d1e32b2579aac281c5055ce76bb4693993df0a6b3b508ebad6c7. Update ZIP `/home/user/github.com/yarkovaleksei/yandex-music-downloader/STEP-052-update.zip`: 55650 байт, 13 files, SHA256 1e55121202df17f8309f8708c3dba2535dbd4e902632653517ac846d7d57da83. Current source sha256:25a6a43bde2aa78ac3f5d74f533cec434ff0173d87859dbf0dfcaf78c0fdea07 /306 files. Update flat, config.json отсутствует в ZIP, existingsources сохраняются apply-update после сравнения allowlist/digest. Explicit --replace обновляет только фиксированные архивные names.
- Реальный локальный update proof: предыдущий Windows-комплект eb00ae843b8c распакован в workspace .cache/checks, ему заданы собственные synthetic music URLs/дополнительная настройка; наложен окончательный flat update ZIP и штатный CLI apply-update (exit0, UPDATE_APPLIED). Все306 source bytes совпали с текущим worktree; config own sources/extra key сохранились, digest совпал. Full ZIP отдельно проверен: каждый source byte актуален, defaultsources пусты. Временная копия proof удалена после проверки; product/config baseline подтвердил313 неизменённых файлов, все7 изменений — разрешённые текущим scope.
- Принцип приёмки сохраняется: owner-startup production cause прежних Windows failures неизвестна до нового safe capture; ни увеличение timeout, ни local diagnostic не объявляют её исправленной. Следующий Windows run делается в existing copy после небольшого update, report внутриcwd. Git commit/push не выполнялись.

- Отчёт владельца от 2026-10-14T12:06:45.542Z, Windows 10.0.26200/x64, Node v24.21.0: все семь preparation checks прошли с code0 и без timeout, включая полный `test`, `build`, coverage и provider runner tests. Source digest `sha256:25a6a43bde2aa78ac3f5d74f533cec434ff0173d87859dbf0dfcaf78c0fdea07` совпадает с текущим приложением. SHA256 исходного attachment `49015ffe5ce84506a37167b82d20a7827216f8f1ced1f2cfdb524ebf1688fdea`; нормализованные факты сохранены в `.harness/local/step-052-windows-offline-pass-signal-failure.json`. Это реальное подтверждение Windows offline suite; прежние timing/M3U8 failures в данном прогоне отсутствуют.
- Последующий FAIL относится к инструментарному `WINDOWS_CTRL_C_NOT_CONFIRMED`: signal-probe получил настоящий SIGINT, вывел `paused` и завершился с code4; `ctrlCSent` отсутствует, stderrBytes0. В исходном helper подтверждение записывалось фоновым control-потоком после 250ms, основной поток после выхода дочернего Node мог раньше вызвать Environment.Exit. Точный порядок Windows потоков в report не captured; наличие этой гонки установлено чтением кода, не выдаётся за native trace.
- Исправлен lifecycle helper: pauseDone.Reset до отправки Ctrl+C, Set после записи/flush подтверждения, основной поток ожидает событие максимум10s перед возвратом exit code. При timeout возвращается97; отсутствие CTRL_C_SENT остаётся FAIL. Проверка native быстрого exit4 в run.test.mjs на Windows повторяется трижды; Linux 15/15 PASS проверяет только Linux-механизм. Windows qualification исправленного helper ещё pending.
- Обновлены фиксированные ZIP в корне: full3414070bytes/323files/SHA256c9e76c8bc3fc42d3aec42283cafd562c9a53dcca6e8bef8b86d4804b19e576d7; update59043bytes/14files/SHA2566ff409764e944a17fe439096b57e59dae30bb994f33ffea511e6fa6b164bfa1e. Update теперь включает windows-cli.ps1, config.json исключён; все ZIP entries побайтно совпали с worktree. Product source digest не изменился: успешные Windows supporting checks остаются применимыми, продолжение existing copy допускает `run.mjs --no-prepare`. Полная матрица музыкальных циклов STEP-027 ещё не выполнена.

- Получен исходный Windows report полного музыкального прогона 2026-10-14T12:23:18.840Z–12:28:55.708Z, сохранён без изменений в `docs/research/step-052-windows-pass-2026-10-14.json`, SHA256 `05d6dd9571e314055066ee6f10b74760c651898547a032c8bc281a861f7cf074`. Итог PASS, 9/9 циклов (track/album/playlist по3), 30 validated files. Каждый download прерван с code4 и ctrlCSent=true, каждый resume завершён с code0; все partial prefixes существуют по snapshot, partsRemaining=0, preservedCompleted/noRepeatedCompletedDownloads=true, privacy passed. Три M3U8 sidecar содержат по2 entries. Native signal-probe также code4/paused/ctrlCSent=true. Tool/source/sourceAfter digests побайтно совпали с текущими файлами; reporter working outputs находятся под `C:\Users\vboxuser\test2\music-downloader-check-w0kud8`, вне OS Temp. Sources совпадают с предыдущим Windows supporting report; настройки проверяющего сохранились. Credentials backend native-keyring, account/doctor PASS; отсутствие необязательного FFmpeg не является отказом.
- PreparationSkipped=true и checks=[] соответствуют явно рекомендованному `--no-prepare`; этот report не заявляет повторный offline suite. Его supporting checks — предыдущий full Windows report с тем же source digest (все7 code0), зафиксированный выше. Windows helper qualification теперь подтверждена реальным прогоном. OwnerGo остаётся PENDING; полный headless gate STEP-027 не объявляется завершённым.


## Blocker / Failure reason

Нативные Windows offline и Ctrl+C/resume проверки прошли на текущем source. Остаётся независимый implementation review STEP-052. Полная матрица STEP-027 и owner go ещё не завершены.
