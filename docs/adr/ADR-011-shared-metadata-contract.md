---
schema: 1
id: ADR-011
status: accepted
date: 2026-10-09
deciders:
  - Codex (STEP RUN STEP-038)
supersedes: []
superseded_by: []
requirements:
  - REQ-006
steps:
  - STEP-038
  - STEP-039
  - STEP-009
---

# ADR-011 — Жанр и доступность в shared metadata contract

## Context

[REQ-006](../requirements/REQ-006-provider-metadata.md) требует жанр, если он сообщён, и сохранение недоступного трека в album/playlist без прерывания коллекции. Текущий [`Track`](../../packages/shared/src/domain.ts) требует `id`, `title`, `artists`, но не содержит жанра или доступности. `Album.tracks` и `PlaylistTrack.track` используют этот тип; [`MockMusicProvider`](../../packages/testing/src/mock-provider.ts) клонирует `artists` как обязательный массив. Provider-only [STEP-009](../../planning/tasks/STEP-009.md) не может исправить shared contract скрытыми полями.

[ADR-002](ADR-002-music-provider-abstraction.md) сохраняет provider-neutral доменные типы и набор методов MusicProvider. [ADR-009](ADR-009-yandex-adapter-strategy.md) требует проверять availability до библиотечных моделей, сохранять недоступные записи и не принимать отсутствие подтверждения за разрешение. Его запрет самовольного изменения non-auth контракта выполняется отдельными owning STEP: решение здесь, код в STEP-039, raw mapping в STEP-009.

## Problem

Один boolean или отсутствие признака не различают явный отказ и отсутствие подтверждения. Сохранение обязательных title/artists для любой записи заставило бы либо выдумывать metadata недоступного трека, либо удалять его из коллекции. Нужны явная доступность и минимальная запись с ID без потери фактически известных данных.

## Decision

### Жанр

- `genre?: string` добавляется к metadata трека, `Album` и `AlbumReference`. Это provider-neutral строка источника, без собственного enum, перевода, списков или определения жанра по названию/артисту.
- Отсутствие жанра означает отсутствие поля. Оно не меняет доступность и не является schema drift само по себе. Некорректный тип присутствующего используемого raw поля проверяет STEP-009 по ADR-009.
- Для track жанр берётся из прямого metadata поля, если источник его сообщает; иначе допускается жанр выбранного источником album reference. При нескольких альбомах STEP-009 сохраняет жанр именно того album reference, который использует для Track.album, без смешивания жанров и произвольного поиска другого альбома. Если жанр не сообщён, значение не выдумывается.
- Основание scalar формы: установленный `@dvxch/yandex-music@0.3.0`, `src/models/album/album.ts`, объявляет `genre?: string`; track содержит album metadata. Это чтение модели, а не live-доказательство полноты полей API. Проверка и fixtures реальных ответов остаются STEP-009.

### Доступность и форма трека

В shared вводятся публичные provider-neutral типы:

```ts
export type TrackAvailability = 'available' | 'unavailable' | 'unknown';

export interface TrackMetadata {
  readonly id: string;
  readonly title?: string;
  readonly artists?: readonly Artist[];
  readonly album?: AlbumReference;
  readonly durationMs?: number;
  readonly trackNumber?: number;
  readonly discNumber?: number;
  readonly year?: number;
  readonly genre?: string;
  readonly artwork?: ArtworkRef;
}

export interface AvailableTrack extends TrackMetadata {
  readonly availability: 'available';
  readonly title: string;
  readonly artists: readonly Artist[];
}

export interface UnavailableTrack extends TrackMetadata {
  readonly availability: 'unavailable';
}

export interface UnknownTrack extends TrackMetadata {
  readonly availability: 'unknown';
}

export type Track = AvailableTrack | UnavailableTrack | UnknownTrack;
```

`TrackMetadata` — общая форма metadata, не самостоятельное разрешение доступа. Любой возвращаемый `Track` имеет непустой ID и обязательный discriminator. Для `available` сохраняются прежние обязательные title/artists. Для `unavailable` и `unknown` минимально достаточно ID и состояния: присутствующие корректные metadata сохраняются, отсутствующие title/artists не заменяются пустыми строками или искусственными артистами. `[]` для artists допускается только как фактически сообщённый пустой массив, а не подстановка за отсутствующее поле. Существующие optional поля и ArtworkRef сохраняют их доменную семантику; единственное добавление к Album/AlbumReference — optional genre.

| Наблюдение provider | Доменное состояние | Доступ к контенту |
| --- | --- | --- |
| Доступ явно подтверждён для текущего аккаунта | `available` | Metadata marker сам не заменяет проверку полных audio variants STEP-010 |
| Источник явно отказал в доступе | `unavailable` | Не допускается |
| Нет подтверждения, ответ неоднозначен или известен только track reference | `unknown` | Не допускается до явного подтверждения |

Состояние определяет provider по проверенным raw данным и контексту текущего аккаунта, не shared и не библиотечный optional boolean по умолчанию. Точный mapping vendor flags и account context принадлежит STEP-009/010 по ADR-009. Title, genre, artwork, наличие metadata и подписка сами по себе не доказывают разрешённость. Противоречивый/неизвестный доступ не повышается до `available`. Если raw ответ утверждает доступ, но нарушает критичный metadata contract, provider возвращает безопасную schema-ошибку по ADR-009 вместо выдуманного AvailableTrack.

### Отдельный запрос и коллекции

- Сигнатуры и набор методов MusicProvider сохраняются: `getTrack` возвращает `Promise<Track>`, `getAlbum` — `Promise<Album>`, `getPlaylist` — `Promise<Playlist>`.
- Для отдельного `getTrack` явный отказ источника даёт существующий `TrackUnavailableError`/`TRACK_UNAVAILABLE` по ADR-009. Новый marker не превращает этот отказ в successful standalone ответ. При отсутствии подтверждения без явного отказа допускается `UnknownTrack` с известным ID/metadata; это результат получения сведений, а не разрешение читать аудио.
- В `Album.tracks: readonly Track[]` и `PlaylistTrack.track: Track` остаются `AvailableTrack`, `UnavailableTrack` и `UnknownTrack`. Отказ одного track не вызывает исключение всего album/playlist и не фильтрует запись. Отсутствие/невалидная identity записи остаётся ошибкой критичной структуры по ADR-009; synthetic ID не создаётся.
- Album сохраняет порядок volumes и записей внутри volumes при их доменной развёртке. Playlist возвращает все N записей с позициями 1..N в порядке источника; повтор одного ID сохраняется как отдельная позиция. `unavailable` и `unknown` занимают своё место и не меняют нумерацию остальных записей.
- Частичный reference с ID и без подтверждения может остаться `unknown`. Если STEP-009 получает явное подтверждение/отказ при предусмотренном запросе metadata, он возвращает соответствующую форму. Этот ADR не вводит фоновые запросы, retries, cache, refresh или новые методы.

### Владельцы реализации и контрактная матрица

[STEP-039](../../planning/tasks/STEP-039.md) реализует эти типы/exports, optional genre в Album/AlbumReference, текущие shared test fixtures, offline MockMusicProvider и clone helpers. Consumers, которым нужны обязательные title/artists, должны сначала сузить union по discriminator; клонирование недоступной/unknown записи сохраняет absence полей. Mock standalone явный отказ сохраняет TrackUnavailableError, а mock коллекции содержат marker и остальные записи. Доступные старые mock fixtures получают явное `availability: 'available'`; отсутствие этого поля не трактуется как legacy-разрешение.

| Контрактный пример | Ожидаемый результат / owning proof |
| --- | --- |
| AvailableTrack с genre / без genre | Обязательные ID/title/artists, optional genre сохраняется / отсутствует; shared/mock tests STEP-039 |
| Недоступный track только с ID внутри album/playlist | `unavailable`, без выдуманных title/artists; соседние элементы сохранены, STEP-039 |
| Reference без подтверждения только с ID | `unknown`, не `available`; отсутствие genre/metadata не подменяется, STEP-039 |
| Недоступная/unknown запись с сообщёнными title/artists | Сообщённые значения сохраняются без превращения доступа в available, STEP-039 |
| Повтор ID и denied/unknown между доступными tracks | Все записи/порядок/playlist позиции 1..N сохранены, STEP-039 |
| Отдельный getTrack с явным отказом | TrackUnavailableError без successful UnavailableTrack, STEP-039 mock / STEP-009 raw mapping |
| Available discriminator без обязательных title/artists | Не соответствует типу; type tests STEP-039 и schema tests STEP-009 |
| Raw metadata с новыми неиспользуемыми полями | Не становится drift; vendor-schema proof STEP-009 по ADR-009 |

[STEP-009](../../planning/tasks/STEP-009.md) реализует raw schemas, доменное отображение и редактированные real fixtures/live proof с этим контрактом только после completed STEP-039. STEP-010 сохраняет собственную проверку provider-reported access и полноты варианта; marker не является bypass её gate.

## Alternatives considered

### Optional boolean на прежнем Track

Малый diff, но отсутствие boolean легко принять за доступ, а обязательные title/artists не представляют минимальный tombstone. Требует неявных conventions у каждого consumer; отвергнуто.

### Единый Track со всеми optional полями и обязательным состоянием

Представляет minimal record, но после проверки `available` title/artists всё ещё optional и доступная ветка теряет прежние гарантии. Отвергнуто в пользу discriminator union.

### Ошибка либо удаление любого недоступного трека из коллекции

Противоречит REQ-006, меняет порядок/позиции/повторы и не сохраняет identity; отвергнуто. Standalone явный отказ остаётся отдельным existing error contract.

### Vendor flags либо hidden subtype внутри provider

Не даёт portable typed contract общим потребителям и нарушает границы ADR-002/PRN-001; отвергнуто.

## Consequences

Получается явная типизированная metadata identity даже для неполных записей. Available ветка сохраняет прежние metadata гарантии, а коллекции не теряют элементы. Genre остаётся optional и не связывается с доступностью.

Изменение требует source migration существующих shared/mock fixtures и cloneTrack в STEP-039: прежний объект без discriminator перестаёт быть Track. Consumers должны сужать union вместо безусловного чтения обязательных artists/title. Нет обещания source compatibility для старых object literals.

## Security implications

PRN-001/002/003 сохраняются. Доменный статус не содержит account ID, токенов, cookies, raw availability flags, signed URL или SDK types. `unknown` и `unavailable` не дают разрешения на контент; metadata result не является авторизацией и может требовать повторной проверки provider при будущей операции получения audio.

## Data / migration implications

Изменяется metadata data shape, а не manifest schema, variantKey или storage. Сейчас затронутые executable consumers — shared тесты, offline fixtures/MockMusicProvider/clone helpers; metadata provider ещё не реализован. STEP-038 не изменяет ни один из этих файлов.

Ранее сериализованный объект без discriminator, если такой объект встречается у будущего consumer, не может автоматически считаться available. Восстановление требует явного актуального подтверждения provider либо unknown представления; этот ADR не задаёт и не реализует новую persisted migration/cache policy. Existing runtime migrations отсутствуют в scope STEP-038/039; формат manifest/cache и его эволюция остаются у owning STEP. До реализации future consumer обязан соблюдать принятый typed контракт, а не unchecked cast.

Rollback документационного решения до реализации оформляется новым решением. После изменения executable типов rollback требует согласованного возврата shared/mock consumers, а не reinterpretation неизвестного доступа как разрешения. Никакой runtime rollout/данных в STEP-038 не выполняется.

## Compatibility / operational implications

Это узкое дополнение metadata data contract к ADR-002/009, а не полная замена этих решений (`supersedes: []`). Набор методов/портов MusicProvider, provider isolation, auth policy, raw-before-model schemas, retries:0, stream contract и variantKey не меняются. Ограничение на самовольное изменение non-auth контракта внутри adapter снимается только для явной эволюции shared metadata формы в отдельном owning STEP-039 по этому accepted ADR; произвольные изменения остальных методов/типов не разрешаются. Старые Accepted Decision тексты не переписываются.

Начальная версия metadata runtime compatibility остаётся `PROVIDER_SCHEMA_VERSION=1.0.0`, вводимая STEP-009 по ADR-009: metadata provider ещё не выпускался. Этот документ не экспортирует version constant и не заявляет новую runtime-поддержку. Live account fixture, availability mapping и artwork/metadata proof принадлежат STEP-009; PR CI shared/mock proof STEP-039 остаётся offline.

STEP-009 остаётся blocked до completed STEP-039. Принятие ADR и документальная completion STEP-038 сами по себе не являются implementation proof жанра, availability или raw schemas.
