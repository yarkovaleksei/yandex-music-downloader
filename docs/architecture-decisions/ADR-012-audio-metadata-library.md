---
schema: 1
id: ADR-012
status: accepted
date: 2026-10-11
deciders:
  - Codex
supersedes: []
superseded_by: []
requirements:
  - REQ-025
  - REQ-016
---

# ADR-012 — Библиотека записи аудиометаданных

## Context

REQ-025 требует Unicode, исходный album, обязательные теги и отсутствие пустых optional заглушек; REQ-016 сохраняет baseline без FFmpeg. По OQ-002 MP3 имеет bytes evidence provider, AAC/FLAC-in-MP4 известны из API. Выбор основан на сравнении двух writer на полных локальных файлах с независимым чтением тегов, обложек и проверкой PCM. Локальные samples не доказывают Yandex transport.

## Problem

Нужен writer для MP3 и MP4, который сохраняет аудиопоток, пишет точную обложку и работает с `.part`, не требуя FFmpeg или формата из расширения. Зависимость должна соответствовать Node >=22.13 <25 и границам shared/provider/processing.

## Decision

Выбрать **taglib-wasm 1.5.3, Emscripten buffer API** (TagLib 2.3.1). Последний 2.4.0 требует Node >=24; обновление выбранной версии требует повторного compatibility spike. Доказанные комбинации: MP3/MPEG Layer 3, MP4/AAC и MP4/FLAC. Иные контейнеры/codecs этим ADR не вводятся. Независимый reader **music-metadata 12.1.0** доказан для tag/artwork verification и является кандидатом для базовой валидации аудио, не готовой production validation.

MetadataWriter получает явный container отдельно от `.part` path. У библиотеки нет `force-format`: adapter читает bytes, открывает Buffer и до mutation сверяет `getFormat()` с разрешённым explicit mp3/mp4. Несовпадение отклоняется; библиотека не получает расширение `.part` для определения формата. Этот путь и отказ неверного container проверены executable spike. Способ записи: `setProperties`, `setPictures`, `save`, `getFileBuffer`, awaited запись в `.part`, `dispose` в finally. Формат сохраняется, транскодирование отсутствует.

Mapping обязательных полей: TITLE, ARTIST, ALBUM, ALBUMARTIST, TRACKNUMBER, DISCNUMBER, DATE с YEAR источника, GENRE при наличии. Артисты в исходном порядке соединяются `; `; reader возвращает точную строку, отдельное мультизначное разбиение плеерами не обещано. ALBUM — исходный album трека, не playlist. Artwork — заранее полученные через provider bytes; processing не делает network requests. Отсутствующее optional поле не заменяется пустой строкой и не выдумывается.

Shared Track по ADR-011 не содержит albumArtist/полную дату: реализация MetadataWriter должна явно описать доступный provider-neutral mapping, отсутствие сведений и нужный owner изменения shared, если такое изменение потребуется. Spike DTO не является расширением shared API. Выбор YEAR удовлетворяет DATE/YEAR REQ-025; неподтверждённый полный DATE не обещается.

Реализация MetadataWriter определяет ошибки, отмену и управление памятью; модуль validation определяет проверки и допуски. Работа продолжается в `.part` до атомарной финализации ADR-004. Этот ADR не меняет state machine, manifest, transport или Accepted ADR-011.

## Alternatives considered

### node-id3 0.2.9

Чистый JS/MIT, ESM использует CommonJS default import; MP3 прошёл все поля, обложку и Unicode в обеих optional ветках. MP4 writer отсутствует: не удовлетворяет всей матрице. Два разных production writers увеличили бы поддерживаемую поверхность без доказанного преимущества.

### FFmpeg как writer

Способен работать с аудиоконтейнерами, но обязательный внешний binary противоречит baseline REQ-016. Использован только для подготовки/диагностического декодирования; как полноценный writer в матрице не проверялся и не имеет PASS. Отдельное решение — ADR-013.

### Native TagLib binding / самостоятельные ID3 и MP4 atoms

Не проверялись в spike. Native binding добавляет сборку/ABI и платформенные обязанности; собственный muxer добавляет большую область форматов. Не выбираются вместо уже прошедшего WASM пути. Обещания превосходства по скорости или безопасности отсутствуют.

## Consequences

Один writer покрыл три комбинации без FFmpeg; установка не требует native toolchain. Полный Buffer + WASM + output требуют памяти пропорционально размеру файла. Spike проверяет короткие полные файлы, не performance больших музыкальных файлов. Реализация MetadataWriter должна учитывать стоимость памяти и условия отмены и завершения операций.

В выбранном режиме TagLib изменяет память, adapter перезаписывает `.part`; операция не crash-атомарна, скрытого дискового temporary path у TagLib нет. Awaited завершение и finally освобождают ресурс в успешных/обычных ошибочных операциях, но не доказывают восстановление при kill/power loss. Это не новая recovery-механика; ADR-004 остаётся применимым.

## Security implications

REQ-005, REQ-039, REQ-038 сохраняются. Writer не получает vendor DTO/URL/токены и не выполняет сеть; artwork уже provider-neutral bytes. Локальный WASM не требует subprocess. Способ безопасного отображения production errors принадлежит записи аудиометаданных; arbitrary untrusted inputs не объявляются безопасными одним успешным corpus.

## Data / migration implications

Нет schema/manifest migrations и изменений public shared API. Тегирование сохраняет audio bytes; все compulsory fields и обложка прочитаны независимым reader. Возможная future эволюция shared metadata требует отдельного owning решения, не hidden provider subtype.

## Compatibility / operational implications

На Linux x64 реально проверены Node 22.13.0 и 24.21.0. macOS arm64/x64 и Windows x64 ещё требуют платформенной проверки writer и дистрибутивов; WASM portability не считается выполненной проверкой. Root package.json/yarn.lock пока не меняются.

JS wrapper имеет MIT, поставляемый WASM — LGPL-2.1-or-later по README npm archive 1.5.3, несмотря на `license: MIT` registry. сборщик дистрибутивов должен сохранить notices, соответствующий source и возможность relink/замены WASM согласно его условиям; точное решение упаковки и проверка поставляемого artifact принадлежат packaging. Не считать весь dependency одним MIT. Research install с обоими writers и reader занял 4460631 bytes, не размер production package.

Совместимость с реальными provider MP4 подтверждается проверкой аудиотранспорта после разрешённого transport proof; локальный AAC/FLAC MP4 PASS его не заменяет. ADR дополняет существующие решения (`supersedes: []`). OQ-004 закрывается этим выбором и evidence.
