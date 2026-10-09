---
schema: 1
id: STEP-006
status: completed
type: adr
priority: critical
phase: provider-spike
depends_on:
  - STEP-005
  - STEP-003
requirements:
  - REQ-002
  - REQ-007
adrs:
  - ADR-009
  - ADR-010
architecture_refs:
  - docs/architecture.md#external-dependencies-integrations
  - docs/architecture.md#security-boundaries
risk_flags:
  - architecture
  - security-sensitive
  - external-integration
plan:
  status: ready
  revision: 1
  context_basis: sha256:08e1379d44eedd0d6102ac55e692d79374596df9abe7d0ea8093ac80b182e94c
  content_hash: sha256:d8fed70d29d02879b9689d7b97589eb86d5bec4a351d1f57de0ad64c9aaed121
  reviewed_report: planning/plan-reviews/STEP-006/PLAN-REVIEW-20261008T202831Z.md
  planned_at: 2026-10-08T20:28:31+00:00
  execution_groups:
  context_components:
    - "ARCH@docs/architecture.md#external-dependencies-integrations=sha256:2a9340a0bf7a9df206adcb8bd32b0930f87ff85506f9244c1ca48bb6d3ef0604"
    - "ARCH@docs/architecture.md#security-boundaries=sha256:b9616e55167eb22bbc26bed02091ac38f0def02160abf9f6a7edab60c4d960ad"
    - "OQ@OQ-001=sha256:33eb64aca6df2153cd4ac1f9771be4a4b8809b420acece16151d52a922c7c399"
    - "PRN@PRN-001=sha256:3b3801f207fafc3f77272f0e93570258a6d006964839d93a276accd814d548af"
    - "PRN@PRN-002=sha256:f29ee3fbdb9cf65cf9739d0907768bbf192ad88b8e443110d4d82f81c6b79ecb"
    - "PRN@PRN-003=sha256:16516d7d302fecda5f7615f9d55e29e04b588d671f8660640e1f61d1619e4ef8"
    - "REQ@REQ-002=sha256:57b2efdb8feefc31d5701a6d4be255b8905908c1704d2b7f171a1022fe6e0629"
    - "REQ@REQ-007=sha256:6ecccc57a941d7a16855333f973f4fc2e9d3184e121a3f643f96d78d22ccaa74"
    - "STEP@STEP-003=sha256:d44b1efab2bcb4a844c3ac708626a1569e846fb6034b4aae8b752fa91b7e7405"
    - "STEP@STEP-005=sha256:cb280369edd87e0a4560c9e2d78ddba902bebde1a9c1d20699cf193946b6838c"
    - "STEP@STEP-006=sha256:89b6834e1cc2487cfb9f33642c09bf480b2450b17b6cf9c98ca6b8b1076cef8c"
---

# STEP-006 — ADR: стратегия адаптера, авторизация и хранение токена

## Goal

Принять устойчивые решения по стратегии Yandex adapter (использование `@dvxch/yandex-music`, стратегия runtime-валидации и обнаружения schema drift) и по авторизации/хранению токена CLI.

## Context

ADR-002 фиксирует общий контракт; детали адаптера и flow зависят от evidence STEP-005. OQ-007 (определение schema drift) закрывается этим STEP.

## Scope

- Создать ADR «Yandex Music API adapter strategy» (библиотека, обёртка, runtime-схемы, drift detection, PROVIDER_SCHEMA_VERSION).
- Создать ADR «Authentication and secure token storage» для CLI (flow, механизм хранения, права, logout, порт взаимодействия при авторизации и `CredentialStore`); допустимо уточнить auth-часть контракта MusicProvider (ADR-002 п.1); токен не проходит через application API; ADR явно решает, допустимо ли однократное обновление токена с повтором запроса внутри provider (исключение из запрета скрытых повторов ADR-002 п.6) либо refresh выносится в core.
- Перевести OQ-007 в `resolved` либо `deferred` с обоснованием.
- Привязать ADR к REQ/STEP (двусторонняя traceability) и обновить architecture baseline.

## Mutation policy

### Allowed

- `docs/adr/**`, `docs/architecture.md`, `docs/open-questions/**`, связанные REQ/STEP (только traceability).

### Conditional

- Supersede ADR-002 — только если evidence доказывает неверность контракта.

### Forbidden

- Production-код, изменение Accepted ADR задним числом.
- Реализация future/unrelated STEP «заодно».

## Out of scope

- Реализация adapter и хранилища токена.

## Acceptance criteria

- Созданы ADR со статусом `accepted`, ссылающиеся на evidence из `docs/research/yandex-api-spike.md`.
- OQ-007 разрешён либо отложен с обоснованием, а решения о токене согласованы с REQ auth-token-storage.
- Двусторонняя traceability ADR↔STEP и REQ↔ADR актуальна; `validate.py` проходит.

## Verification

- command: `python3 .harness/tools/validate.py --mode manual`
- manual: Независимый ADR reviewer сопоставляет стратегию adapter с исходными ответами/library models и REQ-007/ADR-002: критичные поля проверяются до потери при преобразовании, drift отделён от network/auth/CDN отказа, preview неизвестен не становится полным вариантом, PROVIDER_SCHEMA_VERSION имеет определённое правило изменения; runtime-поддержка непроверенных сценариев не утверждается.
- manual: Независимый ADR reviewer проверяет CLI auth/storage по REQ-002, PRN-001/002/003 и STEP-008: ownership/injection укладываются в ADR-001, секреты остаются внутри provider и доверенного store, plaintext fallback отсутствует, POSIX 0600/Windows current-user доступ/logout/doctor определены; истёкший токен даёт AUTH_ERROR без автоматического replay, shared-изменения и реализация переданы допустимым owning STEP.
- manual: Проверить итоговые ADR/traceability/architecture/OQ и diff: оба новых ADR accepted и ссылаются на точные evidence STEP-005; ADR↔STEP и REQ↔ADR двусторонние; OQ-007 resolved либо justified deferred без ослабления REQ-007; обновлённый architecture baseline согласован с Accepted ADR. Production/зависимости не изменены этим STEP, существующая dirty worktree сохранена, связанные STEP/REQ изменены только по traceability, OQ-010/011 не закрыты без владельцев. В Evidence записан фактический результат независимого ADR review, а runtime proof будущих STEP не заявлен.

## Deliverables

- ADR adapter strategy, ADR auth/token storage, обновлённая architecture.

## Implementation plan

### 1. Собрать основания и границы двух ADR

- Перед RUN сверить реестр docs/adr и назначить два свободных ADR-ID: стратегия Yandex adapter и CLI auth/защищённое хранение. Использовать действующий шаблон; принятые ADR-001/002/008 не переписывать. Текущий PLAN создаёт только план, не принимает эти решения.
- Составить компактную таблицу «решение → REQ/ADR → evidence → ограничение → владелец реализации»: REQ-002, REQ-007, ADR-001/002 и отчёт STEP-005. Device Authorization подтверждён; refresh на авторизованном Client вернул 401 с неизвестной причиной; modern encraw/preview/bytes не подтверждены; отказ старой CDN URL наблюдался между пробами 30/60 минут, универсальный TTL не установлен; предел rate limits не измерен.
- Зафиксировать документируемую поверхность: wrapper/runtime validation/schema drift/PROVIDER_SCHEMA_VERSION и CLI auth interaction/CredentialStore. Реализация — STEP-008/009 и остальные существующие владельцы ADR-002; desktop OQ-010 и выбор high/normal OQ-011 остаются за своими владельцами.
- Новые hypotheses допускают только проверку оснований и документируемое ограничение. Если конкретное решение требует нового runtime evidence, которого нет, не объявлять его поддержанной возможностью: выбрать доказуемую совместимую ветку либо остановить принятие соответствующего ADR с конкретным недостающим доказательством. PLAN не запускает новые live-пробы или платформенные тесты.

**Files:**
- docs/adr/**
- docs/research/yandex-api-spike.md
- planning/tasks/STEP-006.md

**Tests:**
- manual: проверить связь каждого проектируемого решения с существующим контрактом и ограничениями evidence.

### 2. Выбрать и оформить стратегию adapter/runtime-схем

- Сравнить тонкую обёртку над pinned @dvxch/yandex-music с альтернативой собственного HTTP-клиента на уровне замены нестабильной интеграции. При RUN сверить первичные источники кандидатов; выбрать конкретную стратегию и способ runtime-схем в новом ADR с причинами и последствиями. Library dependency и Yandex-код остаются только в provider; наружу — shared-контракты. Production dependencies/код в STEP-006 не менять.
- Определить границу проверки исходного ответа до библиотечных преобразований и проверки доменного результата после них. Библиотечные классы/unknown-field hooks не считать сами по себе достаточной runtime-валидацией: наблюдаемая потеря preview должна быть учтена. Составить таблицу критичных ответов/полей и правил optional/additive fields, отсутствующих/неверно типизированных обязательных полей, некорректных значений и неподтверждённых вариантов.
- Определить признаки schema drift и классификацию NETWORK_ERROR, AUTH_ERROR, SERVICE_UNAVAILABLE, PROVIDER_RESPONSE_INVALID, API_CHANGED по REQ-007; закрепить требуемое пользовательское сообщение без stack trace и секретов. Учесть STREAM_EXPIRED из ADR-002: старую CDN-ссылку/401 нельзя без контекста отправлять в общий normalizeDomainError как auth отказ; одного HTTP-кода недостаточно для вывода о причине.
- Выбрать формат и правила изменения PROVIDER_SCHEMA_VERSION, место экспорта и связь с doctor/совместимостью. Описать последствия обновления библиотеки/схем, сохранение non-auth MusicProvider/variantKey, отсутствие секретов в доменной модели; не смешивать версию npm-package с версией compatibility contract.
- Сохранить подтверждённые ограничения preview/encraw/Range/TTL и отсутствие гарантий от подписки/запроса lossless. Не закладывать числовой постоянный TTL или безопасный rate limit из малой выборки. Общие скрытые retries/гонки/обходы не разрешать: бюджет core и ограничения PRN остаются действующими.

**Files:**
- docs/adr/**
- docs/open-questions/OQ-007-schema-drift.md
- docs/architecture.md

**Tests:**
- Независимый ADR reviewer сопоставляет стратегию adapter с исходными ответами/library models и REQ-007/ADR-002: критичные поля проверяются до потери при преобразовании, drift отделён от network/auth/CDN отказа, preview неизвестен не становится полным вариантом, PROVIDER_SCHEMA_VERSION имеет определённое правило изменения; runtime-поддержка непроверенных сценариев не утверждается.

**Risks:**
- H-001 остаётся planned до независимой проверки самого authored ADR; document-level PASS не является runtime proof будущего adapter.

### 3. Выбрать и оформить CLI auth и защищённое хранение

- На основании live Device Authorization спроектировать последовательность начала auth, приватного пользовательского подтверждения, отмены/timeout, получения аккаунта и обработки истёкшего/невалидного токена. Пароль Яндекса не запрашивать. Явно разделить краткоживущий UI user code, provider-private Device/access/refresh token и публичные безопасные результаты; challenge не попадает в обычные logs/events/сохранённые DTO.
- Сравнить механизмы CLI credential storage по первичной документации поддерживаемых Windows/macOS/Linux и выбрать конкретный backend в ADR. Описать защиту данных/ключей, доступность в интерактивном и неинтерактивном CLI, поведение при недоступном/заблокированном/повреждённом store, отсутствие plaintext fallback. Для файлового варианта определить защиту содержимого и ключа, POSIX 0600/Windows доступ только текущего пользователя; одни permissions не заменяют PRN-002.
- Назвать пакет реализации CredentialStore, кто создаёт реализацию и как composition root передаёт её provider по ADR-001 без прямого импорта provider/persistence в CLI и без импорта конкретного store в shared. Определить минимальный приватный формат access/refresh credentials и его версионирование/обновление/удаление; приложение не принимает и не возвращает credentials через публичный application API.
- Сопоставить решение с фактическими CredentialStore.read/write(string)/clear, AuthInteraction.notify и authenticate():Promise<Account>. Выбрать минимальное совместимое auth уточнение; для каждого предполагаемого изменения shared назвать допустимый owning STEP. STEP-008 разрешает только минимальное дополнение store-интерфейса: расширение других shared-портов или Scope не маскировать traceability-правкой. Если без него выбранная альтернатива не исполнима, её принятие блокируется до отдельного canonical изменения контракта.
- Явно решить refresh ownership/replay с учётом ADR-002 п.6 и STEP-008: действующий expired-token contract требует AUTH_ERROR без retry, поэтому согласованное решение сохраняет отсутствие автоматического refresh/replay после auth отказа и предусматривает явную повторную авторизацию. Не обещать рабочий refresh из наличия refreshToken; наблюдаемый 401 не доказывает глобальную неподдерживаемость. Иная политика требует отдельно разрешённого semantic изменения STEP-008 вне этого scope.
- Определить logout (clear store и удаление in-memory credentials), getAccount после удаления, диагностику прав/недоступности store через doctor и безопасную классификацию ошибок. Desktop backend/IPC/Electron и OQ-010 не выбирать. Совместимость с ADR-002 уточняется новым ADR в разрешённой auth-части; supersede только если конкретное evidence доказывает неверность действующего контракта, не из-за удобства реализации.

**Files:**
- docs/adr/**
- docs/architecture.md

**Tests:**
- Независимый ADR reviewer проверяет CLI auth/storage по REQ-002, PRN-001/002/003 и STEP-008: ownership/injection укладываются в ADR-001, секреты остаются внутри provider и доверенного store, plaintext fallback отсутствует, POSIX 0600/Windows current-user доступ/logout/doctor определены; истёкший токен даёт AUTH_ERROR без автоматического replay, shared-изменения и реализация переданы допустимым owning STEP.

**Risks:**
- H-002 остаётся planned до независимой проверки authored ADR. CLI store/platform support здесь проектируются, а не выдаются за проверенные runtime-возможности.

### 4. Проверить два ADR до принятия и синхронизировать контракты

- Выполнить независимый read-only review двух подготовленных ADR против evidence STEP-005, REQ-002/007, ADR-001/002/008, PRN и фактических shared-портов. Reviewer должен проверить оба planned obligations H-001/H-002; устранить только material противоречия. Если выбранное решение зависит от незафиксированного продуктового выбора владельца, получить точный ответ и сохранить его в canonical ADR/OQ до accepted.
- После подтверждения решений записать два ADR со статусом accepted, evidence links, alternatives/consequences, владельцами и путём реализации; не маркировать будущие runtime checks выполненными. Принятие решений происходит в RUN, planning-review PASS подтверждает лишь пригодность этого плана.
- Обновить OQ-007 Resolution из выбранной стратегии, статус resolved либо deferred с точной причиной, последствиями и условием повторной проверки; не ослаблять обязательную runtime-валидацию REQ-007. Прочие OQ изменять только если это непосредственно следует из принятых решений, не закрывать desktop/качество за владельца.
- Связать новые ADR↔STEP и REQ↔ADR, связанные STEP-008/009/другие владельцы — только traceability; записать ADR-refs STEP-006 и обновить релевантные architecture sections. Смысл REQ, Scope/Acceptance чужих STEP и Accepted ADR не менять. Если такой semantic transfer необходим, остановить эту ветку и вынести canonical prerequisite вместо скрытого расширения scope.
- Перед validation/evidence выполнить sync-projections.py; deterministic projections README/SPEC/STATUS/roadmap/OQ index руками не править. Порядок выбран последовательный из-за общих ADR refs и architecture baseline, параллельные write-agents не нужны.

**Files:**
- docs/adr/**
- docs/architecture.md
- docs/open-questions/OQ-007-schema-drift.md
- docs/requirements/REQ-002-auth-token-storage.md
- docs/requirements/REQ-007-provider-schema.md
- planning/tasks/STEP-006.md
- planning/tasks/STEP-008.md
- planning/tasks/STEP-009.md

**Tests:**
- python3 .harness/tools/validate.py --mode manual
- Независимый ADR reviewer сопоставляет стратегию adapter с исходными ответами/library models и REQ-007/ADR-002: критичные поля проверяются до потери при преобразовании, drift отделён от network/auth/CDN отказа, preview неизвестен не становится полным вариантом, PROVIDER_SCHEMA_VERSION имеет определённое правило изменения; runtime-поддержка непроверенных сценариев не утверждается.
- Независимый ADR reviewer проверяет CLI auth/storage по REQ-002, PRN-001/002/003 и STEP-008: ownership/injection укладываются в ADR-001, секреты остаются внутри provider и доверенного store, plaintext fallback отсутствует, POSIX 0600/Windows current-user доступ/logout/doctor определены; истёкший токен даёт AUTH_ERROR без автоматического replay, shared-изменения и реализация переданы допустимым owning STEP.

### 5. Записать проверяемое evidence завершения ADR STEP

- Проверить, что оба ADR accepted и ссылаются на нужные разделы отчёта; OQ-007 имеет Resolution/обоснованный deferred, traceability двусторонняя и architecture не противоречит принятым решениям. Список неподтверждённых runtime сценариев остаётся явным, новые решения не переписывают историю STEP-005.
- Записать реальный результат независимого ADR review с конкретными reviewed paths, командами/exit code и observed facts. Если текстовый output не сохранён дословно, пометить summary. Проверить итоговый diff по базовой dirty worktree: существующие изменения STEP-005 и .codex/config сохраняются, новая mutation только документальная поверхность STEP-006 и traceability/projections.
- Запустить каноническую Verification с точными manual observations обоих независимых ADR checks и traceability/scope check; завершать STEP только с реальными документальными Acceptance/type-specific proof. Не запускать сборку/платформенные/live tests только ради documentation STEP, не реализовывать provider/store и не делать git commit.

**Files:**
- planning/tasks/STEP-006.md
- docs/adr/**
- docs/architecture.md
- docs/open-questions/OQ-007-schema-drift.md

**Tests:**
- python3 .harness/tools/validate.py --mode manual

## Evidence


### Принятые решения и независимый ADR review

Приняты [ADR-009](../../docs/adr/ADR-009-yandex-adapter-strategy.md) и [ADR-010](../../docs/adr/ADR-010-cli-auth-and-secure-storage.md). Оба ссылаются на конкретные разделы evidence STEP-005 и первичные источники; старые Accepted ADR не переписаны. OQ-007 resolved, architecture baseline и двусторонние ADR↔STEP/REQ↔ADR ссылки обновлены. Реализация wrapper/Zod/native store/CLI и runtime-проверки остаются owning STEP.

Независимый read-only reviewer `/root/adr_review` (роль reviewer, не автор ADR) вернул **PASS** для текущих решений по H-001/H-002; ниже summary фактических observed facts, не дословный terminal output.

- **H-001:** по опубликованным исходникам установленной библиотеки 0.3.0 подтверждены fetch injection и retries=0, а также потеря preview в LosslessDownloadInfo. ADR-009 требует raw проверку до моделей, post-mapping схемы и исключение неизвестного preview; различает network/auth/service/CDN/drift; задаёт SemVer PROVIDER_SCHEMA_VERSION, безопасное сообщение и владельцев STEP-008/009/010/025. Непроверенные encraw/Range/TTL/rate limits не объявлены поддержанными.
- **H-002:** ownership persistence→shared и injection application→provider согласованы с ADR-001/STEP-008; текущих shared-портов достаточно. Provider/store сохраняют секреты внутри доверенной границы; приватный browser challenge не проходит публичный API/notify/logs. Plaintext/keyutils fallback запрещён. Reviewer подтвердил по binding 2.1/native store 1.0.0 Windows default Enterprise: первоначальная ошибочная гарантия LocalMachine-only устранена до принятия; возможный OS profile roaming указан явно и не является собственной синхронизацией приложения. Linux требует защиты именно используемой default GNOME collection, не просто наличия Secret Service. Собственного token-файла нет, файловые 0600/ACL checks не заявлены PASS. Logout/ошибка удаления/doctor/expired-token AUTH_ERROR без refresh/replay определены. Это document-level PASS, не platform/runtime proof.

Финальная проверка scope: сохранены хеши 652 исходных файлов в локальном временном baseline. Изменения только в документальной поверхности STEP-006/projections; 8 связанных STEP/REQ отличаются от исходного HEAD только ADR refs. Исходные STEP-005/research, provider package dependency/yarn.lock и .codex/config.toml не изменены этим RUN, исходных файлов не удалено. OQ-010/011 сохранены без закрытия. `git diff --check` — exit 0. Production/build/live/platform tests для ADR STEP не запускались. Generated Verification ниже принадлежит deterministic runner.

<!-- VERIFICATION-EVIDENCE:START -->
- Verification run: 2026-10-08T20:42:02Z
- Status: PASS
- Automated resumed: false
- Git head: 2a19e5a72693ae741adfab8bbd464e120eed7785
- Worktree hash: sha256:dfe4d2abb4dcdd4ba4a16c17b23f3b3d575f4238e8f3c71f31cdfc979dbd9f96
- Verification contract basis: sha256:1488ee543166d2635806cdc6cbdc534f4a3b5d4fcfc06fcabac5f57352802867
- Subject git head: 2a19e5a72693ae741adfab8bbd464e120eed7785
- Subject worktree hash: sha256:bdd34b718983757b552dd30df8c7d66e8fbacf2a25c10b828601d946870f631c

### Automated verification
- Command: python3 .harness/tools/validate.py --mode manual
  - Status: PASS
  - Exit code: 0
  - Duration ms: 2318
  - stdout sha256: 396c8fc552f5c39b3b2ec0a2334966ff5c863de96432e1d6a2a17caee20a33ee
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 308
  - stderr bytes: 0

### Product verification
- none

### Manual verification
- Check: Независимый ADR reviewer сопоставляет стратегию adapter с исходными ответами/library models и REQ-007/ADR-002: критичные поля проверяются до потери при преобразовании, drift отделён от network/auth/CDN отказа, preview неизвестен не становится полным вариантом, PROVIDER_SCHEMA_VERSION имеет определённое правило изменения; runtime-поддержка непроверенных сценариев не утверждается.
  - Status: PASS
  - Observed: "Независимый read-only reviewer /root/adr_review вернул PASS H-001: по исходникам @dvxch/yandex-music 0.3.0 подтверждены fetch injection/retries=0/потеря preview; ADR-009 проверяет raw до моделей и доменную проекцию, исключает неизвестный preview, различает network/auth/service/CDN/drift и задаёт SemVer PROVIDER_SCHEMA_VERSION. Runtime encraw/Range/TTL/rate-limit support не утверждён. Summary проверки сохранён в Evidence STEP-006."
- Check: Независимый ADR reviewer проверяет CLI auth/storage по REQ-002, PRN-001/002/003 и STEP-008: ownership/injection укладываются в ADR-001, секреты остаются внутри provider и доверенного store, plaintext fallback отсутствует, POSIX 0600/Windows current-user доступ/logout/doctor определены; истёкший токен даёт AUTH_ERROR без автоматического replay, shared-изменения и реализация переданы допустимым owning STEP.
  - Status: PASS
  - Observed: "Независимый reviewer /root/adr_review вернул PASS H-002: ADR-010 совместим с текущими shared-портами и Scope STEP-008; persistence store создаёт application и передаёт provider, CLI не импортирует его. Секреты/challenge приватны, plaintext/keyutils fallback запрещён. Windows current-user default Enterprise/potential OS roaming указан по primary source; Linux требует защищённую используемую default GNOME collection. File 0600/ACL условны, собственного token-файла нет; logout/отказ удаления/doctor и AUTH_ERROR без refresh/replay определены. Platform proof оставлен owning STEP."
- Check: Проверить итоговые ADR/traceability/architecture/OQ и diff: оба новых ADR accepted и ссылаются на точные evidence STEP-005; ADR↔STEP и REQ↔ADR двусторонние; OQ-007 resolved либо justified deferred без ослабления REQ-007; обновлённый architecture baseline согласован с Accepted ADR. Production/зависимости не изменены этим STEP, существующая dirty worktree сохранена, связанные STEP/REQ изменены только по traceability, OQ-010/011 не закрыты без владельцев. В Evidence записан фактический результат независимого ADR review, а runtime proof будущих STEP не заявлен.
  - Status: PASS
  - Observed: "ADR-009/010 accepted, evidence STEP-005 и primary links проверены; двусторонние ADR↔STEP/REQ↔ADR refs актуальны, OQ-007 resolved, architecture согласован с решениями. По исходному hash baseline 652 файла production/dependency/yarn/research/STEP-005/.codex сохранены, ничего исходного не удалено; 8 связанных STEP/REQ изменены только ADR refs, OQ-010/011 не закрыты. Independent review PASS H-001/H-002 сохранён как summary в Evidence; runtime proof будущих STEP не заявлен. git diff --check exit0."
<!-- VERIFICATION-EVIDENCE:END -->

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.


## Blocker / Failure reason

—
