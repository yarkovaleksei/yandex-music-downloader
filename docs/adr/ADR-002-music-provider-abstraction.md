---
schema: 1
id: ADR-002
status: accepted
date: 2026-10-04
deciders:
  - yarkovaleksei
supersedes: []
superseded_by: []
requirements:
  - REQ-002
  - REQ-004
  - REQ-005
  - REQ-006
  - REQ-007
  - REQ-008
  - REQ-009
  - REQ-010
  - REQ-015
  - REQ-034
steps:
  - STEP-003
  - STEP-007
  - STEP-008
  - STEP-009
  - STEP-010
  - STEP-011
  - STEP-025
  - STEP-038
  - STEP-039
  - STEP-048
---

# ADR-002 — Абстракция MusicProvider и изоляция Yandex adapter

## Context

Используемый API Яндекс Музыки неофициальный и потенциально нестабильный (brief §1, §29, §45). Первоначальный adapter может использовать `@dvxch/yandex-music`, но эта зависимость считается деталью реализации.

## Problem

Нужен устойчивый контракт между core и источником музыки, который изолирует Yandex-специфику, нормализует ошибки, делает дрейф API диагностируемым и содержит всё, что core нужно для прогресса, валидации, resume и обложек без обращения к CDN в обход provider.

## Decision

1. Core, application layer и клиенты зависят только от интерфейса `MusicProvider` и доменных типов из `packages/shared`. Контракт включает (brief §9 с уточнениями этого ADR):
   - `authenticate`, `getAccount`, `logout`; взаимодействие с пользователем при авторизации (device code, redirect, ввод токена) выражается портом взаимодействия, а хранение токена — портом `CredentialStore`; детали уточняются ADR STEP-006 и могут менять только auth-часть контракта;
   - `resolveUrl`, `getTrack`, `getAlbum`, `getPlaylist`;
   - `getAudioVariants(trackId)` → список `AudioVariant`, каждый с обязательным `container` и непрозрачным стабильным ключом `key`, который достаточен, чтобы открыть тот же вариант повторно (в том числе после перезапуска) и проверить его идентичность для Range; `key` не содержит ключей расшифровки и других секретов;
   - `openAudioStream(trackId, variantKey, { signal, offset? })` → `AudioStream { stream, contentLength?, container, acceptsRanges, startOffset }`, где `startOffset` — фактическое смещение, с которого начался поток;
   - `fetchArtwork(artworkRef, size)` → байты и MIME-тип; `ArtworkRef` — непрозрачная ссылка из доменных типов. Клиенты и core не обращаются к CDN обложек напрямую.
2. `MediaReference` и manifest содержат идентификатор provider (`provider: "yandex-music"`), чтобы добавление других provider-ов не меняло форматы.
3. Yandex-специфичный код и пакет `@dvxch/yandex-music` разрешены только внутри `packages/providers/yandex-music`; публичный API пакета не экспортирует типы сторонней библиотеки. Граница защищена ESLint boundary rule.
4. Provider сообщает только реально доступные текущему аккаунту `AudioVariant`; core не предполагает связь подписки/качества с кодеком. Preview-варианты не выбираются никогда. Варианты в зашифрованном транспорте допустимы, если ключ выдаёт API текущему авторизованному аккаунту; использование публичных OAuth client credentials официального приложения и встроенных в provider-библиотеку констант подписи допустимо по решению владельца продукта (OQ-012, PRN-003); адаптер расшифровывает поток внутри provider package, наружу отдаётся уже расшифрованный `ReadableStream`. Ключ расшифровки не покидает provider: он не входит в `variantKey`, manifest, cache, логи, ошибки и события и запрашивается заново при каждом открытии потока.
5. Adapter валидирует критичные ответы runtime-схемами и имеет `PROVIDER_SCHEMA_VERSION`. Ошибки нормализуются в коды `NETWORK_ERROR`, `AUTH_ERROR`, `API_CHANGED`, `SERVICE_UNAVAILABLE`, `PROVIDER_RESPONSE_INVALID`, а также `STREAM_EXPIRED` (истёкшая или недействительная подпись ссылки на поток — повторяемая заново открытием потока, в отличие от `AUTH_ERROR`/403 авторизации) и доменные ошибки; библиотечные исключения наружу не выходят.
6. Provider и `@dvxch/yandex-music` не выполняют скрытых повторов запросов: бюджет повторов принадлежит core (retry policy). Единственное допустимое исключение — однократное обновление токена с повтором запроса внутри provider, если его явно разрешит ADR авторизации (STEP-006); оно не расходует бюджет core и не скрывает прочих ошибок.
7. Contract-тесты реального API — отдельный suite (`npm run test:provider`), не входящий в offline unit/integration набор и PR CI.
8. TTL signed URL и поддержка Range являются runtime-возможностями, сообщаемыми `AudioStream`/`AudioVariant` по evidence STEP-005 (OQ-003, OQ-008), а не изменением контракта. Детали стратегии адаптера (использование библиотеки, схемы, обнаружение drift) уточняются ADR STEP-006 и не должны противоречить этому решению.
9. Архитектура не должна искусственно препятствовать добавлению других provider-ов (brief §54).

## Alternatives considered

### Прямое использование `@dvxch/yandex-music` в core

Быстрее, но делает core зависимым от неофициального API и мешает тестированию; отвергнуто.

### Собственный HTTP-клиент без сторонней библиотеки

Снижает зависимость, но увеличивает объём работы до подтверждения жизнеспособности; решение оставлено для ADR STEP-006 по evidence.

### Контракт `openAudioStream` возвращает только `ReadableStream`

Не даёт размер, контейнер и Range-возможности, без которых невозможны прогресс, проверка завершённости и Range-resume; отвергнуто.

## Consequences

Положительные: изоляция нестабильного API, тестируемость, диагностируемый drift, достаточный контракт для прогресса, resume и обложек. Отрицательные: слой маппинга и runtime-схем увеличивает объём кода; изменение контракта требует ADR.

## Security implications

Токены и signed URL обрабатываются только внутри provider и не покидают его в логи/события; редакция секретов обязательна (PRN-002); токен не передаётся через application API.

## Data / migration implications

manifest хранит `variantKey` и выбранный variant, но не signed URL.

## Compatibility / operational implications

`PROVIDER_SCHEMA_VERSION` отражает совместимость adapter с форматом API; несовместимость показывается пользователю понятным сообщением вместо stack trace.
