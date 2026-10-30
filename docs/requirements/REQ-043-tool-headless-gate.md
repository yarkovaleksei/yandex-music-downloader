---
schema: 1
id: REQ-043
priority: critical
adrs: []
---

# REQ-043 — [TOOLING] Критерий готовности headless MVP и перехода к UI

## Requirement

Разработка desktop UI начинается только после выполнения критерия перехода: стабильны track/album/playlist download, auth, quality resolution, retry, resume, metadata; provider abstraction покрыта тестами; doctor обнаруживает API incompatibility; на каждой из ОС Linux, macOS и Windows выполнено не менее трёх последовательных успешных реальных end-to-end прогонов для каждого сценария track, album и playlist (включая прерывание и `resume`), без отказов из-за дефектов приложения (отказы сети и аккаунта фиксируются отдельно).

## Rationale

Сначала качественный headless core, затем UI.

## Acceptance

- Приёмка headless MVP подтверждает каждый пункт критерия, включая прогоны на трёх ОС.
- Разработка desktop начинается после приёмки headless MVP.
- Любое невыполнение пункта критерия фиксируется как blocker/OQ, а не игнорируется.
