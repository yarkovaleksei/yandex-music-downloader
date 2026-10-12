# Metadata

`createMetadataWriter()` записывает теги в `.part` через buffer API `taglib-wasm 1.5.3`. До mutation writer сверяет распознанный TagLib container с явным `mp3` или `mp4`; extension файла не участвует в выборе формата.

Mapping provider-neutral snapshot: `TITLE` берётся из `Track.title`, `ARTIST` — из имён артистов через `; `, `ALBUM` — из `Track.album.title`, а `TRACKNUMBER`, `DISCNUMBER`, `DATE` и `GENRE` — только из доступных полей `Track`. Shared `Track` не содержит `albumArtist` и полную дату, поэтому штатный application mapping их не выдумывает; package-local `albumArtist` доступен только для полного round-trip writer.

Artwork приходит готовыми bytes из resolving cache. Встроенная обложка и `cover.jpg` управляются независимо; sidecar пишется только для album/playlist. Writer держит input buffer, WASM state и output buffer одновременно, поэтому память пропорциональна размеру файла. Проверки выполнены на Linux; platform-specific proof остаётся отдельной задачей.
