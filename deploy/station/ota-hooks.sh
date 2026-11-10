#!/bin/bash
# Rodado no pós-install do pacote OTA (npm). Idempotente; não toca configs.
# Não instala MMDVMHost/NextionDriver: binários nativos vêm do bake da imagem
# (deploy/mmdvm/build-binaries.sh). Estação sem eles precisa de nova imagem.
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

# Sudoers do helper de backup (e demais) — atualiza em aparelhos já instalados.
if [[ -f "$ROOT/sudoers-hamcockpit" ]]; then
  if command -v visudo >/dev/null 2>&1; then
    if visudo -cf "$ROOT/sudoers-hamcockpit" >/dev/null 2>&1; then
      install -o root -g root -m 0440 "$ROOT/sudoers-hamcockpit" /etc/sudoers.d/ham-cockpit
    fi
  else
    install -o root -g root -m 0440 "$ROOT/sudoers-hamcockpit" /etc/sudoers.d/ham-cockpit
  fi
fi

# .env do Wavelog costuma nascer root:root 600 (Docker/install antigo).
# Sem isso o backup do console falha com EACCES ao copiar /opt/wavelog/.env.
if [[ -x "$ROOT/bin/station-backup" ]]; then
  "$ROOT/bin/station-backup" ensure-env >/dev/null 2>&1 || true
elif [[ -f /opt/wavelog/.env ]] && getent passwd hamcockpit >/dev/null 2>&1; then
  chown hamcockpit:hamcockpit /opt/wavelog/.env 2>/dev/null || true
  chmod 640 /opt/wavelog/.env 2>/dev/null || true
fi

# Pastas de dados graváveis pelo serviço (OTA em aparelhos já instalados).
install -d -o hamcockpit -g hamcockpit -m 0775 \
  /opt/ham-cockpit/radios \
  /opt/ham-cockpit/equipment \
  /opt/ham-cockpit/layouts \
  /opt/ham-cockpit/net \
  /opt/ham-cockpit/services \
  /opt/ham-cockpit/ldg \
  /opt/ham-cockpit/lp100a \
  2>/dev/null || true

exit 0
