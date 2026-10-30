#!/bin/sh
set -eu
mkdir -p "$XDG_RUNTIME_DIR" /report/ui
chmod 700 "$XDG_RUNTIME_DIR"
Xvfb :99 -screen 0 1280x900x24 -nolisten tcp > /report/xvfb.log 2>&1 &
sleep 1
/app/AppRun --no-sandbox > /report/application.log 2>&1 &
app_pid=$!
trap 'kill "$app_pid" 2>/dev/null || true' TERM INT
wait "$app_pid"
