---
schema: 1
id: OQ-010
status: resolved
created_at: 2026-10-04T17:57:04Z
resolved_at: 2026-10-16T00:00:00Z
---

# OQ-010 — Какие платформенные secure storage APIs использовать через Electron?

## Context

Платформенные хранилища: Windows Credential Manager, macOS Keychain, Linux Secret Service/Keyring; нужен конкретный механизм и поведение при недоступности.

## Decision needed

Выбрать реализацию secure storage для desktop и политику при недоступном хранилище.

## Resolution

Решено [ADR-015](../architecture-decisions/ADR-015-electron-security-model.md). Основания: [ADR-010](../architecture-decisions/ADR-010-cli-auth-and-secure-storage.md), native canary авторизации и документация Electron `safeStorage`.

- Desktop credential store работает в Electron `utilityProcess` (application host) через `@napi-rs/keyring`:
  - Windows — Credential Manager текущего пользователя;
  - macOS — Login Keychain;
  - Linux — Secret Service с защищённой default-коллекцией.
- Namespace `music-downloader.desktop.yandex-music`, отдельно от CLI.
- При недоступном или заблокированном хранилище — явная ошибка с инструкцией. Plaintext, `safeStorage`/`basic_text` и файловый fallback запрещены.
- Связь Keychain с подписью приложения на macOS рассматривается при проектировании упаковки; см. OQ-013.
- Совместимость с Electron требует отдельной платформенной проверки.
