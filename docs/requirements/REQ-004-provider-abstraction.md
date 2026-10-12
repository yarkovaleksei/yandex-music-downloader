---
schema: 1
id: REQ-004
priority: critical
source: brief
steps:
  - STEP-003
  - STEP-048
adrs:
  - ADR-001
  - ADR-002
---

# REQ-004 — [PROVIDER] Абстракция MusicProvider

## Requirement

Downloader core и клиенты не знают о конкретном provider и зависят только от интерфейса `MusicProvider` и доменных типов; application layer подключает конкретный provider лишь в composition root. Контракт включает authenticate, getAccount, logout, resolveUrl, getTrack, getAlbum, getPlaylist, getAudioVariants (варианты с непрозрачным ключом), openAudioStream (с AbortSignal, смещением и описанием потока: размер, контейнер, поддержка Range) и fetchArtwork; он меняется только через ADR.

## Rationale

Неофициальный API нестабилен; core должен тестироваться с mock provider и не быть привязанным к Яндекс Музыке (brief §9, §56).

## Acceptance

- Весь код `packages/core/**` компилируется и проходит тесты без provider package и `@dvxch/yandex-music` в зависимостях; `packages/application/**` не импортирует `@dvxch/yandex-music` напрямую и тестируется с mock provider.
- В `packages/testing` есть mock provider, реализующий контракт, и он используется в тестах core.
- Тип `MusicProvider` экспортируется из одного места (shared package) и не содержит типов сторонней библиотеки.
- Контракт позволяет получить размер, контейнер и признак поддержки Range потока и скачать обложку без обращения клиентов или core к CDN напрямую (проверяется mock provider).
