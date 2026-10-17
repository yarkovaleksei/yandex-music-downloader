#!/usr/bin/env bash
# Обёртка для ручного запуска автоматической проверки STEP-001
# (packages/testing/scripts/verify-step-001.mjs). Версии Node.js 22.14.0 и 24
# должны быть установлены заранее; nvm install здесь не выполняется.
set -Eeuo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

if ! command -v node >/dev/null 2>&1 && [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
  # shellcheck source=/dev/null
  . "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
  nvm use 24 >/dev/null
fi

exec node "$project_root/packages/testing/scripts/verify-step-001.mjs" "$@"
