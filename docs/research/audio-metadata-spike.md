# STEP-020 — Сравнение записи аудиометаданных

## Результат

Выбран **taglib-wasm 1.5.3** (встроенный TagLib 2.3.1), buffer API с Emscripten WASM. Независимое чтение — **music-metadata 12.1.0**. MP3, AAC-in-MP4 и FLAC-in-MP4 прошли обязательные критерии; node-id3 0.2.9 прошёл MP3, но не имеет MP4 writer. FFmpeg/ffprobe нужны только для подготовки синтетических образцов и дополнительной проверки декодирования, не для baseline записи/чтения.

Решения: [ADR-012](../adr/ADR-012-audio-metadata-library.md), [ADR-013](../adr/ADR-013-optional-ffmpeg.md). Это исследовательское доказательство, а не готовый MetadataWriter/validator/doctor.

## Происхождение и границы

[OQ-002](../open-questions/OQ-002-codecs.md) подтверждает MP3 сигнатурами префиксов STEP-005; AAC/FLAC-in-MP4 там известны только из API, транспорт encraw не проверен. Префикс до 1 MiB не используется как полный файл.

Spike создаёт полные локальные файлы из синусоиды 440 Hz, 2 s, 44100 Hz. Авторский синтетический corpus не содержит provider-контента и не требует аккаунта, URL или ключей. Подготовка через системный FFmpeg 6.1.1-3ubuntu5+esm13 сохраняет первоначальную красную PNG-обложку и ALBUM «Исходный альбом». Запись заменяет её синей PNG с независимым сравнением точных байтов.

| Образец | Контейнер / codec по ffprobe | Полный размер | SHA-256 |
| --- | --- | ---: | --- |
| mp3 | MP3 / mp3 | 49755 | `f5483c1347ab0500f36985bf9b9c068332ed5de22f31e17c5337a9cf5b11216a` |
| aac-mp4 | MP4 / aac | 32432 | `a2f6034288da4107bd90b5b55c12ae6312d5f1831316c85762ee3fc5b0e8526c` |
| flac-mp4 | MP4 / flac | 25244 | `8690feaf44ad6b2d6ffc916bbc208b79b6fde487d7251cc13c18852f8056b803` |

Полные generation arguments, фактическая версия FFmpeg, измеренные duration, bytes/hashes и codec находятся в [results.json](audio-metadata-spike/results.json). Исходные файлы остаются в `.harness/local/audio-metadata-spike/corpus`, исключённом из Git. Другой encoder/build может дать иной hash: новый corpus необходимо явно записать через `--prepare`, проверить diff evidence и повторить review. Сам `--verify` evidence не переписывает.

Локальный успех MP4 доказывает способность writer работать с этими полными файлами. Поддержка доступного аккаунту Yandex transport, распаковка encraw и реальные полные MP4 samples остаются STEP-010; не объявлены реализованными. Ogg/Opus/raw FLAC и произвольный `AudioContainer: string` не расширяют эту матрицу.

## Кандидаты и первичные источники

| Подход | Версия | Node / ESM | Зависимости и лицензия | Наблюдение |
| --- | --- | --- | --- | --- |
| taglib-wasm | 1.5.3 | engines >=22.6; ESM, проверены 22.13.0 и 24.21.0 | JS MIT; поставляемый WASM LGPL-2.1-or-later; без native addon и subprocess | Все три сочетания прошли |
| node-id3 | 0.2.9 | CommonJS через ESM default import; engines не объявлены | MIT, JS, без native addon/binary | MP3 прошёл; MP4 не поддерживается |
| music-metadata, независимый reader | 12.1.0 | engines >=22, ESM | MIT, JS; без FFmpeg/ffprobe | Прочитал теги, artwork, codec и duration всех samples |

Точные npm tarball integrity и transitive версии закреплены в [dependencies.lock.json](audio-metadata-spike/dependencies.lock.json); установка `npm ci --ignore-scripts` изолирована. Вся исследовательская установка заняла 4460631 bytes файлов (включает обоих writers, reader и transitives; это не размер будущего дистрибутива). package.json/yarn.lock проекта и packages не менялись.

Актуальный npm `taglib-wasm@2.4.0` требует Node >=24 и не соответствует минимальному runtime проекта; 1.5.3 требует >=22.6 и фактически проверена на 22.13.0. Не использовать плавающий latest без отдельной проверки compatibility. Эксперимент не обещает производительность или пригодность buffer API для произвольно больших файлов.

Первичные источники, проверенные 2026-10-11:

- [TagLib-Wasm](https://github.com/CharlesWiltgen/TagLib-Wasm), [buffer API](https://charleswiltgen.github.io/TagLib-Wasm/guide/quick-start.html); фактические API и License сверены также с установленным npm archive 1.5.3 (`dist/src/taglib/*.d.ts`, `README.md`, раздел License).
- [node-id3 API](https://github.com/Zazama/node-id3) и установленный 0.2.9.
- [music-metadata API](https://github.com/Borewit/music-metadata) и установленный 12.1.0.
- [TagLib](https://taglib.org/) — лицензирование исходной библиотеки; условия поставляемого WASM дополнительно определены README выбранного npm package.
- [FFmpeg licensing](https://ffmpeg.org/legal.html) — license зависит от конфигурации сборки; bundled бинарник в данном решении отсутствует.

## Матрица обязательных критериев

Каждый PASS ниже означает две отдельные расходные копии: GENRE присутствует / отсутствует. Reader не использует TagLib или node-id3 для чтения metadata/artwork. `node-id3.removeTagsFromBuffer` используется только при выделении MP3 audio bytes, а полное декодирование отдельно выполнено FFmpeg.

| Writer / файл | TITLE/ARTIST/ALBUM/ALBUMARTIST/TRACK/DISC/YEAR | Unicode, два артиста | GENRE present/absent | Обложка SHA-256 | `.part`, explicit container | Аудиобайты / PCM / duration | Без FFmpeg |
| --- | --- | --- | --- | --- | --- | --- | --- |
| taglib-wasm / MP3 | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| taglib-wasm / AAC-MP4 | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| taglib-wasm / FLAC-MP4 | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| node-id3 / MP3 | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| node-id3 / AAC-MP4 | UNSUPPORTED | — | — | — | — | — | — |
| node-id3 / FLAC-MP4 | UNSUPPORTED | — | — | — | — | — | — |

Ожидаемые поля: TITLE «Песня — Ёж и море», ARTIST «Первый артист; Второй артист», ALBUM «Исходный альбом», ALBUMARTIST «Автор альбома», TRACK=3, DISC=2, YEAR=2024, GENRE «Электроника» либо отсутствие. Playlist «Название плейлиста» не попадает в ALBUM. Множество артистов сохраняется в одной строке в исходном порядке с `; `; это не обещание одинакового разбиения списка всеми плеерами.

YEAR — выбранная разрешённая REQ-025 форма DATE/YEAR. Существующий shared Track имеет year, но не albumArtist и полную дату. STEP-021 обязан явно определить provider-neutral mapping album artist из исходных metadata и политику при отсутствии сведений; spike использует отдельный локальный DTO, не hidden subtype и не добавление shared API. Название playlist не служит fallback альбома. Полный DATE и многозначные ARTIST как отдельные native frames не проверены и не обещаны.

## Explicit container и способ записи

У TagLib-Wasm 1.5.3 нет параметра `force-format`. Доказанный adapter принимает `(partPath, container, metadata, artworkBytes)`, допускает только mp3/mp4, читает `.part` как Buffer, `TagLib.open(buffer)` распознаёт bytes, а adapter **до изменений** сверяет `getFormat()` с explicit container. Передача mp4 для MP3 отклонена, исходные bytes сохранены. Суффикс реального `.part` не участвует в выборе. Reader получает MIME из того же explicit container, а codec/container независимо сверяются с подготовленным corpus.

Это явный проверяемый контракт caller, а не заявление о несуществующем force-format API библиотеки. Spike adapter находится только в [run.mjs](audio-metadata-spike/run.mjs); реализация production adapter принадлежит STEP-021.

Buffer API вычисляет новую версию файла в WASM memory: `save()`, `getFileBuffer()`, затем awaited `writeFile` в ту же расходную `.part`; `dispose()` выполнен в finally. Нет скрытого дискового temporary path TagLib в выбранном режиме; физическая запись перезаписывает `.part`, полной crash-атомарности не обещает. Потребление памяти включает исходный файл, WASM и output; bounded memory/отмена/ошибки fs остаются обязательствами MetadataWriter и download lifecycle, а не решаются в spike. Финальная публикация через atomic rename остаётся после processing/validation по ADR-004. MP3 writer также добавляет ID3v1, поэтому при выделении аудио удаляются ID3v2 и конечный ID3v1, не аудиофреймы.

## Отсутствие внешних бинарников и duration

Worker запускается отдельным Node process: `--permission --allow-fs-read=* --allow-fs-write=<spike-root>`, без `--allow-child-process`, с `PATH=''` и только `AUDIO_SPIKE_ROOT` в env. Пробы `ffmpeg`, `ffprobe`, `/usr/bin/ffmpeg`, `/usr/bin/ffprobe` отклонены с `ERR_ACCESS_DENIED`; абсолютный путь и любые discovery variables не обходят запрет. Использован Emscripten backend, без WASI и внешних оптимизаторов. Эти flags ограничивают именно эксперимент, не внедряют новую product sandbox policy.

После записи независимый reader распознал MP3/MPEG Layer 3, MP4/AAC и MP4/FLAC. Duration before/after reader совпала: MP3 2.0375510204081633 s, AAC 2.023219954648526 s, FLAC 2 s. ffprobe для подготовленных MP4 показывает 2 s: AAC priming/edit-list и precision разных readers нельзя превратить в production tolerance; её выбирает STEP-023. Хэши MP3 frame bytes и MP4 mdat before/after равны; полное декодирование каждой PASS-копии дало одинаковый PCM before/after при `--prepare`.

Без FFmpeg повторены запись, чтение всех тегов/обложки, базовое распознавание и duration, сравнение audio bytes и отказ неверного container. Эти проверки не доказывают пока отсутствующие production download, doctor, обработку повреждённого потока или packaging.

## Воспроизведение и captured evidence

Из корня репозитория, Node >=22.13 <25. Подготовка дополнительно требует npm, FFmpeg/ffprobe с libmp3lame, AAC и экспериментальным FLAC-in-MP4 muxing. Research dependencies и fixtures остаются под `.harness/local/**`; для другого каталога можно задать `AUDIO_SPIKE_ROOT`.

```sh
node docs/research/audio-metadata-spike/run.mjs --prepare
node docs/research/audio-metadata-spike/run.mjs --verify
```

Подготовка: exit 0; сохранены provenance, восемь round-trips, восемь PCM decoding checks в results.json. Проверка: exit 0 на Node 24.21.0 и Node 22.13.0, Linux x64. Буквальная последняя строка обоих запусков:

```text
PASS: 8 round-trip; MP3/AAC-MP4/FLAC-MP4; FFmpeg/ffprobe недоступны worker
```

`--verify` не выполняет install, fixture generation или PCM decode, сверяет заново полученную матрицу с сохранённой и hashes с provenance. Это даёт воспроизводимый baseline без обязательного FFmpeg. macOS/Windows, большие музыкальные файлы, специфичные чужие MP4 atoms и transport provider не проверены; они не имеют PASS.

## Handoff и инварианты

- STEP-021: MetadataWriter и explicit-container buffer adapter, проверка формата до записи, mapping исходного album/album artist/YEAR, optional fields и artwork bytes; без сети в processing.
- STEP-023: real validation/truncation/error coverage и duration tolerance, без обязательного FFmpeg/ffprobe; кандидат baseline reader доказан, production ещё отсутствует.
- STEP-025: doctor сообщает FFmpeg `optional / not installed`; фактическая команда/поиск бинарника принадлежат этому STEP.
- STEP-035: baseline без bundled FFmpeg; packaging local WASM, third-party notices/исходники/relinkability по выбранной лицензии и проверка целевых ОС. Размер research node_modules не является размером установщика.

PRN-001/002/003 соблюдены: spike не использует vendor SDK, сеть провайдера, credentials или signed URL; никакого обхода ограничений и получения недоступного контента. ADR-004/011 и остальные Accepted ADR не переписаны. Root dependency graph и production packages не изменены.
