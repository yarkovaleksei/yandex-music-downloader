---
schema: 1
id: OQ-010
status: resolved
affects:
  - STEP-030
created_at: 2026-10-04T17:57:04Z
resolved_at: 2026-10-16T00:00:00Z
---

# OQ-010 — Какие платформенные secure storage APIs использовать через Electron?

## Context

Brief §10: Windows Credential Manager, macOS Keychain, Linux Secret Service/Keyring; нужен конкретный механизм и поведение при недоступности.

## Decision needed

Выбрать реализацию secure storage для desktop и политику при недоступном хранилище.

## Resolution

Решено [ADR-015](../adr/ADR-015-electron-security-model.md) (STEP-028). Основания: [ADR-010](../adr/ADR-010-cli-auth-and-secure-storage.md), native canary STEP-008 и документация Electron `safeStorage`.

- Desktop credential store работает в Electron `utilityProcess` (application host) через `@napi-rs/keyring`:
  - Windows — Credential Manager текущего пользователя;
  - macOS — Login Keychain;
  - Linux — Secret Service с защищённой default-коллекцией.
- Namespace `music-downloader.desktop.yandex-music`, отдельно от CLI.
- При недоступном или заблокированном хранилище — явная ошибка с инструкцией. Plaintext, `safeStorage`/`basic_text` и файловый fallback запрещены.
- Связь Keychain с подписью приложения на macOS передана STEP-034/OQ-013.
- Платформенное доказательство в Electron — STEP-030.
