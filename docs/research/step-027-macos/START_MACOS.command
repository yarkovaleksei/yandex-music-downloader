#!/bin/bash
# Этот файл кладётся в корень macOS-комплекта: глобальные Node/Homebrew не нужны.
# Проверяется исходный архив Node; tar сохраняет Corepack symlinks и права executable.
set -eu
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
cd -- "$ROOT"
ARCH="unknown"

write_report() {
  printf '{"schema":1,"step":"STEP-027","kind":"macos-launcher","architecture":"%s","node":"v24.21.0","status":"%s","code":"%s","exitCode":%s}\n' \
    "$ARCH" "$1" "$2" "$3" > "$ROOT/START_REPORT.json"
}
fail() {
  write_report FAIL "$1" 1 || true
  printf '\nПроверка не запущена: %s\nОтправьте START_REPORT.json из этой папки.\n' "$1"
  exit 1
}
trap 'fail LAUNCHER_INTERRUPTED' INT TERM

[ "$(uname -s)" = Darwin ] || fail MACOS_REQUIRED
case "$(uname -m)" in
  arm64) ARCH=arm64; EXPECTED=bed7eea5325e1108f32ce5228ddd6a5f0f08a499ee42aa7442aea583702f6057 ;;
  x86_64) ARCH=x64; EXPECTED=1462cb3b3046b815cf8ea436d3da450ec1a9f11dac7e5a46b0ada5305d7e8097 ;;
  *) fail ARCHITECTURE_UNSUPPORTED ;;
esac
VERSION="$(sw_vers -productVersion)" || fail MACOS_VERSION_UNAVAILABLE
MAJOR="${VERSION%%.*}"
REST="${VERSION#*.}"
MINOR="${REST%%.*}"
case "$MAJOR:$MINOR" in *[!0-9:]*|:*|*:) fail MACOS_VERSION_UNAVAILABLE ;; esac
if [ "$MAJOR" -lt 13 ] || { [ "$MAJOR" -eq 13 ] && [ "$MINOR" -lt 5 ]; }; then
  fail MACOS_13_5_REQUIRED
fi

PREFIX="node-v24.21.0-darwin-$ARCH"
ARCHIVE="$ROOT/runtimes/$PREFIX.tar.gz"
[ -f "$ARCHIVE" ] || fail NODE_ARCHIVE_MISSING
SUM="$(shasum -a 256 "$ARCHIVE")" || fail NODE_CHECKSUM_FAILED
[ "${SUM%% *}" = "$EXPECTED" ] || fail NODE_CHECKSUM_MISMATCH
mkdir -p "$ROOT/.cache/checks" "$ROOT/.cache/runtime" || fail WORKSPACE_NOT_WRITABLE
export TMPDIR="$ROOT/.cache/checks"
export TMP="$TMPDIR"
export TEMP="$TMPDIR"

# Каждый запуск распаковывает проверенный runtime в новый собственный каталог.
# Незавершённая прежняя распаковка не используется для исполнения.
STAGING="$(mktemp -d "$ROOT/.cache/runtime/node.XXXXXX")" || fail NODE_EXTRACT_FAILED
if ! tar -xzf "$ARCHIVE" -C "$STAGING" >/dev/null 2>&1; then
  fail NODE_EXTRACT_FAILED
fi
NODE="$STAGING/$PREFIX/bin/node"
[ -x "$NODE" ] || fail NODE_EXECUTABLE_MISSING
[ -f "$STAGING/$PREFIX/lib/node_modules/corepack/dist/corepack.js" ] || fail COREPACK_MISSING
export PATH="$STAGING/$PREFIX/bin:$PATH"
NODE_VERSION="$("$NODE" --version 2>/dev/null)" || fail NODE_RUNTIME_FAILED
[ "$NODE_VERSION" = v24.21.0 ] || fail NODE_VERSION_MISMATCH
if ! corepack --version >/dev/null 2>&1; then fail COREPACK_RUNTIME_FAILED; fi
write_report READY RUNTIME_READY 0
printf 'Node.js 24.21.0 (%s) готов. Полная проверка и отчёты — в этой папке.\n' "$ARCH"
printf 'Нужны три свои ссылки и, при необходимости, вход в браузере.\n\n'

set +e
"$NODE" "$ROOT/docs/research/step-027-acceptance/run.mjs" "$@"
CODE=$?
set -e
write_report FINISHED RUNNER_EXITED "$CODE"
printf '\nПроверка завершилась с кодом %s. Отправьте указанный выше report.json.\n' "$CODE"
if [ -t 0 ]; then
  printf 'Нажмите Enter, чтобы закрыть окно… '
  read -r ANSWER || true
fi
exit "$CODE"
