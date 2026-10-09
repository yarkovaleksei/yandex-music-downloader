---
schema: 1
id: STEP-007
status: completed
type: implementation
priority: critical
phase: provider
depends_on:
  - STEP-003
requirements:
  - REQ-009
adrs:
  - ADR-002
architecture_refs:
  - "docs/architecture.md#основные-компоненты-границы"
risk_flags:
  - none
plan:
  status: ready
  revision: 1
  context_basis: sha256:12e791715e76cff4a73832f8cbee62623c9a2fe8f94221f15b55d26f4a757b70
  content_hash: sha256:f31d1ec340f19cc30201fff8658ac52222fb103255710c0be3ecd18af946ed95
  reviewed_report: planning/plan-reviews/STEP-007/PLAN-REVIEW-20261009T105347Z.md
  planned_at: 2026-10-09T10:53:47+00:00
  execution_groups:
  context_components:
    - "ADR@ADR-002=sha256:9603d7e711e02ee4bc36d447b5397e944f34d00f15a3d773c4fec36cce4e4d17"
    - "ARCH@docs/architecture.md#основные-компоненты-границы=sha256:fbdabff4c712b9793cdefe9ef7f14d27253ce04e554c0e2e1ab730cb5bfb5a91"
    - "PRN@PRN-001=sha256:3b3801f207fafc3f77272f0e93570258a6d006964839d93a276accd814d548af"
    - "PRN@PRN-002=sha256:f29ee3fbdb9cf65cf9739d0907768bbf192ad88b8e443110d4d82f81c6b79ecb"
    - "PRN@PRN-003=sha256:16516d7d302fecda5f7615f9d55e29e04b588d671f8660640e1f61d1619e4ef8"
    - "REQ@REQ-009=sha256:d757e12491f060a00d6265bb48aa8cc963fe62e1db09680d1724c6b09585e684"
    - "STEP@STEP-003=sha256:d44b1efab2bcb4a844c3ac708626a1569e846fb6034b4aae8b752fa91b7e7405"
    - "STEP@STEP-007=sha256:d9754caebf643de3377e4415ef6dd50a92738bdd6f7d578e8471cde2769aa25c"
---

# STEP-007 — Resolver ссылок Яндекс Музыки

## Goal

Реализовать в provider package разбор и нормализацию ссылок track/album/playlist с доменной ошибкой `UNSUPPORTED_URL`.

## Context

Форматы URL известны из публичных ссылок; resolver — чистая функция без сети.

## Scope

- Парсер URL → `MediaReference` (тип, canonical id).
- Нормализация: fragment, маркетинговые query-параметры, hostname.
- Table-driven unit-тесты, включая негативные.

## Mutation policy

### Allowed

- `packages/providers/yandex-music/**` (url), тесты.

### Conditional

- Нет.

### Forbidden

- Сетевые вызовы, авторизация, получение метаданных.
- Реализация future/unrelated STEP «заодно».

## Out of scope

- Резолв через API, короткие/редирект-ссылки, требующие сети (если потребуются — отдельный STEP).

## Acceptance criteria

- Эквивалентные ссылки дают одинаковый `MediaReference`.
- Неподдерживаемые ссылки дают `UnsupportedUrlError` с кодом `UNSUPPORTED_URL`.
- Тесты не требуют сети.

## Verification

- command: `node packages/testing/scripts/run-yarn.mjs run lint`
- command: `node packages/testing/scripts/run-yarn.mjs run typecheck`
- command: `node packages/testing/scripts/run-yarn.mjs test`
- command: `python3 .harness/tools/validate.py --mode manual`

## Deliverables

- Resolver и тесты.

## Implementation plan

### 1. Чистый resolver и каноническая идентичность ресурсов

- В packages/providers/yandex-music/src/url/resolve-yandex-music-url.ts реализовать resolveYandexMusicUrl(url: string): Promise<MediaReference> — чистую функцию, совместимую по типу с MusicProvider["resolveUrl"]. Использовать только существующие shared MediaReference и UnsupportedUrlError и встроенный URL; не создавать Client, YandexMusicProvider со stub-методами, HTTP, auth, хранилище или новые зависимости (STEP-007 Scope/Forbidden, ADR-002, PRN-001).
- Разбирать абсолютные http/https URL. Allowlist hostname: music.yandex.ru, music.yandex.by, music.yandex.kz, music.yandex.com, music.yandex.uz; hostname сравнивать после штатной нормализации URL. Список подтверждён официальными адресами сервиса https://yandex.ru/legal/music_termsofuse/ru (проверен 2026-10-09); wildcard, чужие домены, непредусмотренные поддомены и схемы не принимать. Userinfo и нестандартный port не относятся к поддерживаемым публичным ссылкам; default port допустим. Окружающие пробелы и один завершающий slash нормализуются.
- Поддержать точные полные пути /track/<trackId> и /album/<albumId>/track/<trackId> → kind=track,id=trackId; /album/<albumId> → kind=album,id=albumId; /users/<owner>/playlists/<kind> → kind=playlist; /playlists/<UUID> → kind=playlist. Идентификаторы track/album/kind — непустые десятичные строки, канонизировать ведущие нули без Number и потери точности; существование ресурса не проверяется.
- Для legacy playlist сохранить оба компонента в provider-owned opaque id users/<encodeURIComponent(decodedOwner)>/playlists/<canonicalKind>: decodedOwner непустой одиночный path segment, декодируется ровно один раз, регистр владельца сохраняется; / внутри owner не допускается. Для UUID playlist id — lowercase UUID формы 8-4-4-4-12 hex без проверки version/variant: опубликованные ссылки Яндекс Музыки не ограничены RFC UUID v4. Эти две формы различимы без изменения shared schema и передаются будущему getPlaylist (STEP-009); не обещать offline сопоставление legacy и UUID одного плейлиста.
- Идентичность брать из полного pathname; fragment и query не входят в MediaReference (включая UTM/from и другие параметры публичной ссылки). Query не может подменить resource kind/id или сделать неподдерживаемый path поддерживаемым; fragment-based iframe, short/redirect URLs, artist/search и лишние path segments отклоняются по STEP-007 Out of scope. Возвращать только {provider:"yandex-music",kind,id}, без исходного URL.
- Источники форматов: track и album/track — https://yandex.ru/support2/guide-alice-answer/ru/muzyka и https://yandex.ru/support2/guide-alice-answer/ru/ustrojjstvo-s-jekranom---skrinshoty; album — https://education.yandex.ru/knowledge/neproshenii-prosvet-kotiki-kompiuternoe-zrenie-i-shad-vipusk-1; UUID — https://music.yandex.ru/playlists/1c2f4e22-b0f3-b81a-b471-36e6c248c859. Установленный @dvxch/yandex-music 0.3.0 src/methods/playlists.ts подтверждает usersPlaylists(kind,userId) и playlist(playlistUuid), но не вызывается resolver. Источники проверены 2026-10-09, не объявляются live API proof.
- Добавить короткие русские комментарии с @link на STEP-007/REQ-009: причина offline parse, сохранение owner+kind и отсутствие raw URL в ошибке. Не расширять shared/MusicProvider/REQ/ADR.

**Files:**
- packages/providers/yandex-music/src/url/resolve-yandex-music-url.ts

**Tests:**
- REQ-009/STEP-007: table-driven fixtures для каждого поддерживаемого пути и нормализации.

**Risks:**
- UUID и legacy ссылки нельзя связать offline: canonical id сохраняет доступную в URL идентичность; metadata/API соответствие принадлежит STEP-009.

### 2. Доменная ошибка и доказательство offline нормализации

- В том же resolver все malformed/unsupported URL и ошибки URL/percent-decoding преобразовать в новый UnsupportedUrlError() без raw URL/cause, логирования и сериализации пользовательских query (REQ-009, PRN-002). Код UNSUPPORTED_URL, retryable=false и безопасное сообщение взять из shared, без изменения общего error contract.
- Добавить packages/providers/yandex-music/src/url/resolve-yandex-music-url.test.ts: таблицы valid/negative и группы equivalent URLs для host case/каждого allowlisted hostname, HTTP/HTTPS, default port, trailing slash, fragment, UTM/from/query и большого десятичного id выше Number.MAX_SAFE_INTEGER. Прямой track и album/track с тем же track id дают один MediaReference.
- Проверить owner+kind identity legacy playlist: одинаковый kind разных владельцев даёт разные id, URL-encoded и literal допустимый owner — одинаковый id, case владельца сохраняется; UUID normalizes hex case и не требует v4. Проверять ровно тот же итоговый MediaReference при повторных вызовах.
- Негативные таблицы: мусор/relative URL, чужой hostname и строка с разрешённым именем только в path/query/userinfo, неподдерживаемая схема/resource type, отсутствующий или недесятичный numeric id, пустой owner/невалидное percent encoding, невалидная UUID shape, extra path segments, short/redirect/iframe ссылки. Проверять instance UnsupportedUrlError, code UNSUPPORTED_URL, retryable=false; synthetic query-canary отсутствует в message/toJSON.
- Для valid и invalid tables подменить global fetch spy, который запрещает вызовы, и проверять ноль обращений. Реализация не импортирует SDK/auth/native/file I/O; тесты автономны и не требуют account, keyring, браузера или provider test suite. Не добавлять security/edge hardening вне этих прямых REQ/STEP/PRN сценариев.

**Files:**
- packages/providers/yandex-music/src/url/resolve-yandex-music-url.ts
- packages/providers/yandex-music/src/url/resolve-yandex-music-url.test.ts

**Tests:**
- Эквивалентность track/album/playlist, неподдерживаемая ссылка → UNSUPPORTED_URL, отсутствие сети и raw input в ошибках.

### 3. Экспорт provider функции и обязательные проверки

- Добавить named export resolveYandexMusicUrl из provider src/index.ts; публичная функция использует только shared types. Type-level assignment через existing MusicProvider["resolveUrl"] в тесте/compile guard доказывает совместимость Promise<MediaReference>; не вводить новый shared port или provider facade, auth export STEP-008 сохранить.
- Обновить Verification с устаревших npm команд на фактический repository-local Yarn runner по package.json. Перед canonical Verification при реализации синхронизировать projections; получить lint/typecheck/offline test/Harness validation PASS.
- Acceptance REQ-009 о CLI download и typed track/album/playlist commands остаётся у STEP-019: текущий resolver возвращает kind для будущего потребителя, не меняет apps/cli. План не требует manual/live/platform проверок, performance benchmarks, новых ADR/OQ, миграций или зависимостей.

**Files:**
- packages/providers/yandex-music/src/index.ts
- packages/providers/yandex-music/src/url/resolve-yandex-music-url.test.ts

**Tests:**
- Typecheck existing MusicProvider resolveUrl signature, lint boundaries и полный offline suite.

## Evidence


<!-- VERIFICATION-EVIDENCE:START -->
- Verification run: 2026-10-09T11:31:11Z
- Status: PASS
- Automated resumed: false
- Git head: 2a19e5a72693ae741adfab8bbd464e120eed7785
- Worktree hash: sha256:66b202de06dd6059b60ea2debb2c97d7bfc723e27e3ed7b27fc78d6840a0e008
- Verification contract basis: sha256:6ec2f3bc85d44774a839d086d89f75716ea49e2d1f3a22130354bbf8ceefd757
- Subject git head: 2a19e5a72693ae741adfab8bbd464e120eed7785
- Subject worktree hash: sha256:543a84445ca346da5f20366bf1535b8984fec27656814c7bfb95e0c202de857d

### Automated verification
- Command: node packages/testing/scripts/run-yarn.mjs run lint
  - Status: PASS
  - Exit code: 0
  - Duration ms: 4321
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: f59ba696a15507a8febe0f9ea94ac75ccc5411952df61ee4cb3c971b47b6bc12
  - stdout bytes: 0
  - stderr bytes: 25
- Command: node packages/testing/scripts/run-yarn.mjs run typecheck
  - Status: PASS
  - Exit code: 0
  - Duration ms: 2217
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: ffbfd8ec2bfcf3e8f0e99a93f081f695da2de832eba56c5ae6943a4052680411
  - stdout bytes: 0
  - stderr bytes: 30
- Command: node packages/testing/scripts/run-yarn.mjs test
  - Status: PASS
  - Exit code: 0
  - Duration ms: 3623
  - stdout sha256: aa1103cf4b4cf748918776184268100a7dd39858dfdffcde78d5c21c95bbdfc0
  - stderr sha256: f969fafb7bc32ecc492c8343f56269c9c47161d893e83a0d8b9b27fcf57b9aee
  - stdout bytes: 3300
  - stderr bytes: 21
- Command: python3 .harness/tools/validate.py --mode manual
  - Status: PASS
  - Exit code: 0
  - Duration ms: 2317
  - stdout sha256: 396c8fc552f5c39b3b2ec0a2334966ff5c863de96432e1d6a2a17caee20a33ee
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 308
  - stderr bytes: 0

### Product verification
- none

### Manual verification
- none
<!-- VERIFICATION-EVIDENCE:END -->

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.

### Наблюдения реализации

- Реализован `resolveYandexMusicUrl` в `packages/providers/yandex-music/src/url/resolve-yandex-music-url.ts`; экспорт добавлен в provider `src/index.ts`. Shared API, auth, storage, CLI и зависимости не менялись.
- Табличные тесты покрывают path/host/query/fragment normalization, legacy owner+kind и UUID идентичность, безопасный `UNSUPPORTED_URL` и отсутствие fetch. Целевой Vitest: 26/26 PASS; точечные ESLint/TypeScript provider compile и `git diff --check` — PASS. Canonical Verification и независимый review выполняются отдельно.


## Blocker / Failure reason

—
