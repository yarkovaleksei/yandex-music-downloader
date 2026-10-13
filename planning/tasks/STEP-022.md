---
schema: 1
id: STEP-022
status: completed
type: implementation
priority: high
phase: hardening
depends_on:
  - STEP-017
  - STEP-012
requirements:
  - REQ-028
adrs:
  - ADR-001
architecture_refs:
  - "docs/architecture.md#основные-потоки"
risk_flags:
  - none
plan:
  status: ready
  revision: 1
  context_basis: sha256:22d1b179c70ef8d3fd48e7b430dd65c0b860222f365b19bcf6bf2d1877fd4ea0
  content_hash: sha256:7f9400bb70e669728b5593bca572dadb996e13ce38ac70c832c38839ceafb378
  reviewed_report: planning/plan-reviews/STEP-022/PLAN-REVIEW-20261013T190049Z.md
  planned_at: 2026-10-13T19:00:49+00:00
  execution_groups:
  context_components:
    - "ADR@ADR-001=sha256:0c9975737760fdee3b16ec2c99c8412cd98e81af5a0ce123cf70600a4a3200bc"
    - "ARCH@docs/architecture.md#основные-потоки=sha256:e7842c107b39127d5776d5575d975efcf69df8d05024b630a938e1dc510e7575"
    - "PRN@PRN-001=sha256:3b3801f207fafc3f77272f0e93570258a6d006964839d93a276accd814d548af"
    - "PRN@PRN-002=sha256:f29ee3fbdb9cf65cf9739d0907768bbf192ad88b8e443110d4d82f81c6b79ecb"
    - "PRN@PRN-003=sha256:16516d7d302fecda5f7615f9d55e29e04b588d671f8660640e1f61d1619e4ef8"
    - "REQ@REQ-028=sha256:d2f11db64579c4de7438433afffb48b689f2b72ed6b44027b77589c06dc47301"
    - "STEP@STEP-012=sha256:91d00ce3c395b76bcb5e721c860d92a0373f3df1482da03a669a7fa68d8a6e69"
    - "STEP@STEP-017=sha256:74d947c3ddfeab0bcb7930439ff7161e2273ea240add13300da208e9725b7245"
    - "STEP@STEP-022=sha256:2d930f2395e503ece83debf2200a1936795af48ffc1f9d0d93fb9c8df3cd2feb"
---

# STEP-022 — Каталог playlist и .m3u8

## Goal

Генерировать `.m3u8` в UTF-8 с относительными путями в порядке плейлиста и нумерацией файлов по позициям источника.

## Context

Playlist membership выражается каталогом, `.m3u8` и manifest, но не тегом ALBUM.

Выбор путей и подключение файловых операций принадлежат application adapter/composition root по ADR-001; downloader сохраняет orchestration через injected порты. Каталог и нумерация playlist определяются типом источника, включая playlist из одного трека, а не количеством треков в плане.

## Scope

- Генератор `.m3u8` после завершения треков.
- Нумерация по позиции, стабильная при частичных неудачах.
- Исключение неуспешных треков из `.m3u8`.
- Интеграция writer через существующую границу файлового порта и application; выбор playlist layout по типу источника.
- Интеграционный тест.

## Mutation policy

### Allowed

- `packages/core/filesystem/**`, `packages/core/downloader/**` (интеграция), тесты.

### Conditional

- `packages/application/src/adapters/download-files.ts` — только выбор playlist layout по типу источника, включая один трек, и подключение filesystem writer `.m3u8` к файловому порту downloader. Существующие сценарии track/album не расширяются.
- `packages/application/src/composition-root.ts` — только регистрация writer `.m3u8`, если она необходима после уточнения файлового порта; сохранить существующие runtime/processing overrides и границы ADR-001.

### Forbidden

- Изменение тегов, UI.
- Реализация future/unrelated STEP «заодно».

## Out of scope

- Другие форматы плейлистов.

## Acceptance criteria

- Интеграционный тест: N треков → каталог, N файлов и `.m3u8` с путями в порядке источника.
- Частичная неудача: `.m3u8` содержит только успешные треки, нумерация не сдвигается.
- Кириллические имена корректно читаются парсером `.m3u8`.

## Verification

- command: `node packages/testing/scripts/run-yarn.mjs exec vitest run packages/core/filesystem/src/m3u8.test.ts packages/core/downloader/src/manager.test.ts packages/application/src/playlist.integration.test.ts`
- command: `npm run lint`
- command: `npm run typecheck`
- command: `npm test`
- command: `npm run format:check`
- command: `python3 .harness/tools/validate.py --mode manual`

## Deliverables

- m3u8 writer и тесты.

## Implementation plan

### 1. Добавить filesystem writer UTF-8 .m3u8

- Реализовать writer относительных путей в порядке входного списка, используя существующий FsOps/writeStreamToPart для flush/close и атомарную публикацию через временный файл. Поддержать кириллицу/пробелы и нормализовать разделители для win32/posix без изменения sanitizer/layout алгоритмов (REQ-028).
- Экспортировать writer из filesystem index; ошибки файловой операции переводить существующим mapFileError, временный файл очищать при отказе. Добавить краткие русские комментарии с @link на REQ-028.

**Files:**
- packages/core/filesystem/src/m3u8.ts
- packages/core/filesystem/src/index.ts
- packages/core/filesystem/src/m3u8.test.ts

**Tests:**
- Unit: UTF-8/относительные пути, сохранение source order и Windows separators; атомарная замена файла использует существующий FsOps.

### 2. Подключить playlist writer через injected файловый порт

- Добавить совместимую optional операцию записи playlist в DownloadFiles; вход включает manifest и ordered resultPaths. DownloadManager при terminal playlist выбирает completed/skipped с resultPath в порядке immutable plan, исключая failed/unavailable; нумерация остаётся позицией источника (REQ-028).
- Вызвать writer после settlement треков, перед job.completed и release, под owner.exclusive/session.runOwned; повторно проверять текущие generation/control для согласованности с existing pause/cancel. Ошибка записи должна завершить owned side effect, освободить lease и не публиковать успешное job.completed.
- В application download-files adapter реализовать операцию через новый filesystem writer и buildPlaylistLayout.playlistFile. Исправить выбор layout для single-track playlist по source.kind, сохранив existing track/album сценарии и injected пути иных adapters. Если уже возвращаемый adapter автоматически предоставляет writer, composition root не менять. Не менять dependencies, lockfile, shared schema, теги и другие форматы.

**Files:**
- packages/core/downloader/src/ports.ts
- packages/core/downloader/src/manager.ts
- packages/core/downloader/src/manager.test.ts
- packages/application/src/adapters/download-files.ts

**Tests:**
- Manager: writer завершён до job.completed/release, получает только успешные paths в source order; ошибка writer не сообщает completion и не удерживает lease; не вызывается для иных source kind.

### 3. Доказать Acceptance через real application integration

- Создать отдельный playlist.integration.test.ts через public createApplication/providerOverride и реальные FileManifestStore/filesystem. Использовать существующий валидный audio fixture, штатные planner/manager/adapter и независимое UTF-8 чтение/разбор .m3u8.
- Проверить N треков, в том числе завершение в ином порядке: отдельный каталог, N пронумерованных файлов и .m3u8 с относительными paths в source order. Включить single-track playlist как regression подтверждённого adapter дефекта.
- Проверить partial failure/unavailable: playlist содержит только completed/skipped files, номера последующих позиций не сдвигаются. Повторная загрузка existing successful files и retry failed track обновляют playlist по исходным позициям; .m3u8 должен уже существовать при job.completed. Имена fixture содержат кириллицу и пробелы.
- Выполнить focused проверки до handoff, затем передать SUCCESS dispatcher для полного canonical Verification и independent implementation review. Сохранить factual evidence, не объявлять completed самостоятельно.

**Files:**
- packages/application/src/playlist.integration.test.ts
- planning/tasks/STEP-022.md

**Tests:**
- Public application integration: source-order N, N=1, partial fail/unavailable, skip-existing/retry, UTF-8 parser и relative paths.

## Evidence



<!-- VERIFICATION-EVIDENCE:START -->
- Verification run: 2026-10-13T19:22:49Z
- Status: PASS
- Automated resumed: false
- Git head: 1e335f418fcffdc1a5925a4270f7c4b756f71603
- Worktree hash: sha256:750fc87c48e6033577631e99927e19a6b4ff49dc1681df93efd40b89a991d419
- Verification contract basis: sha256:010640dcee806f1b80ead940dbc81fc39a6c45439c25207c67889dd9c1643363
- Subject git head: 1e335f418fcffdc1a5925a4270f7c4b756f71603
- Subject worktree hash: sha256:a680aca4d0cea8c465370be1898ff43cd5df4f41c202a51a84c5a2deb77fb7bc

### Automated verification
- Command: node packages/testing/scripts/run-yarn.mjs exec vitest run packages/core/filesystem/src/m3u8.test.ts packages/core/downloader/src/manager.test.ts packages/application/src/playlist.integration.test.ts
  - Status: PASS
  - Exit code: 0
  - Duration ms: 2122
  - stdout sha256: c5239e7df2b3902db5ca4d009051399015c4b1b1e7abe81465758c64a58a19b4
  - stderr sha256: 0474a0db90ff774a8544c01bafd00355beaf8576c559ac374813fe840f108d6f
  - stdout bytes: 498
  - stderr bytes: 173
- Command: npm run lint
  - Status: PASS
  - Exit code: 0
  - Duration ms: 8279
  - stdout sha256: a9abc4bc51d6729860fb000bf87c02e5a80cc830999d05e640c5651c7e3daa6a
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 147
  - stderr bytes: 0
- Command: npm run typecheck
  - Status: PASS
  - Exit code: 0
  - Duration ms: 3670
  - stdout sha256: 73ad7967b0b62b903e0e14e90a6a3971d720cb1ab6b744714e6d2ef05dd89743
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 83
  - stderr bytes: 0
- Command: npm test
  - Status: PASS
  - Exit code: 0
  - Duration ms: 6938
  - stdout sha256: 8f79fe0b684eaa646584d96b6d6cf406302f79b8655cfd85bd80845691912d1e
  - stderr sha256: 3d736984125b34404aa893a3c9f099adaff35f3e90905b60d3da1dd041689e50
  - stdout bytes: 10580
  - stderr bytes: 2506
- Command: npm run format:check
  - Status: PASS
  - Exit code: 0
  - Duration ms: 2668
  - stdout sha256: dd379bf1ef31c6f32f58abc580a7c0f569da04740184c9270aa3521fc3afd8f2
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 237
  - stderr bytes: 0
- Command: python3 .harness/tools/validate.py --mode manual
  - Status: PASS
  - Exit code: 0
  - Duration ms: 4570
  - stdout sha256: ab99b0ab6e56fd7acbc254467a9ff4b5de526f3c834924b9d1b39bc764e44d56
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 424
  - stderr bytes: 0

### Product verification
- none

### Manual verification
- none
<!-- VERIFICATION-EVIDENCE:END -->

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.

- `PROJECT RECONCILE` от 2026-10-13 согласовал integration scope с REQ-028 и ADR-001: @link planning/audits/AUDIT-20261013T185224Z.md. Это исправление контракта задачи; реализация, Ready-план и Acceptance proof ещё не получены.



## Blocker / Failure reason

Execution `exec-975d022c156f4daba49d8115fb377050` остановлена на PLAN с `STEP_PLAYLIST_INTEGRATION_SCOPE_CONFLICT`: актуальный application adapter выбирает одиночный layout для playlist из одного трека, а прежняя Mutation policy исключала этот adapter. `PROJECT RECONCILE` от 2026-10-13 разрешил узкую integration-правку в Conditional; историческая остановка сохраняется. Следующий `STEP RUN STEP-022` должен подготовить новый план и пройти обычные planning/implementation/review gates.
