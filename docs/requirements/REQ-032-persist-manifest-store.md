---
schema: 1
id: REQ-032
priority: high
source: brief
steps:
  - STEP-016
  - STEP-018
  - STEP-042
  - STEP-043
adrs:
  - ADR-004
---

# REQ-032 — [PERSISTENCE] Файловое хранилище состояния в headless MVP

## Requirement

Состояние заданий в headless MVP хранится в файловых manifest за интерфейсом `ManifestStore`; реализация хранилища заменяема (SQLite в desktop) без изменения семантики manifest. SQLite не входит в headless MVP (OQ-006).

## Rationale

Ускоряет проверку концепции без закрытия пути к SQLite (brief §4.6).

## Acceptance

- Core зависит только от интерфейса `ManifestStore`, а файловая реализация проходит общий contract-набор тестов хранилища.
- Хранилище обеспечивает атомарную запись и безопасное параллельное обновление разных job.
- Каталог состояния настраивается и по умолчанию выбирается по правилам ОС, определённым в STEP-016.
