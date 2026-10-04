---
schema: 1
id: STEP-005
status: planned
type: research
priority: critical
phase: provider-spike
depends_on:
  - STEP-001
requirements:
  - REQ-001
  - REQ-038
adrs: []
architecture_refs:
  - "docs/architecture.md#external-dependencies-integrations"
  - "docs/architecture.md#security-boundaries"
risk_flags:
  - external-integration
  - security-sensitive
plan:
  status: not_planned
  revision: 0
  context_basis: null
  content_hash: null
  reviewed_report: null
  planned_at: null
---

# STEP-005 — Spike: проверка API Яндекс Музыки

## Goal

Получить воспроизводимое evidence о фактическом поведении API Яндекс Музыки через `@dvxch/yandex-music` и закрыть открытые вопросы OQ-001, OQ-002, OQ-003, OQ-008, OQ-009.

## Context

API неофициальный; auth flow, коды/контейнеры, поддержка Range, TTL signed URL и rate limits неизвестны и не могут быть приняты предположением (brief §52). Spike требует тестовый аккаунт/токен пользователя, который не попадает в репозиторий.

## Scope

- Проверить поддерживаемые auth flows (OAuth/Device Authorization) без передачи пароля через приложение.
- Получить track, album, playlist; получить доступные audio variants и зафиксировать реальные codec/container/bitrate/lossless для разных аккаунтов/треков, насколько доступно.
- Проверить поддержку HTTP Range и TTL signed URL, наблюдаемые rate limits API/CDN.
- Записать результаты (с редакцией секретов) в `docs/research/yandex-api-spike.md` и перевести OQ-001/002/003/008/009 в `resolved` либо `deferred` с объяснением.
- Проверить, отдаётся ли часть вариантов только в зашифрованном транспорте с ключом из API либо только как preview, и зафиксировать evidence для ADR STEP-006 (допустимость таких вариантов и констант provider-библиотеки уже решена владельцем продукта, OQ-012; preview не выбираются).
- На основании evidence о вариантах аудио дополнить OQ-011 вариантами правил ранжирования `high`/`normal` (политика недоступной настройки уже решена владельцем; решение о ранжировании остаётся за ним, OQ-011 не закрывается предположением).

## Mutation policy

### Allowed

- `docs/research/**`, одноразовые spike-скрипты только в `packages/providers/yandex-music/research/**` (не входят в production exports и сборку), `docs/open-questions/OQ-*.md` (Resolution).

### Conditional

- Добавление `@dvxch/yandex-music` допустимо только в workspace `packages/providers/yandex-music`; spike использует его исключительно из этого package boundary.

### Forbidden

- Production-код в `packages/**` и `apps/**`, сохранение токенов/cookies/signed URL в репозитории, обход ограничений аккаунта, работа с offline-cache официального клиента, самостоятельное извлечение ключей из официального клиента (константы provider-библиотеки и ключи, выданные API, допустимы по решению владельца, OQ-012).
- Реализация future/unrelated STEP «заодно».

## Out of scope

- Реализация provider adapter, скачивание аудио как продукт, UI.

## Acceptance criteria

- `docs/research/yandex-api-spike.md` содержит воспроизводимые шаги и фактический (отредактированный) вывод для каждого исследованного вопроса; где вывод не сохранён дословно — указаны команда, код завершения и наблюдаемые факты.
- OQ-001, OQ-002 и OQ-008 имеют Resolution на основе evidence (статус `deferred` недопустим, так как от них зависят STEP-008, STEP-010, STEP-017); OQ-003 и OQ-009 имеют Resolution либо `deferred` с обоснованием.
- Evidence о транспорте вариантов (зашифрованный/preview) и об используемых provider-библиотекой константах зафиксировано для ADR STEP-006 (решение о допустимости принято владельцем, OQ-012).
- OQ-011 содержит evidence-based варианты правил ранжирования `high`/`normal` для решения владельца продукта.
- В репозитории нет токенов, cookies и полных signed URL.
- Зафиксирован список неподдерживаемых/неподтверждённых сценариев для ADR STEP-006.

## Verification

- command: `python3 .harness/tools/validate.py --mode manual`
- manual: Выполнить spike на реальном аккаунте пользователя и приложить отредактированный вывод; подтвердить `git grep` по шаблонам токенов без совпадений.

## Deliverables

- Отчёт spike, обновлённые OQ.

## Implementation plan

Заполняется командой `STEP PLAN STEP-005`. Пока semantic planning-review не дал PASS для текущих context basis + content hash, `plan.status` не может быть `ready`.

## Evidence

Generated verification block записывает deterministic runner. Дополнительные semantic observations можно хранить вне generated markers.

## Blocker / Failure reason

—
