#!/bin/bash
# Rodado no pós-install do pacote OTA (npm). Idempotente; não toca configs.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
[[ "$(id -u)" -eq 0 ]] || exit 0

if [[ -d "$ROOT/systemd" ]]; then
  shopt -s nullglob
  for unit in "$ROOT"/systemd/*.service "$ROOT"/systemd/*.target; do
    install -m 0644 "$unit" "/etc/systemd/system/$(basename "$unit")"
  done
  systemctl daemon-reload 2>/dev/null || true
fi

if [[ -d "$ROOT/bin" ]]; then
  find "$ROOT/bin" -maxdepth 1 -type f -exec chmod 0755 {} +
  chown root:root "$ROOT"/bin/* 2>/dev/null || true
fi

exit 0
