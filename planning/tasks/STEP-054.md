---
schema: 1
id: STEP-054
status: planned
type: implementation
priority: medium
phase: packaging
depends_on:
  - STEP-034
  - STEP-035
  - STEP-036
requirements:
  - REQ-041
  - REQ-045
  - REQ-053
  - REQ-054
  - REQ-055
adrs:
  - ADR-014
  - ADR-019
architecture_refs:
  - docs/architecture.md#deployment-runtime-assumptions
risk_flags:
  - release-critical
plan:
  status: not_planned
  revision: 0
  context_basis: null
  content_hash: null
  reviewed_report: null
  planned_at: null
---

# STEP-054 — Финальная проверка готового приложения на Windows и macOS

## Goal

После всей разработки и упаковки единым финальным прогоном подтвердить готовые Linux-сборки на Windows x64 и macOS arm64/x64.

## Context

Решение владельца от 2026-10-29: передача архивов другу через облако и получение отчётов слишком дороги по времени. Все новые Windows/macOS проверки отложены на самый последний STEP. До него обязательны только локальные Linux-проверки; CI не требуется. Старые PASS/FAIL сохраняются без переоценки. Прежний план отдельной x64 проверки устарел; новый PLAN составляется только после STEP-034/035/036. Любая новая разработка должна завершиться до этого финального прогона и быть добавлена в depends_on.

## Scope

- Единый набор готовых артефактов Windows x64, macOS arm64/x64, собранных только на Linux, с revision/build ID и хешами.
- Распаковка portable-пакета на чистой целевой ОС, запуск интерфейса и полный офлайновый Electron E2E без авторизации, гостевой сборки и установленных Node.js/FFmpeg.
- Проверка собственной подписи descriptor и portable-обновления N → N+1 на Windows/macOS по принятому packaging ADR.
- Сохранение raw отчётов, архитектуры runtime/CPU и признака Rosetta; диагностика невыясненного x64 пустого окна до заявления PASS.

## Mutation policy

### Allowed

- `docs/development.md` — инструкции итоговой платформенной проверки.
- `apps/desktop/e2e/**` — финальный сценарий, диагностика и нативное Evidence.
- `apps/desktop/scripts/**` — Linux-подготовка готовых проверочных артефактов.

### Conditional

- Точечные исправления подтверждённых финальной проверкой дефектов desktop/packaging: только после фиксации воспроизведения и нового STEP PLAN с явными файлами, тестами и документационными outputs.

### Forbidden

- Сборка приложения или E2E host на Windows/macOS.
- Изменение CI workflows, требования CI-приёмки, секреты в отчётах/репозитории.
- Неподтверждённое hardening и unrelated функции.

## Out of scope

- Разработка portable-упаковки и проверки обновлений до завершения STEP-034/035/036.
- Live provider и личный аккаунт для офлайнового E2E.

## Acceptance criteria

- Все предшествующие этапы разработки и упаковки завершены; финальные артефакты собраны на Linux и совпадают с manifest по хешам.
- На Windows x64 и macOS arm64/x64 готовое portable-приложение запускается без установщика и, открывает интерфейс и проходит офлайновый Electron E2E; файл и та же история сохраняются после перезапуска, гостевая компиляция отсутствует.
- Собственная подпись descriptor и ручное portable-обновление N → N+1 проверены на Windows/macOS по принятому ADR.
- Evidence содержит revision/build ID, appArtifactHash, ОС, process.arch, CPU/Rosetta, команды, raw результаты и сведения о файле/истории. Старые FAIL не скрыты; Linux или прежние CI-логи не подменяют новый native PASS.
- При отсутствии требуемой платформы финальная приёмка остаётся pending; промежуточные STEP из-за этого не блокируются, готовность релиза не заявляется.

## Verification

- command: `python3 .harness/tools/validate.py --mode manual`
- manual: На Windows x64 и macOS arm64/x64 проверить распаковку и запуск готовых Linux-сборок, офлайновый Electron E2E с файлом/историей после restart, собственную подпись descriptor и ручное portable-обновление N → N+1; сохранить raw Evidence с revision/build ID, хешами, ОС/CPU/runtime/Rosetta и отсутствием гостевой сборки.

## Deliverables

- Единый финальный проверочный набор и инструкция.
- Реальные Windows/macOS отчёты portable-запуска, E2E, проверки подлинности и обновления.

## Implementation plan

Заполняется новым STEP PLAN только после завершения всей предшествующей разработки и упаковки. Прежние immutable planning-review reports не являются Ready-планом изменённого контракта.

## Evidence

<!-- VERIFICATION-EVIDENCE:START -->
- Verification run: 2026-10-29T11:07:22Z
- Status: MANUAL_REQUIRED
- Automated resumed: false
- Verification mode: full
- Incremental executed checks: 1
- Incremental reused checks: 0
- Targeted feedback reused: 0
- Incremental fallback reason: FULL_VERIFICATION_REQUESTED
- Git head: 32fb8e1aef7d7b78cb90b8ffce508da55f98aa52
- Worktree hash: sha256:54f6af6cfdfe5fbe20018208ca821197c14d4946a3c1ddd12d9b3da283c9a7de
- Verification contract basis: sha256:d110fc2f34c291244859146580eb3cf836c7d9aa687b15c87974b286553616fb
- Verification context basis: sha256:4ccbc74d7564906f309a589e40a61bbb023817475562a8fc5c9eba1963560194
- Subject git head: 32fb8e1aef7d7b78cb90b8ffce508da55f98aa52
- Subject worktree hash: sha256:18aa47d6a8cd929aff42a539976d6480a05a15ced19132238ccfe496d72f8ae1
- Subject content hash: sha256:cb5af90f438e5e598724c1f4b898e439268836a708817f0cb7a07d9f5d8c07c9

### Automated verification
- Command: python3 .harness/tools/validate.py --mode manual
  - Status: PASS
  - Exit code: 0
  - Duration ms: 5471
  - stdout sha256: 5bdad1a1ca405e520ab0848cf85781a5b2d581c58ed456755e88fb9b1c44fe2f
  - stderr sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  - stdout bytes: 67
  - stderr bytes: 0
  - Provenance: executed

### Product verification
- none

### Manual verification
- Check: На macOS x64 запустить готовый собранный на Linux артефакт и Electron E2E без сборки; сохранить darwin/x64, revision/build ID, хеш артефакта, результаты, итоговый файл и историю.
  - Status: PENDING
<!-- VERIFICATION-EVIDENCE:END -->

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.

### Историческая блокировка CI

2026-10-16: изменение `ci.yml` опубликовано в [PR #30](https://github.com/yarkovaleksei/yandex-music-downloader/pull/30), но GitHub не запустил Windows/macOS jobs: «recent account payments have failed or your spending limit needs to be increased» (run 38926508109). Владелец восстановит биллинг не раньше 2026-11-07; manual Verification (прогон CI) отложена до этого. По решению владельца STEP-029 подтверждает платформы ручным прогоном и от STEP-054 больше не зависит.

### Подготовка повторной x64 проверки 2026-10-29

Неизменённый Linux-built ZIP `music-downloader-ready-darwin-x64-9f44abe6.zip`, 307 758 376 байт, проверен: CRC PASS; SHA-256 `a51db9c902766933f21d435278a684ff4b7bc5eed52349b192415deb60ffb61a`; все 342 productionFiles совпадают с текущими dist/package. appArtifactHash `7b37871db2ad5c2e8a2acfb020b2e57a048b70d470ed6a7b38f70baff9221f39`, build ID `20261029T093752Z-9f44abe6`, builtOn linux/x64, guestBuildAllowed=false. Гостевой prepare только копирует dist/prebuilt-host.js, компилятора не вызывает.

Инструкция `docs/development.md#локальная-проверка-macos-x64-step-054` описывает офлайновый сценарий без авторизации и гостевой сборки, существующие переменные журналирования и сохранение raw PASS/FAIL с данными CPU/runtime. Архив и копия инструкции предоставляются в `/home/user/Документы/vbox_shared/Mac-x64-STEP-054/`. Это доставка прежнего проверенного по целостности набора, а не исправление прежнего отказа.

Исходный FAIL: `apps/desktop/e2e/evidence/native-20261029/darwin-x64/report.json`, SHA-256 проверяется по provenance; Electron не показал поле URL за 15 с. Причина не установлена. Нового x64 PASS в общей папке нет; свежий reports.zip содержит только arm64. Нативный x64 результат остаётся pending. Критическое H-001 сохраняется: локальная валидация подтверждает структуру артефактов, а native Acceptance требует отдельного реального отчёта.

### Диагностика прежнего x64 отказа по требованию владельца

2026-10-29: владелец отклонил повторную выдачу неизменённого падающего архива и потребовал установить причину до следующей проверки. Старый архив не является исправлением. Исходные x64 console.log/error-context.md подтверждают успешный electron.launch и отказ первого expect поля «Ссылка на музыку» через 15 с; сценарий ещё не дошёл до preview/download. В предоставленном отчёте нет renderer/pageerror, preload-error, did-fail-load, render-process-gone или main stderr, поэтому первопричина пустого окна не установлена.

Дополнительная read-only проверка: все 274 упакованных файла Electron, включая типы symlinks и executable flags, совпали с official electron-v45.0.0-darwin-x64.zip. Node/Electron/better-sqlite3/keyring имеют Mach-O64 CPU x86_64. Это исключает обнаруженную подмену архитектур и повреждение Electron при упаковке, но не доказывает работу на Mac. Локальный Linux startup probe с обработчиками main/renderer/load/preload errors открыл music-downloader://app/index.html и получил desktopApi; Linux результат не перенесён в macOS PASS.

Production-код, параметры безопасности, GPU flags и таймауты не менялись: конкретного подтверждённого дефекта в них пока нет. Нужен доступ к Mac для сбора причинного журнала; владельцу задан вопрос о SSH, ответ пока не получен. Новая сборка как исправленная не выдаётся.


### Перенос по решению владельца

2026-10-29: отдельные проверки x64 и новые Windows/macOS прогоны отложены до самого последнего STEP после разработки/упаковки. Прежние ошибки и диагностические сведения выше сохранены как история; новых прогонов у владельца/друга сейчас не требуется.

## Blocker / Failure reason

Ожидается завершение STEP-034/035/036 и другой добавленной разработки. Доступ к Mac/Windows до финального шага не требуется.
