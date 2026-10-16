#!/bin/bash
# Платформенная проверка SQLite store на macOS (STEP-029).
# Запускает встроенный Node.js: arm64 нативно, x64 через Rosetta (на Intel — x64).
# Node.js, Yarn и сеть на машине проверяющего не нужны.
set -u

KIT="$(cd "$(dirname "$0")" && pwd)" || exit 1
CHECK="$KIT/app/packages/persistence/platform-check/check.mjs"
SUMS="$KIT/runtime/SHA256SUMS"

# Снимаем карантин Gatekeeper с распакованного набора (ошибки не критичны).
xattr -dr com.apple.quarantine "$KIT" 2>/dev/null || true

sha256_of() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    sha256sum "$1" | awk '{print $1}'
  fi
}

# Сверяет SHA-256 runtime с runtime/SHA256SUMS; несовпадение — отказ запуска.
verify_runtime() {
  local relative="$1"
  local expected actual
  expected="$(awk -v target="$relative" '$2 == target {print $1}' "$SUMS")"
  if [ -z "$expected" ] || [ ! -f "$KIT/$relative" ]; then
    echo "FAIL: нет контрольной суммы или файла $relative"
    return 1
  fi
  actual="$(sha256_of "$KIT/$relative")"
  if [ "$actual" != "$expected" ]; then
    echo "FAIL: контрольная сумма $relative не совпадает"
    return 1
  fi
  return 0
}

STATUS=0
run_arch() {
  local arch="$1"
  local relative="runtime/darwin-$arch/bin/node"
  verify_runtime "$relative" || { STATUS=1; return; }
  chmod +x "$KIT/$relative" 2>/dev/null || true
  echo "== darwin-$arch"
  if [ "$arch" = "x64" ] && [ "$(uname -m)" = "arm64" ]; then
    "$ARCH_CMD" -x86_64 "$KIT/$relative" "$CHECK" --report-dir "$KIT" || STATUS=1
  else
    "$KIT/$relative" "$CHECK" --report-dir "$KIT" || STATUS=1
  fi
}

ARCH_CMD="arch"
if [ "${PLATFORM_CHECK_VERIFY_ONLY:-}" = "1" ]; then
  # Тестовый режим: только проверка контрольных сумм, без запуска Node.js.
  for relative in $(awk '{print $2}' "$SUMS"); do
    verify_runtime "$relative" || STATUS=1
  done
  exit "$STATUS"
fi

if [ "$(uname -m)" = "arm64" ]; then
  run_arch arm64
  if "$ARCH_CMD" -x86_64 /usr/bin/true >/dev/null 2>&1; then
    run_arch x64
  else
    echo "SKIP: Rosetta не установлена, проверка x64 пропущена."
    echo "      Установите: softwareupdate --install-rosetta --agree-to-license"
  fi
else
  run_arch x64
fi

echo
if [ "$STATUS" -eq 0 ]; then
  echo "Готово. Пришлите файлы report-*.json из каталога набора:"
else
  echo "Есть ошибки. Пришлите файлы report-*.json и этот вывод:"
fi
echo "  $KIT"
if [ -t 0 ] && [ "${PLATFORM_CHECK_NO_PAUSE:-}" != "1" ]; then
  read -r -p "Нажмите Enter для выхода..." _
fi
exit "$STATUS"
