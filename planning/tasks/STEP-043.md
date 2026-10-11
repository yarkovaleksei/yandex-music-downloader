---
schema: 1
id: STEP-043
status: completed
type: implementation
priority: high
phase: core
depends_on:
  - STEP-016
  - STEP-042
requirements:
  - REQ-020
  - REQ-032
  - REQ-044
adrs:
  - ADR-004
  - ADR-006
  - ADR-007
architecture_refs:
  - docs/architecture.md#data-state-model
  - "docs/architecture.md#основные-компоненты-границы"
risk_flags:
  - public-api
  - concurrency
plan:
  status: ready
  revision: 1
  context_basis: sha256:9b830ba25c9e2530ce724f75b56fb602b6ba55b3dc58597b11910ff3f9577e0f
  content_hash: sha256:ff3885897044aa5f4d7e986eb44c9a5d0c74e6ab67289c5f1871217a966ea074
  reviewed_report: planning/plan-reviews/STEP-043/PLAN-REVIEW-20261011T083805Z.md
  planned_at: 2026-10-11T08:38:05+00:00
  execution_groups:
  context_components:
    - "ADR@ADR-004=sha256:4ad987cbdefdf1409c52fd01994ccca0d6941fad8ae0126d435745f3e727ca08"
    - "ADR@ADR-006=sha256:792115c4604a81dfd2d62950958470e1c1f1bad2b2f18e873d5743b9f9dc443d"
    - "ADR@ADR-007=sha256:04d6b08c651797508a14cb298d43f539d5364b851981d6d9064800f288b6b42c"
    - "ARCH@docs/architecture.md#data-state-model=sha256:a16465c45f16a8f41fd3e876e764be3e05d852017bd62457799b7dba138bf6c6"
    - "ARCH@docs/architecture.md#основные-компоненты-границы=sha256:fbdabff4c712b9793cdefe9ef7f14d27253ce04e554c0e2e1ab730cb5bfb5a91"
    - "PRN@PRN-001=sha256:3b3801f207fafc3f77272f0e93570258a6d006964839d93a276accd814d548af"
    - "PRN@PRN-002=sha256:f29ee3fbdb9cf65cf9739d0907768bbf192ad88b8e443110d4d82f81c6b79ecb"
    - "PRN@PRN-003=sha256:16516d7d302fecda5f7615f9d55e29e04b588d671f8660640e1f61d1619e4ef8"
    - "REQ@REQ-020=sha256:93b4e91c7b271606530f1bafa07000f04d26e338e032ded633ab019958ec92dc"
    - "REQ@REQ-032=sha256:141594b0d5a0491e6b067c2b5e88401f29ee3bb610908f423be87ebe6d30e30c"
    - "REQ@REQ-044=sha256:54427009756971c5fd75791bae02f1df9fb15781afc1501f3e9f4bb88c879749"
    - "STEP@STEP-016=sha256:5e6164a15320a1fef677cd4fbd9a40772ae4686105e1790ffeebaa9051b036fb"
    - "STEP@STEP-042=sha256:ac8ffa7cf12cf975af221121fc23b76ce2bd9956c97a92f023d535f3aa1ef7b2"
    - "STEP@STEP-043=sha256:4ee4a856ea23b71b04ad96a9dabda9024a215e46fa2d860deedea491873a6456"
---

# STEP-043 — Чтение состояния аренды через ManifestStore

## Goal

Предоставить через переносимый порт `ManifestStore` наблюдение состояния аренды без изменения хранилища, чтобы application мог достоверно вычислять статусы сохранённых заданий.

## Context

Основание — пользовательский `STEP ADD` после блокировки `STEP PLAN STEP-018`. Завершённый STEP-042 предоставляет `list()` для сохранённой истории, но `read/list` возвращают только `JobManifestV1` без сведений об аренде. `aggregateJobStatus` в `packages/core/downloader/src/state/aggregate.ts` требует `leaseAlive`: одинаковые `control=running` и незавершённые треки дают `running` при живой аренде и `interrupted` при её отсутствии. Локальная история application не определяет состояние владельца другого процесса или задания после перезапуска.

Проверка пересечений: STEP-016 завершён и владеет существующими правилами аренды, STEP-042 завершён и владеет перечислением manifest. В их публичном порте необходимого наблюдения нет. STEP-018 владеет application DTO и интеграцией истории, но изменение production persistence запрещено его Mutation policy. STEP-029 владеет будущим SQLite adapter; он не реализуется здесь.

Задача предоставляет недостающие входные данные для уже принятой семантики ADR-004/006/007 и REQ-020/032/044. Новый product contract, изменение правил захвата аренды и новое архитектурное решение не требуются. STEP-018 получает STEP-043 как prerequisite; исторический Ready-план сохраняется, а снятие блокировки после выполнения prerequisite проверяется штатным workflow.

## Scope

- Добавить обязательную операцию наблюдения аренды в `ManifestStore` и переносимый результат в shared без Node built-ins. Результат различает аренду, считающуюся активной по действующей политике ADR-004, подтверждённое отсутствие активной аренды и невозможность определить её состояние; конкретную сигнатуру закрепить в плане.
- Реализовать операцию в `FileManifestStore` на существующих lease record, heartbeat и проверке PID вместе со временем старта процесса. Отсутствующая или освобождённая аренда неактивна; неосвобождённая аренда того же хоста признаётся устаревшей только по существующему сочетанию просроченного heartbeat и отсутствующего либо другого процесса. Просроченный heartbeat живого владельца сам по себе не доказывает отсутствие аренды.
- Не выдавать аренду другого хоста или неизвестный результат process probe за подтверждённое отсутствие владельца. Состояние неизвестности должно быть явно представлено результатом либо безопасной ошибкой и не преобразовываться в `leaseAlive=false`.
- Наблюдение только читает: не вызывает `acquire/recovery`, не создаёт каталоги или lock-файлы, не обновляет heartbeat, не отправляет control и не удаляет/освобождает lease. Ошибки чтения и повреждённые данные не маскируются отсутствием аренды.
- Возвращать только необходимые факты состояния без `ownerToken`, полного lease record и raw OS ошибок. Снимок отражает момент наблюдения, не предоставляет writer capability и не обещает общей атомарной транзакции с отдельными `read/list`; окончательное решение о захвате остаётся у существующего `acquire`.
- Расширить общий contract-набор порта и тесты файлового adapter; адаптировать существующие тестовые реализации обязательного метода. Документировать семантику и границу application-интеграции STEP-018.

## Mutation policy

### Allowed

- `packages/shared/src/manifest.ts`, `packages/shared/src/index.ts`, `packages/shared/src/manifest-store.contract.ts` и связанные shared-тесты — порт, переносимые типы и contract-набор; формат manifest v1 не меняется.
- `packages/persistence/**` — только файловый `ManifestStore`, существующие helpers наблюдения процесса/аренды, необходимые тесты и документация. Правила захвата, освобождения и устаревания сохраняются.

### Conditional

- Существующие тестовые реализации `ManifestStore`, включая `packages/core/downloader/src/fixtures/manager-fixture.ts`, — только добавление обязательной операции при фактической ошибке typecheck, без изменения production core/application.

### Forbidden

- Production application, CLI, UI, provider, SQLite и реализация соседних STEP.
- Изменение manifest v1, lease format, TTL/heartbeat policy, алгоритмов acquire/release/recovery, control inbox и job status aggregation.
- Запись или захват аренды ради наблюдения; выдача writer capability или служебных секретов через результат.
- Переписывание исторических Ready-планов, review и Accepted ADR сверх двусторонней traceability.

## Out of scope

- Подключение нового порта к `listJobs/getJob`, application DTO и обработка неизвестного состояния клиентами — STEP-018.
- Повторная реализация `list()` — завершённый STEP-042; SQLite — STEP-029; новые политики lease/recovery и distributed locking.

## Acceptance criteria

- Обязательная операция доступна через `ManifestStore`, её контракт импортируется без Node built-ins; файловый adapter проходит расширенный общий contract-набор.
- Другой экземпляр store с тем же каталогом отличает активную аренду владельца от отсутствующей/освобождённой аренды и распознанной устаревшей аренды по ADR-004. Для одинакового manifest с незавершёнными треками полученные определённые факты дают разные корректные входы `leaseAlive` для существующего агрегатора; перезапуск наблюдателя не меняет результат.
- Проверки подтверждают действующие случаи: свежий heartbeat; просроченный heartbeat при том же живом процессе; просроченный heartbeat при отсутствующем процессе или переиспользованном PID с другим временем старта. Неизвестная probe и другой hostname не превращаются в подтверждённое отсутствие аренды.
- Наблюдение не меняет manifest/lease/control inbox/`.part`, не создаёт файлов в отсутствующем каталоге и не вызывает recovery. После чтения исходный владелец продолжает save, а второй owner по-прежнему не может захватить активную аренду.
- Ошибки чтения и повреждённая lease record остаются явными безопасными отказами; результат не раскрывает `ownerToken`, raw lease record или OS ошибки. Параллельный heartbeat/release не даёт повреждённого результата и не превращает наблюдение в право записи.
- Существующие проверки shared/persistence/downloader проходят; production application и исторические планы не изменены. Интерфейс пригоден для application-интеграции STEP-018 без чтения внутренних lease-файлов клиентом.

## Verification

- command: `yarn test packages/shared packages/persistence packages/core/downloader`
- command: `yarn lint`
- command: `yarn typecheck`
- command: `yarn test`
- command: `yarn build`
- command: `python3 .harness/tools/validate.py --mode manual`

## Deliverables

- Переносимый порт наблюдения аренды, файловая реализация, общий contract-набор и необходимые тесты.
- Документация результата и его ограничений для последующей интеграции в STEP-018.

## Implementation plan

### 1. Зафиксировать переносимый порт наблюдения аренды

- В packages/shared/src/manifest.ts определить LeaseState = 'active' | 'inactive' | 'unknown' и обязательный ManifestStore.readLeaseState(jobId: string): Promise<LeaseState>. Использовать существующий export * из shared/index.ts; Node built-ins, новые event/CommandResult envelopes и публичные lease record не добавлять.
- Закрепить в коротком русском doc-comment с @link на STEP-043/ADR-004 семантику: inactive означает отсутствие/освобождение либо распознанное устаревание; active — аренду, которую действующая политика считает активной; unknown — отсутствие достаточного знания. Не трактовать unknown как leaseAlive=false. Выбор application DTO/реакции на unknown принадлежит STEP-018.
- Отсутствующий namespace/lease даёт inactive без проверки или создания manifest: операция наблюдает именно аренду и не устанавливает существование job, для которого есть read/list. Результат — только строковой state без ownerToken, generation, PID/hostname, raw paths и внутренних exceptions.
- Наблюдение отражает отдельный снимок; общей атомарной транзакции с read/list и права writer не обещает. Существующие acquire/release/recovery и схемы данных остаются единственными источниками writer capability.

**Files:**
- packages/shared/src/manifest.ts
- packages/shared/src/index.ts
- packages/shared/src/manifest-store.contract.ts

**Tests:**
- Расширенный общий contract: inactive для неизвестного job и созданного без аренды, active после acquire, inactive после release; unknown остаётся допустимым явным состоянием переносимого типа.
- yarn lint и yarn typecheck проверяют отсутствие Node импортов в контракте и compatibility обязательного метода.

### 2. Добавить чтение состояния в файловый adapter по существующей политике

- Реализовать FileManifestStore.readLeaseState через существующий jobDirectory и readJsonIfPresent для lease.json. Не вызывать mkdir, NativeJobLock.tryAcquire, acquire, currentLeaseIdentity, recovery, sendControl, heartbeat или save; не подключать новый timer. Для сравнения hostname использовать тот же текущий hostname, что существующий process probe.
- Добавить отдельную внутреннюю проверку существующего LeaseRecord для observation: JSON должен быть объектом с полями действующего формата и корректными timestamp; повреждённый JSON/неполный record/нечитаемые даты дают ValidationError без raw cause. Не менять leaseFrom, формат lease и writer algorithms; не вводить новые форматы, дополнительные ограничения времени или миграцию.
- Ветви в порядке существующей политики: отсутствующая запись или valid releasedAt -> inactive; неосвобождённая запись другого hostname -> unknown; local heartbeat с возрастом <= существующих leaseTimeoutMs (30000 ms) -> active. Для expired local heartbeat вызывать существующий probeLease: same -> active, missing/different -> inactive, unknown -> unknown. Ни fresh reservation, ни один лишь timeout не дают права объявить inactive.
- Ошибки I/O, кроме уже обработанного readJsonIfPresent ENOENT, нормализовать существующим normalizeDomainError и перевыдать безопасный DomainError с code/retryable без исходного cause; повреждение отделить как VALIDATION_ERROR. Не скрывать ошибки через inactive/unknown и не включать contents lease/raw OS messages в error/log/result.
- Использовать текущее атомарное чтение записи; выбор active/inactive остаётся наблюдением, а не обещанием успешного следующего acquire. Не менять assertReclaimable, интервалы heartbeat, обработку foreign force или контроль generation.

**Files:**
- packages/persistence/src/file-manifest-store.ts

**Tests:**
- Adapter unit matrix: no lease, released, fresh local (включая границу 30000 ms), expired+same/missing/different/unknown, unreleased foreign -> unknown.
- Malformed JSON, отсутствующие необходимые поля/некорректные timestamps и non-ENOENT I/O дают safe failure без ownerToken/raw error/cause; корректная запись не переписывается.

**Risks:**
- active означает сохранённую reservation policy ADR-004, а не отдельное обещание process health. Foreign/unknown требует явной обработки в STEP-018; порт не принимает её за inactive.

### 3. Доказать H-001/H-002 на contract и реальном filesystem

- Расширить runManifestStoreContract проверками inactive -> active -> inactive вокруг existing acquire/release. Сохранить прежние read/list/control/recovery assertions; новый contract не зависит от Node и конкретных lease файлов.
- H-001: повторить чтение через другой FileManifestStore, сравнить byte snapshots manifest/lease/control inbox/.part до и после, проверить отсутствие acquire/control/recovery. Исходный owner продолжает save, второй acquire по-прежнему отвергается. Для отсутствующего каталога подтвердить inactive и отсутствие созданных files/directories.
- H-002: использовать один неизменённый manifest с control=running и нетерминальным треком при активной и освобождённой/распознанной устаревшей аренде. Получить active/inactive как определённые входы true/false для существующего aggregateJobStatus; production агрегатор и application не менять. Его существующие tests в общей downloader suite подтверждают различие running/interrupted; не создавать dependency persistence -> core.
- Подтвердить живого владельца другого процесса и чтение после его завершения через существующую child-process fixture. Для expired heartbeat тестировать same и реальные missing/different PID birth, а unknown/foreign — управляемой probe/записью. Не ждать 30 секунд: задавать heartbeat или ограниченно управлять clock/probe только в тесте с восстановлением.
- При controlled параллельном heartbeat/release проверить, что читатель видит состояние из целой valid lease record, остаётся read-only и не получает capability. Использовать existing atomic writer и barriers, не sleep-based races; не требовать общей транзакции manifest+lease или актуальности после завершения чтения.
- Exact proof command H-001/H-002: yarn test packages/shared packages/persistence packages/core/downloader. Semantic Blast Radius пока INCONCLUSIVE, proof.status=planned; до реализации это обязательства, а не доказанный PASS.

**Files:**
- packages/shared/src/manifest-store.contract.ts
- packages/persistence/src/file-manifest-store.test.ts
- packages/persistence/src/file-manifest-store.integration.test.ts

**Tests:**
- H-001: read-only byte snapshots, отсутствующий root, owner save/second owner rejection, отсутствие recovery/control.
- H-002: политика freshness/probe/released/foreign, неизменный pending manifest, двухпроцессное наблюдение, атомарные heartbeat/release snapshots и безопасные ошибки.

### 4. Сохранить совместимость fixtures, документировать границу и выполнить Verification

- После добавления обязательного метода выполнить yarn typecheck. Только при фактических errors адаптировать существующие тестовые ManifestStore implementations, начиная с packages/core/downloader/src/fixtures/manager-fixture.ts. Memory fixture может учитывать существующий acquire/release в небольшом owner Set для active/inactive; production core и application не менять.
- Документировать readLeaseState в коротких русских комментариях shared/adapter с @link на STEP-043, ADR-004 и владельца application integration STEP-018: unknown не boolean false, observation не writer capability, no lease не доказательство существования job, отсутствие общей транзакции с read/list.
- Выполнить все Verification commands и записать factual evidence через canonical workflow реализации. Root toolchain/dependencies, форматы и алгоритмы не менять. Completion implementation потребует fresh independent review; текущая команда только готовит план.
- После завершения STEP-043 рекомендовать актуальный STEP PLAN STEP-018 и штатную проверку его блокировки. В этой PLAN execution не переписывать соседние Ready-планы, не интегрировать API и не снимать status blocked вручную.

**Files:**
- packages/core/downloader/src/fixtures/manager-fixture.ts
- packages/shared/src/manifest.ts
- packages/persistence/src/file-manifest-store.ts

**Tests:**
- yarn test packages/shared packages/persistence packages/core/downloader
- yarn lint
- yarn typecheck
- yarn test
- yarn build
- python3 .harness/tools/validate.py --mode manual

**Risks:**
- Изменение STEP-043 делает зависимый план STEP-018 устаревшим; его отдельное перепланирование и handling unknown остаются обязанностью STEP-018.

## Evidence


<!-- VERIFICATION-EVIDENCE:START -->
- Verification run: 2026-10-11T08:43:31Z
- Status: PASS
- Automated resumed: false
- Git head: 70563057c42f7b1d8b38e228f2671237a4cf2190
- Worktree hash: sha256:381b0b525e9c7f0867504b163e876319d7ac0d7cdd5962508132000d408f8657
- Verification contract basis: sha256:38f9b2ff52b0937b819a23e1bd010b63c187ea449074cda49906e2e64b15ae47
- Subject git head: 70563057c42f7b1d8b38e228f2671237a4cf2190
- Subject worktree hash: sha256:39c8ff5e967138950781dd4a844df2a4e9e82d54d65c56a2d9648bd2ea5b7de3

### Automated verification
- Command: yarn test packages/shared packages/persistence packages/core/downloader
  - Status: PASS
  - Exit code: 0
  - Duration ms: 2172
  - stdout sha256: a0dcef3e6fece72a2286756e72a945c128352cb6df905d2cf3d5061d3a1d5a65
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 1807
  - stderr bytes: 0
- Command: yarn lint
  - Status: PASS
  - Exit code: 0
  - Duration ms: 6976
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 0
  - stderr bytes: 0
- Command: yarn typecheck
  - Status: PASS
  - Exit code: 0
  - Duration ms: 2768
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 0
  - stderr bytes: 0
- Command: yarn test
  - Status: PASS
  - Exit code: 0
  - Duration ms: 9338
  - stdout sha256: 5c0065088751fa0d874153e5c52a00dfabc027d62e645804c10540de75750335
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 7740
  - stderr bytes: 0
- Command: yarn build
  - Status: PASS
  - Exit code: 0
  - Duration ms: 414
  - stdout sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 0
  - stderr bytes: 0
- Command: python3 .harness/tools/validate.py --mode manual
  - Status: PASS
  - Exit code: 0
  - Duration ms: 3870
  - stdout sha256: 7945339bd0e1b40feb46056e24db7c921802505b244cecf46fbf2060137942e4
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 482
  - stderr bytes: 0

### Product verification
- none

### Manual verification
- none
<!-- VERIFICATION-EVIDENCE:END -->

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.


## Blocker / Failure reason

—
