---
schema: 1
id: REQ-023
priority: high
source: brief
steps:
  - STEP-012
adrs: []
---

# REQ-023 — [FILESYSTEM] Структура каталогов для track, album, playlist

## Requirement

Выходная структура: одиночный трек — `<Music>/Artist - Track.ext`; альбом — `<Music>/Artist/Album (Year)/NN - Track.ext` + `cover.jpg`; playlist — `<Music>/Playlist Name/NN - Artist - Track.ext` + `cover.jpg` + `Playlist Name.m3u8`. Каталог назначения задаётся `--output`; в MVP доступны predefined templates без полноценного template language.

Уточнения (решение владельца продукта, 2026-10-09):

- Альбом из нескольких дисков остаётся в одном каталоге; имя файла получает префикс номера диска: `D-NN - Track.ext` (например, `1-01 - Intro.flac`, `2-01 - Outro.flac`). Однодисковый альбом сохраняет формат `NN - Track.ext`.
- Если исполнитель отсутствует (пустой список) — подставляется `Unknown Artist`; любое другое имя, ставшее пустым после санитизации, — `Unknown`.

## Rationale

Предсказуемая структура файлов (brief §19, §37).

## Acceptance

- Unit-тесты path generator для track/album/playlist формируют ожидаемые относительные пути для набора fixture-треков (включая отсутствие года, нескольких дисков и коллизию имён).
- При коллизии имён в одном каталоге результат детерминирован и не перезаписывает другой трек.
- `--output` изменяет корень; все итоговые пути лежат внутри него.
