---
schema: 1
id: STEP-004
status: completed
type: implementation
priority: high
phase: foundation
depends_on:
  - STEP-003
requirements:
  - REQ-035
  - REQ-039
  - REQ-036
adrs:
  - ADR-007
architecture_refs:
  - docs/architecture.md#reliability-observability
  - docs/architecture.md#security-boundaries
risk_flags:
  - security-sensitive
plan:
  status: ready
  revision: 1
  context_basis: sha256:20c753d53a8adb02e2e783d3cde5517e715dc43e7195b154b4e364f9531956bb
  content_hash: sha256:712b0cc7a4c91840ab31a2afad30e15a10b2cbd48d4da35a3bf45001ebdf56a7
  reviewed_report: planning/plan-reviews/STEP-004/PLAN-REVIEW-20261008T211805Z.md
  planned_at: 2026-10-08T21:18:05+00:00
  execution_groups:
  context_components:
    - "ADR@ADR-007=sha256:04d6b08c651797508a14cb298d43f539d5364b851981d6d9064800f288b6b42c"
    - "ARCH@docs/architecture.md#reliability-observability=sha256:a9c337102c2ed62fdaca7173e8e2c05ffe6d68a1d99140fe986a552b3cc636d4"
    - "ARCH@docs/architecture.md#security-boundaries=sha256:1fb8b1276fc829d50a70930422b9207f8e907ad24da1447e1d32ddb08a4adcbe"
    - "PRN@PRN-001=sha256:3b3801f207fafc3f77272f0e93570258a6d006964839d93a276accd814d548af"
    - "PRN@PRN-002=sha256:f29ee3fbdb9cf65cf9739d0907768bbf192ad88b8e443110d4d82f81c6b79ecb"
    - "PRN@PRN-003=sha256:16516d7d302fecda5f7615f9d55e29e04b588d671f8660640e1f61d1619e4ef8"
    - "REQ@REQ-035=sha256:b1130cc7a26791488a178048ec4f352de0119a36e185ed1c5eee0761adbdf1fc"
    - "REQ@REQ-036=sha256:adc3026190b4b6714c911cbabcc7284ff56c2b2ed04372dd3ee6104a24945631"
    - "REQ@REQ-039=sha256:0fdeff2aa145fbee383ca4c7900eed5938d4feb9d0d91125c7bd1d6f07d83ca5"
    - "STEP@STEP-003=sha256:d44b1efab2bcb4a844c3ac708626a1569e846fb6034b4aae8b752fa91b7e7405"
    - "STEP@STEP-004=sha256:b426bd71c5e08f5c66b07b5f73c4c94a21abb2a90a1d3eeb24432e0257a95ddd"
---

# STEP-004 — Структурированное логирование и редакция секретов

## Goal

Реализовать единый structured logger с уровнями, контекстом job/correlation и централизованной редакцией секретов, а также типизированные события observability.

## Context

Токены и signed URL не должны попадать в логи (brief §30); логгер нужен provider и core с самого начала, поэтому создаётся до них.

## Scope

- Logger в `packages/logging` с уровнями error..trace и уровнем info по умолчанию.
- Контекст `jobId`, `correlationId`, `trackId`.
- Редакция Authorization, Cookie, token и query-параметров signed URL; регистрация секретных полей.
- Единый версионированный `JobEvent` и `CommandResult`/`CliRecord` (ADR-007) в `packages/shared`: observability-события (job created ... job completed) и события прогресса с `schemaVersion`, монотонным `seq` на job, `jobId`, `trackKey?` (позиция в плане), `trackId?` (атрибут), `durationMs?`; `subscribe` покрывает только job своего экземпляра.

## Mutation policy

### Allowed

- `packages/logging/**`, `packages/shared/**` (типы событий), unit-тесты.

### Conditional

- Расширение boundary rules для `packages/logging` — минимально необходимое.

### Forbidden

- Подключение логгера к provider/core (делают соответствующие STEP), запись логов в файлы.
- Реализация future/unrelated STEP «заодно».

## Out of scope

- Ротация/транспорт логов, UI отображения логов.

## Acceptance criteria

- Тест с известным токеном и signed URL подтверждает их отсутствие в выводе логгера и сериализованных ошибках.
- Уровень по умолчанию — info; debug/trace включаются конфигурацией.
- Записи в контексте job содержат `jobId`; события observability имеют `durationMs`.
- Добавление нового секретного поля требует регистрации (тест).

## Verification

- command: `node packages/testing/scripts/run-yarn.mjs run lint`
- command: `node packages/testing/scripts/run-yarn.mjs run typecheck`
- command: `node packages/testing/scripts/run-yarn.mjs test`
- command: `python3 .harness/tools/validate.py --mode manual`

## Deliverables

- Logger, redaction, типы событий, тесты.

## Implementation plan

### 1. Добавить общий версионированный контракт событий и результатов

- Создать shared/src/events.ts и экспортировать через index.ts, сохраняя готовые marker/domain/errors/provider exports. JsonValue/JsonObject — рекурсивные readonly JSON-типы без Node/provider; schemaVersion: 1 в каждом DTO.
- JobEvent — union по event: job.created, entity.resolved, plan.created, track.started, variant.selected, download.started, download.completed, metadata.written, validation.completed, job.completed. Общие schemaVersion/event/seq/jobId/trackKey?/trackId?/payload?:JsonObject; durationMs обязателен для observability. Track-варианты track.started/variant.selected/download.started/download.completed/metadata.written/validation.completed требуют trackKey:string.
- Добавить job.progress/track.progress с тем же envelope; track.progress требует trackKey, durationMs optional для progress. Не добавлять publisher/queue/subscribe. Русскими комментариями по ADR-007/REQ-036 закрепить ownership монотонного seq на job у будущего producer и позиционный смысл trackKey; типы не доказывают runtime порядок/isolation.
- CommandErrorDto поверх существующего DomainErrorJson с optional details?:JsonValue. CommandResult — {schemaVersion:1,kind:'result',command:string,data:JsonValue} либо {schemaVersion:1,kind:'error',command:string,error:CommandErrorDto}, исключая смешение data/error. CliRecord=JobEvent|CommandResult.

**Files:**
- packages/shared/src/events.ts
- packages/shared/src/index.ts
- packages/shared/src/events.test.ts

**Tests:**
- Публичные exports, JSON roundtrip JobEvent и обоих CommandResult; type assertions отклоняют другую версию, отсутствующие durationMs/trackKey и смешанный результат. Готовые shared/error tests сохраняются.

### 2. Реализовать централизованную редакцию и безопасные сериализаторы

- logging-local createRedactor(options?) возвращает Redactor с registerField(name), registerSecret(value), redact(value):JsonValue; registry scoped instance, secretFields/secretValues доступны конфигурацией.
- Редактировать без учёта регистра Authorization/Cookie/token/accessToken/access_token/credentials/password/clientSecret/client_secret и именованные stream/decryption key fields. Дополнительные имена/известные значения регистрировать явно; значения очищать и внутри строк.
- Одна очистка применяется к message/context/nested JSON/arrays. В HTTP(S) URL внутри значений и строк удалять query и credentials, сохраняя безопасную часть. Не обещать обнаружение произвольного неизвестного незарегистрированного секрета.
- serializeError(error,redactor?) переиспользует normalizeDomainError/toJSON и возвращает очищенный CommandErrorDto, исключая raw cause/stack/message неизвестной ошибки. shared/errors.ts не менять. serializeCliRecord(record,redactor?):string очищает перед JSON; reusable logging serializer без CLI/provider/core/application integration.

**Files:**
- packages/logging/src/redactor.ts
- packages/logging/src/serializers.ts
- packages/logging/src/index.ts
- packages/logging/src/redactor.test.ts
- packages/logging/src/serializers.test.ts

**Tests:**
- Известный токен/signed URL отсутствуют в итоговом JSON строк/вложенных полей; стандартные поля и зарегистрированное дополнительное поле очищаются. Errors сохраняют code/retryable без secret/cause/stack; JobEvent/CommandResult используют тот же sanitizer.

### 3. Добавить JSON logger с уровнями и контекстом задания

- LogLevel=error|warn|info|debug|trace; LogContext jobId?/correlationId?/trackId?; LoggerOptions level?/context?/sink?/clock?/redactor?. createLogger возвращает пять методов (message,data?) и child(context).
- Одна JSON-строка level/time ISO/message/context/optional nested data. Default info пропускает error/warn/info; debug/trace только конфигурацией. child наследует settings/context без изменения родителя, bound контекст в каждой записи, data остаются вложенными.
- Перед sink очистить всю запись тем же Redactor, Error сериализовать безопасным serializer. Sink получает готовую строку, default stderr отделяет логи от будущего stdout CliRecord по ADR-007.
- Сохранить loggingPackage/smoke test, использовать существующую logging→shared dependency. Русские краткие комментарии с @link на ADR/REQ/STEP у границ; без обратных imports, provider/core integration и file transport/rotation.

**Files:**
- packages/logging/src/logger.ts
- packages/logging/src/index.ts
- packages/logging/src/logger.test.ts

**Tests:**
- JSON level/time/message, info default/debug/trace configuration; child context и parent immutability; итоговый sink очищен, default stderr, marker сохранён.

### 4. Доказать acceptance и critical proof obligations

- Минимальные unit-tests итоговых записей/errors/CliRecord с известным token/signed URL и явной field registration доказывают H-001 и STEP-004/REQ-039.
- Публичные imports, DTO roundtrip/type assertions и готовые marker/error tests закрывают H-002; typecheck доказывает type contract, lint проверяет package boundaries.
- Выполнить Verification через pinned Yarn wrapper, sync projections до validate. Не добавлять runtime seq/subscribe/playlist download и future manifest/cache/SQLite checks. Фиксировать реальные outputs без runtime completion claims от типов; независимый implementation review принадлежит dispatcher.

**Files:**
- packages/logging/src/logger.test.ts
- packages/logging/src/redactor.test.ts
- packages/logging/src/serializers.test.ts
- packages/shared/src/events.test.ts

**Tests:**
- node packages/testing/scripts/run-yarn.mjs test
- node packages/testing/scripts/run-yarn.mjs run typecheck
- node packages/testing/scripts/run-yarn.mjs run lint
- python3 .harness/tools/validate.py --mode manual

## Evidence




<!-- VERIFICATION-EVIDENCE:START -->
- Verification run: 2026-10-08T21:35:32Z
- Status: PASS
- Automated resumed: false
- Git head: 2a19e5a72693ae741adfab8bbd464e120eed7785
- Worktree hash: sha256:95e25eb3a5a452f5b77b4417ec56e21287fc6b3a0717125517120e2aada954d5
- Verification contract basis: sha256:6ec2f3bc85d44774a839d086d89f75716ea49e2d1f3a22130354bbf8ceefd757
- Subject git head: 2a19e5a72693ae741adfab8bbd464e120eed7785
- Subject worktree hash: sha256:da5807d843fc56cd07edd5ea6c5c68a99678fb25719c771ad3a921c516a56959

### Automated verification
- Command: node packages/testing/scripts/run-yarn.mjs run lint
  - Status: PASS
  - Exit code: 0
  - Duration ms: 3869
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: f59ba696a15507a8febe0f9ea94ac75ccc5411952df61ee4cb3c971b47b6bc12
  - stdout bytes: 0
  - stderr bytes: 25
- Command: node packages/testing/scripts/run-yarn.mjs run typecheck
  - Status: PASS
  - Exit code: 0
  - Duration ms: 1415
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: ffbfd8ec2bfcf3e8f0e99a93f081f695da2de832eba56c5ae6943a4052680411
  - stdout bytes: 0
  - stderr bytes: 30
- Command: node packages/testing/scripts/run-yarn.mjs test
  - Status: PASS
  - Exit code: 0
  - Duration ms: 2994
  - stdout sha256: 6af750858ffe099256d6df77aaffe9aea911ea0b9a7badee87f095b8a926f8f8
  - stderr sha256: f969fafb7bc32ecc492c8343f56269c9c47161d893e83a0d8b9b27fcf57b9aee
  - stdout bytes: 2604
  - stderr bytes: 21
- Command: python3 .harness/tools/validate.py --mode manual
  - Status: PASS
  - Exit code: 0
  - Duration ms: 2216
  - stdout sha256: 947a581a87099520a0850ffe4afb190954517ba0185c57444296800119ba062c
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 366
  - stderr bytes: 0

### Product verification
- none

### Manual verification
- none
<!-- VERIFICATION-EVIDENCE:END -->

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.




## Blocker / Failure reason

—
