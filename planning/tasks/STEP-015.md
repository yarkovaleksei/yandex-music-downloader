---
schema: 1
id: STEP-015
status: planned
type: implementation
priority: critical
phase: core
depends_on:
  - STEP-012
  - STEP-003
  - STEP-002
requirements:
  - REQ-012
  - REQ-024
adrs:
  - ADR-004
architecture_refs:
  - "docs/architecture.md#основные-потоки"
  - docs/architecture.md#reliability-observability
risk_flags:
  - data-migration
plan:
  status: ready
  revision: 1
  context_basis: sha256:569f0fcccfa0058f1ffe9bd7dd68653f45e1c027b42284d907c509193b77fac3
  content_hash: sha256:6882fe97fc96cbe39536a123aa0222e1df6d5664c2dfd72d6fb2c0e666acdcc9
  reviewed_report: planning/plan-reviews/STEP-015/PLAN-REVIEW-20261010T061624Z.md
  planned_at: 2026-10-10T06:16:24+00:00
  execution_groups:
  context_components:
    - "ADR@ADR-004=sha256:4ad987cbdefdf1409c52fd01994ccca0d6941fad8ae0126d435745f3e727ca08"
    - "ARCH@docs/architecture.md#reliability-observability=sha256:a9c337102c2ed62fdaca7173e8e2c05ffe6d68a1d99140fe986a552b3cc636d4"
    - "ARCH@docs/architecture.md#основные-потоки=sha256:e7842c107b39127d5776d5575d975efcf69df8d05024b630a938e1dc510e7575"
    - "PRN@PRN-001=sha256:3b3801f207fafc3f77272f0e93570258a6d006964839d93a276accd814d548af"
    - "PRN@PRN-002=sha256:f29ee3fbdb9cf65cf9739d0907768bbf192ad88b8e443110d4d82f81c6b79ecb"
    - "PRN@PRN-003=sha256:16516d7d302fecda5f7615f9d55e29e04b588d671f8660640e1f61d1619e4ef8"
    - "REQ@REQ-012=sha256:bfb0f858590695dbd81594733f5820f59b4b788fa514b57212695534543047ab"
    - "REQ@REQ-024=sha256:db58f69677b462e41432055aef95868b73d7f4ef035b5d1ce797a25521d5701c"
    - "STEP@STEP-002=sha256:9f43502fd6485b6532f596cbb4bf5df62fef4f1736db427e99501cbc9df6fd01"
    - "STEP@STEP-003=sha256:d44b1efab2bcb4a844c3ac708626a1569e846fb6034b4aae8b752fa91b7e7405"
    - "STEP@STEP-012=sha256:91d00ce3c395b76bcb5e721c860d92a0373f3df1482da03a669a7fa68d8a6e69"
    - "STEP@STEP-015=sha256:fa9e50837548202013857a380bec41035e908e725577a82052e2d21faa11eee1"
---

# STEP-015 — Запись .part и атомарная финализация

## Goal

Реализовать потоковую запись в `.part`, flush/close и атомарный rename с поведением skip-existing/overwrite по ADR-004.

## Context

Кроссплатформенный атомарный rename и замена существующего файла различаются на Windows и POSIX.

## Scope

- Writer потока в `.part` в каталоге назначения с поддержкой AbortSignal.
- Финализация: close, flush, hook проверки/метаданных, atomic rename/replace.
- Политики skip-existing/overwrite; удаление `.part` при cancel; имя `.part` уникально для job и трека; rename — точка фиксации.
- В режиме skip-existing финализация не заменяет файл, появившийся до rename (переход `processing → skipped`).
- Hook-и проверки/метаданных получают явный контейнер, а не определяют формат по расширению `.part`.
- Обработка ENOSPC/EACCES в доменные ошибки.

## Mutation policy

### Allowed

- `packages/core/filesystem/**`, тесты.

### Conditional

- Нет.

### Forbidden

- Запись тегов (STEP-021), валидация контейнера (STEP-023), очередь.
- Реализация future/unrelated STEP «заодно».

## Out of scope

- Range-resume (STEP-016).

## Acceptance criteria

- Обрыв потока оставляет только `.part` и не создаёт конечный файл (тест).
- `--overwrite` оставляет прежний файл нетронутым до успешного rename.
- ENOSPC/EACCES дают `DiskFullError`/`PermissionError`.
- Тесты кросс-ОС особенностей выполняются в CI matrix (STEP-002): EPERM/EBUSY при rename на Windows (ограниченные повторы), коллизии NFC/NFD и регистра, учёт `.part` в лимите длины пути.
- Два job с одним итоговым путём не используют один `.part`.

## Verification

- command: `node packages/testing/scripts/run-yarn.mjs run lint`
- command: `node packages/testing/scripts/run-yarn.mjs run typecheck`
- command: `node packages/testing/scripts/run-yarn.mjs test`
- command: `node packages/testing/scripts/run-yarn.mjs run build`
- command: `node packages/testing/scripts/run-yarn.mjs run format:check`
- command: `python3 .harness/tools/validate.py --mode manual`
- manual: Подтвердить зелёный запуск CI matrix (STEP-002) на PR с этим STEP на Linux, Windows и macOS, включая кросс-ОС тесты finalize; приложить ссылку на запуск в Evidence.

## Deliverables

- File writer и тесты.

## Implementation plan

### 1. Имя .part, учёт лимитов и маппинг файловых ошибок

- В packages/core/filesystem/src/part-path.ts реализовать buildPartPath(finalPath, { jobId, position, platform }) → путь `<имя итогового файла>.<короткий id job>-<позиция>.part` в том же каталоге (ADR-004). Короткий id — первые 8 hex-символов sha256(jobId) (node:crypto): не зависит от формата jobId, равномерен и детерминирован. Пустой jobId или позиция не положительное целое → ValidationError. Разделитель и join — по параметру platform (path.win32 / path.posix), а не по process.platform, как в layout.ts.
- Учёт .part в лимите длины: полный путь .part не длиннее лимита платформы (win32 259, posix 4095) и имя не длиннее 255 (в единицах платформы, helper nameLength из sanitize.ts). Если итоговое имя + суффикс не помещается, усекается только часть, взятая из итогового имени (по графемам; суффикс `.<id>-<позиция>.part` сохраняется целиком, часть итогового имени может сократиться до нуля символов). ValidationError — только если не помещается сам суффикс. Итоговый путь и layout.ts не меняются.
- Уникальность: разные пары (jobId, позиция) с одним итоговым путём дают разные .part; одинаковая пара даёт одинаковое имя (детерминизм для recovery).
- В packages/core/filesystem/src/file-errors.ts реализовать mapFileError(error): ENOSPC → DiskFullError, EACCES и EPERM → PermissionError, остальные системные ошибки → DownloadError(false) без исходного текста в публичных полях (PRN-002). Ошибки из потока (reader) и hook-ов не маппятся и пробрасываются без изменений, чтобы core retry классифицировал их сам.

**Files:**
- packages/core/filesystem/src/part-path.ts
- packages/core/filesystem/src/file-errors.ts
- packages/core/filesystem/src/part-path.test.ts
- packages/core/filesystem/src/file-errors.test.ts

**Tests:**
- Табличные: имя .part для разных job и позиций, детерминизм, два job с одним итоговым путём не делят .part, невалидные jobId/позиция.
- Лимиты: длинное итоговое имя на win32 и posix усекается с сохранением суффикса, путь не превышает лимит, слишком длинный каталог → ValidationError; кириллица и эмодзи не рвутся.
- mapFileError: ENOSPC, EACCES, EPERM, прочие коды; сообщение исходной ошибки не попадает в JSON ошибки.
- Граница: для win32-путей, которые buildAlbumLayout принимает у предела 259 (каталог 227–237 символов), buildPartPath возвращает .part в пределах 259 и 255 с целым суффиксом, без ValidationError.

**Risks:**
- Часть имени итогового файла в .part может быть усечена или пуста; это допустимо, потому что .part — временный файл рядом с итоговым и узнаётся по суффиксу с id job и позицией.

### 2. Writer потока в .part

- В packages/core/filesystem/src/fs-ops.ts описать узкий внутренний интерфейс FsOps (mkdir, open, lstat, rename, unlink) с реализацией по умолчанию через node:fs/promises; тестам разрешено подменять отдельные операции для воспроизведения EPERM/EBUSY/ENOSPC/EACCES на любой ОС.
- В packages/core/filesystem/src/writer.ts реализовать writeStreamToPart(stream, partPath, { signal, expectedSize?, ops? }): создать каталог (mkdir recursive), открыть файл на запись с усечением (повторный запуск того же job и трека начинает заново: Range-resume принадлежит STEP-016), читать reader по чанкам, писать, затем flush (fsync) и close. Результат { bytesWritten }.
- AbortSignal: при abort reader отменяется, дескриптор закрывается, .part остаётся на диске (pause сохраняет), бросается AbortError. Обрыв потока (ошибка reader) оставляет .part и пробрасывает исходную ошибку без маппинга. Конечный файл в этих случаях не создаётся.
- Если задан expectedSize и поток завершился с другим числом байт — DownloadError(true) (транзитный сбой: можно повторить открытие потока), .part остаётся. Ошибки файловых операций (open, write, sync, close, mkdir) маппятся через mapFileError.
- discardPart(partPath, ops?) — идемпотентное удаление .part для cancel (ENOENT игнорируется, остальные ошибки через mapFileError). Выбор между pause и cancel принадлежит STEP-017.

**Files:**
- packages/core/filesystem/src/fs-ops.ts
- packages/core/filesystem/src/writer.ts
- packages/core/filesystem/src/writer.test.ts

**Tests:**
- Интеграция с реальной файловой системой во временном каталоге: поток записывается полностью, байты совпадают, bytesWritten верен.
- Обрыв потока на середине: остаётся только .part, конечного файла нет, ошибка исходная (не маппится).
- AbortSignal до и во время чтения: AbortError, .part сохранён, дескриптор закрыт.
- expectedSize не совпал: DownloadError с retryable=true, конечного файла нет.
- ENOSPC при записи и EACCES при open (подменой FsOps) → DiskFullError и PermissionError.
- discardPart удаляет .part и не падает на отсутствующем файле.

**Risks:**
- Подмена FsOps в тестах моделирует ошибки ОС; реальное поведение Windows подтверждается запуском CI matrix (STEP-002).

### 3. Финализация: проверки, hooks, atomic rename и политика существующих файлов

- В packages/core/filesystem/src/finalize.ts реализовать finalizePart({ partPath, finalPath, container, onExisting: 'skip' | 'replace', hooks, platform, ops?, sleep? }) → { status: 'completed' | 'skipped', path }. Порядок по ADR-004: validate({ stage: 'initial' }) → writeMetadata → validate({ stage: 'final' }) → проверка существующего файла → rename. Hooks (validate, writeMetadata) необязательны и получают { partPath, container }, где container — явный AudioContainer, а не расширение .part. Сами теги (STEP-021) и валидация контейнера (STEP-023) не реализуются.
- Ошибка hook-а пробрасывается без маппинга, rename не выполняется, конечный файл не создаётся, .part остаётся для решения вызывающего слоя (REQ-012).
- Политика существующего файла проверяется после всех hooks и непосредственно перед rename (lstat): onExisting='skip' и файл уже есть — .part удаляется, результат skipped, существующий файл не заменяется (переход processing → skipped, ADR-003); onExisting='replace' — rename заменяет цель только после успешных проверок, поэтому при ошибке прежний файл нетронут (overwrite). Отображение режимов CLI на onExisting делает STEP-017: --overwrite и недействительный существующий файл → 'replace', иначе 'skip'. Окно между lstat и rename — принятое ограничение детекции.
- inspectExisting(finalPath, { validate?, ops? }) → 'absent' | 'valid' | 'invalid' для предварительной проверки skip-existing (REQ-024); валидация внедряется вызывающим (STEP-023), без неё существующий обычный файл считается valid. Каталог вместо файла и другие не-файлы — 'invalid' без удаления.
- Rename: платформа win32 и коды EPERM/EBUSY — ограниченные повторы (по умолчанию 5 попыток с нарастающей паузой 50–400 мс, sleep инжектируется), затем EPERM → PermissionError, EBUSY → DownloadError(false). На POSIX и для остальных кодов повторов нет: ENOSPC → DiskFullError, EACCES → PermissionError, остальное через mapFileError. После успешного rename .part отсутствует.
- Экспорт API нового модуля из packages/core/filesystem/src/index.ts с сохранением существующих экспортов STEP-012.

**Files:**
- packages/core/filesystem/src/finalize.ts
- packages/core/filesystem/src/finalize.test.ts
- packages/core/filesystem/src/index.ts

**Tests:**
- Успешная финализация: hooks вызваны в порядке initial → metadata → final с явным container, результат completed, .part исчез, содержимое конечного файла верно.
- Ошибка validate или writeMetadata: конечного файла нет (или прежний файл не изменён), .part сохранён, ошибка hook-а пробрасывается как есть.
- overwrite: прежний файл остаётся нетронутым до rename (hook проверяет содержимое во время вызова) и заменён после успеха; при ошибке hook-а остаётся прежним.
- skip: файл, появившийся во время загрузки, не заменяется, .part удалён, результат skipped; inspectExisting различает absent, valid, invalid.
- EPERM и EBUSY при rename на win32 (подмена FsOps): ограниченные повторы с инжектируемым sleep, затем PermissionError и DownloadError; успех на повторе; на posix повторов нет.
- ENOSPC/EACCES при rename → DiskFullError/PermissionError.
- Кросс-ОС особенности на реальной ФС с runtime-пробой (тест сам определяет, регистронезависима ли ФС и нормализует ли она NFC/NFD, и ожидает соответствующее поведение): при skip файл, различающийся только регистром или NFC/NFD, не теряется ни на одной ОС. Тесты выполняются в CI matrix STEP-002.

**Risks:**
- Между lstat и rename остаётся короткое окно гонки в режиме skip; это принятое ограничение плана (ADR-004 описывает проверку «появился до rename», но не блокировку). Строгий no-clobber (hard link) не вводится.
- EBUSY после повторов считается нетранзитной ошибкой трека: повтор всей загрузки не решает проблему занятого файла.

### 4. Каноническая проверка и CI-подтверждение

- Выполнить lint, typecheck, test, build, format:check и Harness validator; форматировать только затронутые файлы; изменения только в packages/core/filesystem. Синхронизировать projections перед completion; результат SUCCESS передать dispatcher.
- Кросс-ОС Acceptance доказывается запуском CI matrix STEP-002 на PR с этим STEP: после появления workflow выполнить GIT COMMIT, PUSH, PR и приложить ссылку на зелёные запуски Linux, Windows, macOS как manual-наблюдение. Реализация зависит от завершения STEP-002 (depends_on).

**Files:**
- packages/core/filesystem/src/index.test.ts

**Tests:**
- Существующие тесты STEP-012 и marker остаются зелёными.

**Risks:**
- Закрытие STEP зависит от внешнего запуска CI на Windows и macOS и может потребовать итераций.

## Evidence

<!-- VERIFICATION-EVIDENCE:START -->
- Verification run: 2026-10-10T07:48:02Z
- Status: MANUAL_REQUIRED
- Automated resumed: false
- Git head: 8287373508ea719e69596642bcaa4fa3ae94e593
- Worktree hash: sha256:4564cc24e70813654bafbacf47080d5c4157914c9a464f9b1b6e65baf56d0471
- Verification contract basis: sha256:122d3301135dac257d598ea873d20eea41a1e649c5fab4182ba7274e9f240970
- Subject git head: 8287373508ea719e69596642bcaa4fa3ae94e593
- Subject worktree hash: sha256:4564cc24e70813654bafbacf47080d5c4157914c9a464f9b1b6e65baf56d0471

### Automated verification
- Command: node packages/testing/scripts/run-yarn.mjs run lint
  - Status: PASS
  - Exit code: 0
  - Duration ms: 5972
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: f59ba696a15507a8febe0f9ea94ac75ccc5411952df61ee4cb3c971b47b6bc12
  - stdout bytes: 0
  - stderr bytes: 25
- Command: node packages/testing/scripts/run-yarn.mjs run typecheck
  - Status: PASS
  - Exit code: 0
  - Duration ms: 2417
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: ffbfd8ec2bfcf3e8f0e99a93f081f695da2de832eba56c5ae6943a4052680411
  - stdout bytes: 0
  - stderr bytes: 30
- Command: node packages/testing/scripts/run-yarn.mjs test
  - Status: PASS
  - Exit code: 0
  - Duration ms: 4231
  - stdout sha256: 8de58a89a966630f9ce765a5ab8975d7d91f10f75f648fbf438b4a24684fb9b8
  - stderr sha256: f969fafb7bc32ecc492c8343f56269c9c47161d893e83a0d8b9b27fcf57b9aee
  - stdout bytes: 5330
  - stderr bytes: 21
- Command: node packages/testing/scripts/run-yarn.mjs run build
  - Status: PASS
  - Exit code: 0
  - Duration ms: 414
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: a0b5ebe8b7786637f56a665a03d6d27f3d6a927d0669b1870beb1307702b651a
  - stdout bytes: 0
  - stderr bytes: 26
- Command: node packages/testing/scripts/run-yarn.mjs run format:check
  - Status: PASS
  - Exit code: 0
  - Duration ms: 1866
  - stdout sha256: 17aa973d3f004560237d9a95171210b0671deff23d61628eecf7322ff5938f20
  - stderr sha256: 25e162fe1196016bd51a2c9644b6820f880082561abce757f808502fb7895ebb
  - stdout bytes: 66
  - stderr bytes: 33
- Command: python3 .harness/tools/validate.py --mode manual
  - Status: PASS
  - Exit code: 0
  - Duration ms: 2817
  - stdout sha256: 5b27678fb5a659ad29cd46dc1083c1b7a669333084f7abfd09d4ae4688d7d416
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 366
  - stderr bytes: 0

### Product verification
- none

### Manual verification
- Check: Подтвердить зелёный запуск CI matrix (STEP-002) на PR с этим STEP на Linux, Windows и macOS, включая кросс-ОС тесты finalize; приложить ссылку на запуск в Evidence.
  - Status: PENDING
<!-- VERIFICATION-EVIDENCE:END -->

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.

## Blocker / Failure reason

—
