---
schema: 1
id: REQ-046
priority: critical
source: brief
steps:
  - STEP-028
  - STEP-030
adrs:
  - ADR-015
  - ADR-016
---

# REQ-046 — [DESKTOP] Модель безопасности Electron и typed IPC

## Requirement

BrowserWindow создаётся с `contextIsolation = true`, `nodeIntegration = false`, `sandbox = true`; renderer не имеет прямого доступа к fs, child_process, токенам, базе и provider; связь только через строго типизированный preload API / IPC без произвольных строковых каналов.

## Rationale

Renderer — недоверенная среда (brief §38, §39).

## Acceptance

- Автоматический тест конфигурации BrowserWindow проверяет три обязательных флага.
- Попытка использовать `require`/`process` из renderer в тесте завершается ошибкой; каналы IPC определены единым typed contract и произвольные channel strings запрещены lint-правилом.
- Контракт `DesktopApi` описан типами и покрыт тестами на валидацию входных данных каждого метода.
