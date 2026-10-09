---
schema: 1
id: STEP-012
status: completed
type: implementation
priority: critical
phase: core
depends_on:
  - STEP-003
requirements:
  - REQ-022
  - REQ-023
adrs:
  - ADR-001
architecture_refs:
  - "docs/architecture.md#основные-компоненты-границы"
risk_flags:
  - none
plan:
  status: ready
  revision: 1
  context_basis: sha256:ebb9470e019cd4fef8c0b47615d1f3b3cbe6e2c9541417ac6113a1c00fd2c84e
  content_hash: sha256:bcacbf8dd921f44f38ac7652bebf6da23a4b15760cbf365ae2d0f593cfe77a6d
  reviewed_report: planning/plan-reviews/STEP-012/PLAN-REVIEW-20261009T201123Z.md
  planned_at: 2026-10-09T20:11:23+00:00
  execution_groups:
  context_components:
    - "ADR@ADR-001=sha256:0c9975737760fdee3b16ec2c99c8412cd98e81af5a0ce123cf70600a4a3200bc"
    - "ARCH@docs/architecture.md#основные-компоненты-границы=sha256:fbdabff4c712b9793cdefe9ef7f14d27253ce04e554c0e2e1ab730cb5bfb5a91"
    - "PRN@PRN-001=sha256:3b3801f207fafc3f77272f0e93570258a6d006964839d93a276accd814d548af"
    - "PRN@PRN-002=sha256:f29ee3fbdb9cf65cf9739d0907768bbf192ad88b8e443110d4d82f81c6b79ecb"
    - "PRN@PRN-003=sha256:16516d7d302fecda5f7615f9d55e29e04b588d671f8660640e1f61d1619e4ef8"
    - "REQ@REQ-022=sha256:d9c7bb1bb17fb7b09b12f6f5a5acf55ce9b88c43432cf1e00759258413fc1cca"
    - "REQ@REQ-023=sha256:2aff4ac661a508faee8eb8d8043d32f84794b949bd1d8af640b904eb0f27688d"
    - "STEP@STEP-003=sha256:d44b1efab2bcb4a844c3ac708626a1569e846fb6034b4aae8b752fa91b7e7405"
    - "STEP@STEP-012=sha256:9c036202f58ed09deb5339e3882e00f121f994df1071964df8b1d41327a1fbec"
---

# STEP-012 — Filename sanitizer и генерация путей

## Goal

Реализовать единый кроссплатформенный sanitizer и генератор путей для track/album/playlist с predefined templates.

## Context

Правила Windows/macOS/Linux различаются; ошибка приводит к потере данных или path traversal.

## Scope

- Sanitizer с параметром платформы (reserved names, trailing, длина, Unicode).
- Path generator для single/album/playlist по predefined templates.
- Детерминированное разрешение коллизий имён.
- Table-driven и property-тесты.

## Mutation policy

### Allowed

- `packages/core/filesystem/**`, тесты.

### Conditional

- Нет.

### Forbidden

- Запись файлов на диск, пользовательский template language.
- Реализация future/unrelated STEP «заодно».

## Out of scope

- Полноценный template language (будущее).

## Acceptance criteria

- Тесты покрывают все пункты REQ fs-sanitizer, включая reserved names без учёта регистра, `..`, абсолютные пути, кириллицу и эмодзи.
- Результат путей всегда внутри выходного каталога.
- Коллизии имён разрешаются детерминированно без перезаписи.

## Verification

- command: `node packages/testing/scripts/run-yarn.mjs run lint`
- command: `node packages/testing/scripts/run-yarn.mjs run typecheck`
- command: `node packages/testing/scripts/run-yarn.mjs test`
- command: `node packages/testing/scripts/run-yarn.mjs run build`
- command: `node packages/testing/scripts/run-yarn.mjs run format:check`
- command: `python3 .harness/tools/validate.py --mode manual`

## Deliverables

- Пакет filesystem с тестами.

## Implementation plan

### 1. Единый sanitizer сегмента пути с параметром платформы

- Ввести тип TargetPlatform = 'win32' | 'darwin' | 'linux' и одну чистую функцию sanitizePathSegment(name, { platform, fallback }) без ввода-вывода; платформенные различия выражены только параметром (REQ-022).
- Для всех платформ: нормализация Unicode в NFC; замена < > : " / \ | ? * и управляющих символов U+0000–U+001F, U+007F на '_'; обрезка пробелов по краям; сегменты, равные '.' или '..', и пустой результат заменяются fallback ('Unknown' по умолчанию, REQ-023). Ведущие точки в обычных именах ('...And You Will Know Us') сохраняются. Кириллица и эмодзи сохраняются.
- Для win32 (по брифу §20): удаление trailing пробелов и точек; reserved names CON, PRN, AUX, NUL, COM1–COM9, LPT1–LPT9 без учёта регистра, в том числе с расширением (con.txt), получают суффикс '_' к базовому имени (CON_, con_.txt).
- Лимит длины имени: 255 байт UTF-8 для linux/darwin и 255 UTF-16 code units для win32; усечение по границам графем (Intl.Segmenter), чтобы не разрывать суррогатные пары и эмодзи; после усечения повторно применяются правила trailing/reserved/fallback.
- Функция sanitizeFileName(stem, extension, options) усекает только stem и сохраняет расширение в пределах лимита; расширение допускается только как [a-z0-9]{1,10} после приведения к нижнему регистру, иначе ValidationError из packages/shared.

**Files:**
- packages/core/filesystem/src/sanitize.ts
- packages/core/filesystem/src/sanitize.test.ts

**Tests:**
- Table-driven по каждой платформе: каждый запрещённый символ, управляющие символы, reserved names в разных регистрах и с расширением (только win32 переименовывает), trailing пробелы/точки, '.', '..', '../x', 'C:\x', '/etc/passwd', пустая строка, ведущие точки, кириллица, эмодзи и составные эмодзи, NFD-вход становится NFC.
- Длинные имена: результат не превышает лимит платформы, расширение сохраняется, графемы не разрываются.

**Risks:**
- Применение reserved names и trailing-правил только к win32 следует брифу §20; переносимость файлов между ОС за пределами выбранной платформы не гарантируется.

### 2. Генератор путей для track/album/playlist по predefined templates

- Чистые функции buildTrackLayout, buildAlbumLayout, buildPlaylistLayout принимают абсолютный output root, platform и доменные типы из packages/shared (Track, Album, Playlist); расширение задаётся отдельно для каждого трека (вариант выбирается per-track): для альбома и плейлиста — функция extensionOf(index), возврат undefined означает, что трек не входит в загрузку и пропускается без сдвига нумерации остальных. Фильтрация по доступности остаётся за вызывающим слоем (planner). Функции возвращают относительные сегменты и абсолютные пути без обращения к диску.
- Track: '<root>/Artist - Track.ext'. Album: '<root>/Artist/Album (Year)/NN - Track.ext' + 'cover.jpg'; без года — 'Album'. Playlist: '<root>/Playlist Name/NN - Artist - Track.ext' + 'cover.jpg' + 'Playlist Name.m3u8'. Несколько исполнителей объединяются через ', '.
- Каждая подстановка шаблона (исполнитель, title трека, название альбома, название плейлиста) санитизируется отдельно со своим fallback до сборки сегмента: отсутствующий или пустой список исполнителей, а также имя исполнителя, ставшее пустым, — 'Unknown Artist'; остальные пустые подстановки — 'Unknown' (REQ-023). Затем собранный сегмент проходит sanitizer шага 1.
- NN дополняется нулями до max(2, разрядов числа треков). Album использует trackNumber, при отсутствии — порядковый номер (index+1) в album.tracks; если в альбоме больше одного discNumber — префикс 'D-NN - Track.ext' (REQ-023). Playlist использует PlaylistTrack.position (1-based, как в fixtures packages/testing).
- Соединение — через node:path win32/posix по параметру platform, а не по process.platform.
- Лимит длины пути: win32 259 символов, posix 4095 байт; при превышении усекается stem имени файла трека; если после усечения stem короче 16 символов — ValidationError.
- Output root должен быть абсолютным для выбранной платформы, иначе ValidationError. Containment проверяется посегментно, а не строковым префиксом: rel = path.relative(root, full) не пустой, не абсолютный, и первый сегмент rel (split по sep платформы) не равен '..'; иначе ValidationError (REQ-022, REQ-023 — пути внутри --output).

**Files:**
- packages/core/filesystem/src/layout.ts
- packages/core/filesystem/src/layout.test.ts

**Tests:**
- Fixture-треки: одиночный трек, альбом с годом и без года, многодисковый альбом, playlist с повтором одного трека, смешанные расширения внутри альбома, пропуск трека (extensionOf → undefined) без сдвига нумерации; ожидаемые относительные пути для win32 и posix.
- Пустые подстановки: пустой список исполнителей → 'Unknown Artist', пустой или пробельный title трека → '01 - Unknown.flac', пустое название альбома с годом → 'Unknown (2020)'.
- Имена с traversal и reserved names остаются внутри root; исполнитель или плейлист с ведущими точками ('...And You Will Know Us by the Trail of Dead', '...любимое') даёт успешный путь внутри root.
- Смена output root меняет только корень; относительный root даёт ValidationError; слишком длинный путь усекается или даёт ValidationError.

### 3. Детерминированное разрешение коллизий имён

- Внутри одного каталога layout сравнивать имена по ключу NFC + toLowerCase на всех платформах (переносимо на регистронезависимые ФС). Служебные имена 'cover.jpg' и '<Playlist>.m3u8' резервируются первыми.
- Повторное имя получает суффикс ' (2)', ' (3)', ... перед расширением в порядке входного списка; суффиксированное имя тоже проверяется на коллизию и укладывается в лимит длины. Результат зависит только от входа, ни один трек не получает чужой путь.
- Коллизии с уже существующими файлами на диске не обрабатываются: запись и проверка диска относятся к STEP-015.

**Files:**
- packages/core/filesystem/src/layout.ts
- packages/core/filesystem/src/layout.test.ts

**Tests:**
- Альбом, где у двух треков одного диска совпадает NN (одинаковый trackNumber), а названия различаются только регистром или формой NFC/NFD: точные имена '01 - Intro.flac' и '01 - intro (2).flac'; третий такой трек получает ' (3)'; повторный вызов даёт идентичный результат.
- Для album и playlist все итоговые пути уникальны по ключу NFC + toLowerCase.

### 4. Property-тесты, экспорт и каноническая проверка

- Property-тесты на seeded PRNG внутри теста (без новых зависимостей): несколько тысяч случайных строк из алфавита с '/', '\\', '..', ':', 'C:', ведущими точками, управляющими символами, кириллицей и эмодзи; для каждой платформы проверить, что сегмент не содержит запрещённых символов, не равен '.'/'..', укладывается в лимит, а layout с абсолютным root всегда успешно возвращает путь внутри root (ValidationError не считается допустимым исходом для валидного root и коротких имён).
- Экспортировать публичный API (TargetPlatform, sanitizePathSegment, sanitizeFileName, buildTrackLayout, buildAlbumLayout, buildPlaylistLayout и типы результатов) из src/index.ts, сохранив package marker.
- Выполнить lint/typecheck/test/build/format:check и Harness validator; исправлять только packages/core/filesystem и его тесты.

**Files:**
- packages/core/filesystem/src/property.test.ts
- packages/core/filesystem/src/index.ts
- packages/core/filesystem/src/index.test.ts

**Tests:**
- Property-тесты traversal/containment для win32, darwin, linux с фиксированным seed.

## Evidence


<!-- VERIFICATION-EVIDENCE:START -->
- Verification run: 2026-10-09T20:19:03Z
- Status: PASS
- Automated resumed: false
- Git head: 1d61361b6e06dfef2a617c650353fcdb92a76d10
- Worktree hash: sha256:c3a0de14b592a6ed505457cbb7375877a93becf68b4eb41f49e888e429a6f924
- Verification contract basis: sha256:75b598e33fd70ff9f5316d777967dc0391cde0d8e4a85a0ea979e02b7ae8a559
- Subject git head: 1d61361b6e06dfef2a617c650353fcdb92a76d10
- Subject worktree hash: sha256:02ef58ccbc540c2de8d9ceb50463f111b30f0780406df73e5878f1424a66d890

### Automated verification
- Command: node packages/testing/scripts/run-yarn.mjs run lint
  - Status: PASS
  - Exit code: 0
  - Duration ms: 5422
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: f59ba696a15507a8febe0f9ea94ac75ccc5411952df61ee4cb3c971b47b6bc12
  - stdout bytes: 0
  - stderr bytes: 25
- Command: node packages/testing/scripts/run-yarn.mjs run typecheck
  - Status: PASS
  - Exit code: 0
  - Duration ms: 2268
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: ffbfd8ec2bfcf3e8f0e99a93f081f695da2de832eba56c5ae6943a4052680411
  - stdout bytes: 0
  - stderr bytes: 30
- Command: node packages/testing/scripts/run-yarn.mjs test
  - Status: PASS
  - Exit code: 0
  - Duration ms: 3873
  - stdout sha256: 65fad304efe54c399979511a1a6df9e673141859c6918e383001f483f7c4f8d2
  - stderr sha256: f969fafb7bc32ecc492c8343f56269c9c47161d893e83a0d8b9b27fcf57b9aee
  - stdout bytes: 4126
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
  - Duration ms: 1666
  - stdout sha256: 17aa973d3f004560237d9a95171210b0671deff23d61628eecf7322ff5938f20
  - stderr sha256: 25e162fe1196016bd51a2c9644b6820f880082561abce757f808502fb7895ebb
  - stdout bytes: 66
  - stderr bytes: 33
- Command: python3 .harness/tools/validate.py --mode manual
  - Status: PASS
  - Exit code: 0
  - Duration ms: 2618
  - stdout sha256: 655d6b2812234595003a695bfe9c95dea4b528efda98c057da8eec0dfac4c839
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 308
  - stderr bytes: 0

### Product verification
- none

### Manual verification
- none
<!-- VERIFICATION-EVIDENCE:END -->

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.


## Blocker / Failure reason

—
