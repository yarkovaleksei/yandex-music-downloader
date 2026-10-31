#!/usr/bin/env bash
# Обёртка для ручного запуска автоматической проверки toolchain
# (packages/testing/scripts/verify-workspace.mjs). Node.js 24
# должен быть установлен заранее; nvm install здесь не выполняется.
set -Eeuo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

if ! command -v node >/dev/null 2>&1 && [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
  # shellcheck source=/dev/null
  . "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
  nvm use 24 >/dev/null
fi

exec node "$project_root/packages/testing/scripts/verify-workspace.mjs" "$@"
