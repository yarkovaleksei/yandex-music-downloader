# Open Questions

> Tracked deterministic projection/index. Canonical OQ находятся в configured sources.openQuestions.

| OQ | Статус | Вопрос | Affects |
|---|---|---|---|
| [OQ-001](open-questions/OQ-001-auth.md) | open | Какой auth flow стабильно поддерживается текущим API? | STEP-006, STEP-008 |
| [OQ-002](open-questions/OQ-002-codecs.md) | open | Какие codecs и containers реально возвращаются? | STEP-010, STEP-020, STEP-021, STEP-023 |
| [OQ-003](open-questions/OQ-003-range.md) | open | Доступен ли HTTP Range для CDN download? | STEP-010 |
| [OQ-004](open-questions/OQ-004-metadata-lib.md) | open | Какая metadata library наиболее надёжна на Node.js? | STEP-021 |
| [OQ-005](open-questions/OQ-005-ffmpeg.md) | open | Нужен ли bundled FFmpeg? | STEP-023, STEP-035 |
| [OQ-006](open-questions/OQ-006-sqlite-headless.md) | resolved | Нужен ли SQLite уже в headless MVP? | STEP-016 |
| [OQ-007](open-questions/OQ-007-schema-drift.md) | open | Как корректно определять API schema drift? | STEP-009, STEP-025 |
| [OQ-008](open-questions/OQ-008-signed-url.md) | open | Как обновляются signed audio URLs и какой у них TTL? | STEP-010 |
| [OQ-009](open-questions/OQ-009-rate-limits.md) | open | Какие rate limits наблюдаются у API/CDN? | STEP-014, STEP-017 |
| [OQ-010](open-questions/OQ-010-secure-storage.md) | open | Какие платформенные secure storage APIs использовать через Electron? | STEP-030 |
| [OQ-011](open-questions/OQ-011-quality-policy.md) | open | Правила для high/normal и fallback при недоступной настройке качества | STEP-013 |
| [OQ-012](open-questions/OQ-012-encrypted-variants.md) | resolved | Допустимы ли варианты, доступные только в зашифрованном транспорте или как preview? | STEP-010, STEP-013 |
| [OQ-013](open-questions/OQ-013-signing-prereq.md) | open | Сертификаты и аккаунты для подписи и notarization релизов | STEP-036 |

## Blocking semantics

status: open блокирует STEP по explicit affects; PROJECT используется как project-level blocker для INIT.
