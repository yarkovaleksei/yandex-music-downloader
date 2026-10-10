---
schema: 1
id: STEP-016
status: completed
type: implementation
priority: critical
phase: core
depends_on:
  - STEP-014
  - STEP-013
  - STEP-015
  - STEP-005
requirements:
  - REQ-020
  - REQ-021
  - REQ-032
  - REQ-011
adrs:
  - ADR-004
  - ADR-006
architecture_refs:
  - docs/architecture.md#data-state-model
  - docs/architecture.md#reliability-observability
risk_flags:
  - data-migration
  - concurrency
plan:
  status: ready
  revision: 1
  context_basis: sha256:cadc055cd422c858da43e610481e97e37f35fa987a9459d79778c35b25d12160
  content_hash: sha256:f761670365237466976e6f41bfa2d7680b40171d8590164852210abeb1ce2c84
  reviewed_report: planning/plan-reviews/STEP-016/PLAN-REVIEW-20261010T091002Z.md
  planned_at: 2026-10-10T09:10:02+00:00
  execution_groups:
  context_components:
    - "ADR@ADR-004=sha256:4ad987cbdefdf1409c52fd01994ccca0d6941fad8ae0126d435745f3e727ca08"
    - "ADR@ADR-006=sha256:792115c4604a81dfd2d62950958470e1c1f1bad2b2f18e873d5743b9f9dc443d"
    - "ARCH@docs/architecture.md#data-state-model=sha256:a16465c45f16a8f41fd3e876e764be3e05d852017bd62457799b7dba138bf6c6"
    - "ARCH@docs/architecture.md#reliability-observability=sha256:a9c337102c2ed62fdaca7173e8e2c05ffe6d68a1d99140fe986a552b3cc636d4"
    - "OQ@OQ-006=sha256:05f6caed651f45072270a573d1db0166d0fc9bd7c8dadc2846516acc7d051f38"
    - "PRN@PRN-001=sha256:3b3801f207fafc3f77272f0e93570258a6d006964839d93a276accd814d548af"
    - "PRN@PRN-002=sha256:f29ee3fbdb9cf65cf9739d0907768bbf192ad88b8e443110d4d82f81c6b79ecb"
    - "PRN@PRN-003=sha256:16516d7d302fecda5f7615f9d55e29e04b588d671f8660640e1f61d1619e4ef8"
    - "REQ@REQ-011=sha256:ae43bdda1373eb96562e951a2f49be9f4e698ba3685d42b0d7ffbacfdd217ff1"
    - "REQ@REQ-020=sha256:93b4e91c7b271606530f1bafa07000f04d26e338e032ded633ab019958ec92dc"
    - "REQ@REQ-021=sha256:55b89ff7a7bbb9e2aa47befd860d44760b98c8f5af03b5f253c9e1b055cf94c9"
    - "REQ@REQ-032=sha256:141594b0d5a0491e6b067c2b5e88401f29ee3bb610908f423be87ebe6d30e30c"
    - "STEP@STEP-005=sha256:cb280369edd87e0a4560c9e2d78ddba902bebde1a9c1d20699cf193946b6838c"
    - "STEP@STEP-013=sha256:549833df7b4ba273e58be9c29bc7b5213b51d2ccee139f9bd50b0403403da557"
    - "STEP@STEP-014=sha256:1ab3c2db93b38e61bae7b8a5cdf72e8e4b29368a570697b137411e647af9a259"
    - "STEP@STEP-015=sha256:3aba0387696f8552692c27d3f61bdd34e950556e7dc7f3c74f7f2c39e44990ca"
    - "STEP@STEP-016=sha256:7b28a8af895013ae8808afbd4a855b3149ceeb989ed5206e4add8a45a1e0d470"
---

# STEP-016 — Manifest store и восстановление

## Goal

Реализовать интерфейс `ManifestStore` и файловую реализацию versioned JSON manifest, а также логику recovery после перезапуска.

## Context

OQ-003 определяет возможность Range-resume; OQ-006 разрешён: headless MVP использует файловый manifest.

## Scope

- Схема manifest v1 по ADR-004 (ключ трека — позиция в плане, `provider`, `control`, `retryPhase`, `variantKey`, `partial`) и интерфейс `ManifestStore` в shared, включая эксклюзивную аренду job (PID, hostname, heartbeat) и отдельный канал control-запросов (не-владельцы пишут только его; manifest пишет держатель аренды); устаревание аренды по PID + времени старта процесса.
- Распознавание устаревшей аренды; recovery при любом успешном захвате аренды, включая ранее освобождённую; сверка окна «rename выполнен, manifest не записан»; объединение частых обновлений прогресса.
- Файловая реализация с атомарной записью и каталогом состояния по правилам ОС.
- Recovery: completed → skip, pending → enqueue, failed → по команде, partial → resume/restart.
- Поддержка Range только при заявленной provider возможности.
- Contract-набор тестов `ManifestStore`.

## Mutation policy

### Allowed

- `packages/core/manifest/**`, `packages/persistence/**` (файловая реализация), типы в shared, тесты.

### Conditional

- Нет.

### Forbidden

- SQLite, хранение токенов/signed URL, UI.
- Реализация future/unrelated STEP «заодно».

## Out of scope

- SQLite store (STEP-029).

## Acceptance criteria

- Manifest с более новой версией не перезаписывается и даёт `ValidationError`.
- Тест recovery: процесс прерван на середине playlist → restart завершает только незавершённые треки.
- Тест захвата ранее освобождённой paused job подтверждает применение recovery-нормализации до `resume`.
- Manifest не содержит токены и signed URL (автоматическая проверка).
- Второй процесс не может захватить живую аренду job (тест с двумя процессами); аренда аварийно завершённого процесса распознаётся как устаревшая; при одновременном захвате устаревшей аренды побеждает ровно один процесс (тест).
- Переиспользованный PID другого процесса не удерживает аренду; аренда с другого хоста снимается только явной ручной командой.
- Recovery «итоговый файл есть, `.part` нет → `completed`» применяется только к треку в `processing` при совпадении ожидаемого размера/маркера.
- Range используется только при `acceptsRanges=true`; иначе partial скачивается заново.

## Verification

- command: `node packages/testing/scripts/run-yarn.mjs lint`
- command: `node packages/testing/scripts/run-yarn.mjs typecheck`
- command: `node packages/testing/scripts/run-yarn.mjs test`
- command: `node packages/testing/scripts/run-yarn.mjs build`
- command: `node packages/testing/scripts/run-yarn.mjs format:check`
- command: `python3 .harness/tools/validate.py --mode manual`

## Deliverables

- Manifest store, recovery и тесты.

## Implementation plan

### 1. Контракт manifest v1 и переносимый ManifestStore

- В packages/shared/src/manifest.ts определить JobManifestV1, positional track state, LeaseIdentity/LeaseSession, ControlRequest/ControlAck и ManifestStore. Read доступен без lease; save/heartbeat/consume/acknowledge/release и runOwned доступны только owner session. Acquire принимает обязательный recovery callback и возвращает session только после его успешного завершения; production callback предоставляет core-manifest.
- Зафиксировать allowlist DTO по ADR-004/ADR-006: version=1, jobId/provider/source, immutable DownloadPlan, quality/destination, job control с pauseReason/pauseTrackKey; записи по position/trackKey со status/retryPhase/variant/variantKey, result/part paths, attempts/history, безопасной DomainErrorJson, timestamps и partial{bytes,expectedSize,variantKey,tagged}. Для rename-gap добавить ожидаемый post-processing size/identity marker, записываемый до rename.
- Decoder проверяет полный JSON, version, positional соответствие plan/state и неизменяемость plan; поддерживается существующий v1, неизвестные версии дают ValidationError с безопасным понятным сообщением и сохраняют исходные bytes. Пустой store не означает потерянный или повреждённый manifest: существующий некорректный документ не пересоздавать.
- Serializer явно проецирует допустимые fields вместо spread runtime job/provider/error. AudioStream, credentials, raw exceptions/cause и произвольные поля не сохраняются; ошибки приводятся к известным безопасным code/message/retryable. На read восстановить readonly plan и runtime freeze, сохранить позиционную нумерацию REQ-011.

**Files:**
- packages/shared/src/manifest.ts
- packages/shared/src/index.ts
- packages/shared/src/manifest.test.ts

**Tests:**
- DTO roundtrip: повтор trackId на разных позициях, все статусы/retryPhase/control pause metadata, partial и post-processing marker; malformed/newer version и попытка изменения plan отвергаются.
- PRN-002/Acceptance: secret/signed-URL canaries в raw provider/error objects не попадают в сериализованный JSON; отсутствующие обязательные данные не заменяются выдуманными metadata.

**Risks:**
- Manifest v1 и lease/control semantics уже приняты ADR-004/ADR-006; это их конкретизация без SQLite и изменения provider contract.

### 2. Файловый adapter, атомарные snapshots и каталог состояния

- Реализовать FileManifestStore в packages/persistence с зависимостью только от shared. Каталог stateDir настраивается явно; default Linux: абсолютный XDG_STATE_HOME/music-downloader либо ~/.local/state/music-downloader; macOS: ~/Library/Application Support/music-downloader; Windows: LOCALAPPDATA/music-downloader либо ~/AppData/Local/music-downloader.
- На job выделить собственный namespace manifest/lease/control; отображение jobId в имя каталога должно быть стабильным и однозначным. POSIX создаёт user-only directory/file permissions, Windows использует пользовательский каталог и унаследованные права. Разные job не используют общий write mutex.
- Snapshot сохраняется полным JSON: validate proposed DTO и текущую disk version/immutable plan → unique temporary file в том же каталоге → запись всех bytes → sync/close → atomic rename поверх manifest. Ошибка до rename сохраняет прежний snapshot; reader видит целиком старый или новый документ. Не использовать delete-before-rename; необходимые bounded Windows rename retries остаются внутри adapter.
- Owner transitions пишутся сразу. Только partial.bytes объединять с default progressFlushIntervalMs=250; перед state transition, command acknowledgement и release сбросить pending progress. partial.bytes не используется как доказательство действительного размера .part при recovery.

**Files:**
- packages/persistence/src/file-manifest-store.ts
- packages/persistence/src/atomic-json.ts
- packages/persistence/src/state-directory.ts
- packages/persistence/src/index.ts
- packages/persistence/src/state-directory.test.ts
- packages/persistence/src/atomic-json.test.ts

**Tests:**
- State path для Linux/macOS/Windows и override; read при concurrent replace получает только валидные полные snapshots.
- Ошибки write/sync/rename оставляют прежний документ; newer version не изменяется; два разных job сохраняются параллельно; fake clock доказывает coalescing и обязательный flush transitions.

### 3. Эксклюзивная аренда с kernel lock и process identity

- Добавить ровно fs-native-extensions@1.5.1 в packages/persistence/package.json и синхронизировать только относящиеся к ней записи yarn.lock обычным Yarn workflow. Узкий persistence adapter использует nonblocking tryLock/unlock; package имеет Node-API v9 build, совместимый по официальной matrix с Node 22.13/24, и upstream Linux/macOS/Windows implementations/prebuilds. Источники: [v1.5.1 build](https://github.com/holepunchto/fs-native-extensions/blob/v1.5.1/CMakeLists.txt), [Node-API matrix](https://nodejs.org/api/n-api.html#node-api-version-matrix), [platform builds](https://github.com/holepunchto/fs-native-extensions/blob/v1.5.1/.github/workflows/prebuild.yml). Это eligibility, runtime proof обеспечивает реальный тест.
- На каждый job создать постоянный writable mutex-файл: его inode никогда не unlink/rename. Acquire открывает его и выполняет exclusive tryLock; fd/lock удерживается всю owner-session lifetime, включая paused. Поэтому два stale contenders не могут одновременно пройти acquire; второй получает понятную busy error. Ошибка загрузки addon или unsupported native lock даёт безопасный отказ без перехода к небезопасному lock.
- После получения kernel lock перечитать lease record и disk manifest. Released/absent lease можно захватить; same-host retained lease — только при heartbeat старше default leaseTimeoutMs=30000 и подтверждённом отсутствии прежнего PID+birth либо другом birth. Alive owner не становится stale только из-за heartbeat. Foreign-host lease без явного forceForeignLease(expectedGeneration) не менять; force также требует свободного kernel lock и совпадения наблюдавшейся generation.
- Новый lease атомарно публикует monotonic generation, случайный owner token, PID, hostname, process birth, acquiredAt и heartbeatAt. Defaults: heartbeatIntervalMs=5000, leaseTimeoutMs=30000; часы/probe/timers внедряются для детерминированных tests. Generation/token проверяются перед каждым owner mutation и before artifact side effect; подделанный или released session не даёт прав.
- Default ProcessIdentityProbe: Linux — /proc/<pid>/stat starttime с boot identity; macOS — /bin/ps -p PID -o lstart= в C locale/UTC; Windows — системный PowerShell с .NET Process.StartTime UTC ticks. Commands запускаются shell:false с числовым PID и bounded timeout, без вывода command line/environment/credentials. Missing process отличается от unavailable/permission/parse failure; unknown probe запрещает automatic reclaim, kill(pid,0) не заменяет birth. Источники: [Linux starttime](https://man7.org/linux/man-pages/man5/proc_pid_stat.5.html), [Apple ps](https://github.com/apple-oss-distributions/adv_cmds/blob/main/ps/print.c), [Windows StartTime](https://learn.microsoft.com/en-us/dotnet/api/system.diagnostics.process.starttime).
- Локально сериализовать save/heartbeat/control consume/ack/release. runOwned регистрирует artifact operations, не блокируя heartbeat; release перестаёт принимать новые операции, дожидается активных side effects и pending writes/progress, атомарно помечает lease released, затем unlock/close. После release старый handle отвергается. Не заявлять successful release при незавершённой записи или side effect.
- При acquire существующего job вызвать production recovery callback под удерживаемым kernel lock до выдачи готовой session и до применения resume/pause/cancel/retry. Ошибка recovery не предоставляет ready owner session; документ более новой версии остаётся нетронутым.

**Files:**
- packages/persistence/package.json
- yarn.lock
- packages/persistence/src/native-job-lock.ts
- packages/persistence/src/process-identity.ts
- packages/persistence/src/file-manifest-store.ts
- packages/persistence/src/process-identity.test.ts
- packages/persistence/src/process-identity.integration.test.ts

**Tests:**
- Реальный default process probe читает birth своего и child process на текущей ОС, затем подтверждает исчезновение после завершения; отдельные parser/unknown tests проверяют остальные platform branches и fail-closed.
- Native loader/kernel lock тест запускается без mock на Linux/macOS/Windows там, где исполняется стандартный test job; unsupported branch не выдаёт PASS вместо проверки поддерживаемой ОС.

**Risks:**
- H-001 остаётся planned до real multi-process proof; primary-source platform/runtime eligibility не заменяет project integration evidence.

### 4. Отдельный control inbox и подтверждение владельцем

- sendControl создаёт уникальный requestId и атомарно публикует полный allowlisted request в отдельном job inbox после write/sync/close; никакого owner handle для отправки не требуется. Non-owner не меняет manifest, lease или .part и не удаляет request/ack. waitControlAck читает только свой receipt с default timeout 10000 ms.
- Только owner session получает/удаляет запросы и вызывает предоставленный handler command. После согласованного изменения control/state сначала сохранить manifest, затем атомарно опубликовать безопасный ack, затем удалить request. Для окна crash между commit и ack сохранить последний requestId/result вместе с snapshot; на повторном consume восстановить ack без повторного применения команды.
- Матрицу ADR-004 реализовать в core-manifest command/recovery entrypoint: resume живого running owner отвергается, команды paused/running owner направляются inbox, отсутствие владельца означает acquire+recovery перед command. Consumer/handler предоставляет store API и production helper, без daemon, queue scheduler или CLI команд STEP-017/019.
- Все request/ack fields и ошибки проходят тот же safe DTO policy; receipt содержит correlation/result, а не raw exception. Timeout не означает отмену уже опубликованной команды и не даёт отправителю права переписывать job.

**Files:**
- packages/persistence/src/control-inbox.ts
- packages/persistence/src/file-manifest-store.ts
- packages/core/manifest/src/control.ts
- packages/persistence/src/control-inbox.test.ts

**Tests:**
- Non-owner пишет только inbox; owner-only consume/delete/ack/save/heartbeat/release и rejected stale handles; command matrix, timeout и crash после manifest commit до ack.
- Два уникальных requests не перезаписывают друг друга; repeated delivery завершённого request не повторяет mutation.

### 5. Production recovery, checkpoint и безопасный Range candidate

- В packages/core/manifest реализовать openRecoveredJob/recoverJob поверх ManifestStore с injected file inspection/read/write/promote operations. Persistence не импортирует core. Recovery запускается при каждом успешном acquire, включая released paused job, прежде чем команда изменит control.
- Нормализовать все DownloadTrackStatus по ADR-006: completed/skipped/cancelled сохраняются и не загружаются; ordinary failed остаётся failed до retry; queued и незавершённые resolving/ready/downloading/processing/retry_wait становятся восстанавливаемой работой с сохранением positional identity, attempts/variant/retryPhase и paused control. Paused partial получает resume/restart decision, а не автоматический запуск. AUTH_REQUIRED сохраняет pauseReason/pauseTrackKey; только подтверждённая успешная auth+resume возвращает остановившийся трек в queued, оставляя прочие failed.
- Rename-gap сверять только для processing: .part отсутствует, final существует, реально проверен и совпадает recorded post-processing size/identity marker → completed. Для других состояний и отсутствующего/неподходящего marker final existence не доказывает completed. Никакой обычный inspectExisting без validator не является recovery proof.
- Production finalization wrapper использует existing writer/finalizer через injected callbacks: перед возможной metadata mutation записать partial.tagged; после metadata и final validation измерить готовый .part и атомарно записать processing checkpoint size/identity, затем разрешить rename. После successful rename сохранить completed независимо от последующего cancel; сбой manifest write оставляет marker для следующего recovery. Реализация metadata/container validator остаётся у профильных STEP.
- Production Range helper измеряет реальный retained prefix, не полагается на coalesced partial.bytes. Offset допустим только для untagged partial с совпадающими variantKey/expectedSize; provider response обязан подтвердить acceptsRanges=true, startOffset=actualPrefixBytes и совпадающий full contentLength. При false/tagged/mismatch начать с offset=0; неожиданный suffix не добавлять к prefix.
- Для Range читать prefix потоково, соединить prefix+provider suffix и через injected existing writeStreamToPart записать отдельный unique candidate в том же каталоге; проверить полный размер, sync/close, затем owner-only atomic promote candidate → canonical .part. Existing writer не меняется и не получает append FsOps вопреки его truncate contract. До promote прежний .part сохраняется; pause/error не публикует частичный candidate как canonical prefix. Cancel удаляет job-owned partial/candidate; crash recovery игнорирует незавершённый candidate и использует canonical prefix.
- Дать concrete callable helper и реальные integration adapters в тесте: read/stat/promote — настоящая ФС, write — существующий production writer/finalizer, provider — общий portable test provider/stream. Тестовый executor не реализует missing prefix composition, append, recovery или checkpoint вместо production core-manifest.

**Files:**
- packages/core/manifest/src/recovery.ts
- packages/core/manifest/src/range.ts
- packages/core/manifest/src/finalization.ts
- packages/core/manifest/src/control.ts
- packages/core/manifest/src/index.ts
- packages/core/manifest/src/recovery.test.ts
- packages/core/manifest/src/range.test.ts

**Tests:**
- Таблица всех track/control states, retryPhase, ordinary failed и AUTH_REQUIRED; released paused normalization выполняется до resume.
- Checkpoint вызывается после реальной mutation/validation, до rename; совпадающий processing final восстанавливается completed, другие состояния/markers не становятся completed.
- Range offset берётся из actual stat, совместимый prefix сохраняется побайтно; false/tagged/variant/size/startOffset mismatch не даёт повреждённого файла.

**Risks:**
- H-002 planned: byte-exact restart/recovery доказывается production helper с реальной ФС; application composition и scheduling будущих STEP не входят в реализацию.

### 6. Общий store contract и прямые критические integration proofs

- Добавить переиспользуемый ManifestStore contract suite в разрешённом test surface packages/shared и применить к FileManifestStore: atomic full snapshots, version refusal без изменения bytes, immutable plan roundtrip, независимость job, owner capability/control policy, coalescing/flush и отсутствие секретов в snapshot/lease/inbox/ack/error metadata.
- H-001: packages/persistence/src/file-manifest-store.integration.test.ts запускает реальные Node child-process fixtures с production adapter и настоящей временной ФС. IPC barriers обеспечивают live contention, crash владельца, expired heartbeat+birth probe и simultaneous stale acquire; ровно один winner держит lock, остальные не меняют manifest/.part. Проверить released handle, fake old birth у реально существующего другого процесса, foreign-host refusal и explicit force при свободном kernel lock.
- Child-process fixtures в packages/persistence/src/fixtures/manifest-owner.mjs используют реальные built workspace exports, подготовленные обычным TypeScript build в test setup; не вводить отдельный TS runtime или подмену kernel lock. Проверить default native lock/process identity в packages/persistence/src/process-identity.integration.test.ts, без skip поддерживаемой платформы.
- H-002: packages/core/manifest/src/recovery.integration.test.ts запускает real store+production core recovery/Range/finalization helper, убивает child loader посреди playlist и после нового acquire заканчивает только unfinished tracks. Счётчики stream opens доказывают completed skip; final bytes равны эталону. Отдельные crash barriers покрывают released paused job и rename-before-manifest checkpoint window.
- Зафиксировать обе critical proof obligations из validated PLAN blast точной общей command `node packages/testing/scripts/run-yarn.mjs test`. Тесты являются acceptance proof этого STEP, а не реализацией CLI resume или queue STEP-017/019. Локальная проверка доказывает текущую ОС; стандартные test jobs существующей OS matrix исполняют те же реальные native/probe fixtures, а не считаются пройденными по platform docs.

**Files:**
- packages/shared/src/manifest-store.contract.ts
- packages/persistence/src/file-manifest-store.contract.test.ts
- packages/persistence/src/file-manifest-store.integration.test.ts
- packages/persistence/src/process-identity.integration.test.ts
- packages/persistence/src/fixtures/manifest-owner.mjs
- packages/core/manifest/src/recovery.integration.test.ts
- packages/core/manifest/src/fixtures/recovery-owner.mjs

**Tests:**
- H-001 direct proof: exactly-one owner/stale winner и отсутствие unauthorized writes на реальных процессах.
- H-002 direct proof: restart playlist, completed skip, released-paused recovery, processing marker и byte-exact Range/restart.
- Общая command proof: node packages/testing/scripts/run-yarn.mjs test.

**Risks:**
- Runtime proof пока planned; INCONCLUSIVE PLAN blast не выдаётся за уже доказанную безопасность.

### 7. Проверка итогового scope и canonical Verification

- Проверить, что production mutations ограничены shared contracts, core/manifest и persistence; packages/persistence/package.json/yarn.lock меняются только для выбранного kernel-lock adapter. Не добавлять SQLite, Yandex-specific imports, credentials persistence, UI, queue/application/CLI implementation или unrelated tooling.
- Выполнить все шесть Verification commands на итоговом implementation subject; test evidence должно содержать H-001/H-002 suites и реальные native/process probes. Исправить material failures в том же contract, затем передать работу independent review без self-approval.
- Сохранить фактические Verification results и поддерживаемую текущую runtime/platform observation через canonical workflow; documentation/code comments новых contracts и неочевидного lease/recovery flow писать по-русски с короткими ссылками на ADR-004/ADR-006 и owning REQ.

**Files:**
- packages/shared/src/manifest.ts
- packages/core/manifest/**
- packages/persistence/**
- yarn.lock

**Tests:**
- lint/typecheck/test/build/format:check и Harness validator на итоговом subject.

## Evidence






<!-- VERIFICATION-EVIDENCE:START -->
- Verification run: 2026-10-10T10:57:42Z
- Status: PASS
- Automated resumed: false
- Git head: 422e1074ee9a90c43744d196bce5a22ead914bbc
- Worktree hash: sha256:8e003619a91bc8f4899cd10826aba2e45652c797fb5ab7531ed748b3dadfdbb1
- Verification contract basis: sha256:120779b5e74f01e75927e4b8fbe4852a7e84afcca2927829e09a89ee4513840c
- Subject git head: 422e1074ee9a90c43744d196bce5a22ead914bbc
- Subject worktree hash: sha256:f2b8c057925d5becbb5d4e3a385d2f2955e69159a3173a888e97a7bdf54995e8

### Automated verification
- Command: node packages/testing/scripts/run-yarn.mjs lint
  - Status: PASS
  - Exit code: 0
  - Duration ms: 6226
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
  - Duration ms: 4332
  - stdout sha256: daa331aa7a580c8c2e7399d1d54271562877cc6c1400d50e9211ee89754d0bec
  - stderr sha256: f969fafb7bc32ecc492c8343f56269c9c47161d893e83a0d8b9b27fcf57b9aee
  - stdout bytes: 6135
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
  - Duration ms: 2016
  - stdout sha256: 17aa973d3f004560237d9a95171210b0671deff23d61628eecf7322ff5938f20
  - stderr sha256: bc7ff43979f728ea1bb7df02172de0e3cf57fcedb8eda66fe9d54d5198d0fa84
  - stdout bytes: 66
  - stderr bytes: 29
- Command: python3 .harness/tools/validate.py --mode manual
  - Status: PASS
  - Exit code: 0
  - Duration ms: 2818
  - stdout sha256: f80692f3fa283ff311fe39ac71c6d8ce5f65d4fd07027662972e291b98bd4cde
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
