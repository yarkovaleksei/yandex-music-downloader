---
schema: 1
id: ADR-013
status: accepted
date: 2026-10-11
deciders:
  - Codex (STEP RUN STEP-020)
supersedes: []
superseded_by: []
requirements:
  - REQ-016
steps:
  - STEP-020
---

# ADR-013 — Опциональный FFmpeg без обязательного bundling

## Context

REQ-016 требует загрузку и базовую валидацию без FFmpeg. [Spike STEP-020](../research/audio-metadata-spike.md) и [results.json](../research/audio-metadata-spike/results.json) доказали запись/независимое чтение MP3, AAC/FLAC-in-MP4, распознавание и duration в worker без доступа к FFmpeg/ffprobe. [ADR-012](ADR-012-audio-metadata-library.md) выбирает локальный WASM writer.

## Problem

Обязательный бинарник ради metadata или удобного duration probe сделал бы baseline зависимым от внешней установки и добавил размер, платформенные сборки и лицензионные условия packaging. Нужно определить роль binary без реализации будущих validator/doctor/installer.

## Decision

**FFmpeg и ffprobe опциональны. Baseline не поставляет bundled FFmpeg**, не скачивает его автоматически и не требует для тегирования, загрузки и базовой валидации. Если внешняя дополнительная диагностика предусмотрена owning STEP, используется явно обнаруженный системный инструмент; отсутствие не делает baseline ошибочным. Возможный будущий bundled вариант требует нового решения с конкретным artifact/license/size/platform evidence, не скрытого изменения packaging.

STEP-023 реализует обязательную базовую validation и определяет production duration tolerance средствами, работающими без этих бинарников. Spike доказал возможность независимого чтения через music-metadata 12.1.0; это не proof готовой обработки empty/truncated streams или загрузчика. STEP-025 сообщает FFmpeg `optional / not installed` при отсутствии; детальный поиск и запуск diagnostics принадлежат ему. STEP-035 реализует baseline packaging без FFmpeg, но с локальным WASM по ADR-012.

FFmpeg в исследовании используется для генерации полного синтетического corpus и дополнительного PCM decoding before/after. Это dev/research tooling, не runtime dependency. `--verify` повторяет baseline без install/fixture generation/FFmpeg; worker запрещает child_process для PATH и absolute-path discovery.

Транскодирование, новый postprocessing pipeline, binary download/cache и doctor runtime не входят в STEP-020.

## Alternatives considered

### Обязательный system FFmpeg/ffprobe

Удобный probe и decoding, но нарушает optional baseline REQ-016 и требует внешней установки даже там, где TagLib/reader справились. Отвергнуто.

### Bundled FFmpeg по умолчанию

Уменьшает зависимость optional diagnostics от окружения, но выбранный baseline не нуждается в нём. Точный размер невозможно честно назначить без конкретных сборок для Windows x64, macOS arm64/x64, Linux x64; сборка/подписание/обновления и notices добавляют обязанности. Не выбран.

### Полностью исключить любую дополнительную FFmpeg диагностику

Базовая работа возможна, но опциональный инструмент может быть полезен при исследовании сложных файлов. Само наличие бинарника не включает новую product возможность без owning STEP.

## Consequences

Baseline установка и metadata path не зависят от FFmpeg. В spike FFmpeg и ffprobe недоступны через все пути запуска, поэтому доказательство сильнее одного удаления PATH. Сравнение audio bytes и независимое duration чтение продолжают работать. Полная проверка decoder в этом исследовании остаётся дополнительной, использующей внешний tool во время подготовки.

Reader показывает AAC 2.023219954648526 s, ffprobe подготовленного контейнера — 2 s: различия priming/edit-list/precision требуют осознанного выбора tolerance STEP-023. Этот ADR не устанавливает число и не признаёт любое расхождение допустимым.

## Security implications

Нет запуска subprocess в baseline выбранного metadata path, нет скрытого скачивания или секретов в command arguments/evidence. PRN-001/002/003 сохранены. Future optional diagnostics должны соблюдать принятые границы данных и явный owner; здесь такой runtime не реализуется.

## Data / migration implications

Нет migrations, нового persisted state или изменений manifest/API. Optional dependency не меняет правила финализации ADR-004 и не снимает обязательную validation REQ-016.

## Compatibility / operational implications

Baseline spike проверен на Linux x64, Node 22.13.0/24.21.0. Целевые macOS/Windows не объявлены проверенными; platform/package proof остаётся owning STEP. Никакие binaries не добавлены в root dependencies или packages.

По [официальному FFmpeg licensing](https://ffmpeg.org/legal.html) базовая лицензия LGPL-2.1-or-later, включение GPL-компонентов меняет условия всей сборки; применимость условий требует конкретной конфигурации. Отказ от bundling избавляет текущую поставку от выбора/распространения такого artifact, не даёт общей юридической оценки всех будущих сборок. Лицензионные обязанности WASM writer остаются по ADR-012.

OQ-005 закрывается решением о baseline без bundling. Дополнительная packaging реализация, production doctor и полный validation proof не объявлены завершёнными. ADR дополняет прежние решения (`supersedes: []`).
